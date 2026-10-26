import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, writeBatch } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/*
 * Budget d'évaluation des règles (décision de Thomas du 26/10/2026),
 * contre l'émulateur. Les autres tests de règles écrivent des fiches
 * minuscules ; ceux-ci prennent de vraies fiches de la refonte, produites
 * par l'assistant de création (tests/fixtures/fiches-refonte.json), parce
 * que c'est leur taille qui faisait dépasser les 1000 expressions de
 * Firestore et refuser le lot d'un sort qui blesse.
 *   - le chemin rapide : seuls les champs volatils, bornés sur l'avant ;
 *   - le chemin complet : `ficheValide` entier, inchangé.
 */
const TABLE = 'tables/t1';
const C = `${TABLE}/combats/c1`;
const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-refonte.json', 'utf8')) as Record<string, Record<string, unknown>>;
const MAGE = FICHES.Nysa!;
const GUERRIER = FICHES.Orel!;
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cof-compagno',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => {
  await env.cleanup();
});

const combat = (extra: Record<string, unknown> = {}) => ({
  nom: 'Les goules', scene: 'cave', rencontre: null, statut: 'encours', round: 1, tour: 3, actif: 'pj-p1', porteesLibres: false, creeLe: 1, closLe: null, ...extra,
});
const combattant = (extra: Record<string, unknown> = {}) => ({
  genre: 'pj', nom: 'Nysa', perso: 'p1', uid: 'alice', monstre: null, modInit: 2, initiative: 14, de: 12, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [],
  tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...extra,
});
const goule = (extra: Record<string, unknown> = {}) =>
  combattant({ genre: 'monstre', nom: 'Goule', perso: null, uid: null, monstre: 'goule', modInit: 3, pv: 14, pvMax: 14, def: 13, armure: 1, resistances: { physique: 0.5, magique: 1 }, ...extra });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`${TABLE}/secret/codeMj`).set({ code: 'dragon' });
    await db.doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'dragon', rejointLe: 1 });
    await db.doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1, persoActif: 'p1' });
    await db.doc(TABLE).set({ sceneActive: 'cave', combat: 'c1' });
    await db.doc(C).set(combat());
    await db.doc(`${C}/combattants/pj-p1`).set(combattant());
    await db.doc(`${C}/combattants/m-r1-a`).set(goule());
    await db.doc(`${TABLE}/persos/p1`).set(MAGE);
    await db.doc(`${TABLE}/persos/p2`).set(GUERRIER);
  });
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();

