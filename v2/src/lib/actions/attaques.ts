import { doc, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { degatsSurMonstre, formuleDegats, lancerDegats, resoudreAttaque, texteAttaque, type AttaqueMonstre, type DegatsAppliques, type IssueAttaque, type TypeDegats } from '../combat/attaque';
import { degatsSurPj, type TypeDegatsSubis } from '../combat/attaques-pj';
import { etatPj, jetDeMort, texteJetDeMort, type IssueJetDeMort } from '../combat/mort';
import { actionsDuTour } from '../combat/ordre';
import { vueFiche } from '../fiche/vue-fiche';
import { formuleTest, type Jet } from '../regles/des';
import { RefusEquipement, utiliser } from '../regles/equipement';
import { schemaCombattant, type Combat, type Combattant } from '../schemas/combat';
import type { Fiche } from '../schemas/fiche';
import { session } from '../session.svelte';
import { RefusCombat } from './combat';
import { noterJet } from './journal';
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
 */

type AvecId<T> = T & { id: string };

const refCombattant = (idCombat: string, c: string) => doc(db, `tables/${session.table}/combats/${idCombat}/combattants/${c}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);
const d20 = (alea: () => number) => 1 + Math.floor(alea() * 20);

/** L'action principale du tour, refusée si elle est déjà prise (5a, 7a). */
function principaleLibre(combat: Pick<Combat, 'tour'>, c: Combattant, quoi: string): Pick<Combattant, 'principale' | 'secondaire' | 'mvt' | 'sprint'> {
  const a = actionsDuTour(c, combat.tour);
  if (a.principale) throw new RefusCombat(`L’action principale est déjà prise ce tour : pas de ${quoi}.`);
  return a;
}

const avecPrincipale = (combat: Pick<Combat, 'tour'>, a: Pick<Combattant, 'principale' | 'secondaire' | 'mvt' | 'sprint'>) => ({ tourActions: combat.tour, ...a, principale: true });

/**
 * Le joueur attaque un monstre (1b, 3a, 5a) : d20 + bonus contre sa DEF,
 * au journal ; l'action principale est prise. Rend l'issue : touché, le
 * joueur lance ensuite ses dégâts (2a).
 */
export async function attaquer(
  idCombat: string,
  combat: Pick<Combat, 'tour'>,
  attaquant: AvecId<Combattant>,
  cible: AvecId<Combattant>,
  a: { nom: string; bonus: number; seuilCritique: number },
  perso: string,
  alea: () => number = Math.random,
): Promise<IssueAttaque> {
  if (cible.genre !== 'monstre' || cible.def === null) throw new RefusCombat('On attaque un monstre.');
  if (cible.aTerre) throw new RefusCombat(`${cible.nom} est déjà à terre.`);
  const actions = principaleLibre(combat, attaquant, 'attaque');
  const issue = resoudreAttaque(d20(alea), a.bonus, cible.def, a.seuilCritique);
  await updateDoc(refCombattant(idCombat, attaquant.id), avecPrincipale(combat, actions));
  await noterJet(`${a.nom} sur ${cible.nom}`, formuleTest(a.bonus), { des: [issue.de], faces: 20, bonus: a.bonus, total: issue.total }, perso, texteAttaque(issue));
  return issue;
}

/**
 * Les dégâts sur un monstre (2a, 3a, 10a) : la formule de l'arme, ses dés
 * doublés sur un critique ; l'armure puis la résistance du monstre ; ses
 * PV lus et écrits dans une transaction (deux coups au même moment ne
 * s'écrasent pas).
 */
export async function infligerDegats(
  idCombat: string,
  cible: AvecId<Combattant>,
  d: { nom: string; formule: string; typeDegats: TypeDegats; critique: boolean },
  perso: string,
  alea: () => number = Math.random,
): Promise<{ jet: Jet; degats: DegatsAppliques; pv: number }> {
  const formule = formuleDegats(d.formule, d.critique);
  const jet = lancerDegats(formule, alea);
  if (!jet) throw new RefusCombat(`Formule de dégâts illisible : « ${formule} ».`);
  const r = await runTransaction(db, async (tx) => {
    const lu = await tx.get(refCombattant(idCombat, cible.id));
    if (!lu.exists()) throw new RefusCombat(`${cible.nom} n’est plus dans le combat.`);
    const c = schemaCombattant.parse(lu.data());
    if (c.pv === null) throw new RefusCombat('On blesse un monstre.'); // un PJ n'a pas de PV ici : ils sont sur sa fiche
    const degats = degatsSurMonstre(jet.total, c, d.typeDegats);
    const pv = Math.max(0, c.pv - degats.net);
    tx.update(refCombattant(idCombat, cible.id), { pv, aTerre: pv <= 0 });
    return { degats, pv, pvMax: c.pvMax! };
  });
  const suite = r.pv <= 0 ? `${cible.nom} tombe` : `${cible.nom} ${r.pv}/${r.pvMax} PV`;
  await noterJet(`Dégâts ${d.nom} sur ${cible.nom}${d.critique ? ' (critique)' : ''}`, formule, jet, perso, `${r.degats.detail} → ${suite}`);
  return { jet, degats: r.degats, pv: r.pv };
}

/**
 * MJ : un monstre attaque un PJ (6a), d'un clic : d20 + bonus contre la CA
 * de la fiche ; touché, les dégâts de l'arme du monstre (dés doublés sur
 * un critique), moins la réduction du PJ, ôtés de ses PV. L'action
 * principale du monstre est prise.
 */
export async function attaqueDeMonstre(
  idCombat: string,
  combat: Pick<Combat, 'tour'>,
  monstre: AvecId<Combattant>,
  a: AttaqueMonstre,
  cible: AvecId<Combattant>,
  fiche: AvecId<Fiche>,
  alea: () => number = Math.random,
): Promise<{ issue: IssueAttaque; net: number | null; pv: number }> {
  if (monstre.genre !== 'monstre') throw new RefusCombat('Seul un monstre attaque depuis ce panneau.');
  if (cible.genre !== 'pj' || cible.perso !== fiche.id) throw new RefusCombat('On attaque un PJ du combat.');
  const actions = principaleLibre(combat, monstre, 'attaque');
  const vue = vueFiche(fiche);
  const issue = resoudreAttaque(d20(alea), a.bonus, vue.stats.ca, a.seuilCritique);
  await updateDoc(refCombattant(idCombat, monstre.id), avecPrincipale(combat, actions));
  await noterJet(`${a.nom} sur ${fiche.nom}`, formuleTest(a.bonus), { des: [issue.de], faces: 20, bonus: a.bonus, total: issue.total }, monstre.nom, texteAttaque(issue, 'CA'));
  if (!issue.touche) return { issue, net: null, pv: vue.pv.actuel };
  const formule = formuleDegats(a.formule, issue.critique);
  const jet = lancerDegats(formule, alea);
  if (!jet) throw new RefusCombat(`Formule de dégâts illisible : « ${formule} ».`);
  const d = degatsSurPj(fiche, jet.total, a.typeDegats);
  const pv = Math.max(0, vue.pv.actuel - d.net);
  await updateDoc(refPerso(fiche.id), { pvActuel: pv });
  await noterJet(`Dégâts ${a.nom} sur ${fiche.nom}${issue.critique ? ' (critique)' : ''}`, formule, jet, monstre.nom, `${d.detail} → ${fiche.nom} ${pv}/${vue.pv.max} PV${pv <= 0 ? ', Mourant' : ''}`);
  return { issue, net: d.net, pv };
}

/** « Subir des dégâts » (8a, 10a) : un montant et un type, après réduction, ôtés des PV de la fiche ; au journal. */
export async function subirDegats(fiche: AvecId<Fiche>, brut: number, type: TypeDegatsSubis): Promise<{ net: number; pv: number }> {
  if (!Number.isFinite(brut) || brut < 0 || brut > 9999) throw new RefusCombat('Donne un nombre de dégâts.');
  const vue = vueFiche(fiche);
  const d = degatsSurPj(fiche, brut, type);
  const pv = Math.max(0, vue.pv.actuel - d.net);
  await updateDoc(refPerso(fiche.id), { pvActuel: pv });
  await noterJet(`Dégâts subis (${type})`, String(d.brut), { des: [], faces: 0, bonus: d.brut, total: d.net }, fiche.nom, `${d.detail} → ${pv}/${vue.pv.max} PV${pv <= 0 ? ', Mourant' : ''}`);
  return { net: d.net, pv };
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
