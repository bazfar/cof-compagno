import { describe, expect, it } from 'vitest';
import { jetonsEnZone, jetonsSurLigne } from '../../src/lib/battlemap/ciblage';
import { caseOccupee, contactsPerdus, deplacementBloque, placerLot } from '../../src/lib/battlemap/deplacement';
import { explorationAffichee, GrilleExploration, SOUS_CASES } from '../../src/lib/battlemap/exploration';
import { sceneCalcul, type JetonCarte } from '../../src/lib/battlemap/geometrie';
import { catalogueScenes, chargerGeometrie } from '../../src/lib/battlemap/scenes';
import { jetonsVisiblesDesPJ, monstresQuiApparaissent, visionsDesPJ } from '../../src/lib/battlemap/visibilite';

/*
 * Règles de la battlemap propres à la 2.0 (lot L5.1) : ce que le test
 * d'équivalence avec la v1 ne peut pas couvrir.
 */

const geoTavern = await chargerGeometrie('test_tavern');
const tavern = sceneCalcul(geoTavern);
// Carte vide de 20 × 20, sans mur.
const geoVide = { id: 'vide', nom: 'Vide', colonnes: 20, lignes: 20, pxParCaseSource: 100, murs: [], obstacles: [], portes: [] };
const vide = sceneCalcul(geoVide);

const pj = (id: string, cx: number, cy: number): JetonCarte => ({ id, genre: 'pj', cx, cy });
const monstre = (id: string, cx: number, cy: number, mort = false): JetonCarte => ({ id, genre: 'monstre', cx, cy, mort });

describe('scènes préparées', () => {
  it('le catalogue reprend les scènes de la v1', () => {
    expect(catalogueScenes.map((s) => s.id)).toEqual(['test_tavern', 'ambush', 'forest_1', 'kratz']);
  });

  it('une scène inconnue est refusée', async () => {
    await expect(chargerGeometrie('nulle-part')).rejects.toThrow('absente du catalogue');
  });

  it('une porte fermée bloque un PJ ; ouverte, il passe', () => {
    // Porte p0 de la taverne : ouverture de (27,6) à (28,6), fermée dans le fichier.
    expect(deplacementBloque(tavern, { cx: 27, cy: 5 }, { cx: 27, cy: 6 })).toBe(true);
    const ouverte = sceneCalcul(geoTavern, { portesOuvertes: { p0: true } });
    expect(deplacementBloque(ouverte, { cx: 27, cy: 5 }, { cx: 27, cy: 6 })).toBe(false);
  });

  it('un mur dessiné par le MJ bloque comme un mur importé', () => {
    const avecMur = sceneCalcul(geoVide, { mursManuels: [[[5, 0], [5, 20]]] });
    expect(deplacementBloque(vide, { cx: 4, cy: 3 }, { cx: 5, cy: 3 })).toBe(false);
    expect(deplacementBloque(avecMur, { cx: 4, cy: 3 }, { cx: 5, cy: 3 })).toBe(true);
  });

  it('un obstacle bloque la vue mais pas le passage', () => {
    const avecObstacle = sceneCalcul(geoVide, { obstaclesManuels: [[[5, 0], [5, 20]]] });
    expect(deplacementBloque(avecObstacle, { cx: 4, cy: 3 }, { cx: 5, cy: 3 })).toBe(false);
    const visions = visionsDesPJ(avecObstacle, [pj('a', 3, 3)]);
    expect(jetonsVisiblesDesPJ(visions, [monstre('m', 7, 3)]).has('m')).toBe(false);
    expect(jetonsVisiblesDesPJ(visions, [monstre('m', 4, 6)]).has('m')).toBe(true);
  });
});

describe('monstres morts (décision du 15/10)', () => {
  it('un monstre mort libère sa case ; un PJ à terre garde la sienne', () => {
    expect(caseOccupee([monstre('m', 3, 3, true)], 3, 3)).toBe(false);
    expect(caseOccupee([monstre('m', 3, 3)], 3, 3)).toBe(true);
    // Un PJ à 0 PV n'est pas « mort » pour la carte : il tient sa case.
    expect(caseOccupee([pj('a', 3, 3)], 3, 3)).toBe(true);
  });

  it('on peut poser un jeton sur un monstre mort', () => {
    const { poses } = placerLot(vide, [monstre('m', 10, 10, true)], [{ id: 'n', genre: 'pj' }], { cx: 10, cy: 10 });
    expect(poses[0]).toMatchObject({ cx: 10, cy: 10 });
    const vivant = placerLot(vide, [monstre('m', 10, 10)], [{ id: 'n', genre: 'pj' }], { cx: 10, cy: 10 });
    expect(vivant.poses[0]).not.toMatchObject({ cx: 10, cy: 10 });
  });

  it("un monstre mort ne provoque pas d'attaque d'opportunité", () => {
    const jetons = [pj('a', 5, 5)];
    expect(contactsPerdus(jetons, monstre('m', 5, 6), { cx: 5, cy: 6 }, { cx: 5, cy: 9 })).toEqual(['a']);
    expect(contactsPerdus(jetons, monstre('m', 5, 6, true), { cx: 5, cy: 6 }, { cx: 5, cy: 9 })).toEqual([]);
  });

  it('un monstre mort ne se cible plus (ligne et zone)', () => {
    const jetons = [pj('a', 2, 5), monstre('vivant', 4, 5), monstre('mort', 5, 5, true), monstre('cible', 7, 5)];
    expect(jetonsSurLigne(vide, jetons, 'a', 'cible', 8)).toEqual(['vivant', 'cible']);
    expect(jetonsEnZone(jetons, 'vivant', 1).map((r) => r.id)).toEqual(['vivant']);
  });

  it("un monstre mort n'est pas annoncé à l'initiative, mais son corps se voit", () => {
    const jetons = [pj('a', 2, 2), monstre('m1', 4, 2), monstre('m2', 5, 2, true), monstre('m3', 6, 2)];
    const visions = visionsDesPJ(vide, jetons);
    expect(monstresQuiApparaissent(visions, jetons, new Set(['m3']))).toEqual(['m1']);
    expect(jetonsVisiblesDesPJ(visions, jetons).has('m2')).toBe(true);
  });
});

