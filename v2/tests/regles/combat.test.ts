import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles du combat (lot L6.1, décisions du 23/10/2026), contre
 * l'émulateur. Table « t1 » : Bob est MJ ; Alice joue Kargash (pj-p1),
 * Carol joue Hermione (pj-p2). Combat c1 sur la scène « cave ».
 *
 * Lot L6.2 : le joueur qui a la main blesse un monstre (1b, 2a), fait son
 * jet de mort (7a), relève un allié (7a) ; le journal porte le détail
 * d'un jet de combat (10a) ; le MJ libère les portées (4a).
 *
 * Lot L6.3 : le joueur qui a la main pose et retire des états sur
 * n'importe quel combattant (4b), tient ses usages et sa visée, repousse
 * d'une case le jeton d'un combattant (12a) et blesse un allié dans une
 * collision.
 *
 * Lot L6.4a : les sauvegardes du monstre (8a), les PV et bonus temporaires
 * (11a, 12a) ; le sort du joueur qui a la main déplace un jeton de 20 cases
 * au plus (10a) et soigne un allié (ses PV montent).
 */
const TABLE = 'tables/t1';
const C = `${TABLE}/combats/c1`;
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cof-compagno',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

const combat = (extra: Record<string, unknown> = {}) => ({
  nom: 'Les goules', scene: 'cave', rencontre: null, statut: 'encours', round: 1, tour: 3, actif: 'pj-p1', porteesLibres: false, creeLe: 1, closLe: null, ...extra,
});
const combattant = (extra: Record<string, unknown> = {}) => ({
  genre: 'pj', nom: 'Kargash', perso: 'p1', uid: 'alice', monstre: null, modInit: 2, initiative: 14, de: 12, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [],
  tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...extra,
});
const goule = (extra: Record<string, unknown> = {}) =>
  combattant({ genre: 'monstre', nom: 'Goule', perso: null, uid: null, monstre: 'goule', modInit: 3, pv: 14, pvMax: 14, def: 13, armure: 1, resistances: { physique: 0.5, magique: 1 }, ...extra });
/** Fiche minimale valide (comme tests/regles/persos.test.ts). */
const fiche = (proprietaireUid: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1, proprietaireUid, creeLe: 1, nom: 'Hermione', niveau: 3, classe: 'pretre', race: 'humain',
  caracs: { FOR: 10 }, capacites: [], pvMax: 14, pvActuel: 0, equipement: {}, inventaire: {},
  piecesOr: 5, piecesArgent: 0, piecesBronze: 0, modules: {},
  progression: { crans: 0 }, vecu: { crans: 0, paliers: 0, points: 0, noeuds: [], noeudOffert: null }, usages: {},
  ...extra,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`${TABLE}/secret/codeMj`).set({ code: 'dragon' });
    await db.doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'dragon', rejointLe: 1 });
    await db.doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1, persoActif: 'p1' });
    await db.doc(`${TABLE}/joueurs/carol`).set({ nom: 'Carol', rejointLe: 1, persoActif: 'p2' });
    await db.doc(TABLE).set({ sceneActive: 'cave', combat: 'c1' });
    await db.doc(C).set(combat());
    await db.doc(`${C}/combattants/pj-p1`).set(combattant());
    await db.doc(`${C}/combattants/pj-p2`).set(combattant({ nom: 'Hermione', perso: 'p2', uid: 'carol', initiative: null, de: null }));
    await db.doc(`${C}/combattants/m-r1-a`).set(goule());
    await db.doc(`${TABLE}/scenes/cave/jetons/pj-p1`).set({ genre: 'pj', nom: 'Kargash', couleur: '#2980b9', cx: 1, cy: 1, proprietaire: 'alice', creeLe: 1 });
    await db.doc(`${TABLE}/scenes/cave/jetons/pj-p2`).set({ genre: 'pj', nom: 'Hermione', couleur: '#27ae60', cx: 2, cy: 1, proprietaire: 'carol', creeLe: 1 });
    await db.doc(`${TABLE}/persos/p1`).set(fiche('alice', { nom: 'Kargash', pvActuel: 20, pvMax: 20 }));
    await db.doc(`${TABLE}/persos/p2`).set(fiche('carol'));
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const poser = (chemin: string, d: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(chemin).set(d);
  });

