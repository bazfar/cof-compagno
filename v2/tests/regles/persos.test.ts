import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des fiches de personnage (lot L2.1), contre l'émulateur Firestore.
 * Table « t1 » : Bob est MJ, Alice et Carol sont joueuses.
 */
const TABLE = 'tables/t1';
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cof-compagno',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`${TABLE}/secret/codeMj`).set({ code: 'dragon' });
    await db.doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'dragon', rejointLe: 1 });
    await db.doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1 });
    await db.doc(`${TABLE}/joueurs/carol`).set({ nom: 'Carol', rejointLe: 1 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const alice = () => pour('alice');
const bob = () => pour('bob');

/** Fiche minimale valide (la forme complète est vérifiée par Zod dans l'app). */
const fiche = (proprietaireUid: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1, proprietaireUid, creeLe: 1, nom: 'Shyrion', niveau: 3, classe: 'magicien', race: 'elfe',
  caracs: { FOR: 10 }, capacites: [], pvMax: 14, pvActuel: 14, equipement: {}, inventaire: {},
  piecesOr: 5, piecesArgent: 0, piecesBronze: 0, modules: {},
  progression: { crans: 0 }, vecu: { crans: 0, paliers: 0, points: 0, noeuds: [], noeudOffert: null }, usages: {},
  ...extra,
});

async function poser(id: string, donnees: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`${TABLE}/persos/${id}`).set(donnees);
  });
}