describe('exploration partagée (décision 2a du 15/10)', () => {
  it('ce qui a été exploré le reste quand le PJ s\'éloigne (bug v1 : zone redevenue opaque)', () => {
    const g = new GrilleExploration(vide.colonnes, vide.lignes);
    expect(g.marquerVisions(visionsDesPJ(vide, [pj('a', 2, 2)]))).toBeGreaterThan(0);
    g.marquerVisions(visionsDesPJ(vide, [pj('a', 19, 19)]));
    expect(g.estExploree(2 * SOUS_CASES, 2 * SOUS_CASES)).toBe(true);
    expect(g.estExploree(19 * SOUS_CASES, 19 * SOUS_CASES)).toBe(true);
  });

  it('marquer deux fois la même vue n\'ajoute rien', () => {
    const g = new GrilleExploration(vide.colonnes, vide.lignes);
    const visions = visionsDesPJ(vide, [pj('a', 5, 5)]);
    g.marquerVisions(visions);
    expect(g.marquerVisions(visions)).toBe(0);
  });

  it('un mur arrête l\'exploration', () => {
    const avecMur = sceneCalcul(geoVide, { mursManuels: [[[8, 0], [8, 20]]] });
    const g = new GrilleExploration(20, 20);
    g.marquerVisions(visionsDesPJ(avecMur, [pj('a', 5, 5)]));
    expect(g.estExploree(7 * SOUS_CASES, 5 * SOUS_CASES)).toBe(true);
    expect(g.estExploree(9 * SOUS_CASES, 5 * SOUS_CASES)).toBe(false);
  });

  it('deux joueurs qui explorent en même temps : la fusion garde tout', () => {
    const a = new GrilleExploration(20, 20);
    const b = new GrilleExploration(20, 20);
    a.marquerVisions(visionsDesPJ(vide, [pj('a', 1, 1)]));
    b.marquerVisions(visionsDesPJ(vide, [pj('b', 18, 18)]));
    const f = a.fusionner(b);
    expect(f.estExploree(1 * SOUS_CASES, 1 * SOUS_CASES) && f.estExploree(18 * SOUS_CASES, 18 * SOUS_CASES)).toBe(true);
    expect(() => a.fusionner(new GrilleExploration(10, 10))).toThrow('tailles différentes');
  });

  it('aller-retour en texte pour Firestore, taille raisonnable', () => {
    const g = new GrilleExploration(80, 50); // la plus grande scène actuelle (palais de justice)
    g.marquerVisions(visionsDesPJ(sceneCalcul({ ...geoVide, colonnes: 80, lignes: 50 }), [pj('a', 40, 25)]));
    const texte = g.versTexte();
    expect(texte.length).toBeLessThan(3000);
    expect(GrilleExploration.depuisTexte(80, 50, texte).bits).toEqual(g.bits);
    expect(() => GrilleExploration.depuisTexte(40, 25, texte)).toThrow('attendus');
  });

  it("changement vers une scène d'une autre taille : la fusion ne lève jamais (bug 2.0 du 16/10, 8f2e7ff)", () => {
    // Taverne 35 × 20 → Ambush 40 × 25 : un instant, l'exploration locale a encore l'ancienne taille.
    const localeTaverne = new GrilleExploration(35, 20);
    localeTaverne.marquerVisions(visionsDesPJ(vide, [pj('a', 2, 2)]));
    const ambush = explorationAffichee(40, 25, undefined, localeTaverne);
    expect([ambush.largeur, ambush.hauteur]).toEqual([40 * SOUS_CASES, 25 * SOUS_CASES]);
    expect(ambush.estExploree(2 * SOUS_CASES, 2 * SOUS_CASES)).toBe(false); // rien de la taverne
    // Et l'inverse, avec une exploration enregistrée de la mauvaise taille.
    const texteAmbush = GrilleExploration.pleine(40, 25).versTexte();
    const taverne = explorationAffichee(35, 20, texteAmbush, new GrilleExploration(40, 25));
    expect([taverne.largeur, taverne.hauteur]).toEqual([35 * SOUS_CASES, 20 * SOUS_CASES]);
  });

  it('même taille : enregistré et local se fusionnent', () => {
    const locale = new GrilleExploration(20, 20);
    locale.marquerVisions(visionsDesPJ(vide, [pj('a', 2, 2)]));
    const texte = GrilleExploration.pleine(1, 1).versTexte(); // mauvaise taille : ignoré
    expect(explorationAffichee(20, 20, texte, locale).estExploree(2 * SOUS_CASES, 2 * SOUS_CASES)).toBe(true);
    expect(explorationAffichee(20, 20, undefined, null).estExploree(0, 0)).toBe(false);
  });

  it('« tout révéler » du MJ', () => {
    const g = GrilleExploration.pleine(3, 2);
    for (let sy = 0; sy < 2 * SOUS_CASES; sy++) for (let sx = 0; sx < 3 * SOUS_CASES; sx++) expect(g.estExploree(sx, sy)).toBe(true);
  });
});