describe('budget d’évaluation, sur de vraies fiches de la refonte', () => {
  it('la fiche d’essai est bien une refonte de niveau 10, avec ses jauges', () => {
    expect(MAGE.schemaVersion).toBe(2);
    expect(MAGE.niveau).toBe(10);
    expect((MAGE.refonte as { jauges: Record<string, unknown> }).jauges).toBeTruthy();
    expect(GUERRIER.niveau).toBe(12);
  });

  it('le lot d’un sort qui blesse : deux écritures (monstre + lanceur) passent', async () => {
    const db = pour('alice');
    const lot = writeBatch(db);
    lot.update(doc(db, `${C}/combattants/m-r1-a`), { pv: 8, aTerre: false });
    lot.update(doc(db, `${C}/combattants/pj-p1`), { tourActions: 3, principale: true, secondaire: false, mvt: 0, sprint: false });
    await assertSucceeds(lot.commit());
  });

  it('le lot d’un sort qui blesse : trois écritures (monstre + lanceur + sa fiche) passent', async () => {
    const db = pour('alice');
    const lot = writeBatch(db);
    lot.update(doc(db, `${C}/combattants/m-r1-a`), { pv: 7, aTerre: false, etats: [{ id: 'ralenti', rounds: 1, cumul: 1, charges: null, des: null, source: 'Nysa' }] });
    lot.update(doc(db, `${C}/combattants/pj-p1`), { tourActions: 3, principale: true, secondaire: false, mvt: 0, sprint: false });
    lot.update(doc(db, `${TABLE}/persos/p1`), { ppActuel: 24 });
    await assertSucceeds(lot.commit());
  });

  it('une jauge de la refonte passe aussi par le chemin rapide', async () => {
    await assertSucceeds(pour('alice').doc(`${TABLE}/persos/p1`).update({ 'refonte.jauges.plongee': 3 }));
  });

  it('le chemin complet tient sur une fiche de niveau 12 : la fiche entière réécrite', async () => {
    await assertSucceeds(pour('alice').doc(`${TABLE}/persos/p2`).set({ ...GUERRIER, proprietaireUid: 'alice', notes: 'Un essai.' }));
  });

  it('hors liste blanche : la fiche repasse par le contrôle complet, et un champ interdit est refusé', async () => {
    await assertFails(pour('alice').doc(`${TABLE}/persos/p1`).update({ ppActuel: 20, humeur: 'grognon' }));
    await assertSucceeds(pour('alice').doc(`${TABLE}/persos/p1`).update({ ppActuel: 20, nom: 'Nysa la Grise' }));
  });

  it('les bornes du chemin rapide : PV entre 0 et pvMax, PP jamais négatifs', async () => {
    const d = pour('alice').doc(`${TABLE}/persos/p1`);
    await assertSucceeds(d.update({ pvActuel: MAGE.pvMax as number }));
    await assertFails(d.update({ pvActuel: (MAGE.pvMax as number) + 1 }));
    await assertFails(d.update({ pvActuel: -1 }));
    await assertFails(d.update({ ppActuel: -1 }));
    await assertFails(d.update({ ppActuel: '12' }));
  });

  it('hors de son tour, le joueur encaisse ses propres dégâts : pvTemp baisse, ses états rétrécissent', async () => {
    const endormi = { id: 'endormi', rounds: 2, cumul: 1, charges: null, des: null, source: 'MJ' };
    const affaibli = { id: 'affaibli', rounds: 2, cumul: 1, charges: null, des: null, source: 'MJ' };
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(C).set(combat({ actif: 'm-r1-a' }));
      await ctx.firestore().doc(`${C}/combattants/pj-p1`).set(combattant({ pvTemp: 6, etats: [endormi, affaibli] }));
    });
    const moi = pour('alice').doc(`${C}/combattants/pj-p1`);
    await assertSucceeds(moi.update({ pvTemp: 2 }));
    await assertSucceeds(moi.update({ pvTemp: 0, etats: [affaibli] }));
  });

  it('hors de son tour, rien de plus : pas de hausse, pas d’ajout d’état, pas le combattant d’un autre', async () => {
    const endormi = { id: 'endormi', rounds: 2, cumul: 1, charges: null, des: null, source: 'MJ' };
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(C).set(combat({ actif: 'm-r1-a' }));
      await ctx.firestore().doc(`${C}/combattants/pj-p1`).set(combattant({ pvTemp: 4, etats: [endormi] }));
      await ctx.firestore().doc(`${C}/combattants/pj-p2`).set(combattant({ nom: 'Orel', perso: 'p2', uid: 'carol', pvTemp: 4 }));
    });
    const moi = pour('alice').doc(`${C}/combattants/pj-p1`);
    await assertFails(moi.update({ pvTemp: 9 }));
    await assertFails(moi.update({ pvTemp: -1 }));
    await assertFails(moi.update({ etats: [endormi, { ...endormi, id: 'brulure' }] }));
    await assertFails(moi.update({ pvTemp: 2, tourActions: 3 }));
    await assertFails(moi.update({ pvTemp: 2, pvMax: 99 }));
    await assertFails(pour('alice').doc(`${C}/combattants/pj-p2`).update({ pvTemp: 1 }));
  });

  it('le lot réel de « Subir des dégâts » hors de son tour : la fiche et le combattant ensemble', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(C).set(combat({ actif: 'm-r1-a' }));
      await ctx.firestore().doc(`${C}/combattants/pj-p1`).set(combattant({ pvTemp: 6 }));
    });
    const db = pour('alice');
    const lot = writeBatch(db);
    lot.update(doc(db, `${TABLE}/persos/p1`), { pvActuel: (MAGE.pvActuel as number) - 3 });
    lot.update(doc(db, `${C}/combattants/pj-p1`), { pvTemp: 3 });
    await assertSucceeds(lot.commit());
  });

  it('le chemin rapide du combattant : ses champs volatils, pas sa forme', async () => {
    const m = pour('bob').doc(`${C}/combattants/m-r1-a`);
    await assertSucceeds(m.update({ pv: 5, aTerre: false, pvTemp: 3 }));
    await assertFails(m.update({ pv: 15 }));
    await assertFails(m.update({ pvTemp: 1000 }));
    // Hors liste blanche : on repasse par `combattantValide`, que le MJ
    // satisfait — c'est le routage qu'on vérifie, pas un refus.
    await assertSucceeds(m.update({ nom: 'Goule royale' }));
    await assertFails(m.update({ nom: 42 }));
  });
});
