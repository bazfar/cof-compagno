import { collection, doc, FieldPath, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import { ppDisponibles, sortRate, cibleResiste, sortsLancables, type SortLancable } from '../fiche/sorts-hors-combat';
import { CLE_HORS_SEANCE, dejaUtiliseCetteSeance } from '../scenes/vecu-en-scene';
import { schemaFiche, type FicheV2 } from '../schemas/fiche';
import { schemaJetJournal } from '../schemas/journal';
import { schemaDemandeSort, type DemandeSort } from '../schemas/sort-hors-combat';
import type { Palier } from '../schemas/effets';
import { session } from '../session.svelte';
import { lancerEtNoter } from './journal';

/*
 * Écritures des sorts lancés hors combat (lot G2a, décisions de Thomas du
 * 22/10/2026) : le joueur demande (1a, 2b), le MJ accepte ou refuse (5b),
 * le joueur lance et paie (15b, 6a), le MJ lance la sauvegarde de la
 * cible (14b). Voir src/lib/schemas/sort-hors-combat.ts.
 */

export class RefusSort extends Error {}

const refDemande = (id: string) => doc(db, `tables/${session.table}/sortsHorsCombat/${id}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);
const d20 = (alea: () => number) => 1 + Math.floor(alea() * 20);

/** Le joueur demande au MJ de lancer un sort hors combat. Rend l'identifiant de la demande. */
export async function demanderSort(fiche: FicheV2 & { id: string }, sort: string, palier: Palier, intention: string, seance: string | undefined): Promise<string> {
  if (!intention.trim()) throw new RefusSort('Dis en une ligne ce que tu veux faire.');
  const s: SortLancable | undefined = sortsLancables(fiche).find((x) => x.id === sort);
  const p = s?.paliers.find((x) => x.palier === palier);
  if (!s || !p) throw new RefusSort('Ce sort ne se lance pas hors combat à ce palier.');
  if (p.pp > ppDisponibles(fiche)) throw new RefusSort(`Il te faut ${p.pp} PP.`);
  if (s.unParSeance && dejaUtiliseCetteSeance(fiche.usages as Record<string, unknown>, s.id, seance)) throw new RefusSort(`${s.nom} a déjà servi cette séance.`);
  const maintenant = Date.now();
  const d = schemaDemandeSort.parse({
    uid: session.uid,
    perso: fiche.id,
    nom: fiche.nom.slice(0, 40),
    sort: s.id,
    nomSort: s.nom,
    palier,
    pp: p.pp,
    echec: s.echec,
    sauvegarde: p.sauvegarde,
    dd: p.dd,
    intention: intention.trim().slice(0, 120),
    textes: p.textes,
    statut: 'attente',
    motif: null,
    de: null,
    resistance: null,
    creeLe: maintenant,
    majLe: maintenant,
  });
  const ref = doc(collection(db, `tables/${session.table}/sortsHorsCombat`));
  await setDoc(ref, d);
  return ref.id;
}

/** Le MJ accepte ou refuse une demande en attente (5b), avec un motif possible. */
export async function repondreDemandeSort(id: string, accepte: boolean, motif: string): Promise<void> {
  const m = motif.trim().slice(0, 120);
  await updateDoc(refDemande(id), { statut: accepte ? 'acceptee' : 'refusee', motif: m || null, majLe: Date.now() });
}

/**
 * Le joueur lance un sort accepté (15b) : il paie ses PP, lance le jet
 * d'échec s'il y en a un (6a) et note le sort au journal (9a). Un
 * « 1x/combat » est noté dans `usages` de la fiche, avec la séance (11a).
 * Rend la demande à jour.
 */
export async function lancerSort(id: string, seance: string | undefined, alea: () => number = Math.random): Promise<DemandeSort> {
  return runTransaction(db, async (tx) => {
    const lue = await tx.get(refDemande(id));
    if (!lue.exists()) throw new RefusSort('Cette demande n’existe plus.');
    const d = schemaDemandeSort.parse(lue.data());
    if (d.uid !== session.uid) throw new RefusSort('Ce sort n’est pas le tien.');
    if (d.statut !== 'acceptee') throw new RefusSort('Le MJ n’a pas accepté ce sort.');
    const luP = await tx.get(refPerso(d.perso));
    const f = luP.exists() ? schemaFiche.parse(luP.data()) : null;
    if (!f || f.schemaVersion !== 2) throw new RefusSort('Fiche introuvable.');
    const pp = ppDisponibles(f);
    if (d.pp > pp) throw new RefusSort(`Il te faut ${d.pp} PP (tu en as ${pp}).`);
    const s = sortsLancables(f).find((x) => x.id === d.sort);
    const de = d.echec > 0 ? d20(alea) : null;
    const rate = de !== null && sortRate(de, d.echec);
    const maintenant = Date.now();
    const usage = s?.unParSeance ? [new FieldPath('usages', d.sort), { seance: seance ?? CLE_HORS_SEANCE, le: maintenant }] : [];
    tx.update(refPerso(d.perso), 'ppActuel', pp - d.pp, ...usage);
    const apres: DemandeSort = { ...d, statut: rate ? 'ratee' : 'lancee', de, majLe: maintenant };
    tx.update(refDemande(id), { statut: apres.statut, de, majLe: maintenant });
    const entree = schemaJetJournal.parse({
      auteurUid: session.uid,
      auteurNom: session.nom,
      perso: d.nom,
      libelle: `${d.nomSort} ${d.palier}, hors combat${rate ? ' : raté' : ''}`.slice(0, 80),
      formule: de === null ? 'sort' : `1d20 (échec sur 1 à ${d.echec})`,
      des: de === null ? [] : [de],
      bonus: 0,
      total: de ?? 0,
      creeLe: maintenant,
      sort: { nom: d.nomSort, palier: d.palier, pp: d.pp, intention: d.intention, issue: rate ? 'rate' : 'lance' },
    });
    tx.set(doc(collection(db, `tables/${session.table}/journal`)), entree);
    return apres;
  });
}

/**
 * Le MJ lance la sauvegarde de la cible d'un sort lancé (14b), avec le
 * bonus qu'il lui donne. Le jet part au journal. Rend vrai si la cible
 * résiste.
 */
export async function resisterSort(d: DemandeSort & { id: string }, bonus: number, alea: () => number = Math.random): Promise<boolean> {
  if (d.statut !== 'lancee' || d.sauvegarde === null || d.dd === null) throw new RefusSort('Ce sort n’appelle pas de sauvegarde.');
  if (d.resistance) throw new RefusSort('La cible a déjà fait sa sauvegarde.');
  const b = Math.max(-10, Math.min(30, Math.round(bonus)));
  const nomSauvegarde = d.sauvegarde === 'Volonte' ? 'Volonté' : d.sauvegarde;
  const jet = await lancerEtNoter(`Sauvegarde de ${nomSauvegarde} contre ${d.nomSort} (DD ${d.dd})`, b ? `1d20${b > 0 ? '+' : ''}${b}` : '1d20', undefined, alea);
  const de = jet?.des[0] ?? 1;
  const reussie = cibleResiste(de, b, d.dd);
  await updateDoc(refDemande(d.id), { resistance: { de, bonus: b, reussie }, majLe: Date.now() });
  return reussie;
}