describe('combat (L6.1)', () => {
  it('toute la table lit ; le MJ seul crée et clôt ; la forme est vérifiée', async () => {
    await assertSucceeds(pour('carol').doc(C).get());
    await assertSucceeds(pour('carol').doc(`${C}/combattants/m-r1-a`).get());
    await assertFails(pour('alice').doc(`${TABLE}/combats/c2`).set(combat()));
    await assertSucceeds(pour('bob').doc(`${TABLE}/combats/c2`).set(combat()));
    await assertFails(pour('bob').doc(`${TABLE}/combats/c3`).set(combat({ statut: 'fini' })));
    await assertFails(pour('bob').doc(`${TABLE}/combats/c3`).set(combat({ dd: 13 })));
    await assertFails(pour('alice').doc(`${C}/combattants/m-r1-b`).set(goule()));
    await assertSucceeds(pour('bob').doc(`${C}/combattants/m-r1-b`).set(goule()));
    await assertFails(pour('bob').doc(`${C}/combattants/m-r1-c`).set(goule({ pv: null })));
    await assertFails(pour('bob').doc(`${C}/combattants/pj-p3`).set(combattant({ pv: 3, pvMax: 3 })));
    // L6.2 : la DEF du monstre, pas du PJ ; les jets de mort d'un PJ seulement ; la mort au troisième échec.
    await assertFails(pour('bob').doc(`${C}/combattants/m-r1-d`).set(goule({ def: null })));
    await assertFails(pour('bob').doc(`${C}/combattants/pj-p4`).set(combattant({ def: 12 })));
    await assertFails(pour('bob').doc(`${C}/combattants/m-r1-e`).set(goule({ mortSucces: 1 })));
    await assertFails(pour('bob').doc(`${C}/combattants/pj-p5`).set(combattant({ mortEchecs: 2, mort: true })));
    await assertFails(pour('bob').doc(`${C}/combattants/m-r1-f`).set(goule({ resistances: { physique: 0.5 } })));
    await assertFails(pour('bob').doc(`${TABLE}/combats/c4`).set(combat({ porteesLibres: 'oui' })));
    await assertSucceeds(pour('bob').doc(C).update({ statut: 'clos', actif: null, closLe: 9 }));
  });

  it('6a : le joueur qui a la main la passe (tour + 1, round inchangé ou + 1) ; pas un autre', async () => {
    await assertFails(pour('carol').doc(C).update({ actif: 'm-r1-a', tour: 4 }));
    await assertFails(pour('alice').doc(C).update({ actif: 'm-r1-a', tour: 5 }));
    await assertFails(pour('alice').doc(C).update({ actif: 'm-r1-a', tour: 4, round: 3 }));
    await assertFails(pour('alice').doc(C).update({ actif: 'm-r1-a', tour: 4, nom: 'x' }));
    await assertSucceeds(pour('alice').doc(C).update({ actif: 'm-r1-a', tour: 4, round: 2 }));
    // La main est à la goule : Alice ne peut plus rien.
    await assertFails(pour('alice').doc(C).update({ actif: 'pj-p1', tour: 5 }));
    await assertSucceeds(pour('bob').doc(C).update({ actif: 'pj-p1', tour: 5 }));
  });

  it('5a : chacun lance son initiative, une fois, initiative = d20 + modificateur', async () => {
    const carol = pour('carol').doc(`${C}/combattants/pj-p2`);
    await assertFails(pour('alice').doc(`${C}/combattants/pj-p2`).update({ initiative: 14, de: 12 }));
    await assertFails(carol.update({ initiative: 20, de: 12 }));
    await assertSucceeds(carol.update({ initiative: 14, de: 12 }));
    await assertFails(carol.update({ initiative: 22, de: 20 }));
  });

  it('7a : les actions du tour, à son tour, datées du tour en cours, sans dépasser ses cases', async () => {
    const alice = pour('alice').doc(`${C}/combattants/pj-p1`);
    await assertFails(alice.update({ tourActions: 2, principale: true }));
    await assertFails(alice.update({ tourActions: 3, mvt: 6 }));
    await assertSucceeds(alice.update({ tourActions: 3, mvt: 5 }));
    await assertSucceeds(alice.update({ tourActions: 3, principale: true, sprint: true, mvt: 7 }));
    await assertFails(alice.update({ tourActions: 3, pv: 3 }));
    // Plus son tour : plus d'action.
    await poser(C, combat({ actif: 'm-r1-a' }));
    await assertFails(alice.update({ tourActions: 3, secondaire: true }));
    // Le MJ règle tout, les PV des monstres compris.
    await assertSucceeds(pour('bob').doc(`${C}/combattants/m-r1-a`).update({ pv: 0, aTerre: true }));
  });

  it('8a : pendant le combat, un joueur ne déplace son jeton qu’à son tour ; le MJ, toujours ; hors combat, librement', async () => {
    await assertSucceeds(pour('alice').doc(`${TABLE}/scenes/cave/jetons/pj-p1`).update({ cx: 2, cy: 2 }));
    await assertFails(pour('carol').doc(`${TABLE}/scenes/cave/jetons/pj-p2`).update({ cx: 3, cy: 3 }));
    await assertSucceeds(pour('bob').doc(`${TABLE}/scenes/cave/jetons/pj-p2`).update({ cx: 3, cy: 3 }));
    await poser(TABLE, { sceneActive: 'cave', combat: null });
    await assertSucceeds(pour('carol').doc(`${TABLE}/scenes/cave/jetons/pj-p2`).update({ cx: 4, cy: 4 }));
  });
});

