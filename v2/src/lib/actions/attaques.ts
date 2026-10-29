import { doc, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { degatsSurMonstre, formuleDegats, lancerDegats, resoudreAttaque, texteAttaque, type AttaqueMonstre, type CarteDuCombat, type DegatsAppliques, type IssueAttaque, type TypeDegats } from '../combat/attaque';
import { degatsSurPj, type TypeDegatsSubis } from '../combat/attaques-pj';
import {
  affaibli,
  avantageAttaque,
  ciblable,
  consommerCharge,
  contactSeulement,
  d20Attaque,
  degatsParTour,
  ETATS_V1_VERS_REFONTE,
  etatDuCatalogue,
  immunise,
  leurre,
  modificateur,
  peutAgir,
  poserEtat,
  retirerEtat,
  rompre,
} from '../combat/etats';
import { etatPj, jetDeMort, texteJetDeMort, type IssueJetDeMort } from '../combat/mort';
import { actionsDuTour } from '../combat/ordre';
import { DEGATS_COLLISION_DECOR, DEGATS_COLLISION_JETON, pousser } from '../combat/poussee';
import { champsJauges, gainParDegatsSubis, gainParTouche, gainParVingtNaturel, payer, type Jauges } from '../combat/ressources';
import type { AttaqueSpeciale } from '../combat/speciales';
import { absorber, apresAttaque, bonusDes, bonusFixe, consommerBonus, poserBonus, texteBonus } from '../combat/bonus';
import { avecUsage, limiteDeLAttaque, refusDeLimite } from '../combat/monstres';
import { avecFaim, bonusBerserk, drainer, faimDe, faimNourrie, soigne, soinDuDemon, touchesBerserk, USAGE_BERSERK, type TraitsDemon } from '../combat/demons';
import { cibleDe } from '../combat/sorts';
import { reactionDisponible, USAGE_REACTION } from '../combat/reactions';
import { appliquerAffaibli } from '../effets/resolution';
import { vueFiche } from '../fiche/vue-fiche';
import { formuleTest, type Jet } from '../regles/des';
import { RefusEquipement, utiliser } from '../regles/equipement';
import { schemaCombattant, type Combat, type Combattant, type EtatCombat } from '../schemas/combat';
import type { Fiche } from '../schemas/fiche';
import { session } from '../session.svelte';
import { RefusCombat } from './combat';
import { noterJet } from './journal';
import { apresDeplacement } from './zones';
import { champsDuChangement } from './persos';

/*
 * Attaques et dégâts en combat (lot L6.2, décisions de Thomas du
 * 23/10/2026). Les règles sont dans lib/combat (attaque.ts, attaques-pj.ts,
 * mort.ts) ; ce module lance les dés, écrit et note au journal.
 *   - 1b, 2a, 5a : le joueur attaque un monstre à son tour, sur son client,
 *     contre sa DEF ; l'attaque prend son action principale ; touché, il
 *     lance ses dégâts, qui ôtent les PV du monstre après son armure et ses
 *     résistances (10a) ;
 *   - 6a : le MJ attaque un PJ avec une attaque du monstre : d20 + bonus
 *     contre la CA de la fiche ; touché, les dégâts de l'arme du monstre,
 *     après la réduction du PJ, ôtent les PV de la fiche ;
 *   - 7a : à 0 PV, le PJ est Mourant ; à son tour, il ne fait que son jet
 *     de mort ; un allié le relève (action principale) ;
 *   - 8a : « Subir des dégâts » : un montant et un type, après réduction ;
 *   - 9a : boire une potion prend l'action secondaire ;
 *   - 10a : chaque jet arrive au journal avec son détail.
 * Le jeton d'un monstre tombé par la main d'un joueur est marqué mort par
 * le client du MJ (CombatMj), seul à écrire les jetons d'un autre.
 *
 * Lot L6.3 (décisions de Thomas du 23/10/2026) : les états jouent dans
 * chaque attaque (modificateurs, avantage, Double, Aveuglé, rupture, 6a) ;
 * l'attaque d'un monstre pose son état à la touche (8) ; les ressources de
 * classe se paient et se gagnent (9a) ; les attaques spéciales posent leur
 * état ou repoussent, collision comprise (11a, 12a) ; Précision et Décharge
 * (13a) ; le MJ joue les dégâts de début de tour ; le MJ et le joueur
 * posent et retirent des états à la main (4b).
 *
 * Lot L6.4a (11a, 12a) : les bonus temporaires comptent dans les jets et
 * les dégâts (« prochaine frappe » : ils tombent avec elle) ; les PV
 * temporaires absorbent les dégâts avant les PV.
 */

type AvecId<T> = T & { id: string };

const refCombattant = (idCombat: string, c: string) => doc(db, `tables/${session.table}/combats/${idCombat}/combattants/${c}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);
const refJeton = (scene: string, id: string) => doc(db, `tables/${session.table}/scenes/${scene}/jetons/${id}`);
const d20 = (alea: () => number) => 1 + Math.floor(alea() * 20);
const memes = (a: readonly EtatCombat[], b: readonly EtatCombat[]) => JSON.stringify(a) === JSON.stringify(b);
/** Les gains de ressource d'une fiche ne s'écrivent que par son joueur ou le MJ. */
const peutEcrireJauges = (f: Fiche) => session.etape === 'mj' || f.proprietaireUid === session.uid;

/** L'action principale du tour, refusée si elle est déjà prise (5a, 7a). */
function principaleLibre(combat: Pick<Combat, 'tour'>, c: Combattant, quoi: string): Pick<Combattant, 'principale' | 'secondaire' | 'mvt' | 'sprint'> {
  const a = actionsDuTour(c, combat.tour);
  if (a.principale) throw new RefusCombat(`L’action principale est déjà prise ce tour : pas de ${quoi}.`);
  return a;
}

const avecPrincipale = (combat: Pick<Combat, 'tour'>, a: Pick<Combattant, 'principale' | 'secondaire' | 'mvt' | 'sprint'>) => ({ tourActions: combat.tour, ...a, principale: true });

/** Ce que l'attaque d'un monstre prend : son action principale, ou, en réaction (L6.5b, 5a, 7a), la réaction du round. */
function priseDeLAttaque(combat: Pick<Combat, 'tour'>, monstre: Combattant, reaction: boolean): Record<string, unknown> {
  if (!reaction) return avecPrincipale(combat, principaleLibre(combat, monstre, 'attaque'));
  if (!reactionDisponible(monstre)) throw new RefusCombat(`${monstre.nom} a déjà réagi ce round.`);
  return { usages: { ...monstre.usages, [USAGE_REACTION]: combat.tour } };
}

/** Ce que les états de l'attaquant lui interdisent (6a, 7b) : agir, viser loin. */
function peutAttaquer(attaquant: Combattant, mode: 'contact' | 'distance'): void {
  const agit = peutAgir(attaquant.etats);
  if (agit !== 'oui') throw new RefusCombat(agit === 'non' ? `${attaquant.nom} ne peut pas agir ce tour.` : `${attaquant.nom} ne peut que se déplacer ce tour.`);
  if (mode === 'distance' && contactSeulement(attaquant.etats)) throw new RefusCombat(`${attaquant.nom} n’attaque qu’au contact.`);
}

/**
 * Le jet d'attaque, états compris (6a) : bonus et DEF modifiés, avantage ou
 * désavantage, Double qui fait rater d'office ; les états rompus ou
 * consommés de part et d'autre.
 */
function jetAttaque(
  attaquant: Combattant,
  cible: Combattant,
  a: { bonus: number; seuilCritique: number; mode: 'contact' | 'distance'; defEnPlus?: number },
  defBase: number,
  alea: () => number,
): { issue: IssueAttaque | null; leurre: string | null; etatsAttaquant: EtatCombat[]; etatsCible: EtatCombat[] } {
  let etatsAttaquant = rompre(attaquant.etats, 'sesAttaques');
  let etatsCible = rompre(cible.etats, 'estAttaque');
  const l = leurre(cible.etats);
  if (l) return { issue: null, leurre: l.id, etatsAttaquant, etatsCible: consommerCharge(etatsCible, l.id) };
  const av = avantageAttaque(attaquant.etats, cible.etats);
  for (const id of av.consommes) etatsAttaquant = retirerEtat(etatsAttaquant, id);
  const d = d20Attaque(alea, av.avantage);
  const surAttaque = ['attaque', a.mode === 'contact' ? 'attaqueContact' : 'attaqueDistance'];
  const bonus = a.bonus + modificateur(attaquant.etats, surAttaque) + bonusFixe(attaquant.bonus, [...surAttaque, 'tests']);
  // L6.4b1 (11a) : `defEnPlus`, la couverture d'un terrain contre une attaque à distance.
  const def = defBase + modificateur(cible.etats, ['DEF']) + bonusFixe(cible.bonus, ['DEF', a.mode === 'contact' ? 'DEFContact' : 'DEFDistance']) + (a.defEnPlus ?? 0);
  const issue = { ...resoudreAttaque(d.garde, bonus, def, a.seuilCritique), ...(d.des.length > 1 ? { des: d.des } : {}) };
  return { issue, leurre: null, etatsAttaquant, etatsCible };
}

/** L'attaque d'arme jouée par le joueur : la normale (L6.2) ou une spéciale (L6.3). */
export interface AttaqueJouee {
  nom: string;
  bonus: number;
  seuilCritique: number;
  mode: 'contact' | 'distance';
  /** DEF en plus de la cible : sa couverture (L6.4b1, 11a). */
  defEnPlus?: number;
}

/**
 * Le joueur attaque un monstre (1b, 3a, 5a) : d20 + bonus contre sa DEF,
 * au journal ; l'action principale est prise. Rend l'issue : touché, le
 * joueur lance ensuite ses dégâts (2a). Lot L6.3 : `speciale` paie son coût
 * (9a, 10a) et, touché, pose son état ou repousse (11a, 12a) ; un coup qui
 * touche rapporte la ressource « par touche » (Ki), un 20 naturel la sienne
 * (Inspiration).
 */
export async function attaquer(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'round' | 'scene'>,
  attaquant: AvecId<Combattant>,
  cible: AvecId<Combattant>,
  a: AttaqueJouee,
  fiche: AvecId<Fiche>,
  alea: () => number = Math.random,
  speciale: { s: AttaqueSpeciale; estoc?: 'etat' | 'repousse'; carte?: CarteDuCombat | null; fiches?: ReadonlyMap<string, AvecId<Fiche>>; combattants?: readonly AvecId<Combattant>[] } | null = null,
): Promise<IssueAttaque> {
  if (cible.genre !== 'monstre' || cible.def === null) throw new RefusCombat('On attaque un monstre.');
  if (cible.aTerre) throw new RefusCombat(`${cible.nom} est déjà à terre.`);
  if (!ciblable(cible.etats)) throw new RefusCombat(`${cible.nom} ne peut pas être pris pour cible.`);
  peutAttaquer(attaquant, a.mode);
  const actions = principaleLibre(combat, attaquant, 'attaque');
  // Le coût d'une spéciale (9a, 10a) : sa ressource, ou son usage du combat.
  let jauges: Jauges = {};
  let usages = attaquant.usages;
  if (speciale) {
    const c = speciale.s.cout;
    if (c === 'unParCombat') {
      if (attaquant.usages.attaqueSpeciale) throw new RefusCombat('L’attaque spéciale du combat est déjà faite.');
      usages = { ...usages, attaqueSpeciale: combat.round };
    } else {
      const p = payer(fiche, c.ressource, c.montant);
      if (typeof p === 'string') throw new RefusCombat(p);
      jauges = p;
    }
  }
  const j = jetAttaque(attaquant, cible, a, cible.def, alea);
  const libelle = `${speciale ? speciale.s.nom : a.nom} sur ${cible.nom}`;
  const moi: Record<string, unknown> = { ...avecPrincipale(combat, actions) };
  if (!memes(j.etatsAttaquant, attaquant.etats)) moi.etats = j.etatsAttaquant;
  if (usages !== attaquant.usages) moi.usages = usages;
  let etatsCible = j.etatsCible;
  const issue = j.issue ?? { de: 0, bonus: a.bonus, total: 0, def: cible.def, touche: false, critique: false, echecCritique: false };
  // Gains de ressource (9a) : par touche (Ki, plafonné au round), sur un 20 naturel (Inspiration).
  if (issue.touche) {
    const g = gainParTouche(fiche, attaquant, combat.round);
    if (g) {
      jauges = { ...jauges, ...g.jauges };
      moi.gainTouche = g.gainTouche;
    }
  }
  if (j.issue) jauges = { ...jauges, ...gainParVingtNaturel(fiche, j.issue.de) };
  // L'état de la spéciale, touché (11a ; Coup d'estoc : au choix, 12a).
  let pousse = false;
  let immunite = '';
  if (speciale && issue.touche) {
    const e = speciale.s.effet;
    // L6.6a (8a) : un état dont le monstre est immunisé ne se pose pas.
    if ((e.type === 'etat' || (e.type === 'estoc' && speciale.estoc !== 'repousse')) && immunise(cible, e.etat)) immunite = ` ; immunisé : ${etatDuCatalogue(e.etat)?.nom ?? e.etat}`;
    else if (e.type === 'etat' || (e.type === 'estoc' && speciale.estoc !== 'repousse')) etatsCible = poserEtat(etatsCible, e.etat, e.rounds, fiche.nom);
    if (e.type === 'repousse' || (e.type === 'estoc' && speciale.estoc === 'repousse')) pousse = true;
  }
  const lot = writeBatch(db);
  lot.update(refCombattant(idCombat, attaquant.id), moi);
  if (!memes(etatsCible, cible.etats)) lot.update(refCombattant(idCombat, cible.id), { etats: etatsCible });
  if (Object.keys(jauges).length) lot.update(refPerso(fiche.id), champsJauges(jauges));
  await lot.commit();
  if (j.leurre) {
    await noterJet(libelle, formuleTest(a.bonus), { des: [], faces: 0, bonus: a.bonus, total: 0 }, fiche.nom, `${etatDuCatalogue(j.leurre)?.nom ?? j.leurre} : l’attaque rate d’office.`);
    return issue;
  }
  await noterJet(libelle, formuleTest(issue.bonus), { des: issue.des ?? [issue.de], faces: 20, bonus: issue.bonus, total: issue.total }, fiche.nom, `${texteAttaque(issue)}${immunite}`);
  if (pousse && speciale?.carte) await repousser(idCombat, combat.scene, attaquant, cible, speciale.carte, speciale.combattants ?? [], speciale.fiches ?? new Map(), fiche.nom, alea, combat);
  return issue;
}

/**
 * Les dégâts sur un monstre (2a, 3a, 10a) : la formule de l'arme, ses dés
 * doublés sur un critique ; l'armure puis la résistance du monstre ; ses
 * PV lus et écrits dans une transaction (deux coups au même moment ne
 * s'écrasent pas). Lot L6.3 : les états de l'attaquant (+ dégâts,
 * Affaibli) et sa Précision ; les dégâts rompent les états de la cible
 * que les dégâts rompent (Endormi).
 */
export async function infligerDegats(
  idCombat: string,
  cible: AvecId<Combattant>,
  d: { nom: string; formule: string; typeDegats: TypeDegats; critique: boolean },
  perso: string,
  alea: () => number = Math.random,
  attaquant: AvecId<Combattant> | null = null,
): Promise<{ jet: Jet; degats: DegatsAppliques; pv: number }> {
  const plus = attaquant ? modificateur(attaquant.etats, ['degats']) + bonusFixe(attaquant.bonus, ['degats']) : 0;
  const visee = attaquant?.visee ? (d.critique ? '+1d10' : '+1d6') : '';
  const desEnPlus = attaquant ? bonusDes(attaquant.bonus, ['degats']).map((x) => `+${x}`).join('') : '';
  const formule = `${formuleDegats(d.formule, d.critique)}${visee}${desEnPlus}${plus ? (plus > 0 ? `+${plus}` : plus) : ''}`;
  const jet = lancerDegats(formule, alea);
  if (!jet) throw new RefusCombat(`Formule de dégâts illisible : « ${formule} ».`);
  const faible = attaquant ? affaibli(attaquant.etats) : null;
  const r = await runTransaction(db, async (tx) => {
    const lu = await tx.get(refCombattant(idCombat, cible.id));
    if (!lu.exists()) throw new RefusCombat(`${cible.nom} n’est plus dans le combat.`);
    const c = schemaCombattant.parse(lu.data());
    if (c.pv === null) throw new RefusCombat('On blesse un monstre.'); // un PJ n'a pas de PV ici : ils sont sur sa fiche
    const brut = degatsSurMonstre(jet.total, c, d.typeDegats);
    const net = faible ? appliquerAffaibli(brut.net, faible.pourcent, faible.minimum) : brut.net;
    const t = absorber(c.pvTemp, net);
    const degats = { ...brut, net, detail: `${net !== brut.net ? `${brut.detail}, affaibli : ${net}` : brut.detail}${t.pvTemp !== c.pvTemp ? `, ${c.pvTemp - t.pvTemp} sur les PV temporaires` : ''}` };
    const pv = Math.max(0, c.pv - t.reste);
    const etats = net > 0 ? rompre(c.etats, 'degatsSubis') : c.etats;
    tx.update(refCombattant(idCombat, cible.id), { pv, aTerre: pv <= 0, ...(memes(etats, c.etats) ? {} : { etats }), ...(t.pvTemp !== c.pvTemp ? { pvTemp: t.pvTemp } : {}) });
    const restants = attaquant ? consommerBonus(attaquant.bonus, ['degats']) : [];
    const moi: Record<string, unknown> = {};
    if (attaquant?.visee) moi.visee = false;
    if (attaquant && restants.length !== attaquant.bonus.length) moi.bonus = restants;
    if (attaquant && Object.keys(moi).length) tx.update(refCombattant(idCombat, attaquant.id), moi);
    return { degats, pv, pvMax: c.pvMax! };
  });
  const suite = r.pv <= 0 ? `${cible.nom} tombe` : `${cible.nom} ${r.pv}/${r.pvMax} PV`;
  await noterJet(`Dégâts ${d.nom} sur ${cible.nom}${d.critique ? ' (critique)' : ''}`, formule.slice(0, 40), jet, perso, `${r.degats.detail} → ${suite}`);
  return { jet, degats: r.degats, pv: r.pv };
}

/**
 * Blesser un combattant hors d'une attaque (collision, dégâts de début de
 * tour) : un monstre, ses PV en transaction (armure et résistance) ; un PJ,
 * sa fiche (sa réduction), son gain « par dégâts subis » si on peut
 * l'écrire. Les états que les dégâts rompent tombent. Au journal.
 */
export async function blesser(
  idCombat: string,
  c: AvecId<Combattant>,
  fiche: AvecId<Fiche> | null,
  jet: Jet,
  formule: string,
  type: TypeDegats,
  libelle: string,
  auteur: string,
): Promise<number> {
  if (c.genre !== 'pj') {
    const r = await runTransaction(db, async (tx) => {
      const lu = await tx.get(refCombattant(idCombat, c.id));
      if (!lu.exists()) throw new RefusCombat(`${c.nom} n’est plus dans le combat.`);
      const m = schemaCombattant.parse(lu.data());
      const d = degatsSurMonstre(jet.total, m, type);
      const t = absorber(m.pvTemp, d.net);
      const pv = Math.max(0, (m.pv ?? 0) - t.reste);
      const etats = d.net > 0 ? rompre(m.etats, 'degatsSubis') : m.etats;
      tx.update(refCombattant(idCombat, c.id), { pv, aTerre: pv <= 0, ...(memes(etats, m.etats) ? {} : { etats }), ...(t.pvTemp !== m.pvTemp ? { pvTemp: t.pvTemp } : {}) });
      return { d, pv, pvMax: m.pvMax! };
    });
    await noterJet(libelle, formule, jet, auteur, `${r.d.detail} → ${c.nom} ${r.pv <= 0 ? 'tombe' : `${r.pv}/${r.pvMax} PV`}`);
    return r.d.net;
  }
  if (!fiche) throw new RefusCombat(`La fiche de ${c.nom} manque.`);
  const vue = vueFiche(fiche);
  const d = degatsSurPj(fiche, jet.total, type);
  const t = absorber(c.pvTemp, d.net);
  const pv = Math.max(0, vue.pv.actuel - t.reste);
  const lot = writeBatch(db);
  const gain = peutEcrireJauges(fiche) ? gainParDegatsSubis(fiche, d.net) : {};
  if (pv !== vue.pv.actuel || Object.keys(gain).length) lot.update(refPerso(fiche.id), { pvActuel: pv, ...champsJauges(gain) });
  const etats = d.net > 0 ? rompre(c.etats, 'degatsSubis') : c.etats;
  const maj: Record<string, unknown> = memes(etats, c.etats) ? {} : { etats };
  if (t.pvTemp !== c.pvTemp) maj.pvTemp = t.pvTemp;
  if (Object.keys(maj).length) lot.update(refCombattant(idCombat, c.id), maj);
  await lot.commit();
  await noterJet(libelle, formule, jet, auteur, `${d.detail} → ${fiche.nom} ${pv}/${vue.pv.max} PV${pv <= 0 ? ', Mourant' : ''}`);
  return d.net;
}

/**
 * Repousser d'une case (12a) : le jeton de la cible recule dans l'axe de
 * l'attaquant ; une case prise, c'est la collision : 1d4 à chacun contre un
 * jeton, 1d6 au poussé contre le décor.
 */
export async function repousser(
  idCombat: string,
  scene: string,
  attaquant: AvecId<Combattant>,
  cible: AvecId<Combattant>,
  carte: CarteDuCombat,
  combattants: readonly AvecId<Combattant>[],
  fiches: ReadonlyMap<string, AvecId<Fiche>>,
  auteur: string,
  alea: () => number = Math.random,
  combat: Pick<Combat, 'tour'> | null = null,
): Promise<'pousse' | 'jeton' | 'decor' | null> {
  const p = pousser(carte.scene, carte.jetons, attaquant.id, cible.id);
  if (!p) return null;
  if ('vers' in p) {
    await updateDoc(refJeton(scene, cible.id), { cx: p.vers.cx, cy: p.vers.cy });
    // L6.4b1 (7a) : repoussé dans une zone du combat, il la déclenche.
    const de = carte.jetons.find((j) => j.id === cible.id);
    if (de && carte.zones?.length && combat)
      await apresDeplacement(
        { lieu: { combat: idCombat }, zones: carte.zones.filter((z) => !carte.idsZonesCombat || carte.idsZonesCombat.has(z.id)), jetons: carte.jetons, combat: { id: idCombat, tour: combat.tour }, combattants, fiches, auteur },
        { id: cible.id, de, vers: p.vers },
        alea,
      );
    return 'pousse';
  }
  const ficheDe = (c: AvecId<Combattant>) => (c.perso ? (fiches.get(c.perso) ?? null) : null);
  const formule = p.collision === 'jeton' ? DEGATS_COLLISION_JETON : DEGATS_COLLISION_DECOR;
  await blesser(idCombat, cible, ficheDe(cible), lancerDegats(formule, alea)!, formule, 'physique', `Collision : ${cible.nom} ${p.collision === 'jeton' ? 'heurte un jeton' : 'heurte le décor'}`, auteur);
  const autre = p.collision === 'jeton' ? combattants.find((c) => c.id === p.avec) : undefined;
  if (autre) await blesser(idCombat, autre, ficheDe(autre), lancerDegats(formule, alea)!, formule, 'physique', `Collision : ${autre.nom} est heurté`, auteur);
  return p.collision;
}

/** Précision (13a) : il vise, l'action principale et le coût de la spéciale ; sa prochaine attaque gagne +1d6 (+1d10 sur un critique). */
export async function viser(idCombat: string, combat: Pick<Combat, 'tour' | 'round'>, c: AvecId<Combattant>, s: AttaqueSpeciale, fiche: AvecId<Fiche>): Promise<void> {
  peutAttaquer(c, 'distance');
  const actions = principaleLibre(combat, c, 'visée');
  const lot = writeBatch(db);
  const moi: Record<string, unknown> = { ...avecPrincipale(combat, actions), visee: true };
  if (s.cout === 'unParCombat') {
    if (c.usages.attaqueSpeciale) throw new RefusCombat('L’attaque spéciale du combat est déjà faite.');
    moi.usages = { ...c.usages, attaqueSpeciale: combat.round };
  } else {
    const p = payer(fiche, s.cout.ressource, s.cout.montant);
    if (typeof p === 'string') throw new RefusCombat(p);
    lot.update(refPerso(fiche.id), champsJauges(p));
  }
  lot.update(refCombattant(idCombat, c.id), moi);
  await lot.commit();
  await noterJet('Précision', '0', { des: [], faces: 0, bonus: 0, total: 0 }, fiche.nom, `${fiche.nom} vise : sa prochaine attaque gagne +1d6 aux dégâts (+1d10 sur un critique).`);
}

/** Décharge (13a) : trois balles de 1d4, trois cibles au plus, un jet par balle ; les dégâts de chaque balle qui touche sont appliqués d'office. */
export async function decharger(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'round' | 'scene'>,
  attaquant: AvecId<Combattant>,
  cibles: readonly AvecId<Combattant>[],
  s: AttaqueSpeciale,
  fiche: AvecId<Fiche>,
  alea: () => number = Math.random,
): Promise<number> {
  if (!cibles.length || cibles.length > 3) throw new RefusCombat('Une à trois cibles.');
  const [premiere, ...autres] = cibles;
  const issue = await attaquer(idCombat, combat, attaquant, premiere!, { ...s.arme, nom: s.nom, mode: s.arme.mode }, fiche, alea, { s });
  let touches = 0;
  const balle = async (c: AvecId<Combattant>, i: IssueAttaque) => {
    if (!i.touche) return;
    touches++;
    await infligerDegats(idCombat, c, { nom: 'Décharge', formule: '1d4', typeDegats: 'physique', critique: i.critique }, fiche.nom, alea);
  };
  await balle(premiere!, issue);
  for (const c of autres) {
    if (c.genre !== 'monstre' || c.def === null || c.aTerre) continue;
    const j = jetAttaque(attaquant, c, { ...s.arme, mode: s.arme.mode }, c.def, alea);
    if (!j.issue) continue;
    if (!memes(j.etatsCible, c.etats)) await updateDoc(refCombattant(idCombat, c.id), { etats: j.etatsCible });
    await noterJet(`Décharge sur ${c.nom}`, formuleTest(j.issue.bonus), { des: j.issue.des ?? [j.issue.de], faces: 20, bonus: j.issue.bonus, total: j.issue.total }, fiche.nom, texteAttaque(j.issue));
    await balle(c, j.issue);
  }
  return touches;
}

/**
 * MJ : un monstre attaque un PJ (6a), d'un clic : d20 + bonus contre la CA
 * de la fiche ; touché, les dégâts de l'arme du monstre (dés doublés sur
 * un critique), moins la réduction du PJ, ôtés de ses PV. L'action
 * principale du monstre est prise. Lot L6.3 : les états des deux côtés
 * (6a) ; l'état de l'attaque posé à la touche, sans sauvegarde (8) ; le
 * gain « par dégâts subis » du PJ (9a).
 */
export async function attaqueDeMonstre(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'round'>,
  monstre: AvecId<Combattant>,
  a: AttaqueMonstre & { defEnPlus?: number },
  cible: AvecId<Combattant>,
  fiche: AvecId<Fiche>,
  alea: () => number = Math.random,
  reaction = false,
  /** L6.6a (6b) : le jet suivant d'une attaque à plusieurs jets : ni action ni usage de plus. */
  jetSuivant = false,
  /** L6.6b : ce que le bestiaire dit du démon (faim, berserk, Puits, Vol de sève) ; null : un monstre ordinaire. */
  demon: TraitsDemon | null = null,
): Promise<{ issue: IssueAttaque; net: number | null; pv: number; etat: string | null; repousse: number }> {
  if (monstre.genre !== 'monstre') throw new RefusCombat('Seul un monstre attaque depuis ce panneau.');
  if (cible.genre !== 'pj' || cible.perso !== fiche.id) throw new RefusCombat('On attaque un PJ du combat.');
  if (!ciblable(cible.etats)) throw new RefusCombat(`${cible.nom} ne peut pas être pris pour cible.`);
  peutAttaquer(monstre, a.portee.vue ? 'distance' : 'contact');
  // L6.6a (6b) : ses limites (par combat, par round, recharge), comptées dans ses usages.
  const effet = a.effet ?? null;
  const limite = limiteDeLAttaque(effet);
  const refus = jetSuivant ? null : refusDeLimite(monstre, a.nom, limite, combat.round);
  if (refus) throw new RefusCombat(`${a.nom} : ${refus}.`);
  const prise: Record<string, unknown> = jetSuivant ? {} : priseDeLAttaque(combat, monstre, reaction);
  if (!jetSuivant && (limite.parCombat || limite.parRound || limite.recharge)) prise.usages = avecUsage((prise.usages as Record<string, number> | undefined) ?? monstre.usages, a.nom, limite, combat.round);
  const vue = vueFiche(fiche);
  const j = jetAttaque(monstre, cible, { ...a, mode: a.portee.vue ? 'distance' : 'contact', defEnPlus: (a.defEnPlus ?? 0) - (effet?.defIgnoree ?? 0) }, vue.stats.ca, alea);
  const issue = j.issue ?? { de: 0, bonus: a.bonus, total: 0, def: vue.stats.ca, touche: false, critique: false, echecCritique: false };
  // L'état de l'attaque (8), traduit du bestiaire (1a) ; inconnu, il est dit au journal.
  let etatsCible = j.etatsCible;
  let etat: string | null = null;
  let etatInconnu: string | null = null;
  if (issue.touche && a.etatSurTouche) {
    const id = etatDuCatalogue(a.etatSurTouche.id) ? a.etatSurTouche.id : ETATS_V1_VERS_REFONTE[a.etatSurTouche.id];
    if (id && etatDuCatalogue(id)) {
      etatsCible = poserEtat(etatsCible, id, a.etatSurTouche.duree, monstre.nom, { des: a.etatSurTouche.formuleDot ?? null });
      etat = id;
    } else etatInconnu = a.etatSurTouche.id;
  }
  // L6.5b (8a) : le bonus d'une réaction « contre cette attaque » tombe avec elle.
  const bonusMonstre = apresAttaque(monstre.bonus, 'attaquant');
  const bonusCible = apresAttaque(cible.bonus, 'cible');
  const majMonstre: Record<string, unknown> = { ...prise, ...(memes(j.etatsAttaquant, monstre.etats) ? {} : { etats: j.etatsAttaquant }), ...(bonusMonstre.length !== monstre.bonus.length ? { bonus: bonusMonstre } : {}) };
  // L6.6b (6a) : raté, le berserk lui coûte son bonus en PV et retombe à 0.
  const usagesMonstre = (prise.usages as Record<string, number> | undefined) ?? monstre.usages;
  const coutBerserk = !issue.touche && demon ? bonusBerserk(monstre, demon) : 0;
  if (coutBerserk) {
    const reste = Math.max(0, (monstre.pv ?? 0) - coutBerserk);
    const { [USAGE_BERSERK]: _b, ...sans } = usagesMonstre;
    Object.assign(majMonstre, { pv: reste, aTerre: reste <= 0, usages: sans });
  }
  // Le jet suivant (6b) ne prend rien : sans changement, pas d'écriture.
  const lot = writeBatch(db);
  if (Object.keys(majMonstre).length) lot.update(refCombattant(idCombat, monstre.id), majMonstre);
  await lot.commit();
  const t = `${j.leurre ? `${etatDuCatalogue(j.leurre)?.nom ?? j.leurre} : l’attaque rate d’office.` : texteAttaque(issue, 'CA')}${coutBerserk ? ` ; berserk : ${monstre.nom} perd ${coutBerserk} PV` : ''}`;
  await noterJet(`${reaction ? 'Opportunité : ' : ''}${a.nom} sur ${fiche.nom}`, formuleTest(issue.bonus), { des: j.leurre ? [] : (issue.des ?? [issue.de]), faces: 20, bonus: issue.bonus, total: issue.total }, monstre.nom, t);
  const bonusTombe = bonusCible.length !== cible.bonus.length ? { bonus: bonusCible } : {};
  if (!issue.touche) {
    const maj = { ...(memes(etatsCible, cible.etats) ? {} : { etats: etatsCible }), ...bonusTombe };
    if (Object.keys(maj).length) await updateDoc(refCombattant(idCombat, cible.id), maj);
    return { issue, net: null, pv: vue.pv.actuel, etat: null, repousse: 0 };
  }
  const plus = modificateur(monstre.etats, ['degats']) + bonusFixe(monstre.bonus, ['degats']) + (demon ? bonusBerserk(monstre, demon) : 0);
  const formule = `${formuleDegats(a.formule, issue.critique)}${bonusDes(monstre.bonus, ['degats']).map((x) => `+${x}`).join('')}${plus ? (plus > 0 ? `+${plus}` : plus) : ''}`;
  const jet = lancerDegats(formule, alea);
  if (!jet) throw new RefusCombat(`Formule de dégâts illisible : « ${formule} ».`);
  const brut = degatsSurPj(fiche, jet.total, a.typeDegats);
  const faible = affaibli(monstre.etats);
  const net = faible ? appliquerAffaibli(brut.net, faible.pourcent, faible.minimum) : brut.net;
  const absorbe = absorber(cible.pvTemp, net);
  // L6.6b (4a) : la Morsure d'ancrage draine les PP qu'il y a ; le reste, en PV.
  const drain = a.drainPP ? drainer(a.drainPP, vue.pp?.actuel ?? null) : null;
  const pv = Math.max(0, vue.pv.actuel - absorbe.reste - (drain?.pv ?? 0));
  if (net > 0) etatsCible = rompre(etatsCible, 'degatsSubis');
  if (etat && !etatsCible.some((e) => e.id === etat)) etatsCible = poserEtat(etatsCible, etat, a.etatSurTouche!.duree, monstre.nom, { des: a.etatSurTouche!.formuleDot ?? null });
  // L6.6a (6b) : l'effet traduit, après la sauvegarde de la cible s'il en a une ; ce qui reste va au MJ.
  let bonusFinal = bonusCible;
  let repousse = 0;
  const effets: string[] = [];
  if (effet?.etats || effet?.malus || effet?.repousse) {
    let sauve = false;
    if (effet.sauvegarde) {
      const d = 1 + Math.floor(alea() * 20);
      const total = d + cibleDe(cible, fiche, 0).sauvegardes[effet.sauvegarde.type];
      sauve = total >= effet.sauvegarde.dd;
      effets.push(`sauvegarde de ${effet.sauvegarde.type} ${total} (d20 ${d}) contre ${effet.sauvegarde.dd} : ${sauve ? 'réussie' : 'ratée'}`);
    }
    if (!sauve) {
      for (const x of effet.etats ?? []) {
        etatsCible = poserEtat(etatsCible, x.id, x.rounds, monstre.nom, { des: x.des ?? null });
        effets.push(`${etatDuCatalogue(x.id)?.nom ?? x.id}${x.rounds ? ` ${x.rounds} round${x.rounds > 1 ? 's' : ''}` : ''}`);
      }
      for (const m of effet.malus ?? []) {
        const b = { sur: m.sur, valeur: m.valeur, rounds: m.rounds, consomme: false, typeDegats: null, source: monstre.nom.slice(0, 40) };
        // Le même malus du même monstre ne se cumule pas : il repart pour sa durée.
        bonusFinal = poserBonus(bonusFinal.filter((x) => !(x.sur === b.sur && x.valeur === b.valeur && x.source === b.source)), b);
        effets.push(texteBonus(b));
      }
      repousse = effet.repousse ?? 0;
      if (repousse) effets.push(`repoussé de ${repousse} case${repousse > 1 ? 's' : ''}`);
    }
  }
  if (drain) effets.push(`drain : ${[drain.pp ? `${drain.pp} PP` : '', drain.pv ? `${drain.pv} PV` : ''].filter(Boolean).join(', ')}`);
  // L6.6b (1a, 6a, 7a) : le démon touche : sa faim, son berserk, son Puits et son Vol de sève.
  const majDemon: Record<string, unknown> = {};
  if (demon) {
    let u: Record<string, number> = usagesMonstre;
    const faim = faimNourrie(demon, { ppDraines: drain?.pp ?? 0, degatsInfliges: net });
    if (faim) u = avecFaim(u, faim);
    if (demon.berserk) u = { ...u, [USAGE_BERSERK]: Math.min(999, touchesBerserk(monstre) + 1) };
    if (u !== usagesMonstre) majDemon.usages = u;
    const pvDemon = soigne(monstre, soinDuDemon(demon, drain?.pp ?? 0, net));
    if (pvDemon !== monstre.pv) majDemon.pv = pvDemon;
    if (faim && demon.faim) effets.push(`faim ${faimDe({ usages: u })}/${demon.faim.seuil}`);
    if (demon.berserk) effets.push(`berserk +${bonusBerserk({ usages: u }, demon)}`);
    if (pvDemon !== monstre.pv) effets.push(`${monstre.nom} regagne ${pvDemon - (monstre.pv ?? 0)} PV`);
  }
  const auMj = effet ? effet.auMj : (a.texte ?? null);
  if (auMj) effets.push(`MJ : ${auMj}`);
  const lot2 = writeBatch(db);
  lot2.update(refPerso(fiche.id), { pvActuel: pv, ...(drain?.pp ? { ppActuel: (vue.pp?.actuel ?? 0) - drain.pp } : {}), ...champsJauges(gainParDegatsSubis(fiche, net)) });
  const majCible: Record<string, unknown> = { ...(memes(etatsCible, cible.etats) ? {} : { etats: etatsCible }), ...(JSON.stringify(bonusFinal) === JSON.stringify(cible.bonus) ? {} : { bonus: bonusFinal }) };
  if (absorbe.pvTemp !== cible.pvTemp) majCible.pvTemp = absorbe.pvTemp;
  if (Object.keys(majCible).length) lot2.update(refCombattant(idCombat, cible.id), majCible);
  const restants = consommerBonus(bonusMonstre, ['degats']);
  if (restants.length !== bonusMonstre.length) majDemon.bonus = restants;
  if (Object.keys(majDemon).length) lot2.update(refCombattant(idCombat, monstre.id), majDemon);
  await lot2.commit();
  const suite = [etat ? `${etatDuCatalogue(etat)!.nom} ${a.etatSurTouche!.duree} round${a.etatSurTouche!.duree > 1 ? 's' : ''}` : '', etatInconnu ? `état « ${etatInconnu} » inconnu de la refonte, au MJ` : '', ...effets]
    .filter(Boolean)
    .join(' ; ');
  await noterJet(
    `Dégâts ${a.nom} sur ${fiche.nom}${issue.critique ? ' (critique)' : ''}`,
    formule.slice(0, 40),
    jet,
    monstre.nom,
    `${brut.detail}${net !== brut.net ? `, affaibli : ${net}` : ''}${absorbe.pvTemp !== cible.pvTemp ? `, ${cible.pvTemp - absorbe.pvTemp} sur les PV temporaires` : ''} → ${fiche.nom} ${pv}/${vue.pv.max} PV${pv <= 0 ? ', Mourant' : ''}${suite ? ` ; ${suite}` : ''}`,
  );
  return { issue, net, pv, etat, repousse };
}

/** L6.6a (6b) : repoussé de `cases` cases, une à une ; une collision l'arrête. */
export async function repousserDe(
  cases: number,
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'scene'>,
  attaquant: AvecId<Combattant>,
  cible: AvecId<Combattant>,
  carte: CarteDuCombat,
  combattants: readonly AvecId<Combattant>[],
  fiches: ReadonlyMap<string, AvecId<Fiche>>,
  auteur: string,
  alea: () => number = Math.random,
): Promise<number> {
  let jetons = carte.jetons;
  let n = 0;
  for (; n < cases; n++) {
    const p = pousser(carte.scene, jetons, attaquant.id, cible.id);
    const r = await repousser(idCombat, combat.scene, attaquant, cible, { ...carte, jetons }, combattants, fiches, auteur, alea, combat);
    if (r !== 'pousse' || !p || !('vers' in p)) break;
    const vers = p.vers;
    jetons = jetons.map((j) => (j.id === cible.id ? { ...j, cx: vers.cx, cy: vers.cy } : j));
  }
  return n;
}

/**
 * MJ : un monstre attaque une invocation (L6.4b2, 10a) : d20 + bonus contre
 * sa DEF (une barricade, un objet, est toujours touchée) ; touchée, les
 * dégâts de l'arme du monstre ôtent ses PV en chiffres (sans armure ni
 * résistance), dans une transaction. À 0 PV, le client du MJ la retire.
 */
export async function attaqueSurInvocation(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'round'>,
  monstre: AvecId<Combattant>,
  a: AttaqueMonstre & { defEnPlus?: number },
  cible: AvecId<Combattant>,
  alea: () => number = Math.random,
  reaction = false,
): Promise<{ issue: IssueAttaque; net: number | null; pv: number }> {
  if (monstre.genre !== 'monstre') throw new RefusCombat('Seul un monstre attaque depuis ce panneau.');
  if (cible.genre !== 'invocation' || cible.def === null || cible.pv === null) throw new RefusCombat('On attaque une invocation du combat.');
  if (!ciblable(cible.etats)) throw new RefusCombat(`${cible.nom} ne peut pas être pris pour cible.`);
  peutAttaquer(monstre, a.portee.vue ? 'distance' : 'contact');
  // L6.6a (6b) : ses limites comptent aussi contre une invocation.
  const limite = limiteDeLAttaque(a.effet ?? null);
  const refus = refusDeLimite(monstre, a.nom, limite, combat.round);
  if (refus) throw new RefusCombat(`${a.nom} : ${refus}.`);
  const prise: Record<string, unknown> = priseDeLAttaque(combat, monstre, reaction);
  if (limite.parCombat || limite.parRound || limite.recharge) prise.usages = avecUsage((prise.usages as Record<string, number> | undefined) ?? monstre.usages, a.nom, limite, combat.round);
  const j = jetAttaque(monstre, cible, { ...a, mode: a.portee.vue ? 'distance' : 'contact' }, cible.def, alea);
  const brute = j.issue ?? { de: 0, bonus: a.bonus, total: 0, def: cible.def, touche: false, critique: false, echecCritique: false };
  const issue = cible.invocation?.objet && !j.leurre ? { ...brute, touche: true } : brute;
  const bonusMonstre = apresAttaque(monstre.bonus, 'attaquant');
  await updateDoc(refCombattant(idCombat, monstre.id), { ...prise, ...(memes(j.etatsAttaquant, monstre.etats) ? {} : { etats: j.etatsAttaquant }), ...(bonusMonstre.length !== monstre.bonus.length ? { bonus: bonusMonstre } : {}) });
  const t = j.leurre ? `${etatDuCatalogue(j.leurre)?.nom ?? j.leurre} : l’attaque rate d’office.` : cible.invocation?.objet ? 'un objet : touché d’office' : texteAttaque(issue);
  await noterJet(`${reaction ? 'Opportunité : ' : ''}${a.nom} sur ${cible.nom}`, formuleTest(issue.bonus), { des: j.leurre ? [] : (issue.des ?? [issue.de]), faces: 20, bonus: issue.bonus, total: issue.total }, monstre.nom, t);
  if (!issue.touche) {
    if (!memes(j.etatsCible, cible.etats)) await updateDoc(refCombattant(idCombat, cible.id), { etats: j.etatsCible });
    return { issue, net: null, pv: cible.pv };
  }
  const plus = modificateur(monstre.etats, ['degats']) + bonusFixe(monstre.bonus, ['degats']);
  const formule = `${formuleDegats(a.formule, issue.critique)}${plus ? (plus > 0 ? `+${plus}` : plus) : ''}`;
  const jet = lancerDegats(formule, alea);
  if (!jet) throw new RefusCombat(`Formule de dégâts illisible : « ${formule} ».`);
  const faible = affaibli(monstre.etats);
  const r = await runTransaction(db, async (tx) => {
    const lu = await tx.get(refCombattant(idCombat, cible.id));
    if (!lu.exists()) throw new RefusCombat(`${cible.nom} n’est plus dans le combat.`);
    const c = schemaCombattant.parse(lu.data());
    const brut = degatsSurMonstre(jet.total, c, a.typeDegats);
    const net = faible ? appliquerAffaibli(brut.net, faible.pourcent, faible.minimum) : brut.net;
    const abs = absorber(c.pvTemp, net);
    const pv = Math.max(0, (c.pv ?? 0) - abs.reste);
    const etats = net > 0 ? rompre(j.etatsCible, 'degatsSubis') : j.etatsCible;
    tx.update(refCombattant(idCombat, cible.id), { pv, aTerre: pv <= 0, ...(memes(etats, c.etats) ? {} : { etats }), ...(abs.pvTemp !== c.pvTemp ? { pvTemp: abs.pvTemp } : {}) });
    return { net, detail: brut.detail, pv, pvMax: c.pvMax! };
  });
  await noterJet(`Dégâts ${a.nom} sur ${cible.nom}${issue.critique ? ' (critique)' : ''}`, formule.slice(0, 40), jet, monstre.nom, `${r.detail} → ${cible.nom} ${r.pv <= 0 ? 'retourne à la Mer' : `${r.pv}/${r.pvMax} PV`}`);
  return { issue, net: r.net, pv: r.pv };
}

/**
 * « Subir des dégâts » (8a, 10a) : un montant et un type, après réduction,
 * ôtés des PV de la fiche ; au journal. Lot L6.3 : le gain « par dégâts
 * subis » (9a) ; en combat, les états que les dégâts rompent tombent.
 */
export async function subirDegats(fiche: AvecId<Fiche>, brut: number, type: TypeDegatsSubis, enCombat: { idCombat: string; c: AvecId<Combattant> } | null = null): Promise<{ net: number; pv: number }> {
  if (!Number.isFinite(brut) || brut < 0 || brut > 9999) throw new RefusCombat('Donne un nombre de dégâts.');
  const vue = vueFiche(fiche);
  const d = degatsSurPj(fiche, brut, type);
  const t = absorber(enCombat?.c.pvTemp ?? 0, d.net);
  const pv = Math.max(0, vue.pv.actuel - t.reste);
  const lot = writeBatch(db);
  lot.update(refPerso(fiche.id), { pvActuel: pv, ...champsJauges(gainParDegatsSubis(fiche, d.net)) });
  if (enCombat && d.net > 0) {
    const etats = rompre(enCombat.c.etats, 'degatsSubis');
    const maj: Record<string, unknown> = memes(etats, enCombat.c.etats) ? {} : { etats };
    if (t.pvTemp !== enCombat.c.pvTemp) maj.pvTemp = t.pvTemp;
    if (Object.keys(maj).length) lot.update(refCombattant(enCombat.idCombat, enCombat.c.id), maj);
  }
  await lot.commit();
  await noterJet(`Dégâts subis (${type})`, String(d.brut), { des: [], faces: 0, bonus: d.brut, total: d.net }, fiche.nom, `${d.detail} → ${pv}/${vue.pv.max} PV${pv <= 0 ? ', Mourant' : ''}`);
  return { net: d.net, pv };
}

/**
 * Début de tour (6a) : le client du MJ, quand la main arrive à un
 * combattant, joue ses dégâts par tour (Saignement, Brûlure…), au journal,
 * une fois par tour.
 */
export async function debutDeTour(idCombat: string, combat: Pick<Combat, 'tour'>, c: AvecId<Combattant>, fiche: AvecId<Fiche> | null, alea: () => number = Math.random): Promise<number> {
  await updateDoc(refCombattant(idCombat, c.id), { debutTour: combat.tour });
  let total = 0;
  for (const d of degatsParTour(c.etats)) {
    const jet = lancerDegats(d.des, alea);
    if (!jet) continue;
    total += await blesser(idCombat, c, fiche, jet, d.des, d.typeDegats === 'magique' ? 'magique' : 'physique', `${d.nom} : début du tour de ${c.nom}`, c.nom);
  }
  return total;
}

/** Poser un état à la main (4b) : le MJ sur qui il veut ; le joueur, à son tour, sur la cible de son choix. Au journal. */
export async function poserEtatSur(idCombat: string, c: AvecId<Combattant>, id: string, rounds: number | null, auteur: string): Promise<void> {
  const d = etatDuCatalogue(id);
  if (!d) throw new RefusCombat(`État inconnu : ${id}`);
  if (rounds !== null && (!Number.isInteger(rounds) || rounds < 1 || rounds > 99)) throw new RefusCombat('Une durée de 1 à 99 rounds.');
  // L6.6a (8a)
  if (immunise(c, id)) throw new RefusCombat(`${c.nom} est immunisé : ${d.nom}.`);
  await updateDoc(refCombattant(idCombat, c.id), { etats: poserEtat(c.etats, id, rounds, auteur) });
  await noterJet(`${d.nom} sur ${c.nom}`, '0', { des: [], faces: 0, bonus: 0, total: 0 }, auteur, `${auteur} pose ${d.nom} sur ${c.nom}${rounds ? `, ${rounds} round${rounds > 1 ? 's' : ''}` : ''}.`);
}

/** Retirer un état (MJ ; le joueur, à son tour). */
export async function retirerEtatDe(idCombat: string, c: AvecId<Combattant>, id: string): Promise<void> {
  await updateDoc(refCombattant(idCombat, c.id), { etats: retirerEtat(c.etats, id) });
}

/**
 * Jet de mort (7a), à son tour : un d20, 11 ou plus réussit. Trois
 * réussites, il se relève à 1 PV ; trois échecs, il meurt. Il prend
 * l'action principale (un jet par tour).
 */
export async function lancerJetDeMort(idCombat: string, combat: Pick<Combat, 'tour'>, c: AvecId<Combattant>, fiche: AvecId<Fiche>, alea: () => number = Math.random): Promise<IssueJetDeMort> {
  if (etatPj(vueFiche(fiche).pv.actuel, c) !== 'mourant') throw new RefusCombat(`${fiche.nom} n’est pas Mourant.`);
  const actions = principaleLibre(combat, c, 'second jet de mort');
  const issue = jetDeMort(d20(alea), c);
  const lot = writeBatch(db);
  lot.update(refCombattant(idCombat, c.id), { ...avecPrincipale(combat, actions), mortSucces: issue.mortSucces, mortEchecs: issue.mortEchecs, mort: issue.mort });
  if (issue.issue === 'releve') lot.update(refPerso(fiche.id), { pvActuel: 1 });
  await lot.commit();
  await noterJet('Jet de mort', '1d20', { des: [issue.de], faces: 20, bonus: 0, total: issue.de }, fiche.nom, texteJetDeMort(issue, fiche.nom));
  return issue;
}

/** Relever un allié Mourant (7a, v1 : releverAllie) : action principale, sans jet ; il revient à 1 PV. */
export async function releverAllie(idCombat: string, combat: Pick<Combat, 'tour'>, moi: AvecId<Combattant>, allie: AvecId<Combattant>, ficheAllie: AvecId<Fiche>, perso: string): Promise<void> {
  if (allie.genre !== 'pj' || allie.perso !== ficheAllie.id) throw new RefusCombat('On relève un PJ du combat.');
  if (etatPj(vueFiche(ficheAllie).pv.actuel, allie) !== 'mourant') throw new RefusCombat(`${ficheAllie.nom} n’a pas besoin d’être relevé.`);
  const actions = principaleLibre(combat, moi, 'relever');
  const lot = writeBatch(db);
  lot.update(refCombattant(idCombat, moi.id), avecPrincipale(combat, actions));
  lot.update(refPerso(ficheAllie.id), { pvActuel: 1 });
  await lot.commit();
  await noterJet(`Relève ${ficheAllie.nom}`, '1', { des: [], faces: 0, bonus: 1, total: 1 }, perso, `${perso} relève ${ficheAllie.nom} : 1 PV.`);
}

/** Boire une potion en combat (9a) : le même « Utiliser » que la fiche, qui prend l'action secondaire. */
export async function boirePotion(idCombat: string, combat: Pick<Combat, 'tour'>, c: AvecId<Combattant>, fiche: AvecId<Fiche>, cle: string, alea: () => number = Math.random): Promise<number> {
  const a = actionsDuTour(c, combat.tour);
  if (a.secondaire) throw new RefusCombat('L’action secondaire est déjà prise ce tour.');
  let u: ReturnType<typeof utiliser>;
  try {
    u = utiliser(fiche, cle, alea);
  } catch (e) {
    throw e instanceof RefusEquipement ? new RefusCombat(e.message) : e;
  }
  const nom = fiche.inventaire[cle]?.nom ?? 'Potion';
  const lot = writeBatch(db);
  lot.update(refPerso(fiche.id), champsDuChangement(u.changement));
  lot.update(refCombattant(idCombat, c.id), { tourActions: combat.tour, ...a, secondaire: true });
  await lot.commit();
  await noterJet(nom, u.formule, u.jet, fiche.nom, `${u.soin} PV rendus → ${u.changement.pvActuel}/${fiche.pvMax} PV`);
  return u.soin;
}

/** MJ : remet à zéro les jets de mort d'un PJ qui n'est plus à 0 PV (soin, allié qui le relève). */
export async function remettreJetsDeMort(idCombat: string, c: AvecId<Combattant>): Promise<void> {
  await updateDoc(refCombattant(idCombat, c.id), { mortSucces: 0, mortEchecs: 0, mort: false });
}
