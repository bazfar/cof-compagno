import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * LES BUGS CONNUS DE LA BATTLEMAP V1 (lot L5.6, critère de sortie de L5).
 *
 * Un `describe` par bug documenté dans js/carte.js ou rencontré en séance.
 * Chacun dit comment la 2.0 l'empêche, et le vérifie. Les bugs de la
 * « bulle » d'information et du ciblage concernent des écrans qui
 * n'existent pas encore en 2.0 : ils sont notés `todo` et seront couverts
 * avec l'overlay de combat (L6). Un bug ne sort de cette liste que couvert.
 *
 * Les écritures Firestore sont observées à travers un faux SDK : on vérifie
 * QUEL document et QUELS champs chaque action touche, sans base.
 */

const appels: { fn: string; chemin: string; donnees?: unknown; options?: unknown }[] = [];
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  const ref = (_db: unknown, ...p: string[]) => ({ chemin: p.join('/') });
  return {
    doc: ref,
    collection: ref,
    setDoc: async (r: { chemin: string }, donnees: unknown, options?: unknown) => { appels.push({ fn: 'setDoc', chemin: r.chemin, donnees, options }); },
    updateDoc: async (r: { chemin: string }, donnees: unknown) => { appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees }); },
    deleteDoc: async (r: { chemin: string }) => { appels.push({ fn: 'deleteDoc', chemin: r.chemin }); },
    deleteField: () => '<supprimer>',
    increment: (n: number) => `<+${n}>`,
    runTransaction: async () => undefined,
    writeBatch: () => ({ set: () => undefined, delete: () => undefined, commit: async () => undefined }),
  };
});

const { session } = await import('../../src/lib/session.svelte');
const actions = await import('../../src/lib/actions/carte');
const { GrilleExploration, SOUS_CASES, explorationLocalePerimee } = await import('../../src/lib/battlemap/exploration');
const { sourceScene } = await import('../../src/lib/battlemap/import-image');
const { sceneCalcul } = await import('../../src/lib/battlemap/geometrie');
const { jetonsVisiblesDesPJ, visionsDesPJ } = await import('../../src/lib/battlemap/visibilite');

const vide = sceneCalcul({ id: 'vide', nom: 'Vide', colonnes: 20, lignes: 20, pxParCaseSource: 100, murs: [], obstacles: [], portes: [] });

beforeEach(() => {
  appels.length = 0;
  session.table = 't1';
});

describe('bug 1 — deux clients qui bougent des jetons différents s\'écrasent (tableau réécrit en entier)', () => {
  it('2.0 : un document par jeton, seules cx et cy sont écrites', async () => {
    await actions.deplacerJeton('taverne', 'pj-alice', { cx: 3, cy: 4 });
    await actions.deplacerJeton('taverne', 'g1', { cx: 7, cy: 8 });
    expect(appels).toEqual([
      { fn: 'updateDoc', chemin: 'tables/t1/scenes/taverne/jetons/pj-alice', donnees: { cx: 3, cy: 4 } },
      { fn: 'updateDoc', chemin: 'tables/t1/scenes/taverne/jetons/g1', donnees: { cx: 7, cy: 8 } },
    ]);
  });

  it('2.0 : deux portes basculées en même temps ne touchent chacune que leur clé', async () => {
    await actions.basculerPorte('taverne', 'p0', true);
    await actions.basculerPorte('taverne', 'p3', false);
    expect(appels.map((a) => [a.chemin, a.donnees, a.options])).toEqual([
      ['tables/t1/scenes/taverne', { portesOuvertes: { p0: true } }, { merge: true }],
      ['tables/t1/scenes/taverne', { portesOuvertes: { p3: false } }, { merge: true }],
    ]);
  });
});

