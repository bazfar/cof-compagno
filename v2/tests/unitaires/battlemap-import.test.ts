import { describe, expect, it } from 'vitest';
import { sceneCalcul } from '../../src/lib/battlemap/geometrie';
import {
  CASES_MAX,
  essaiSuivant,
  estSceneImportee,
  geometrieImportee,
  grilleDepuisImage,
  idSceneImportee,
  premierEssai,
  type EssaiCompression,
} from '../../src/lib/battlemap/import-image';
import { schemaGeometrieScene } from '../../src/lib/schemas/scene';

/*
 * Import d'une scène depuis une image (lot L5.5) : grille, identifiant,
 * paliers de compression. La compression elle-même (canvas) se vérifie à
 * l'écran.
 */

describe('grille déduite de l\'image (v1 : chargerImage)', () => {
  it('arrondi à la case la plus proche', () => {
    expect(grilleDepuisImage(2800, 1750, 70)).toEqual({ colonnes: 40, lignes: 25 });
    expect(grilleDepuisImage(2830, 1700, 70)).toEqual({ colonnes: 40, lignes: 24 });
  });
  it('au moins une case', () => {
    expect(grilleDepuisImage(30, 20, 70)).toEqual({ colonnes: 1, lignes: 1 });
  });
  it(`refus au-delà de ${CASES_MAX} cases de côté, ou avec une taille de case nulle`, () => {
    expect(grilleDepuisImage(8000, 1000, 10)).toBeNull();
    expect(grilleDepuisImage(2800, 1750, 0)).toBeNull();
    expect(grilleDepuisImage(2800, 1750, Number.NaN)).toBeNull();
  });
});

describe('scène importée', () => {
  it('identifiant « imp- » + nom simplifié + suffixe unique', () => {
    const id = idSceneImportee('Crypte de Khoreth — étage 2', 1_700_000_000_000);
    expect(id).toBe('imp-crypte-de-khoreth-etage-2-loyw3v28');
    expect(estSceneImportee(id)).toBe(true);
    expect(estSceneImportee('kratz')).toBe(false);
    expect(idSceneImportee('???', 1)).toBe('imp-scene-1');
  });

  it('géométrie vide, valide, utilisable par les calculs', () => {
    const geo = geometrieImportee('imp-x-1', 'X', { colonnes: 40, lignes: 25 }, 70);
    expect(schemaGeometrieScene.parse(geo)).toEqual(geo);
    const scene = sceneCalcul(geo);
    expect(scene.murs).toEqual([]);
    expect(scene.portes).toEqual([]);
  });
});

describe('paliers de compression (v1 : _comprimerImagePourSync)', () => {
  it('qualité d\'abord, puis résolution, jusqu\'à abandonner', () => {
    const suite: EssaiCompression[] = [];
    for (let e: EssaiCompression | null = premierEssai(256); e; e = essaiSuivant(e)) suite.push(e);
    expect(suite[0]).toEqual({ pxParCase: 128, qualite: 0.8 }); // jamais plus de 128 px par case
    expect(suite.slice(1, 3)).toEqual([{ pxParCase: 128, qualite: 0.65 }, { pxParCase: 128, qualite: 0.5 }]);
    expect(suite.slice(3).map((e) => e.pxParCase)).toEqual([102, 81, 64, 51, 40, 32, 25, 20, 16]);
    expect(suite.length).toBe(12); // l'abandon arrive toujours
  });

  it("une petite image n'est jamais agrandie au-delà de sa résolution", () => {
    expect(premierEssai(70)).toEqual({ pxParCase: 70, qualite: 0.8 });
  });
});