describe('fiches de personnage (L2.1)', () => {
  it('une joueuse crée SES personnages, plusieurs si elle veut (décision 2a)', async () => {
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).set(fiche('alice')));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p2`).set(fiche('alice', { nom: 'Fred' })));
    await assertFails(alice().doc(`${TABLE}/persos/p3`).set(fiche('carol')));
  });

  it('elle modifie sa fiche, pas celle des autres', async () => {
    await poser('p1', fiche('alice'));
    await poser('p2', fiche('carol'));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).update({ pvActuel: 9 }));
    await assertFails(alice().doc(`${TABLE}/persos/p2`).update({ pvActuel: 9 }));
  });

  it("elle ne peut ni donner son personnage, ni se donner des crans, ni le supprimer", async () => {
    await poser('p1', fiche('alice'));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ proprietaireUid: 'carol' }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ progression: { crans: 9 } }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.crans': 3 }));
    await assertFails(alice().doc(`${TABLE}/persos/p2`).set(fiche('alice', { progression: { crans: 2 } })));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).delete());
  });

  it('Vécu : elle choisit ses nœuds et dépense ses points, sans en créer', async () => {
    await poser('p1', fiche('alice', { vecu: { crans: 3, paliers: 1, points: 1, noeuds: [], noeudOffert: null } }));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.points': 0, 'vecu.noeuds': ['oeil_du_chasseur'] }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.points': 5 }));
  });

  it('Vécu (L4.18, 8a) : un point par nœud, aucun nœud retiré, le nœud offert posé une fois', async () => {
    await poser('p1', fiche('alice', { vecu: { crans: 0, paliers: 2, points: 1, noeuds: ['affable'], noeudOffert: null } }));
    // Un nœud sans payer, ou deux pour un point : refusé.
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.noeuds': ['affable', 'pisteur'] }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.points': 0, 'vecu.noeuds': ['affable', 'pisteur', 'acrobate'] }));
    // Retirer un nœud pour en prendre un autre : refusé (seul le MJ retire).
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.points': 0, 'vecu.noeuds': ['pisteur', 'acrobate'] }));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.noeudOffert': 'erudit' }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.noeudOffert': 'affable' }));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.points': 0, 'vecu.noeuds': ['affable', 'pisteur'] }));
    // Le MJ retire et accorde.
    await assertSucceeds(bob().doc(`${TABLE}/persos/p1`).update({ 'vecu.points': 1, 'vecu.noeuds': ['pisteur'] }));
  });

  it('le MJ fait tout : crans, changement de propriétaire, suppression', async () => {
    await poser('p1', fiche('alice'));
    await assertSucceeds(bob().doc(`${TABLE}/persos/p1`).update({ progression: { crans: 2 } }));
    await assertSucceeds(bob().doc(`${TABLE}/persos/p1`).update({ proprietaireUid: 'carol' }));
    await assertSucceeds(bob().doc(`${TABLE}/persos/p1`).delete());
  });

  it('toute la table lit les fiches ; hors table, rien', async () => {
    await poser('p1', fiche('alice'));
    await assertSucceeds(pour('carol').doc(`${TABLE}/persos/p1`).get());
    await assertFails(pour('intrus').doc(`${TABLE}/persos/p1`).get());
  });

  it('forme refusée : champ inconnu (la DEF v1), niveau hors bornes, version future', async () => {
    await assertFails(bob().doc(`${TABLE}/persos/p1`).set(fiche('alice', { def: 14 })));
    await assertFails(bob().doc(`${TABLE}/persos/p1`).set(fiche('alice', { niveau: 21 })));
    await assertFails(bob().doc(`${TABLE}/persos/p1`).set(fiche('alice', { schemaVersion: 2 })));
    await assertFails(bob().doc(`${TABLE}/persos/p1`).set(fiche('alice', { jalons: { acquis: 1, requis: 3 } })));
  });
});

describe('fiche vivante (L2.3)', () => {
  const image = 'data:image/jpeg;base64,AAAA';

  it('notes : son propriétaire et le MJ les écrivent, au plus 10 000 caractères', async () => {
    await poser('p1', fiche('alice'));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).update({ notes: 'Doit 3 po au tavernier.' }));
    await assertSucceeds(bob().doc(`${TABLE}/persos/p1`).update({ notes: 'Vu par le MJ.' }));
    await assertFails(pour('carol').doc(`${TABLE}/persos/p1`).update({ notes: 'intrus' }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ notes: 'x'.repeat(10001) }));
  });

  it('portrait : document à part, changé par le propriétaire du personnage ou le MJ, lu par toute la table', async () => {
    await poser('p1', fiche('alice'));
    const chemin = `${TABLE}/persos/p1/images/portrait`;
    await assertSucceeds(alice().doc(chemin).set({ image, majLe: 1 }));
    await assertFails(pour('carol').doc(chemin).set({ image, majLe: 2 }));
    await assertSucceeds(pour('carol').doc(chemin).get());
    await assertSucceeds(bob().doc(chemin).set({ image, majLe: 3 }));
    await assertFails(alice().doc(chemin).set({ image: 'https://exemple.fr/x.png', majLe: 4 }));
    await assertFails(alice().doc(`${TABLE}/persos/p1/images/illustration`).set({ image, majLe: 5 }));
    await assertFails(pour('carol').doc(chemin).delete());
    await assertSucceeds(alice().doc(chemin).delete());
  });
});

describe('fiche de la refonte (L4.11a)', () => {
  const refonte = { classe: 'magicien', rangs: { 'magicien.ecole': 2 }, rangOffert: null, ecole: 'evocation', elementDepart: 'feu', secondElement: null, elementMaitre: null, mineurs: [], mineurPalierII: null, caracEnPlus: null, variantes: {}, jauges: { endurance: null, inspiration: null, sacre: null, plongee: 0, corruptionAme: 0 } };
  const octrois = { chaos: false, elements: {}, verbes: [], reconversion: false };
  const v2 = (proprietaireUid: string, extra: Record<string, unknown> = {}) => {
    const { capacites: _c, ...communs } = fiche(proprietaireUid);
    return { ...communs, schemaVersion: 2, refonte, octrois, ...extra };
  };
  const convertie = (extra: Record<string, unknown> = {}) => {
    const { capacites: _c, ...communs } = fiche('alice');
    return { ...communs, schemaVersion: 2, refonte, octrois, ...extra };
  };

  it('une joueuse convertit sa fiche v1 (version 2, champs v1 retirés), sans rien s’accorder', async () => {
    await poser('p1', fiche('alice'));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).set(convertie()));
    await poser('p2', fiche('alice'));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p2`).set(convertie({ octrois: { ...octrois, chaos: true } })));
    await poser('p3', fiche('alice'));
    await assertFails(alice().doc(`${TABLE}/persos/p3`).set(convertie({ octrois: { ...octrois, elements: { glace: 'initie' } } })));
    await assertFails(alice().doc(`${TABLE}/persos/p3`).set(convertie({ capacites: [] })));
  });

  it('ensuite, ce qu’accorde le MJ (octrois) ne se touche pas ; les jauges, si ; les rangs, à la montée ou rouverts', async () => {
    await poser('p1', v2('alice'));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'octrois.chaos': true }));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).update({ 'refonte.jauges.plongee': 3 }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'refonte.rangs': { 'magicien.ecole': 3 } }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ schemaVersion: 1 }));
    await assertSucceeds(bob().doc(`${TABLE}/persos/p1`).update({ 'octrois.reconversion': true, 'octrois.chaos': true }));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).update({ 'refonte.rangs': { 'magicien.ecole': 1 }, 'octrois.reconversion': false }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'refonte.rangs': { 'magicien.ecole': 2 } }));
  });

  it('une joueuse crée une fiche de la refonte sans rien d’accordé ; le MJ, comme il veut', async () => {
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).set(v2('alice')));
    await assertFails(alice().doc(`${TABLE}/persos/p2`).set(v2('alice', { octrois: { ...octrois, chaos: true } })));
    await assertSucceeds(bob().doc(`${TABLE}/persos/p3`).set(v2('alice', { octrois: { ...octrois, chaos: true } })));
  });
});
