import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des scènes hors combat (lot S2, décisions du 22/10/2026), contre
 * l'émulateur. Table « t1 » : Bob est MJ ; Alice et Carol sont joueuses,
 * Alice seule est appelée.
 */
const TABLE = 'tables/t1';
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cof-compagno',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

const scene = (extra: Record<string, unknown> = {}) => ({
  type: 'social', pnj: 'pnj-aude', cible: 'Aude Berlan', objectif: 'Savoir d’où vient la fiole', mode: 'individuel', competence: null,
  requis: 3, toleres: 2, echecsVisibles: true, marquante: false,
  appeles: [{ uid: 'alice', perso: 'p-magnus', nom: 'Magnus' }], appelesUids: ['alice'],
  tour: 1, reussites: 0, echecs: 0, depart: 'neutre', hausses: 0, baisses: 0, menaces: 0, temp: 0, mensonges: 0, seduction: null,
  statut: 'ouverte', issue: null, creeLe: 1, closeLe: null, ...extra,
});
const action = (extra: Record<string, unknown> = {}) => ({
  uid: 'alice', perso: 'p-magnus', nom: 'Magnus', tour: 1, option: 'convaincre', competence: 'Persuasion', de: 14, bonus: 3, resultat: null, creeLe: 1, ...extra,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`${TABLE}/secret/codeMj`).set({ code: 'dragon' });
    await db.doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'dragon', rejointLe: 1 });
    await db.doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1 });
    await db.doc(`${TABLE}/joueurs/carol`).set({ nom: 'Carol', rejointLe: 1 });
    await db.doc(TABLE).set({ sceneActive: null });
    await db.doc(`${TABLE}/scenesHorsCombat/sh1`).set(scene());
    await db.doc(`${TABLE}/scenesHorsCombatMj/sh1`).set({ dd: 13 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const actes = `${TABLE}/scenesHorsCombat/sh1/actions`;

describe('scènes hors combat (S2)', () => {
  it('toute la table lit la scène ; le MJ seul l’écrit ; le DD est au MJ seul', async () => {
    await assertSucceeds(pour('carol').doc(`${TABLE}/scenesHorsCombat/sh1`).get());
    await assertFails(pour('alice').doc(`${TABLE}/scenesHorsCombat/sh1`).set(scene({ reussites: 3 })));
    await assertSucceeds(pour('bob').doc(`${TABLE}/scenesHorsCombat/sh1`).set(scene({ reussites: 1, hausses: 1 })));
    await assertFails(pour('alice').doc(`${TABLE}/scenesHorsCombatMj/sh1`).get());
    await assertSucceeds(pour('bob').doc(`${TABLE}/scenesHorsCombatMj/sh1`).get());
    await assertFails(pour('bob').doc(`${TABLE}/scenesHorsCombatMj/sh1`).set({ dd: 40 }));
    await assertFails(pour('bob').doc(`${TABLE}/scenesHorsCombatMj/sh1`).set({ dd: 13, note: 'x' }));
  });

  it('forme de la scène refusée : DD dedans, statut inventé, appelesUids qui ne suit pas', async () => {
    const bob = pour('bob').doc(`${TABLE}/scenesHorsCombat/sh2`);
    await assertFails(bob.set(scene({ dd: 13 })));
    await assertFails(bob.set(scene({ statut: 'finie' })));
    await assertFails(bob.set(scene({ appelesUids: [] })));
    await assertFails(bob.set(scene({ temp: 6 })));
    await assertSucceeds(bob.set(scene({ seance: 's0014' })));
  });

  it('une appelée écrit son action du tour, une seule, à son nom, sans résultat ; passer donne « passe »', async () => {
    await assertFails(pour('alice').doc(`${actes}/1-alice`).set(action({ resultat: 'reussite' })));
    await assertFails(pour('alice').doc(`${actes}/2-alice`).set(action({ tour: 2 })));
    await assertFails(pour('alice').doc(`${actes}/1-carol`).set(action()));
    await assertFails(pour('alice').doc(`${actes}/1-alice`).set(action({ uid: 'carol' })));
    await assertSucceeds(pour('alice').doc(`${actes}/1-alice`).set(action()));
    // Pas de seconde action ce tour (ni de réécriture).
    await assertFails(pour('alice').doc(`${actes}/1-alice`).set(action({ de: 20 })));
    await assertSucceeds(pour('bob').doc(`${actes}/1-alice`).update({ resultat: 'reussite' }));
    await assertFails(pour('bob').doc(`${actes}/1-alice`).update({ de: 20 }));
  });

  it('G2b : un sort joint est une demande d’Alice pour cette scène et cette action, en attente ; pas sur Passer', async () => {
    const demande = (extra: Record<string, unknown> = {}) => ({
      uid: 'alice', perso: 'p-magnus', nom: 'Magnus', sort: 'enchantement.charme', nomSort: 'Charme', palier: 'II', pp: 2, echec: 0, sauvegarde: null, dd: null,
      intention: 'Un ami de passage', textes: ['x'], statut: 'attente', motif: null, de: null, resistance: null, scene: 'sh1', action: '1-alice', bonus: null, creeLe: 1, majLe: 1, ...extra,
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`${TABLE}/sortsHorsCombat/ok`).set(demande());
      await db.doc(`${TABLE}/sortsHorsCombat/autre-action`).set(demande({ action: '2-alice' }));
      await db.doc(`${TABLE}/sortsHorsCombat/de-carol`).set(demande({ uid: 'carol' }));
      await db.doc(`${TABLE}/sortsHorsCombat/acceptee`).set(demande({ statut: 'acceptee', bonus: 2 }));
    });
    const alice = pour('alice').doc(`${actes}/1-alice`);
    await assertFails(alice.set(action({ sort: 'autre-action' })));
    await assertFails(alice.set(action({ sort: 'de-carol' })));
    await assertFails(alice.set(action({ sort: 'acceptee' })));
    await assertFails(alice.set(action({ sort: 'inconnue' })));
    await assertFails(alice.set(action({ option: 'passer', competence: null, de: null, resultat: 'passe', sort: 'ok' })));
    await assertSucceeds(alice.set(action({ sort: 'ok' })));
    // Refusé (2b) : le MJ défait l'action, Alice rejoue.
    await assertSucceeds(pour('bob').doc(`${actes}/1-alice`).delete());
    await assertSucceeds(alice.set(action()));
  });

  it('passer ; une non-appelée ne joue pas ; une scène terminée n’attend plus de jet', async () => {
    await assertFails(pour('alice').doc(`${actes}/1-alice`).set(action({ option: 'passer', competence: null, de: null, resultat: null })));
    await assertSucceeds(pour('alice').doc(`${actes}/1-alice`).set(action({ option: 'passer', competence: null, de: null, resultat: 'passe' })));
    await assertFails(pour('carol').doc(`${actes}/1-carol`).set(action({ uid: 'carol' })));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${TABLE}/scenesHorsCombat/sh1`).set(scene({ tour: 2, statut: 'terminee', issue: 'gagnee' }));
    });
    await assertFails(pour('alice').doc(`${actes}/2-alice`).set(action({ tour: 2 })));
    await assertSucceeds(pour('carol').collection(actes).get());
  });
});

describe('Vécu en scène (S3)', () => {
  it('relance (Mémoire eidétique) : `<tour>-<uid>-r`, pour un échec à soi, scène pas close ; le MJ annule l’original', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${actes}/1-alice`).set(action({ resultat: 'echec' }));
    });
    await assertFails(pour('alice').doc(`${actes}/1-alice-r`).set(action({ relance: true, resultat: 'reussite' })));
    await assertFails(pour('alice').doc(`${actes}/1-alice-r`).set(action({ relance: false })));
    await assertFails(pour('alice').doc(`${actes}/1-alice-r`).set(action({ relance: true, note: 'triche' })));
    await assertSucceeds(pour('alice').doc(`${actes}/1-alice-r`).set(action({ relance: true, note: null, delta: null, annule: false })));
    await assertSucceeds(pour('bob').doc(`${actes}/1-alice`).update({ annule: true }));
    await assertSucceeds(pour('bob').doc(`${actes}/1-alice-r`).update({ resultat: 'reussite', note: 'Mémoire eidétique', delta: { reussites: 1 } }));
    // Pas de relance d'une réussite, ni pour un autre.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${actes}/2-alice`).set(action({ tour: 2, resultat: 'reussite' }));
    });
    await assertFails(pour('alice').doc(`${actes}/2-alice-r`).set(action({ tour: 2, relance: true })));
    await assertFails(pour('carol').doc(`${actes}/1-carol-r`).set(action({ uid: 'carol', relance: true })));
  });

  it('une action vierge à la création : ni note, ni delta, ni annulation', async () => {
    await assertFails(pour('alice').doc(`${actes}/1-alice`).set(action({ note: 'Orateur' })));
    await assertFails(pour('alice').doc(`${actes}/1-alice`).set(action({ annule: true })));
    await assertSucceeds(pour('alice').doc(`${actes}/1-alice`).set(action({ option: 'lire', competence: 'Discernement', relance: false, note: null, delta: null, annule: false })));
  });

  it('capacités du Vécu : un appelé, à son nom, une fois pour un même identifiant', async () => {
    const u = { uid: 'alice', perso: 'p-magnus', nom: 'Magnus', noeud: 'compagnon-oiseau', tour: 1, creeLe: 1 };
    const chemin = `${TABLE}/scenesHorsCombat/sh1/utilisations`;
    await assertFails(pour('alice').doc(`${chemin}/x`).set({ ...u, uid: 'carol' }));
    await assertFails(pour('carol').doc(`${chemin}/carol-compagnon-oiseau`).set({ ...u, uid: 'carol' }));
    await assertSucceeds(pour('alice').doc(`${chemin}/alice-compagnon-oiseau`).set(u));
    await assertFails(pour('alice').doc(`${chemin}/alice-compagnon-oiseau`).set({ ...u, tour: 2 }));
    await assertSucceeds(pour('carol').collection(chemin).get());
  });

  it('questions : le joueur pose Savant ou Réseau de rumeurs, lit les siennes seulement ; le MJ répond et pose Lire les gens', async () => {
    const q = { uid: 'alice', perso: 'p-magnus', nom: 'Magnus', noeud: 'savant', scene: 'sh1', question: 'Qui ?', dd: null, reponse: null, creeLe: 1, reponduLe: null };
    const chemin = `${TABLE}/questions`;
    await assertSucceeds(pour('alice').doc(`${chemin}/sh1-alice-savant`).set(q));
    await assertFails(pour('alice').doc(`${chemin}/a2`).set({ ...q, noeud: 'lire-les-gens' }));
    await assertFails(pour('alice').doc(`${chemin}/a3`).set({ ...q, reponse: 'Moi' }));
    await assertFails(pour('alice').doc(`${chemin}/a4`).set({ ...q, uid: 'carol' }));
    await assertFails(pour('alice').doc(`${chemin}/sh1-alice-savant`).set(q));
    await assertSucceeds(pour('alice').collection(chemin).where('uid', '==', 'alice').get());
    await assertFails(pour('carol').doc(`${chemin}/sh1-alice-savant`).get());
    await assertFails(pour('carol').collection(chemin).get());
    await assertFails(pour('alice').doc(`${chemin}/sh1-alice-savant`).update({ reponse: 'Moi' }));
    await assertSucceeds(pour('bob').doc(`${chemin}/sh1-alice-savant`).update({ reponse: 'Les forges de Mornac', reponduLe: 2 }));
    await assertFails(pour('bob').doc(`${chemin}/sh1-alice-savant`).update({ question: 'Autre' }));
    await assertSucceeds(pour('bob').doc(`${chemin}/sh1-alice-lire`).set({ ...q, noeud: 'lire-les-gens', question: null, dd: 12 }));
  });

  it('scène de S3 : peuple, foule, autorité, nœuds relevés, usages', async () => {
    await assertSucceeds(pour('bob').doc(`${TABLE}/scenesHorsCombat/sh3`).set(scene({ peuple: 1, foule: true, autorite: false, vecus: { alice: ['orateur'] }, usages: { alice: ['langue-d-argent'] } })));
    await assertFails(pour('bob').doc(`${TABLE}/scenesHorsCombat/sh3`).set(scene({ peuple: 2 })));
  });
});
