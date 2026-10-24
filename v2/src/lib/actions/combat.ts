import { collection, doc, getDocs, query, runTransaction, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { finDeTourBonus } from '../combat/bonus';
import { finDeTourZones } from '../combat/zones-sol';
import { finDeConcentration, finDeTourConcentration } from '../combat/concentration';
import { finDeTourInvocations } from '../combat/invocations';
import { finDeTour, rompre } from '../combat/etats';
import { champsJauges, type Jauges } from '../combat/ressources';
import { actionsDuTour, deplacementRestant, mainSuivante, premierActif } from '../combat/ordre';
import type { BrouillonCombattant } from '../combat/demarrage';
import { formuleTest } from '../regles/des';
import { schemaCombat, schemaCombattant, schemaSauvegardesCombat, type Combat, type Combattant, type SauvegardesCombat } from '../schemas/combat';
import { session } from '../session.svelte';
import { marquerMort } from './carte';
import { lancerEtNoter, noterJet } from './journal';

/*
 * Écritures du combat (lot L6.1, décisions de Thomas du 23/10/2026).
 *   - Le MJ démarre (4a), ajoute un combattant (9a), donne la main (6a),
 *     règle les PV d'un monstre et clôt (11a). Au démarrage et à l'ajout,
 *     son client lance l'initiative des monstres (5a), notée au journal.
 *   - Le joueur lance son initiative, note ses actions du tour (7a) et
 *     finit son tour quand c'est à lui (6a). Les règles Firestore le
 *     vérifient.
 */

export class RefusCombat extends Error {}

type AvecId<T> = T & { id: string };

const refCombat = (id: string) => doc(db, `tables/${session.table}/combats/${id}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);
const refCombattant = (id: string, c: string) => doc(db, `tables/${session.table}/combats/${id}/combattants/${c}`);
const refZone = (id: string, z: string) => doc(db, `tables/${session.table}/combats/${id}/zones/${z}`);
const refJeton = (scene: string, id: string) => doc(db, `tables/${session.table}/scenes/${scene}/jetons/${id}`);
const d20 = (alea: () => number) => 1 + Math.floor(alea() * 20);

function nouveauCombattant(b: BrouillonCombattant, de: number | null, maintenant: number): Combattant {
  if (b.genre === 'monstre' && (b.pvMax === null || b.pvMax < 1)) throw new RefusCombat(`Donne les PV de ${b.nom}.`);
  if (b.genre === 'monstre' && b.def === null) throw new RefusCombat(`Donne la DEF de ${b.nom}.`);
  return schemaCombattant.parse({
    genre: b.genre,
    nom: b.nom,
    perso: b.perso,
    uid: b.uid,
    monstre: b.monstre,
    modInit: b.modInit,
    initiative: de === null ? null : de + b.modInit,
    de,
    pv: b.genre === 'monstre' ? b.pvMax : null,
    pvMax: b.genre === 'monstre' ? b.pvMax : null,
    aTerre: false,
    mvtBase: b.mvtBase,
    def: b.genre === 'monstre' ? b.def : null,
    armure: b.genre === 'monstre' ? b.armure : 0,
    resistances: b.genre === 'monstre' ? b.resistances : { physique: 1, magique: 1 },
    mortSucces: 0,
    mortEchecs: 0,
    mort: false,
    etats: [],
    usages: {},
    gainTouche: { round: 0, montant: 0 },
    debutTour: 0,
    visee: false,
    sauvegardes: b.genre === 'monstre' ? b.sauvegardes : null,
    boss: b.genre === 'monstre' && b.boss,
    demonOuMortVivant: b.genre === 'monstre' && b.demonOuMortVivant,
    pvTemp: 0,
    bonus: [],
    tourActions: 0,
    principale: false,
    secondaire: false,
    mvt: 0,
    sprint: false,
    creeLe: maintenant,
    maitre: null,
    invocation: null,
    concentration: null,
  });
}

/** Les jets d'initiative des monstres, au journal (5a). */
async function noterInitiatives(combattants: readonly (BrouillonCombattant & { de: number | null })[]): Promise<void> {
  for (const c of combattants)
    if (c.de !== null) await noterJet('Initiative', formuleTest(c.modInit), { des: [c.de], faces: 20, bonus: c.modInit, total: c.de + c.modInit }, c.nom);
}

/**
 * MJ : démarre un combat sur la scène (4a), depuis une rencontre ou libre.
 * Les monstres lancent leur initiative ; les PJ attendent la leur en bas de
 * l'ordre. La main va au premier qui a une initiative. Rend l'identifiant.
 */
export async function demarrerCombat(
  b: { nom: string; scene: string; rencontre: string | null; combattants: readonly BrouillonCombattant[] },
  combatEnCours: string | null,
  alea: () => number = Math.random,
  remises: readonly { perso: string; jauges: Jauges }[] = [],
): Promise<string> {
  if (combatEnCours) throw new RefusCombat('Un combat est déjà en cours : clos-le d’abord.');
  if (!b.combattants.length) throw new RefusCombat('Personne à faire combattre.');
  const maintenant = Date.now();
  const jets = b.combattants.map((c) => ({ ...c, de: c.genre === 'monstre' ? d20(alea) : null }));
  const combattants = jets.map((c) => ({ id: c.id, ...nouveauCombattant(c, c.de, maintenant) }));
  const ref = doc(collection(db, `tables/${session.table}/combats`));
  const combat = schemaCombat.parse({
    nom: b.nom.trim().slice(0, 80) || 'Combat',
    scene: b.scene,
    rencontre: b.rencontre,
    statut: 'encours',
    round: 1,
    tour: 1,
    actif: premierActif(combattants),
    porteesLibres: false,
    creeLe: maintenant,
    closLe: null,
  });
  const lot = writeBatch(db);
  lot.set(ref, combat);
  for (const { id, ...c } of combattants) lot.set(refCombattant(ref.id, id), c);
  lot.set(doc(db, 'tables', session.table), { combat: ref.id }, { merge: true });
  // L6.3 (9a) : une ressource qui repart à chaque combat reprend sa valeur de départ (Ki).
  for (const r of remises) if (Object.keys(r.jauges).length) lot.update(refPerso(r.perso), champsJauges(r.jauges));
  await lot.commit();
  await noterInitiatives(jets);
  return ref.id;
}

/** MJ : un combattant arrive en cours de combat (9a). Un monstre lance son initiative et prend sa place. */
export async function ajouterCombattant(idCombat: string, b: BrouillonCombattant, alea: () => number = Math.random): Promise<void> {
  const de = b.genre === 'monstre' ? d20(alea) : null;
  const c = nouveauCombattant(b, de, Date.now());
  const lot = writeBatch(db);
  lot.set(refCombattant(idCombat, b.id), c);
  await lot.commit();
  await noterInitiatives([{ ...b, de }]);
}

/** Le joueur (ou le MJ pour lui) lance l'initiative d'un combattant qui ne l'a pas encore (5a). */
export async function lancerInitiative(idCombat: string, c: AvecId<Combattant>): Promise<number> {
  if (c.initiative !== null) throw new RefusCombat(`${c.nom} a déjà son initiative.`);
  const jet = await lancerEtNoter('Initiative', formuleTest(c.modInit), c.nom);
  const de = jet!.des[0]!;
  await updateDoc(refCombattant(idCombat, c.id), { initiative: de + c.modInit, de });
  return de + c.modInit;
}

/**
 * Finir le tour (6a) : le joueur qui joue, ou le MJ. La main passe au
 * suivant qui peut jouer ; un nouveau round s'ouvre en repartant de la
 * tête. `aTerre` : ceux dont le tour est sauté (monstres à 0 PV, PJ à
 * 0 PV sur leur fiche).
 * Lot L6.4b2 (9a, 1a, 3a) : ses invocations perdent un round (à 0, elles
 * s'en vont avec leur jeton) ; sa concentration aussi (à 0, ce qu'elle a
 * posé s'en va).
 */
export async function finirTour(idCombat: string, actifAttendu: string | null, combattants: readonly AvecId<Combattant>[], aTerre: ReadonlySet<string>): Promise<Combat> {
  // L6.4b1 (9a) : les zones de celui qui finit son tour perdent un round.
  const zones = actifAttendu
    ? (await getDocs(query(collection(db, `tables/${session.table}/combats/${idCombat}/zones`), where('lanceur', '==', actifAttendu)))).docs.map((d) => ({
        id: d.id,
        lanceur: actifAttendu,
        rounds: (d.data() as { rounds?: number | null }).rounds ?? null,
      }))
    : [];
  const decompte = finDeTourZones(zones, actifAttendu ?? '');
  // L6.4b2 (9a) : les invocations de celui qui finit son tour perdent un round.
  const invocations = finDeTourInvocations(combattants, actifAttendu ?? '');
  let finies: string[] = [];
  const r = await runTransaction(db, async (tx) => {
    const lu = await tx.get(refCombat(idCombat));
    if (!lu.exists()) throw new RefusCombat('Ce combat n’existe plus.');
    const c = schemaCombat.parse(lu.data());
    if (c.statut !== 'encours') throw new RefusCombat('Le combat est clos.');
    if (c.actif !== actifAttendu) throw new RefusCombat('La main a déjà changé.');
    // L6.3 (5a) : les états de celui qui finit son tour perdent un round.
    const lu2 = c.actif ? await tx.get(refCombattant(idCombat, c.actif)) : null;
    const s = mainSuivante(combattants, c.actif, c.round, aTerre);
    const apres = { ...c, actif: s.actif, round: s.round, tour: c.tour + 1 };
    // L6.4a (12a) : ses bonus temporaires aussi.
    const zonesRetirees = new Set(decompte.retirer);
    const retirees = new Set(invocations.retirer);
    let conc: Combattant['concentration'] = null;
    if (lu2?.exists()) {
      const m = schemaCombattant.parse(lu2.data());
      let etats = finDeTour(m.etats);
      const bonus = finDeTourBonus(m.bonus);
      const maj: Record<string, unknown> = {};
      // L6.4b2 (1a, 3a) : sa concentration perd un round ; à 0, ce qu'elle a posé s'en va.
      const fc = m.concentration ? finDeTourConcentration(m.concentration) : null;
      if (fc === 'fin' && m.concentration) {
        conc = m.concentration;
        const fin = finDeConcentration(m.concentration, combattants.map((x) => (x.id === c.actif ? { ...x, etats } : x)));
        for (const [id, e] of fin.etats) {
          if (id === c.actif) etats = e;
          else tx.update(refCombattant(idCombat, id), { etats: e });
        }
        if (fin.zone) zonesRetirees.add(fin.zone);
        for (const id of fin.invocations) retirees.add(id);
        maj.concentration = null;
      } else if (fc && fc !== 'fin' && m.concentration) maj.concentration = { ...m.concentration, rounds: fc.rounds };
      if (JSON.stringify(etats) !== JSON.stringify(m.etats)) maj.etats = etats;
      if (JSON.stringify(bonus) !== JSON.stringify(m.bonus)) maj.bonus = bonus;
      if (Object.keys(maj).length) tx.update(refCombattant(idCombat, c.actif!), maj);
    }
    for (const z of decompte.maj) if (!zonesRetirees.has(z.id)) tx.update(refZone(idCombat, z.id), { rounds: z.rounds });
    for (const id of zonesRetirees) tx.delete(refZone(idCombat, id));
    for (const i of invocations.maj) if (!retirees.has(i.id)) tx.update(refCombattant(idCombat, i.id), { invocation: i.invocation });
    for (const id of retirees) {
      tx.delete(refCombattant(idCombat, id));
      tx.delete(refJeton(c.scene, id));
    }
    finies = [...retirees];
    tx.update(refCombat(idCombat), { actif: apres.actif, round: apres.round, tour: apres.tour });
    return { apres, conc };
  });
  const auteur = combattants.find((x) => x.id === actifAttendu)?.nom ?? 'MJ';
  if (r.conc) await noterJet(`Concentration : ${r.conc.nom}`, '0', { des: [], faces: 0, bonus: 0, total: 0 }, auteur, `${r.conc.nom} s’achève.`);
  if (finies.length)
    await noterJet('Invocations', '0', { des: [], faces: 0, bonus: 0, total: 0 }, auteur, `${finies.map((id) => combattants.find((x) => x.id === id)?.nom ?? id).join(', ')} : leur temps est écoulé, elles retournent à la Mer.`);
  return r.apres;
}

/** MJ : corrige les sauvegardes d'un monstre (L6.4a, 8a). */
export async function corrigerSauvegardes(idCombat: string, c: AvecId<Combattant>, s: SauvegardesCombat): Promise<void> {
  if (c.genre !== 'monstre') throw new RefusCombat('Les sauvegardes d’un PJ sont sur sa fiche.');
  const ok = schemaSauvegardesCombat.safeParse(s);
  if (!ok.success) throw new RefusCombat('Des sauvegardes de −10 à +40.');
  await updateDoc(refCombattant(idCombat, c.id), { sauvegardes: ok.data });
}

/** MJ : donne la main à un combattant (oubli, retour en arrière : 6a). Le round ne change pas. */
export async function donnerLaMain(idCombat: string, combat: Combat, id: string): Promise<void> {
  await updateDoc(refCombat(idCombat), { actif: id, tour: combat.tour + 1 });
}

/**
 * Note une action du tour (7a) : principale, secondaire, Sprint (+2 cases,
 * prend l'action principale), ou des cases parcourues. Le joueur pour son
 * combattant, à son tour ; le MJ pour tous.
 */
export async function noterAction(
  idCombat: string,
  combat: Pick<Combat, 'tour'>,
  c: AvecId<Combattant>,
  quoi: { principale: boolean } | { secondaire: boolean } | { sprint: true } | { cases: number },
): Promise<void> {
  const a = actionsDuTour(c, combat.tour);
  const n = { ...a };
  if ('principale' in quoi) {
    if (!quoi.principale && a.sprint) throw new RefusCombat('Le Sprint a pris l’action principale.');
    n.principale = quoi.principale;
  } else if ('secondaire' in quoi) n.secondaire = quoi.secondaire;
  else if ('sprint' in quoi) {
    if (a.principale) throw new RefusCombat('L’action principale est déjà prise : plus de Sprint ce tour.');
    n.principale = true;
    n.sprint = true;
  } else {
    const restant = deplacementRestant(c, combat.tour);
    if (quoi.cases > restant) throw new RefusCombat(`Il ne te reste que ${restant} case${restant > 1 ? 's' : ''}.`);
    n.mvt = Math.min(40, a.mvt + Math.max(0, Math.round(quoi.cases)));
  }
  const etats = 'cases' in quoi && quoi.cases > 0 ? rompre(c.etats, 'actionMouvement') : c.etats;
  await updateDoc(refCombattant(idCombat, c.id), { tourActions: combat.tour, ...n, ...(etats.length !== c.etats.length ? { etats } : {}) });
}

/** MJ : règle les PV d'un monstre ; à 0 il est à terre, son jeton marqué mort (et l'inverse). */
export async function ajusterPvMonstre(idCombat: string, scene: string, c: AvecId<Combattant>, delta: number): Promise<number> {
  if (c.genre === 'pj' || c.pv === null || c.pvMax === null) throw new RefusCombat('Les PV d’un PJ se règlent sur sa fiche.');
  const pv = Math.max(0, Math.min(c.pvMax, c.pv + Math.round(delta)));
  const aTerre = pv <= 0;
  await updateDoc(refCombattant(idCombat, c.id), { pv, aTerre });
  if (aTerre !== c.aTerre) await marquerMort(scene, c.id, aTerre);
  return pv;
}

/** MJ : laisse attaquer hors de portée, ou non (L6.2, 4a). */
export async function basculerPortees(idCombat: string, libres: boolean): Promise<void> {
  await updateDoc(refCombat(idCombat), { porteesLibres: libres });
}

/**
 * MJ : clôt le combat (11a). Les monstres morts restent sur la carte, marqués morts. L6.3 (9a) : la Plongée revient à 0.
 * L6.4b2 (9a) : les invocations s'en vont avec le combat, leurs jetons aussi.
 */
export async function cloreCombat(idCombat: string, remises: readonly { perso: string; jauges: Jauges }[] = [], invocations: { scene: string; ids: readonly string[] } | null = null): Promise<void> {
  const lot = writeBatch(db);
  if (invocations) for (const id of invocations.ids) lot.delete(refJeton(invocations.scene, id));
  for (const r of remises) if (Object.keys(r.jauges).length) lot.update(refPerso(r.perso), champsJauges(r.jauges));
  lot.update(refCombat(idCombat), { statut: 'clos', actif: null, closLe: Date.now() });
  lot.set(doc(db, 'tables', session.table), { combat: null }, { merge: true });
  await lot.commit();
}
