import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sceneCalcul, type JetonCarte } from '../../src/lib/battlemap/geometrie';
import { initiales, jetonsADessiner, jetonSousPointeur, pasDeGlisser, peutDeplacer, porteSousPointeur } from '../../src/lib/battlemap/interactions';
import { catalogueScenes, chargerGeometrie } from '../../src/lib/battlemap/scenes';
import { deplacer, ECHELLE_MAX, ecranVersCase, ecranVersScene, sceneVersEcran, vueAjustee, zoomer } from '../../src/lib/battlemap/vue';

/*
 * Battlemap à l'écran (lot L5.2) : cadrage, gestes, images des scènes.
 * Le dessin lui-même (rendu.ts) n'a pas de canvas ici ; tout ce qui décide
 * de ce qu'il montre est testé à travers ces fonctions.
 */

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');
const geoTavern = await chargerGeometrie('test_tavern');
const tavern = sceneCalcul(geoTavern);
const dims = { colonnes: 40, lignes: 25 };

describe('images des scènes', () => {
  it.each(catalogueScenes.map((s) => [s.id, s] as const))('%s : image WebP présente et allégée', (_id, s) => {
    const chemin = join(PUBLIC, s.image);
    expect(existsSync(chemin)).toBe(true);
    // Les .dd2vtt font 18 à 37 Mo ; l'image servie doit rester sous 3 Mo.
    expect(statSync(chemin).size).toBeLessThan(3 * 1024 * 1024);
    expect(s.pxParCase).toBeLessThanOrEqual(128);
  });
});

describe('cadrage', () => {
  it('vue ajustée : toute la scène tient, centrée', () => {
    const v = vueAjustee(dims, 1000, 500); // limitée par la hauteur : 20 px par case
    expect(v.echelle).toBe(20);
    expect(v.decalX).toBe((1000 - 40 * 20) / 2);
    expect(v.decalY).toBe(0);
  });

  it("le zoom garde immobile le point sous la souris", () => {
    const v = vueAjustee(dims, 1000, 500);
    const avant = ecranVersScene(v, 300, 200);
    const z = zoomer(v, 2, 300, 200, dims, 1000, 500);
    expect(z.echelle).toBe(40);
    const apres = ecranVersScene(z, 300, 200);
    expect(apres[0]).toBeCloseTo(avant[0], 10);
    expect(apres[1]).toBeCloseTo(avant[1], 10);
  });

  it('le zoom est borné des deux côtés', () => {
    const v = vueAjustee(dims, 1000, 500);
    expect(zoomer(v, 1000, 0, 0, dims, 1000, 500).echelle).toBe(ECHELLE_MAX);
    expect(zoomer(v, 0.001, 0, 0, dims, 1000, 500).echelle).toBe(10); // moitié de l'ajusté
  });

  it('on ne peut pas faire sortir la carte de l\'écran', () => {
    const v = vueAjustee(dims, 1000, 500);
    const loin = deplacer(v, 1e6, 1e6, dims, 1000, 500);
    expect(loin.decalX).toBeLessThanOrEqual(1000 - 250);
    expect(loin.decalY).toBeLessThanOrEqual(500 - 125);
  });

  it('écran ↔ case', () => {
    const v = { echelle: 50, decalX: 10, decalY: 20 };
    expect(ecranVersCase(v, 10 + 50 * 3 + 1, 20 + 50 * 7 + 49, dims)).toEqual({ cx: 3, cy: 7 });
    expect(ecranVersCase(v, 5, 5, dims)).toBeNull();
    expect(sceneVersEcran(v, 3, 7)).toEqual([160, 370]);
  });
});