describe('attaques et dégâts (L6.2)', () => {
  it('1b, 2a : le joueur qui a la main ôte des PV à un monstre, à terre à 0 ; pas d’autre champ, jamais vers le haut', async () => {
    const g = pour('alice').doc(`${C}/combattants/m-r1-a`);
    await assertFails(g.update({ pv: 15 }));
    await assertFails(g.update({ pv: 9, def: 5 }));
    await assertFails(g.update({ pv: 0, aTerre: false }));
    await assertFails(g.update({ pv: -1, aTerre: false }));
    await assertSucceeds(g.update({ pv: 9 }));
    await assertFails(pour('carol').doc(`${C}/combattants/m-r1-a`).update({ pv: 5 }));
    await assertSucceeds(g.update({ pv: 0, aTerre: true }));
    // Pas un PJ : ses PV sont sur sa fiche.
    await assertFails(pour('alice').doc(`${C}/combattants/pj-p2`).update({ aTerre: true }));
    // Plus la main : plus de coups.
    await poser(`${C}/combattants/m-r1-a`, goule());
    await poser(C, combat({ actif: 'm-r1-a' }));
    await assertFails(pour('alice').doc(`${C}/combattants/m-r1-a`).update({ pv: 9 }));
  });

  it('7a : le jet de mort, à son tour, avec l’action principale : une réussite ou un échec de plus ; la troisième réussite remet à zéro, le troisième échec tue', async () => {
    const alice = pour('alice').doc(`${C}/combattants/pj-p1`);
    await assertFails(alice.update({ tourActions: 3, mortSucces: 1 }));
    await assertFails(alice.update({ tourActions: 3, principale: true, mortSucces: 2 }));
    await assertFails(alice.update({ tourActions: 3, principale: true, mortSucces: 1, mortEchecs: 1 }));
    await assertSucceeds(alice.update({ tourActions: 3, principale: true, mortSucces: 1 }));
    await poser(`${C}/combattants/pj-p1`, combattant({ mortSucces: 2, mortEchecs: 2 }));
    await assertFails(alice.update({ tourActions: 3, principale: true, mortEchecs: 3 }));
    await assertSucceeds(alice.update({ tourActions: 3, principale: true, mortEchecs: 3, mort: true }));
    await poser(`${C}/combattants/pj-p1`, combattant({ mortSucces: 2, mortEchecs: 2 }));
    await assertSucceeds(alice.update({ tourActions: 3, principale: true, mortSucces: 0, mortEchecs: 0 }));
    await poser(`${C}/combattants/pj-p1`, combattant({ mortSucces: 1, mortEchecs: 2 }));
    await assertFails(alice.update({ tourActions: 3, principale: true, mortSucces: 0, mortEchecs: 0 }));
    // Le MJ remet les jets à zéro.
    await assertSucceeds(pour('bob').doc(`${C}/combattants/pj-p1`).update({ mortSucces: 0, mortEchecs: 0, mort: false }));
  });

  it('7a : le joueur qui a la main relève un allié Mourant à 1 PV ; pas un autre champ, pas un mort, pas sans la main', async () => {
    const hermione = pour('alice').doc(`${TABLE}/persos/p2`);
    // L6.4a (10a) : un soin fait monter les PV d'un allié du combat, donc
    // la hausse n'est plus réservée au relèvement à 1 PV.
    await assertSucceeds(hermione.update({ pvActuel: 5 }));
    await poser(`${TABLE}/persos/p2`, fiche('carol'));
    await assertFails(hermione.update({ pvActuel: 1, nom: 'x' }));
    await assertSucceeds(hermione.update({ pvActuel: 1 }));
    await poser(`${TABLE}/persos/p2`, fiche('carol'));
    await poser(`${C}/combattants/pj-p2`, combattant({ nom: 'Hermione', perso: 'p2', uid: 'carol', mortEchecs: 3, mort: true }));
    await assertFails(hermione.update({ pvActuel: 1 }));
    await poser(`${C}/combattants/pj-p2`, combattant({ nom: 'Hermione', perso: 'p2', uid: 'carol' }));
    await poser(C, combat({ actif: 'm-r1-a' }));
    await assertFails(hermione.update({ pvActuel: 1 }));
    // Debout : la collision d'un allié le blesse (L6.3, 12a) et un soin le
    // remonte (L6.4a, 10a) ; jamais sous 0.
    await poser(C, combat());
    await poser(`${TABLE}/persos/p2`, fiche('carol', { pvActuel: 3 }));
    await assertSucceeds(hermione.update({ pvActuel: 5 }));
    await assertFails(hermione.update({ pvActuel: -1 }));
    await assertSucceeds(hermione.update({ pvActuel: 1 }));
    // Hors combat : non plus.
    await poser(`${TABLE}/persos/p2`, fiche('carol'));
    await poser(TABLE, { sceneActive: 'cave', combat: null });
    await assertFails(hermione.update({ pvActuel: 1 }));
  });

  it('10a : le journal porte le détail d’un jet de combat ; des dégâts subis sans dé, avec leur détail', async () => {
    const jet = (extra: Record<string, unknown> = {}) => ({ auteurUid: 'alice', auteurNom: 'Alice', perso: 'Kargash', libelle: 'Dégâts subis (physique)', formule: '7', des: [], bonus: 7, total: 6, creeLe: 1, ...extra });
    await assertFails(pour('alice').doc(`${TABLE}/journal/a`).set(jet()));
    await assertSucceeds(pour('alice').doc(`${TABLE}/journal/a`).set(jet({ detail: '7 − 1 (armure) = 6' })));
    await assertFails(pour('alice').doc(`${TABLE}/journal/b`).set(jet({ detail: 'x'.repeat(201) })));
    await assertFails(pour('alice').doc(`${TABLE}/journal/c`).set(jet({ detail: 3 })));
  });

  it('4a : le MJ seul libère les portées', async () => {
    await assertFails(pour('alice').doc(C).update({ porteesLibres: true }));
    await assertSucceeds(pour('bob').doc(C).update({ porteesLibres: true }));
  });
});

