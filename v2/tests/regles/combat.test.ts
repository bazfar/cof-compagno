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
 *
 * Lot L6.4b1 : les cases du MJ (le MJ seul les écrit ; le joueur ne lit
 * que les visibles), les zones du combat (le joueur qui a la main les
 * pose, les déclenche, les retire).
 *
 * Lot L6.5b : le joueur demande sa réaction, pour son combattant, hors de
 * son tour ; le MJ seul la passe à « jouée » ou « refusée » (1a). Le
 * joueur qui a la main note les attaques d'opportunité que son pas ouvre,
 * ce tour ; le MJ, toutes (2b).
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
  tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...extra,
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

  it('la forme d’un combattant : exactement ses clés, ni une de moins, ni une de trop', async () => {
    const sans = (o: Record<string, unknown>, cle: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== cle));
    const bob = pour('bob');
    // `monstre` n'est relu par aucune branche pour un monstre : seul le
    // compte des clés le rend obligatoire.
    await assertFails(bob.doc(`${C}/combattants/m-r2-a`).set(sans(goule(), 'monstre')));
    await assertFails(bob.doc(`${C}/combattants/m-r2-b`).set(sans(goule(), 'visee')));
    await assertFails(bob.doc(`${C}/combattants/pj-p6`).set(sans(combattant(), 'concentration')));
    await assertFails(bob.doc(`${C}/combattants/pj-p7`).set(combattant({ humeur: 'grognon' })));
    await assertSucceeds(bob.doc(`${C}/combattants/m-r2-c`).set(goule()));
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

  it('11a, 12a : le joueur qui a la main donne ou ôte PV temporaires et bonus à n’importe quel combattant ; les siens à son tour ; sans la main, seulement encaisser les siens', async () => {
    await assertSucceeds(pour('alice').doc(`${C}/combattants/m-r1-a`).update({ pvTemp: 0, bonus: [bonus], pv: 10, aTerre: false }));
    await assertSucceeds(pour('alice').doc(`${C}/combattants/pj-p2`).update({ pvTemp: 5, bonus: [bonus] }));
    await assertSucceeds(pour('alice').doc(`${C}/combattants/pj-p1`).update({ tourActions: 3, principale: true, pvTemp: 4, bonus: [bonus] }));
    await assertFails(pour('alice').doc(`${C}/combattants/pj-p2`).update({ pvTemp: 5, sauvegardes: null, nom: 'x' }));
    await assertFails(pour('carol').doc(`${C}/combattants/m-r1-a`).update({ bonus: [] }));
    // Hors main, elle n'encaisse que ses propres dégâts : la réserve baisse,
    // elle ne monte pas (décision du 26/10, `encaisseSesDegats`).
    await assertFails(pour('carol').doc(`${C}/combattants/pj-p2`).update({ pvTemp: 7 }));
    await assertSucceeds(pour('carol').doc(`${C}/combattants/pj-p2`).update({ pvTemp: 3 }));
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

describe('zones au sol (L6.4b1)', () => {
  const zone = (extra: Record<string, unknown> = {}) => ({
    nom: 'Givre', nature: 'glissant', cases: [{ dx: 0, dy: 0 }], ancre: { cx: 3, cy: 3 }, lanceur: 'pj-p1', camp: 'pj', filtre: 'tous', quand: 'entree', sort: null, danger: null, dd: 13, texte: null,
    usageUnique: false, cachee: false, rounds: 2, declenchements: {}, creeLe: 1, ...extra,
  });
  const caseMj = (extra: Record<string, unknown> = {}) => zone({ nom: 'Case dangereuse', nature: 'dangereuse', lanceur: null, camp: null, danger: { formule: '1d6', typeDegats: 'physique', sauvegarde: null, dd: null, etat: null, rounds: null }, dd: null, rounds: null, ...extra });

  it('1a, 4a : le MJ peint les cases ; un joueur ne lit que celles qui ne sont pas cachées, et n’écrit rien', async () => {
    const S = `${TABLE}/scenes/cave/zones`;
    await assertSucceeds(pour('bob').doc(`${S}/c-3-3`).set(caseMj({ cachee: true })));
    await assertSucceeds(pour('bob').doc(`${S}/c-4-4`).set(caseMj()));
    await assertFails(pour('bob').doc(`${S}/c-5-5`).set(caseMj({ x: 1 })));
    await assertFails(pour('bob').doc(`${S}/c-5-5`).set(caseMj({ cases: [] })));
    await assertFails(pour('bob').doc(`${S}/c-5-5`).set(caseMj({ ancre: null })));
    await assertFails(pour('alice').doc(`${S}/c-6-6`).set(caseMj()));
    await assertFails(pour('alice').doc(`${S}/c-3-3`).get());
    await assertSucceeds(pour('alice').doc(`${S}/c-4-4`).get());
    await assertSucceeds(pour('alice').collection(S).where('cachee', '==', false).get());
    await assertFails(pour('alice').collection(S).get());
    await assertFails(pour('alice').doc(`${S}/c-4-4`).update({ declenchements: { 'pj-p1': 3 } }));
    await assertFails(pour('alice').doc(`${S}/c-4-4`).delete());
    await assertSucceeds(pour('bob').doc(`${S}/c-4-4`).delete());
  });

  it('5a, 7a, 9a : le joueur qui a la main pose, déclenche et retire les zones du combat ; sans la main, non ; le MJ, toujours', async () => {
    const Z = `${C}/zones`;
    await assertSucceeds(pour('alice').doc(`${Z}/z1`).set(zone()));
    await assertSucceeds(pour('alice').doc(`${Z}/z1`).update({ declenchements: { 'm-r1-a': 3 }, cachee: false }));
    await assertSucceeds(pour('alice').doc(`${Z}/z1`).update({ rounds: 1 }));
    await assertFails(pour('alice').doc(`${Z}/z1`).update({ rounds: 0 }));
    await assertFails(pour('alice').doc(`${Z}/z2`).set(zone({ nature: 'lave' })));
    await assertFails(pour('carol').doc(`${Z}/z2`).set(zone()));
    await assertFails(pour('carol').doc(`${Z}/z1`).delete());
    await assertSucceeds(pour('carol').doc(`${Z}/z1`).get());
    await assertSucceeds(pour('alice').doc(`${Z}/z1`).delete());
    await assertSucceeds(pour('bob').doc(`${Z}/z3`).set(zone({ lanceur: 'm-r1-a', camp: 'monstre' })));
    await poser(C, combat({ actif: 'm-r1-a' }));
    await assertFails(pour('alice').doc(`${Z}/z3`).update({ rounds: 1 }));
    await assertSucceeds(pour('bob').doc(`${Z}/z3`).delete());
  });
});

describe('concentration et invocations (L6.4b2)', () => {
  const tison = (extra: Record<string, unknown> = {}) =>
    combattant({
      genre: 'invocation', nom: 'Tison', perso: null, uid: 'alice', monstre: null, pv: 27, pvMax: 27, def: 15, initiative: 13, de: 11, maitre: 'pj-p1',
      invocation: { creature: 'serviteur.feu', element: 'feu', attaque: { bonus: 7, des: '1d8+3', typeDegats: 'feu' }, objet: false, remous: 1, rounds: 3, lancer: 't3' }, ...extra,
    });
  const conc = { action: 'enchantement.fascination', nom: 'Fascination', lancer: 't3', maintien: 1, rupture: ['cibleAttaquee'], rounds: null, etats: [{ cible: 'm-r1-a', etat: 'fascine' }], zone: null, invocations: [] };
  const I = `${C}/combattants/i-p1-t3-1`;
  const J = `${TABLE}/scenes/cave/jetons/i-p1-t3-1`;
  const jeton = (extra: Record<string, unknown> = {}) => ({ genre: 'invocation', nom: 'Tison', couleur: '#8e44ad', cx: 3, cy: 1, proprietaire: 'alice', creeLe: 1, ...extra });

  it('13b, 11a : le joueur qui a la main appelle son invocation (son maître : lui ; PV pleins), puis pose son jeton', async () => {
    await assertFails(pour('alice').doc(J).set(jeton()));
    await assertFails(pour('alice').doc(I).set(tison({ maitre: 'pj-p2' })));
    await assertFails(pour('alice').doc(I).set(tison({ uid: 'carol' })));
    await assertFails(pour('alice').doc(I).set(tison({ pv: 20 })));
    await assertFails(pour('alice').doc(I).set(tison({ maitre: null })));
    await assertFails(pour('alice').doc(I).set(tison({ invocation: null })));
    await assertFails(pour('alice').doc(I).set(tison({ etats: [{ id: 'invisible', rounds: null, cumul: 1, charges: null, des: null, source: null }] })));
    await assertFails(pour('carol').doc(I).set(tison({ uid: 'carol' })));
    await assertFails(pour('alice').doc(`${C}/combattants/m-r1-z`).set(goule()));
    await assertSucceeds(pour('alice').doc(I).set(tison()));
    await assertFails(pour('alice').doc(J).set(jeton({ proprietaire: 'carol' })));
    await assertFails(pour('alice').doc(J).set(jeton({ genre: 'monstre' })));
    await assertFails(pour('carol').doc(J).set(jeton({ proprietaire: 'carol' })));
    await assertSucceeds(pour('alice').doc(J).set(jeton()));
    // Sans la main, non.
    await poser(C, combat({ actif: 'm-r1-a' }));
    await assertFails(pour('alice').doc(`${C}/combattants/i-p1-t3-2`).set(tison()));
    await assertSucceeds(pour('bob').doc(`${C}/combattants/i-p1-t3-2`).set(tison()));
  });

  it('14a, 9a : à son tour, il la joue ; au tour du maître, ses rounds baissent ; il la retire, et son jeton ; un autre joueur non', async () => {
    await poser(I, tison());
    await poser(J, jeton());
    await poser(C, combat({ actif: 'i-p1-t3-1' }));
    await assertSucceeds(pour('alice').doc(I).update({ tourActions: 3, principale: true }));
    await assertSucceeds(pour('alice').doc(J).update({ cx: 4 }));
    // Elle a la main : son joueur blesse un monstre.
    await assertSucceeds(pour('alice').doc(`${C}/combattants/m-r1-a`).update({ pv: 8, aTerre: false }));
    await poser(C, combat({ actif: 'pj-p1' }));
    // Hors de son tour, son joueur ne joue plus l'invocation ; son jeton,
    // lui, reste déplaçable par un sort (L6.4a, 10a : 20 cases au plus).
    await assertFails(pour('alice').doc(I).update({ tourActions: 4, principale: true }));
    await assertFails(pour('alice').doc(J).update({ cx: 40 }));
    await assertSucceeds(pour('alice').doc(I).update({ invocation: { creature: 'serviteur.feu', element: 'feu', attaque: { bonus: 7, des: '1d8+3', typeDegats: 'feu' }, objet: false, remous: 1, rounds: 2, lancer: 't3' } }));
    await assertFails(pour('alice').doc(I).update({ pv: 30 }));
    await assertFails(pour('carol').doc(I).delete());
    await assertFails(pour('carol').doc(J).delete());
    await assertSucceeds(pour('alice').doc(I).delete());
    await assertSucceeds(pour('alice').doc(J).delete());
  });

  it('12a, 1a : la concentration du PJ ; le joueur qui a la main la rompt (pas d’en poser une à un autre) ; un monstre ne se concentre pas', async () => {
    await assertSucceeds(pour('alice').doc(`${C}/combattants/pj-p1`).update({ tourActions: 3, principale: true, concentration: conc }));
    await assertFails(pour('bob').doc(`${C}/combattants/m-r1-a`).update({ concentration: conc }));
    await poser(`${C}/combattants/pj-p2`, combattant({ nom: 'Hermione', perso: 'p2', uid: 'carol', concentration: conc }));
    await assertFails(pour('alice').doc(`${C}/combattants/pj-p2`).update({ concentration: { ...conc, nom: 'Autre' } }));
    await assertSucceeds(pour('alice').doc(`${C}/combattants/pj-p2`).update({ concentration: null }));
    await assertFails(pour('carol').doc(`${C}/combattants/pj-p1`).update({ concentration: null }));
    await assertSucceeds(pour('bob').doc(`${C}/combattants/pj-p1`).update({ concentration: null }));
  });

  it('10a : le MJ blesse une invocation ; une barricade a sa DEF ; pas de sauvegardes de monstre', async () => {
    await poser(I, tison());
    await assertSucceeds(pour('bob').doc(I).update({ pv: 3, aTerre: false }));
    await assertFails(pour('bob').doc(`${C}/combattants/i-x`).set(tison({ def: null })));
    await assertFails(pour('bob').doc(`${C}/combattants/i-x`).set(tison({ sauvegardes: { FOR: 0, DEX: 0, CON: 0, Volonte: 0 } })));
    await assertFails(pour('bob').doc(`${C}/combattants/i-x`).set(tison({ perso: 'p1' })));
    await assertFails(pour('bob').doc(`${C}/combattants/i-x`).set(tison({ concentration: conc })));
    await assertSucceeds(pour('bob').doc(I).delete());
  });
});

describe('réactions (L6.5b)', () => {
  const R = `${C}/reactions`;
  const O = `${C}/opportunites`;
  const demande = (extra: Record<string, unknown> = {}) => ({
    qui: 'pj-p1', uid: 'alice', reaction: 'abjuration.bouclier', cible: 'pj-p1', case: null, posture: null, opportunite: null, tour: 3, statut: 'attente', texte: null, creeLe: 1, ...extra,
  });
  const opp = (extra: Record<string, unknown> = {}) => ({ attaquant: 'm-r1-a', cible: 'pj-p1', tour: 3, creeLe: 1, ...extra });

  it('1a : le joueur demande la sienne, hors de son tour, en attente ; le MJ seul la joue ; la forme est vérifiée', async () => {
    await poser(C, combat({ actif: 'm-r1-a' }));
    await assertSucceeds(pour('alice').doc(`${R}/r1`).set(demande()));
    await assertSucceeds(pour('alice').doc(`${R}/r2`).set(demande({ reaction: 'barde.esquive-acrobatique', cible: null, case: { cx: 3, cy: 4 } })));
    await assertSucceeds(pour('alice').doc(`${R}/r3`).set(demande({ reaction: 'guerrier.changement-de-posture', cible: null, posture: { plus: 'degats', moins: 'DEF', valeur: 3 } })));
    await assertSucceeds(pour('alice').doc(`${R}/r4`).set(demande({ reaction: 'arme.opportunite', cible: 'm-r1-a', opportunite: 't3-pj-p1-m-r1-a' })));
    // Pas pour le combattant d'un autre, ni au nom d'un autre, ni déjà jouée.
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ qui: 'pj-p2' })));
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ uid: 'carol' })));
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ statut: 'jouee' })));
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ texte: 'Jouée.' })));
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ x: 1 })));
    await assertFails(pour('alice').doc(`${R}/x`).set((({ creeLe: _c, ...d }) => d)(demande())));
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ posture: { plus: 'vitesse', moins: 'DEF', valeur: 3 } })));
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ posture: { plus: 'DEF', moins: 'attaque', valeur: 0 } })));
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ case: { cx: 500, cy: 0 } })));
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ case: { cx: 1 } })));
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ tour: 0 })));
    await assertFails(pour('alice').doc(`${R}/x`).set(demande({ reaction: '' })));
    await assertSucceeds(pour('carol').doc(`${R}/r1`).get());
    // Le joueur ne la passe pas à « jouée » ; le MJ, avec le texte, rien d'autre.
    await assertFails(pour('alice').doc(`${R}/r1`).update({ statut: 'jouee' }));
    await assertSucceeds(pour('bob').doc(`${R}/r1`).update({ statut: 'jouee' }));
    await assertSucceeds(pour('bob').doc(`${R}/r1`).update({ statut: 'refusee', texte: 'Trop tard : le tour a passé.' }));
    await assertFails(pour('bob').doc(`${R}/r1`).update({ reaction: 'guerrier.riposte' }));
    await assertFails(pour('bob').doc(`${R}/r1`).update({ statut: 'perdue' }));
    await assertFails(pour('alice').doc(`${R}/r1`).delete());
    await assertSucceeds(pour('bob').doc(`${R}/r1`).delete());
  });

  it('2b : le joueur qui a la main note l’opportunité que son pas ouvre, ce tour (deux fois, il la réécrit) ; le MJ, toutes ; le MJ seul la retire', async () => {
    await assertSucceeds(pour('alice').doc(`${O}/t3-m-r1-a-pj-p1`).set(opp()));
    await assertSucceeds(pour('alice').doc(`${O}/t3-m-r1-a-pj-p1`).set(opp({ creeLe: 2 })));
    await assertFails(pour('alice').doc(`${O}/x`).set(opp({ cible: 'pj-p2' })));
    await assertFails(pour('alice').doc(`${O}/x`).set(opp({ tour: 2 })));
    await assertFails(pour('alice').doc(`${O}/x`).set(opp({ x: 1 })));
    await assertFails(pour('carol').doc(`${O}/x`).set(opp({ cible: 'pj-p2' })));
    await assertSucceeds(pour('carol').doc(`${O}/t3-m-r1-a-pj-p1`).get());
    await poser(C, combat({ actif: 'm-r1-a' }));
    await assertFails(pour('alice').doc(`${O}/y`).set(opp()));
    await assertSucceeds(pour('bob').doc(`${O}/t3-pj-p1-m-r1-a`).set(opp({ attaquant: 'pj-p1', cible: 'm-r1-a' })));
    await assertFails(pour('alice').doc(`${O}/t3-m-r1-a-pj-p1`).delete());
    await assertSucceeds(pour('bob').doc(`${O}/t3-m-r1-a-pj-p1`).delete());
  });
});
