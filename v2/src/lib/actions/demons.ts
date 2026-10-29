import { deleteField, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { lancerDegats } from '../combat/attaque';
import { appliquerChangements } from '../combat/changements';
import { airsVicies, apresMontee, avecFaim, faimDe, soigne, USAGE_SURSAUT, type TraitsDemon } from '../combat/demons';
import type { Changement } from '../effets/resolution';
import type { Combat, Combattant } from '../schemas/combat';
import type { Fiche } from '../schemas/fiche';
import { session } from '../session.svelte';
import { RefusCombat } from './combat';
import { noterJet } from './journal';

/*
 * Le client du MJ joue les démons (lot L6.6b, décisions de Thomas du
 * 29/10/2026). lib/combat/demons.ts dit le reste.
 *   - 1a, 2a, 3a : le MJ corrige la faim ; il monte le démon au seuil ;
 *     les rounds survécus se comptent au début de chaque round ;
 *   - 5a, 8a : au début d'un tour : la fin du Sursaut, la Repousse, l'Air
 *     vicié ; quand un démon tombe, son Dernier souffle.
 */

type AvecId<T> = T & { id: string };

const refCombattant = (idCombat: string, c: string) => doc(db, `tables/${session.table}/combats/${idCombat}/combattants/${c}`);
const refJeton = (scene: string, id: string) => doc(db, `tables/${session.table}/scenes/${scene}/jetons/${id}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);
const sansDe = { des: [], faces: 0, bonus: 0, total: 0 };

/** 11a : des démons tombent : ils retournent à la Mer (le journal le dit ; rien ne les suit). */
export async function retourALaMer(qui: readonly Pick<Combattant, 'nom'>[]): Promise<void> {
  if (!qui.length) return;
  await noterJet('Retour à la Mer', '0', sansDe, 'MJ', `${qui.map((c) => c.nom).join(', ')} retourne${qui.length > 1 ? 'nt' : ''} à la Mer.`);
}

/** 1a : le MJ corrige la faim (bornée de 0 à 999). */
export async function corrigerFaim(idCombat: string, c: AvecId<Combattant>, delta: number): Promise<void> {
  const usages = avecFaim(c.usages, delta);
  await updateDoc(refCombattant(idCombat, c.id), { usages });
  await noterJet(`Faim de ${c.nom}`, '0', sansDe, 'MJ', `corrigée : ${faimDe({ usages })}.`);
}

/**
 * 2a, 3a : le démon monte au palier `m` (un de ses paliers suivants) : son
 * combattant prend le nouveau modèle, son jeton le nouveau nom.
 */
export async function monterDemon(
  idCombat: string,
  scene: string,
  c: AvecId<Combattant>,
  traits: TraitsDemon,
  m: Parameters<typeof apresMontee>[1],
  reductions: ReadonlyMap<string, number>,
): Promise<string> {
  if (c.genre !== 'monstre' || c.aTerre || c.mort) throw new RefusCombat('Seul un démon debout monte.');
  if (!traits.paliersSuivants.includes(m.id)) throw new RefusCombat(`${m.nom} n’est pas un palier suivant de ${c.nom}.`);
  const champs = apresMontee(c, m, reductions);
  const lot = writeBatch(db);
  lot.update(refCombattant(idCombat, c.id), Object.fromEntries(Object.entries(champs).map(([k, v]) => [k, v === null ? deleteField() : v])));
  lot.update(refJeton(scene, c.id), { nom: champs.nom });
  await lot.commit();
  const texte = `${c.nom} devient ${m.nom} : ${String(champs.pv)}/${String(champs.pvMax)} PV.`;
  await noterJet(`Montée de ${c.nom}`, '0', sansDe, 'MJ', texte);
  return texte;
}

/** 1a : le round `round` commence : les démons debout comptent un round survécu (`maj` : leurs nouveaux usages). */
export async function compterRoundsSurvecus(idCombat: string, maj: readonly { c: AvecId<Combattant>; usages: Record<string, number> }[]): Promise<void> {
  const lot = writeBatch(db);
  for (const x of maj) lot.update(refCombattant(idCombat, x.c.id), { usages: x.usages });
  await lot.commit();
}

/** 8a : Dernier souffle : le démon tombé se relève pour un dernier tour (Sursaut). */
export async function sursaut(idCombat: string, combat: Pick<Combat, 'tour'>, c: AvecId<Combattant>): Promise<void> {
  await updateDoc(refCombattant(idCombat, c.id), { aTerre: false, usages: { ...c.usages, [USAGE_SURSAUT]: Math.max(1, Math.min(99999, combat.tour)) } });
  await noterJet(`Dernier souffle de ${c.nom}`, '0', sansDe, 'MJ', `${c.nom} se relève, en Sursaut : il agit une dernière fois et tombe au début de son prochain tour.`);
}

/**
 * Au début du tour de `actif` (5a, 8a) : la fin de son Sursaut ; sa
 * Repousse ; l'Air vicié des démons proches. Rend les lignes du journal
 * (vide : rien).
 */
export async function debutDeTourDemons(
  idCombat: string,
  actif: AvecId<Combattant>,
  combattants: readonly AvecId<Combattant>[],
  traits: (c: AvecId<Combattant>) => TraitsDemon | null,
  fiches: ReadonlyMap<string, AvecId<Fiche>>,
  jetons: readonly { id: string; cx: number; cy: number }[],
  alea: () => number = Math.random,
): Promise<string[]> {
  const lignes: string[] = [];
  const t = traits(actif);
  if (actif.genre === 'monstre' && actif.usages[USAGE_SURSAUT] !== undefined && !actif.aTerre) {
    await updateDoc(refCombattant(idCombat, actif.id), { aTerre: true, pv: 0 });
    lignes.push(`${actif.nom} : son Sursaut s’achève, il tombe`);
  } else if (t?.repousse && actif.genre === 'monstre' && !actif.aTerre) {
    const pv = soigne(actif, t.repousse);
    if (pv !== actif.pv) {
      await updateDoc(refCombattant(idCombat, actif.id), { pv });
      lignes.push(`${actif.nom} : Repousse, +${pv - (actif.pv ?? 0)} PV`);
    }
  }
  const airs = airsVicies(actif, combattants, traits, jetons);
  const changements: Changement[] = [];
  for (const a of airs) {
    const j = lancerDegats(a.formule, alea);
    if (!j) continue;
    changements.push({ type: 'degats', cible: actif.id, montant: j.total, typeDegats: 'physique', calcul: `${j.total}` });
    lignes.push(`Air vicié de ${a.source.nom} : ${j.total} sur ${actif.nom}`);
  }
  if (changements.length) {
    const fiche = actif.perso ? (fiches.get(actif.perso) ?? null) : null;
    const ecr = appliquerChangements(changements, new Map([[actif.id, { c: actif, fiche }]]), { id: airs[0]!.source.id, nom: airs[0]!.source.nom, fiche: null }, { parLeMj: true });
    const lot = writeBatch(db);
    for (const [id, m] of ecr.combattants) lot.update(refCombattant(idCombat, id), m);
    for (const [id, m] of ecr.fiches) lot.update(refPerso(id), m);
    await lot.commit();
    lignes.push(...(ecr.lignes.get(actif.id) ?? []));
  }
  if (lignes.length) await noterJet(`Début du tour de ${actif.nom}`, '0', sansDe, 'MJ', lignes.join(' ; '));
  return lignes;
}