describe('états, ressources, poussées (L6.3)', () => {
  const etat = (id: string) => ({ id, rounds: 1, cumul: 1, charges: null, des: null, source: 'Kargash' });

  it('4b : le joueur qui a la main pose un état sur un monstre et sur un allié ; sans la main, non ; rien d’autre', async () => {
    await assertSucceeds(pour('alice').doc(`${C}/combattants/m-r1-a`).update({ etats: [etat('etourdi')] }));
    await assertSucceeds(pour('alice').doc(`${C}/combattants/pj-p2`).update({ etats: [etat('protege')] }));
    await assertFails(pour('alice').doc(`${C}/combattants/pj-p2`).update({ etats: [], usages: { x: 1 } }));
    await assertFails(pour('carol').doc(`${C}/combattants/m-r1-a`).update({ etats: [] }));
    await assertFails(pour('bob').doc(`${C}/combattants/m-r1-a`).update({ etats: Array.from({ length: 21 }, () => etat('x')) }));
  });

  it('ses usages, son gain par touche et sa visée, à son tour', async () => {
    const alice = pour('alice').doc(`${C}/combattants/pj-p1`);
    await assertSucceeds(alice.update({ tourActions: 3, principale: true, usages: { attaqueSpeciale: 1 }, gainTouche: { round: 1, montant: 1 }, visee: true }));
    await assertFails(alice.update({ tourActions: 3, debutTour: 3 }));
    await assertFails(alice.update({ tourActions: 3, gainTouche: { round: 1, montant: 1, x: 1 } }));
    await assertSucceeds(pour('bob').doc(`${C}/combattants/pj-p1`).update({ debutTour: 3 }));
  });

  it('12a : il repousse d’une case le jeton d’un combattant (L6.4a : un sort, jusqu’à 20) ; sans la main, non', async () => {
    await poser(`${TABLE}/scenes/cave/jetons/m-r1-a`, { genre: 'monstre', nom: 'Goule', couleur: '#c0392b', cx: 5, cy: 5, proprietaire: null, creeLe: 1 });
    const g = pour('alice').doc(`${TABLE}/scenes/cave/jetons/m-r1-a`);
    await assertFails(g.update({ cx: 26, cy: 5 }));
    await assertFails(g.update({ cx: 6, cy: 6, nom: 'x' }));
    await assertSucceeds(g.update({ cx: 6, cy: 6 }));
    await assertFails(pour('carol').doc(`${TABLE}/scenes/cave/jetons/m-r1-a`).update({ cx: 5, cy: 5 }));
  });

  it('collision : il ôte des PV à un allié du combat (L6.4a : un soin les monte) ; sans la main, non', async () => {
    await poser(`${TABLE}/persos/p2`, fiche('carol', { pvActuel: 10 }));
    const h = pour('alice').doc(`${TABLE}/persos/p2`);
    await assertFails(h.update({ pvActuel: 10 }));
    await assertFails(h.update({ pvActuel: 7, nom: 'x' }));
    await assertSucceeds(h.update({ pvActuel: 7 }));
    await poser(C, combat({ actif: 'm-r1-a' }));
    await assertFails(h.update({ pvActuel: 5 }));
  });
});