describe('gestes', () => {
  const pj = (id: string, cx: number, cy: number): JetonCarte => ({ id, genre: 'pj', cx, cy });

  it('porte sous le pointeur : à moins de 0,35 case, ou 8 px à petite échelle', () => {
    // p0 de la taverne : de (27,6) à (28,6).
    expect(porteSousPointeur(tavern, [27.5, 6.3], 100)?.id).toBe('p0');
    expect(porteSousPointeur(tavern, [27.5, 6.4], 100)).toBeNull();
    expect(porteSousPointeur(tavern, [27.5, 6.4], 10)?.id).toBe('p0'); // 8 px = 0,8 case à 10 px/case
  });

  it('pour un joueur, un monstre non vu n\'est pas dessiné ; les morts passent dessous', () => {
    const jetons: JetonCarte[] = [
      { id: 'vivant', genre: 'monstre', cx: 1, cy: 1 },
      { id: 'mort', genre: 'monstre', cx: 1, cy: 1, mort: true },
      { id: 'cache', genre: 'monstre', cx: 9, cy: 9 },
      pj('a', 0, 0),
    ];
    const vus = new Set(['vivant', 'mort', 'a']);
    expect(jetonsADessiner(jetons, 'joueur', vus).map((j) => j.id)).toEqual(['mort', 'vivant', 'a']);
    expect(jetonsADessiner(jetons, 'mj', vus).map((j) => j.id)).toEqual(['mort', 'vivant', 'cache', 'a']);
  });

  it('sur une case partagée, on attrape le vivant, pas le corps', () => {
    const dessines = jetonsADessiner([{ id: 'mort', genre: 'monstre', cx: 1, cy: 1, mort: true }, pj('a', 1, 1)], 'mj', new Set());
    expect(jetonSousPointeur(dessines, [1.5, 1.5])?.id).toBe('a');
    expect(jetonSousPointeur(dessines, [1.95, 1.95])).toBeNull(); // hors du disque
  });

  it('un joueur ne bouge que ses jetons ; le MJ bouge tout', () => {
    const j = pj('a', 0, 0);
    expect(peutDeplacer('joueur', j, new Set(['b']))).toBe(false);
    expect(peutDeplacer('joueur', j, new Set(['a']))).toBe(true);
    expect(peutDeplacer('mj', j, new Set())).toBe(true);
  });

  it('un PJ glissé contre une porte fermée reste devant ; un monstre passe', () => {
    const devant = { cx: 27, cy: 5 }, derriere = { cx: 27, cy: 6 };
    expect(pasDeGlisser(tavern, [], pj('a', 27, 5), devant, derriere)).toEqual({ case: devant, arret: 'porte' });
    expect(pasDeGlisser(tavern, [], { id: 'm', genre: 'monstre', cx: 27, cy: 5 }, devant, derriere)).toEqual({ case: derriere, arret: null });
    const ouverte = sceneCalcul(geoTavern, { portesOuvertes: { p0: true } });
    expect(pasDeGlisser(ouverte, [], pj('a', 27, 5), devant, derriere)).toEqual({ case: derriere, arret: null });
  });

  it('un PJ glissé contre un mur plein : arrêt « mur »', () => {
    // Mur ouest de la taverne, en x = 5, de y = 1 à y = 10.
    expect(pasDeGlisser(tavern, [], pj('a', 4, 5), { cx: 4, cy: 5 }, { cx: 5, cy: 5 }).arret).toBe('mur');
  });

  it("un PJ ne s'arrête pas sur une créature vivante, mais la traverse (décision du 15/10)", () => {
    const vide = sceneCalcul({ id: 'vide', nom: 'Vide', colonnes: 10, lignes: 10, pxParCaseSource: 100, murs: [], obstacles: [], portes: [] });
    const a = pj('a', 1, 1);
    const gobelin: JetonCarte = { id: 'g', genre: 'monstre', cx: 2, cy: 1 };
    const jetons = [a, gobelin];
    // Le pointeur arrive sur le gobelin : le PJ reste sur sa case.
    expect(pasDeGlisser(vide, jetons, a, { cx: 1, cy: 1 }, { cx: 2, cy: 1 })).toEqual({ case: { cx: 1, cy: 1 }, arret: 'occupant' });
    // Le pointeur passe au-delà : le PJ saute par-dessus.
    expect(pasDeGlisser(vide, jetons, a, { cx: 1, cy: 1 }, { cx: 3, cy: 1 })).toEqual({ case: { cx: 3, cy: 1 }, arret: null });
    // Un corps ne gêne pas ; un allié PJ, si.
    expect(pasDeGlisser(vide, [a, { ...gobelin, mort: true }], a, { cx: 1, cy: 1 }, { cx: 2, cy: 1 }).arret).toBeNull();
    expect(pasDeGlisser(vide, [a, pj('b', 2, 1)], a, { cx: 1, cy: 1 }, { cx: 2, cy: 1 }).arret).toBe('occupant');
    // Le MJ pose un monstre où il veut, même sur un autre.
    expect(pasDeGlisser(vide, jetons, { id: 'm2', genre: 'monstre', cx: 5, cy: 5 }, { cx: 5, cy: 5 }, { cx: 2, cy: 1 }).arret).toBeNull();
  });

  it('initiales', () => {
    expect(initiales('Magnus Bane')).toBe('MB');
    expect(initiales('  kargash ')).toBe('K');
    expect(initiales('')).toBe('?');
  });
});
