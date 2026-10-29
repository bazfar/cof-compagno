import { doc, runTransaction, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { caseOccupee } from '../battlemap/deplacement';
import type { Case, JetonCarte, SceneCalcul } from '../battlemap/geometrie';
import { formuleDegats, lancerDegats, resoudreAttaque, texteAttaque, degatsSurMonstre, type IssueAttaque } from '../combat/attaque';
import { appliquerChangements, texteJet, typeSubi, type Lu } from '../combat/changements';
import { ddConcentration, finDeConcentration, rompuesParAttaque } from '../combat/concentration';
import { avantageAttaque, ciblable, d20Attaque, modificateur, peutAgir, rompre } from '../combat/etats';
import { capacitesDe, invocationEnJeu, invocationsDe, remousDu, type AInvoquer, type MaitreAuLancer } from '../combat/invocations';
import { actionsDuTour } from '../combat/ordre';
import { bonusFixe } from '../combat/bonus';
import { sauvegardesDuPj } from '../combat/sorts';
import { ppDisponibles } from '../fiche/sorts-hors-combat';
import { formuleTest } from '../regles/des';
import { schemaCombattant, type Combat, type Combattant } from '../schemas/combat';
import type { Fiche, FicheV2 } from '../schemas/fiche';
import { session } from '../session.svelte';
import { RefusCombat } from './combat';
import { noterJet } from './journal';
import { alimenterRemous } from './remous';

/*
 * Écritures de la concentration et des invocations (lot L6.4b2, décisions
 * de Thomas du 24/10/2026). Les règles sont dans lib/combat
 * (concentration.ts, invocations.ts) ; ce module écrit et note au journal.
 *   - 4a : le joueur clique une case libre, à 6 cases au plus de son
 *     personnage, pour chaque créature appelée ; le combattant d'abord,
 *     puis son jeton (au joueur) ;
 *   - 11a : le joueur du mage écrit ses invocations comme son combattant
 *     (les poser, les jouer, les retirer) ; le MJ écrit les dégâts que les
 *     monstres leur font, et le Remous et le maintien payés au début du
 *     tour du mage (2a, 15a) ;
 *   - 7a : à son tour, l'invocation attaque un monstre à l'attaque magique
 *     de son maître, ou joue une capacité ; l'effet de son élément va au
 *     MJ ;
 *   - 1a, 3a : finir une concentration retire ce que son lancer a posé.
 */

type AvecId<T> = T & { id: string };

const refCombattant = (idCombat: string, c: string) => doc(db, `tables/${session.table}/combats/${idCombat}/combattants/${c}`);
const refJeton = (scene: string, id: string) => doc(db, `tables/${session.table}/scenes/${scene}/jetons/${id}`);
const refZone = (idCombat: string, z: string) => doc(db, `tables/${session.table}/combats/${idCombat}/zones/${z}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);
/** La couleur des jetons d'invocation. */
export const COULEUR_INVOCATION = '#8e44ad';
const d20 = (alea: () => number) => 1 + Math.floor(alea() * 20);
const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Ce qu'un lancer appelle, prêt à poser : ses chiffres d'après le mage, et son initiative (un seul jet par lancer, 6a). */
export type InvocationAPoser = AInvoquer & { maitre: MaitreAuLancer; de: number; lancer: string };

/** 4a : la case où paraît une invocation : sur la carte, libre, à `portee` cases au plus du mage. */
export function placementPermis(scene: SceneCalcul, jetons: readonly JetonCarte[], idMaitre: string, vers: Case, portee: number): string | null {
  const m = jetons.find((j) => j.id === idMaitre);
  if (!m) return 'ton jeton n’est pas sur la carte';
  if (vers.cx < 0 || vers.cy < 0 || vers.cx >= scene.colonnes || vers.cy >= scene.lignes) return 'hors de la carte';
  if (Math.max(Math.abs(vers.cx - m.cx), Math.abs(vers.cy - m.cy)) > portee) return `${portee} cases au plus`;
  if (caseOccupee(jetons, vers.cx, vers.cy)) return 'case prise';
  if (scene.infranchissables?.has(`${vers.cx},${vers.cy}`)) return 'case infranchissable';
  return null;
}

/** Poser une créature appelée (13b, 4a) : son combattant, avec son initiative, puis son jeton. */
export async function poserInvocation(
  idCombat: string,
  combat: Pick<Combat, 'scene'>,
  maitre: AvecId<Combattant>,
  a: InvocationAPoser,
  id: string,
  vers: Case,
  carte: { scene: SceneCalcul; jetons: readonly JetonCarte[] },
): Promise<void> {
  const refus = placementPermis(carte.scene, carte.jetons, maitre.id, vers, a.portee);
  if (refus) throw new RefusCombat(`${a.nom} : ${refus}.`);
  if (!maitre.uid) throw new RefusCombat('Seul un PJ appelle une créature.');
  const x = invocationEnJeu(a, a.maitre, a.lancer);
  if (!x) throw new RefusCombat(`Créature inconnue : ${a.creature}.`);
  const c = schemaCombattant.parse({
    genre: 'invocation',
    nom: a.nom,
    perso: null,
    uid: maitre.uid,
    monstre: null,
    modInit: a.maitre.modInit,
    initiative: a.de + a.maitre.modInit,
    de: a.de,
    pv: x.pv,
    pvMax: x.pv,
    aTerre: false,
    mvtBase: x.mvt,
    def: x.def,
    armure: 0,
    resistances: { physique: 1, magique: 1 },
    mortSucces: 0,
    mortEchecs: 0,
    mort: false,
    etats: [],
    usages: {},
    gainTouche: { round: 0, montant: 0 },
    debutTour: 0,
    visee: false,
    sauvegardes: null,
    boss: false,
    demonOuMortVivant: false,
    pvTemp: 0,
    bonus: [],
    tourActions: 0,
    principale: false,
    secondaire: false,
    mvt: 0,
    sprint: false,
    creeLe: Date.now(),
    maitre: maitre.id,
    invocation: x.enJeu,
    concentration: null,
  });
  // Le combattant d'abord : les règles laissent alors le joueur poser son jeton.
  await setDoc(refCombattant(idCombat, id), c);
  await setDoc(refJeton(combat.scene, id), { genre: 'invocation', nom: a.nom, couleur: COULEUR_INVOCATION, cx: vers.cx, cy: vers.cy, proprietaire: maitre.uid, creeLe: Date.now() });
}

/** Retirer des invocations (9a, 15a, 3a) : leur combattant et leur jeton ; au journal, elles retournent à la Mer. */
export async function retirerInvocations(idCombat: string, scene: string, invocations: readonly AvecId<Pick<Combattant, 'nom'>>[], raison: string, auteur: string): Promise<void> {
  if (!invocations.length) return;
  const lot = writeBatch(db);
  for (const c of invocations) {
    lot.delete(refCombattant(idCombat, c.id));
    lot.delete(refJeton(scene, c.id));
  }
  await lot.commit();
  await noterJet('Invocations', '0', { des: [], faces: 0, bonus: 0, total: 0 }, auteur, `${invocations.map((c) => c.nom).join(', ')} : ${raison}.`);
}

/**
 * Finir une concentration (1a, 3a) : elle tombe du lanceur ; les états de
 * son lancer quittent leurs cibles ; sa zone au sol et ses invocations s'en
 * vont. Au journal, avec sa raison.
 */
export async function finirConcentration(idCombat: string, scene: string, lanceur: AvecId<Combattant>, combattants: readonly AvecId<Combattant>[], raison: string, auteur: string): Promise<void> {
  const conc = lanceur.concentration;
  if (!conc) return;
  const fin = finDeConcentration(conc, combattants);
  const lot = writeBatch(db);
  lot.update(refCombattant(idCombat, lanceur.id), { concentration: null });
  for (const [id, etats] of fin.etats) lot.update(refCombattant(idCombat, id), { etats });
  if (fin.zone) lot.delete(refZone(idCombat, fin.zone));
  for (const id of fin.invocations) {
    lot.delete(refCombattant(idCombat, id));
    lot.delete(refJeton(scene, id));
  }
  await lot.commit();
  await noterJet(`Concentration : ${conc.nom}`, '0', { des: [], faces: 0, bonus: 0, total: 0 }, auteur, `${lanceur.nom} perd sa concentration (${raison}).`);
}

/** 1a : une attaque résolue contre cette cible rompt les concentrations qui la tiennent (Fascination). */
export async function rompreParAttaque(idCombat: string, scene: string, cible: string, combattants: readonly AvecId<Combattant>[], auteur: string): Promise<number> {
  const rompues = rompuesParAttaque(combattants, cible);
  for (const l of rompues) await finirConcentration(idCombat, scene, l, combattants, `${combattants.find((c) => c.id === cible)?.nom ?? cible} est attaqué`, auteur);
  return rompues.length;
}

/**
 * 1a (ajout de Thomas) : une attaque touche un PJ concentré : sauvegarde de
 * CON, DD 10 ou la moitié des dégâts si c'est plus ; ratée, la
 * concentration tombe. Rend vrai si elle tient.
 */
export async function maintenirConcentration(
  idCombat: string,
  scene: string,
  pj: AvecId<Combattant>,
  fiche: Fiche,
  degats: number,
  combattants: readonly AvecId<Combattant>[],
  auteur: string,
  alea: () => number = Math.random,
): Promise<boolean> {
  if (!pj.concentration) return true;
  const dd = ddConcentration(degats);
  const de = d20(alea);
  const bonus = sauvegardesDuPj(fiche).CON + bonusFixe(pj.bonus, ['CON', 'sauvegardes', 'tests']);
  const total = de + bonus;
  const tient = total >= dd;
  await noterJet(`Concentration de ${pj.nom}`, formuleTest(bonus), { des: [de], faces: 20, bonus, total }, auteur, `sauvegarde de CON ${total} contre DD ${dd} : ${tient ? 'maintenue' : 'rompue'}`);
  if (!tient) await finirConcentration(idCombat, scene, pj, combattants, 'touché, sa sauvegarde de CON rate', auteur);
  return tient;
}

/**
 * Début du tour du mage (2a, 15a), joué par le client du MJ : il paie le
 * maintien de sa concentration, puis le Remous de ses invocations, en PP.
 * Sans de quoi payer, la concentration s'arrête, ou toutes ses invocations
 * retournent à la Mer. Rend les PP payés.
 *
 * L6.7b (6a) : chaque serviteur payé verse 1 au Remous de la scène, au nom
 * du maître.
 */
export async function payerDebutDeTour(idCombat: string, scene: string, c: AvecId<Combattant>, fiche: AvecId<Fiche> | null, combattants: readonly AvecId<Combattant>[]): Promise<number> {
  if (!fiche || fiche.schemaVersion !== 2) return 0;
  let pp = ppDisponibles(fiche as FicheV2);
  const avant = pp;
  const maintien = c.concentration?.maintien ?? 0;
  if (maintien) {
    if (pp >= maintien) {
      pp -= maintien;
      await noterJet(`Maintien : ${c.concentration!.nom}`, '0', { des: [], faces: 0, bonus: 0, total: maintien }, 'MJ', `${c.nom} paie ${maintien} PP pour maintenir ${c.concentration!.nom}.`);
    } else await finirConcentration(idCombat, scene, c, combattants, 'plus de PP pour la maintenir', 'MJ');
  }
  const remous = remousDu(combattants, c.id);
  if (remous) {
    if (pp >= remous) {
      pp -= remous;
      await noterJet('Remous', '0', { des: [], faces: 0, bonus: 0, total: remous }, 'MJ', `${c.nom} paie ${remous} PP de Remous pour ses invocations.`);
      await alimenterRemous(scene, invocationsDe(combattants, c.id).filter((x) => x.invocation?.remous).length, fiche.id);
    } else await retirerInvocations(idCombat, scene, invocationsDe(combattants, c.id), 'le Remous n’est pas payé, elles retournent à la Mer', 'MJ');
  }
  if (pp !== avant) await updateDoc(refPerso(fiche.id), { ppActuel: pp });
  return avant - pp;
}

/**
 * 7a : l'invocation attaque un monstre, à son tour : d20 + l'attaque
 * magique de son maître contre la DEF ; touchée, ses dés, après l'armure et
 * la résistance du monstre ; l'effet de son élément va au MJ. Son action
 * principale est prise.
 */
export async function attaqueDInvocation(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'actif'>,
  inv: AvecId<Combattant>,
  cible: AvecId<Combattant>,
  alea: () => number = Math.random,
  defEnPlus = 0,
): Promise<{ issue: IssueAttaque; net: number | null }> {
  const a = inv.invocation?.attaque;
  if (inv.genre !== 'invocation' || !a) throw new RefusCombat(`${inv.nom} n’attaque pas.`);
  if (combat.actif !== inv.id) throw new RefusCombat(`Ce n’est pas le tour de ${inv.nom}.`);
  if (cible.genre !== 'monstre' || cible.def === null) throw new RefusCombat('On attaque un monstre.');
  if (cible.aTerre) throw new RefusCombat(`${cible.nom} est déjà à terre.`);
  if (!ciblable(cible.etats)) throw new RefusCombat(`${cible.nom} ne peut pas être pris pour cible.`);
  if (peutAgir(inv.etats) !== 'oui') throw new RefusCombat(`${inv.nom} ne peut pas agir ce tour.`);
  const actions = actionsDuTour(inv, combat.tour);
  if (actions.principale) throw new RefusCombat('L’action principale est déjà prise ce tour.');
  const av = avantageAttaque(inv.etats, cible.etats);
  const d = d20Attaque(alea, av.avantage);
  const bonus = a.bonus + modificateur(inv.etats, ['attaque', 'attaqueContact']) + bonusFixe(inv.bonus, ['attaque', 'attaqueContact', 'tests']);
  const def = cible.def + modificateur(cible.etats, ['DEF']) + bonusFixe(cible.bonus, ['DEF', 'DEFContact']) + defEnPlus;
  const issue: IssueAttaque = { ...resoudreAttaque(d.garde, bonus, def, 20), ...(d.des.length > 1 ? { des: d.des } : {}) };
  const libelle = `${inv.nom} sur ${cible.nom}`;
  let net: number | null = null;
  let suite = '';
  await runTransaction(db, async (tx) => {
    const lu = await tx.get(refCombattant(idCombat, cible.id));
    if (!lu.exists()) throw new RefusCombat(`${cible.nom} n’est plus dans le combat.`);
    const m = schemaCombattant.parse(lu.data());
    let etats = rompre(m.etats, 'estAttaque');
    const maj: Record<string, unknown> = {};
    if (issue.touche) {
      const jet = lancerDegats(formuleDegats(a.des, issue.critique), alea);
      if (!jet) throw new RefusCombat(`Formule de dégâts illisible : « ${a.des} ».`);
      const dg = degatsSurMonstre(jet.total, m, typeSubi(a.typeDegats));
      const pv = Math.max(0, (m.pv ?? 0) - dg.net);
      net = dg.net;
      if (dg.net > 0) etats = rompre(etats, 'degatsSubis');
      Object.assign(maj, { pv, aTerre: pv <= 0 });
      suite = ` ; dégâts ${jet.total} (${jet.des.join(', ')}) ; ${dg.net} dégâts ${a.typeDegats} (${dg.detail}) → ${cible.nom} ${pv <= 0 ? 'tombe' : `${pv}/${m.pvMax} PV`}${inv.invocation?.element ? ` ; MJ : effet de l’élément ${inv.invocation.element}` : ''}`;
    }
    if (!memes(etats, m.etats)) maj.etats = etats;
    if (Object.keys(maj).length) tx.update(refCombattant(idCombat, cible.id), maj);
    tx.update(refCombattant(idCombat, inv.id), { tourActions: combat.tour, ...actions, principale: true, ...(memes(rompre(inv.etats, 'sesAttaques'), inv.etats) ? {} : { etats: rompre(inv.etats, 'sesAttaques') }) });
  });
  await noterJet(libelle, formuleTest(issue.bonus), { des: issue.des ?? [issue.de], faces: 20, bonus: issue.bonus, total: issue.total }, inv.nom, `${texteAttaque(issue)}${suite}`);
  return { issue, net };
}

/** 7a : l'invocation joue une capacité sur un allié (Aide, Purge…), à la place de frapper. */
export async function capaciteDInvocation(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'actif'>,
  inv: AvecId<Combattant>,
  nom: string,
  cible: AvecId<Combattant>,
  fiches: ReadonlyMap<string, AvecId<Fiche>>,
): Promise<string> {
  if (combat.actif !== inv.id || !inv.invocation) throw new RefusCombat(`Ce n’est pas le tour de ${inv.nom}.`);
  const actions = actionsDuTour(inv, combat.tour);
  if (actions.principale) throw new RefusCombat('L’action principale est déjà prise ce tour.');
  const cap = capacitesDe(inv.invocation.creature).find((c) => c.nom === nom);
  if (!cap) throw new RefusCombat(`${inv.nom} n’a pas ${nom}.`);
  if (!cap.effets) {
    await updateDoc(refCombattant(idCombat, inv.id), { tourActions: combat.tour, ...actions, principale: true });
    await noterJet(`${nom} : ${inv.nom}`, '0', { des: [], faces: 0, bonus: 0, total: 0 }, inv.nom, `MJ : ${cap.texte}`);
    return cap.texte;
  }
  if (cible.genre === 'monstre') throw new RefusCombat(`${nom} se joue sur un allié.`);
  const lus = new Map<string, Lu>([[cible.id, { c: cible, fiche: cible.perso ? (fiches.get(cible.perso) ?? null) : null }]]);
  const e = appliquerChangements(cap.effets(cible.id), lus, { id: inv.id, nom: inv.nom, fiche: null });
  const lot = writeBatch(db);
  for (const [id, m] of e.combattants) lot.update(refCombattant(idCombat, id), m);
  lot.update(refCombattant(idCombat, inv.id), { tourActions: combat.tour, ...actions, principale: true });
  await lot.commit();
  const texte = [...(e.lignes.get(cible.id) ?? []), ...e.auMj.map((x) => `MJ : ${x}`)].join(' ; ') || 'rien';
  await noterJet(`${nom} sur ${cible.nom}`, '0', { des: [], faces: 0, bonus: 0, total: 0 }, inv.nom, texte);
  return texte;
}

export { texteJet };