describe('sorts en combat (L6.4a)', () => {
  const sauv = { FOR: 1, DEX: 2, CON: 1, Volonte: 0 };
  const bonus = { sur: 'DEF', valeur: 2, rounds: 2, consomme: false, typeDegats: null, source: 'Kargash' };

  it('8a : un monstre porte ses sauvegardes, un PJ non ; le MJ les corrige, un joueur non ; la forme est vérifiée', async () => {
    const bob = pour('bob');
    await assertSucceeds(bob.doc(`${C}/combattants/m-r1-b`).set(goule({ sauvegardes: sauv, boss: true, demonOuMortVivant: true })));
    await assertFails(bob.doc(`${C}/combattants/m-r1-c`).set(goule({ sauvegardes: { ...sauv, x: 1 } })));
    await assertFails(bob.doc(`${C}/combattants/m-r1-c`).set(goule({ sauvegardes: { ...sauv, FOR: 41 } })));
    await assertFails(bob.doc(`${C}/combattants/m-r1-c`).set(goule({ sauvegardes: { FOR: 1, DEX: 1, CON: 1 } })));
    await assertFails(bob.doc(`${C}/combattants/pj-p3`).set(combattant({ perso: 'p3', sauvegardes: sauv })));
    await assertFails(bob.doc(`${C}/combattants/pj-p3`).set(combattant({ perso: 'p3', boss: true })));
    await assertFails(bob.doc(`${C}/combattants/m-r1-c`).set(goule({ pvTemp: 1000 })));
    await assertFails(bob.doc(`${C}/combattants/m-r1-c`).set(goule({ bonus: Array.from({ length: 21 }, () => bonus) })));
    await assertFails(bob.doc(`${C}/combattants/m-r1-c`).set(goule({ boss: 'oui' })));
    await assertSucceeds(bob.doc(`${C}/combattants/m-r1-a`).update({ sauvegardes: { ...sauv, Volonte: 3 } }));
    await assertFails(pour('alice').doc(`${C}/combattants/m-r1-a`).update({ sauvegardes: sauv }));
  });

  it('11a, 12a : le joueur qui a la main donne ou ôte PV temporaires et bonus à n’importe quel combattant ; les siens à son tour ; sans la main, non', async () => {
    await assertSucceeds(pour('alice').doc(`${C}/combattants/m-r1-a`).update({ pvTemp: 0, bonus: [bonus], pv: 10, aTerre: false }));
    await assertSucceeds(pour('alice').doc(`${C}/combattants/pj-p2`).update({ pvTemp: 5, bonus: [bonus] }));
    await assertSucceeds(pour('alice').doc(`${C}/combattants/pj-p1`).update({ tourActions: 3, principale: true, pvTemp: 4, bonus: [bonus] }));
    await assertFails(pour('alice').doc(`${C}/combattants/pj-p2`).update({ pvTemp: 5, sauvegardes: null, nom: 'x' }));
    await assertFails(pour('carol').doc(`${C}/combattants/m-r1-a`).update({ bonus: [] }));
    await assertFails(pour('carol').doc(`${C}/combattants/pj-p2`).update({ pvTemp: 3 }));
  });

  it('10a : son sort déplace le jeton d’un combattant de 20 cases au plus ; pas un autre champ ; sans la main, non', async () => {
    await poser(`${TABLE}/scenes/cave/jetons/m-r1-a`, { genre: 'monstre', nom: 'Goule', couleur: '#c0392b', cx: 5, cy: 5, proprietaire: null, creeLe: 1 });
    const g = pour('alice').doc(`${TABLE}/scenes/cave/jetons/m-r1-a`);
    await assertSucceeds(g.update({ cx: 25, cy: 5 }));
    await assertFails(g.update({ cx: 25, cy: 26 }));
    await assertFails(g.update({ cx: 4, cy: 5, couleur: '#000000' }));
    await assertSucceeds(pour('alice').doc(`${TABLE}/scenes/cave/jetons/pj-p2`).update({ cx: 8, cy: 1 }));
    await assertFails(pour('carol').doc(`${TABLE}/scenes/cave/jetons/m-r1-a`).update({ cx: 6, cy: 5 }));
    await poser(`${TABLE}/scenes/cave/jetons/x`, { genre: 'libre', nom: 'Coffre', couleur: '#888888', cx: 1, cy: 1, proprietaire: null, creeLe: 1 });
    await assertFails(pour('alice').doc(`${TABLE}/scenes/cave/jetons/x`).update({ cx: 2, cy: 1 }));
  });

  it('10a : son sort soigne un allié du combat (ses PV montent) ; pas un autre champ ; sans la main, non ; pas hors du combat', async () => {
    await poser(`${TABLE}/persos/p2`, fiche('carol', { pvActuel: 4 }));
    const h = pour('alice').doc(`${TABLE}/persos/p2`);
    await assertSucceeds(h.update({ pvActuel: 9 }));
    await assertFails(h.update({ pvActuel: 9 }));
    await assertFails(h.update({ pvActuel: 12, nom: 'x' }));
    await assertFails(pour('carol').doc(`${TABLE}/persos/p1`).update({ pvActuel: 25 }));
    await poser(`${TABLE}/persos/p3`, fiche('dave', { pvActuel: 2 }));
    await assertFails(pour('alice').doc(`${TABLE}/persos/p3`).update({ pvActuel: 5 }));
  });
});
