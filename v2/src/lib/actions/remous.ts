import { doc, increment, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { lancerDegats } from '../combat/attaque';
import { appliquerChangements } from '../combat/changements';
import type { Changement } from '../effets/resolution';
import { palierDe } from '../combat/remous';
import { USAGE_MONTEE_REMOUS } from '../combat/demons';
import type { Combattant } from '../schemas/combat';
import type { Fiche } from '../schemas/fiche';
import type { Remous } from '../schemas/remous';
import type { Membrane } from '../../regles/remous';
import { session } from '../session.svelte';
import { noterJet } from './journal';

/*
 * Le Remous du lieu (lot L6.7b, décisions de Thomas du 29/10/2026).
 * lib/combat/remous.ts dit le reste.
 *   - 6a : alimenter la jauge d'une scène (un incrément : ni lecture, ni
 *     course entre deux lanceurs) ; un joueur au nom de son personnage
 *     joué, le MJ au nom d'un personnage ou de « mj » ;
 *   - 9a : le MJ la vide (repos long, heure de marche), règle la membrane,
 *     la corrige au −/+ ;
 *   - 8a : la Déchirure, au début de chaque round, sur tout le lieu sauf
 *     les démons ; les démons du combat proposés à la montée.
 */

type AvecId<T> = T & { id: string };

const refRemous = (scene: string) => doc(db, `tables/${session.table}/remous/${scene}`);
const refCombattant = (idCombat: string, c: string) => doc(db, `tables/${session.table}/combats/${idCombat}/combattants/${c}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);
const sansDe = { des: [], faces: 0, bonus: 0, total: 0 };

/** 6a : `montant` PP de Remous dans la jauge de `scene`, au nom de `qui` (un personnage, ou « mj »). Rien sous 1. */
export async function alimenterRemous(scene: string, montant: number, qui: string): Promise<void> {
  const n = Math.min(60, Math.floor(montant));
  if (n < 1) return;
  await setDoc(refRemous(scene), { total: increment(n), contributions: { [qui]: increment(n) }, majLe: Date.now() }, { merge: true });
}

/** 9a : le MJ vide la jauge (repos long, heure de marche) ; la membrane reste. */
export async function viderRemous(scene: string, r: Remous | null, raison: 'repos' | 'marche'): Promise<void> {
  await setDoc(refRemous(scene), { total: 0, membrane: r?.membrane ?? 'epaisse', contributions: {}, majLe: Date.now() });
  await noterJet('Remous — vidange', '0', sansDe, 'MJ', raison === 'marche' ? 'Une heure de marche effective : la jauge du lieu retombe à 0.' : 'Repos long : la jauge du lieu retombe à 0.');
}

/** 9a : le MJ règle la membrane (le Voile de sève l'épaissit). */
export async function reglerMembrane(scene: string, r: Remous | null, membrane: Membrane): Promise<void> {
  await setDoc(refRemous(scene), { total: r?.total ?? 0, membrane, contributions: r?.contributions ?? {}, majLe: Date.now() });
}

/** 9a : le MJ corrige le total au −/+ (jamais sous 0). */
export async function corrigerRemous(scene: string, r: Remous | null, delta: number): Promise<void> {
  await setDoc(refRemous(scene), { total: Math.max(0, Math.min(9999, (r?.total ?? 0) + delta)), membrane: r?.membrane ?? 'epaisse', contributions: r?.contributions ?? {}, majLe: Date.now() });
}

/** 8a : un palier est franchi : le journal le dit, avec ce qu'il change. */
export async function annoncerPalier(r: Remous): Promise<void> {
  const p = palierDe(r);
  const gain = [`sorts −${p.coutSorts} PP`, `+${p.degatsSorts} dégâts`, ...(p.ppMax ? [`PP max +${p.ppMax}`] : [])].join(', ');
  await noterJet(`Remous — palier ${p.palier}, ${p.nom}`, '0', sansDe, 'MJ', [`Gain : ${gain}.`, p.dechirure ? `${p.dechirure} dégâts par round à tout le lieu.` : '', p.demon ?? ''].filter(Boolean).join(' '));
}

/**
 * 8a : la Déchirure, au début d'un round : un jet pour tout le lieu, sur
 * chaque créature debout du combat sauf les démons (immunisés). Rend les
 * lignes du journal.
 */
export async function dechirure(
  idCombat: string,
  formule: string,
  combattants: readonly AvecId<Combattant>[],
  estDemon: (c: AvecId<Combattant>) => boolean,
  fiches: ReadonlyMap<string, AvecId<Fiche>>,
  alea: () => number = Math.random,
): Promise<string[]> {
  const cibles = combattants.filter((c) => !c.mort && !c.aTerre && !estDemon(c));
  const j = lancerDegats(formule, alea);
  if (!j || !cibles.length) return [];
  const changements: Changement[] = cibles.map((c) => ({ type: 'degats', cible: c.id, montant: j.total, typeDegats: 'magique', calcul: `${j.total} (Déchirure)` }));
  const lus = new Map(cibles.map((c) => [c.id, { c, fiche: c.perso ? (fiches.get(c.perso) ?? null) : null }]));
  const ecr = appliquerChangements(changements, lus, { id: 'remous', nom: 'Déchirure', fiche: null }, { parLeMj: true });
  const lot = writeBatch(db);
  for (const [id, m] of ecr.combattants) lot.update(refCombattant(idCombat, id), m);
  for (const [id, m] of ecr.fiches) lot.update(refPerso(id), m);
  await lot.commit();
  // Chaque cible blessée a sa ligne.
  const lignes = cibles.map((c) => `${c.nom} : ${ecr.lignes.get(c.id)!.join(', ')}`);
  await noterJet('Déchirure', formule, j, 'MJ', `${j.total} à tout le lieu ; ${lignes.join(' ; ')}`);
  return lignes;
}

/** 8a : le Remous franchit un palier (2 et plus) : les démons debout qui ont où monter se voient offrir une montée. */
export async function offrirMontees(idCombat: string, demons: readonly AvecId<Combattant>[]): Promise<void> {
  if (!demons.length) return;
  const lot = writeBatch(db);
  for (const c of demons) lot.update(refCombattant(idCombat, c.id), { usages: { ...c.usages, [USAGE_MONTEE_REMOUS]: 1 } });
  await lot.commit();
  await noterJet('Remous — montée', '0', sansDe, 'MJ', `${demons.map((c) => c.nom).join(', ')} peu${demons.length > 1 ? 'vent' : 't'} monter d’un palier.`);
}