describe("bug 2 — un mur effacé ne disparaît que chez celui qui l'a retiré (piège de synchro)", () => {
  it("2.0 : effacer = supprimer le document du dessin, que tous les clients suivent", async () => {
    await actions.effacerDessin('taverne', 'd-abc');
    expect(appels).toEqual([{ fn: 'deleteDoc', chemin: 'tables/t1/scenes/taverne/dessins/d-abc' }]);
  });
});

describe('bug 3 — la zone déjà explorée retombe à l\'opacité maximale quand le PJ s\'éloigne', () => {
  it("2.0 : l'exploration ne fait que s'ajouter", () => {
    const g = new GrilleExploration(20, 20);
    g.marquerVisions(visionsDesPJ(vide, [{ id: 'a', genre: 'pj', cx: 2, cy: 2 }]));
    g.marquerVisions(visionsDesPJ(vide, [{ id: 'a', genre: 'pj', cx: 19, cy: 19 }]));
    expect(g.estExploree(2 * SOUS_CASES, 2 * SOUS_CASES)).toBe(true);
  });
});

describe("bug 4 — un monstre à portée reste caché tant que l'onglet Carte n'est pas affiché", () => {
  it("2.0 : la vision ne dépend d'aucune mesure d'écran (elle se calcule sans DOM)", () => {
    expect(typeof document).toBe('undefined'); // les tests tournent sans navigateur
    const jetons = [{ id: 'a', genre: 'pj' as const, cx: 2, cy: 2 }, { id: 'm', genre: 'monstre' as const, cx: 6, cy: 2 }];
    expect(jetonsVisiblesDesPJ(visionsDesPJ(vide, jetons), jetons).has('m')).toBe(true);
  });
});

describe('bug 5 — deux scènes de même taille gardent le brouillard de la précédente', () => {
  it("2.0 : l'exploration locale repart de zéro à chaque changement de scène, même de même taille", () => {
    const repere = { scene: 'ambush', raz: 0 };
    expect(explorationLocalePerimee(repere, 'forest_1', 0)).toBe(true); // Ambush et Forest 1 : 40 × 25 toutes deux
    expect(explorationLocalePerimee(repere, 'ambush', 0)).toBe(false);
    expect(explorationLocalePerimee(null, 'ambush', 0)).toBe(true);
  });

  it("2.0 : « Réinitialiser » du MJ vide aussi l'exploration locale de chaque joueur", async () => {
    expect(explorationLocalePerimee({ scene: 'ambush', raz: 2 }, 'ambush', 3)).toBe(true);
    await actions.reinitialiserExploration('ambush');
    expect(appels[0]).toMatchObject({ chemin: 'tables/t1/scenes/ambush', donnees: { exploration: '<supprimer>', explorationRaz: '<+1>' } });
  });

  it("2.0 : l'exploration enregistrée est rangée dans le document de SA scène", async () => {
    await actions.toutReveler('forest_1', 40, 25);
    expect(appels[0]?.chemin).toBe('tables/t1/scenes/forest_1');
  });
});

describe("bug 6 — le joueur reçoit le changement de scène avant la scène importée, et reste sur l'ancienne", () => {
  it('2.0 : une scène importée pas encore arrivée est « en attente », pas une erreur', () => {
    expect(sourceScene('imp-crypte-1', false, [])).toBe('en-attente');
    expect(sourceScene('imp-crypte-1', true, ['imp-crypte-1'])).toBe('importee');
    expect(sourceScene('imp-crypte-1', true, [])).toBe('introuvable');
    expect(sourceScene('kratz', false, [])).toBe('catalogue');
  });
});

describe("bugs de la bulle d'information et du ciblage (écrans du combat, L6)", () => {
  it.todo('bug 7 — la bulle reste figée à l\'écran pendant un défilement de page');
  it.todo('bug 8 — la bulle ne s\'affiche pas tant qu\'un ciblage est armé (« ne marche pas en phase de combat »)');
  it.todo('bug 9 — la bulle reste affichée par-dessus un autre onglet');
  it.todo('bug 10 — la surbrillance des cibles reste calée sur les positions du début du ciblage');
});
