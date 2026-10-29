import { collection, doc, FieldPath, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import { ppDisponibles, sortRate, cibleResiste, sortsLancables, type SortLancable } from '../fiche/sorts-hors-combat';
import { CLE_HORS_SEANCE, dejaUtiliseCetteSeance } from '../scenes/vecu-en-scene';
import { schemaFiche, type FicheV2 } from '../schemas/fiche';
import { schemaJetJournal } from '../schemas/journal';
import { BONUS_PALIER, schemaDemandeSort, type DemandeSort } from '../schemas/sort-hors-combat';
import type { Palier } from '../schemas/effets';
import { session } from '../session.svelte';
import { lancerEtNoter } from './journal';
import { verseParLeSort } from '../combat/remous';
import { alimenterRemous } from './remous';

/*
 * Écritures des sorts lancés hors combat (lot G2a, décisions de Thomas du
 * 22/10/2026) : le joueur demande (1a, 2b), le MJ accepte ou refuse (5b),
 * le joueur lance et paie (15b, 6a), le MJ lance la sauvegarde de la
 * cible (14b). Voir src/lib/schemas/sort-hors-combat.ts.
 *
 * En scène (lot G2b) : la demande appuie l'action du tour (`enScene`) ; le
 * MJ fixe le bonus en acceptant (13a) ; un refus défait l'action, que le
 * joueur rejoue (2b).
 */

export class RefusSort extends Error {}

const refDemande = (id: string) => doc(db, `tables/${session.table}/sortsHorsCombat/${id}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);
const d20 = (alea: () => number) => 1 + Math.floor(alea() * 20);

/**
 * Le joueur demande au MJ de lancer un sort hors combat, ou, avec
 * `enScene`, pour appuyer son action du tour (G2b). Rend l'identifiant de
 * la demande.
 */
export async function demanderSort(
  fiche: FicheV2 & { id: string },
  sort: string,
  palier: Palier,
  intention: string,
  seance: string | undefined,
  enScene: { scene: string; action: string } | null = null,
): Promise<string> {
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
    scene: enScene?.scene ?? null,
    action: enScene?.action ?? null,
    bonus: null,
    creeLe: maintenant,
    majLe: maintenant,
  });
  const ref = doc(collection(db, `tables/${session.table}/sortsHorsCombat`));
  await setDoc(ref, d);
  return ref.id;
}

/**
 * Le MJ accepte ou refuse une demande en attente (5b), avec un motif
 * possible. En scène (G2b) : il accorde un bonus de 0 à celui du palier
 * (13a) ; un refus défait l'action du tour, que le joueur rejoue (2b).
 */
export async function repondreDemandeSort(d: Pick<DemandeSort, 'scene' | 'action' | 'palier'> & { id: string }, accepte: boolean, motif: string, bonus = 0): Promise<void> {
  const m = motif.trim().slice(0, 120) || null;
  const maintenant = Date.now();
  if (d.scene === null || d.action === null) {
    await updateDoc(refDemande(d.id), { statut: accepte ? 'acceptee' : 'refusee', motif: m, majLe: maintenant });
    return;
  }
  if (!accepte) {
    const { scene, action } = d;
    await runTransaction(db, async (tx) => {
      tx.update(refDemande(d.id), { statut: 'refusee', motif: m, majLe: maintenant });
      tx.delete(doc(db, `tables/${session.table}/scenesHorsCombat/${scene}/actions/${action}`));
    });
    return;
  }
  const b = Math.max(0, Math.min(BONUS_PALIER[d.palier], Math.round(bonus)));
  await updateDoc(refDemande(d.id), { statut: 'acceptee', motif: m, bonus: b, majLe: maintenant });
}

/**
 * Le joueur lance un sort accepté (15b) : il paie ses PP, lance le jet
 * d'échec s'il y en a un (6a) et note le sort au journal (9a). Un
 * « 1x/combat » est noté dans `usages` de la fiche, avec la séance (11a).
 * Rend la demande à jour.
 *
 * L6.7b (6a) : ses PP payés (× la race) vont au Remous de `lieu`, la scène
 * active ; hors combat, le palier ne change rien au sort.
 */
export async function lancerSort(id: string, seance: string | undefined, alea: () => number = Math.random, lieu: string | null = null): Promise<DemandeSort> {
  let verse = { n: 0, perso: '' };
  const apres = await runTransaction(db, async (tx) => {
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
      libelle: `${d.nomSort} ${d.palier}, ${d.scene ? 'en scène' : 'hors combat'}${rate ? ' : raté' : ''}`.slice(0, 80),
      formule: de === null ? 'sort' : `1d20 (échec sur 1 à ${d.echec})`,
      des: de === null ? [] : [de],
      bonus: 0,
      total: de ?? 0,
      creeLe: maintenant,
      sort: { nom: d.nomSort, palier: d.palier, pp: d.pp, intention: d.intention, issue: rate ? 'rate' : 'lance' },
    });
    tx.set(doc(collection(db, `tables/${session.table}/journal`)), entree);
    verse = { n: verseParLeSort(f.race ?? '', d.pp, 0), perso: d.perso };
    return apres;
  });
  if (lieu) await alimenterRemous(lieu, verse.n, verse.perso);
  return apres;
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
