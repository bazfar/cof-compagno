import { describe, expect, it } from 'vitest';
import { deplacementBloque } from '../../src/lib/battlemap/deplacement';
import { aimanter, bornerPoint, dessinProche, estUnTrace, etatDepuisDessins, type DessinCarte } from '../../src/lib/battlemap/dessins';
import { sceneCalcul, type JetonCarte } from '../../src/lib/battlemap/geometrie';
import { jetonsVisiblesDesPJ, visionsDesPJ } from '../../src/lib/battlemap/visibilite';

/*
 * Dessins du MJ (lot L5.4) : ce qu'un mur, un obstacle ou une porte tracés
 * à la main changent au déplacement et à la vue, et les gestes de tracé.
 */

// Carte vide de 20 × 20 (comme une scène importée en simple image, L5.5).
const vide = { id: 'vide', nom: 'Vide', colonnes: 20, lignes: 20, pxParCaseSource: 100, murs: [], obstacles: [], portes: [] };
const pj: JetonCarte = { id: 'a', genre: 'pj', cx: 3, cy: 5 };
const gobelin: JetonCarte = { id: 'g', genre: 'monstre', cx: 8, cy: 5 };
const dessin = (id: string, type: DessinCarte['type'], extra: Partial<DessinCarte> = {}): DessinCarte => ({ id, type, a: [6, 0], b: [6, 20], ...extra });

const scene = (dessins: DessinCarte[], portesOuvertes: Record<string, boolean> = {}) => sceneCalcul(vide, etatDepuisDessins(dessins, portesOuvertes));
const bloque = (s: ReturnType<typeof scene>) => deplacementBloque(s, { cx: 5, cy: 5 }, { cx: 6, cy: 5 });
const voitLeGobelin = (s: ReturnType<typeof scene>) => jetonsVisiblesDesPJ(visionsDesPJ(s, [pj, gobelin]), [pj, gobelin]).has('g');

describe('effet des dessins', () => {
  it('sans dessin : on passe et on voit', () => {
    expect(bloque(scene([]))).toBe(false);
    expect(voitLeGobelin(scene([]))).toBe(true);
  });

  it('mur : bloque le passage et la vue', () => {
    const s = scene([dessin('m', 'mur')]);
    expect(bloque(s)).toBe(true);
    expect(voitLeGobelin(s)).toBe(false);
  });

  it('mur de force : un mur comme les autres, tant qu\'il est là', () => {
    const s = scene([dessin('f', 'mur', { tours: 3 })]);
    expect(bloque(s)).toBe(true);
    expect(voitLeGobelin(s)).toBe(false);
  });

  it('obstacle : bloque la vue, pas le passage', () => {
    const s = scene([dessin('o', 'obstacle')]);
    expect(bloque(s)).toBe(false);
    expect(voitLeGobelin(s)).toBe(false);
  });

  it('porte dessinée dans un mur : fermée elle bloque, ouverte on passe et on voit', () => {
    const mur = [dessin('m1', 'mur', { a: [6, 0], b: [6, 5] }), dessin('m2', 'mur', { a: [6, 6], b: [6, 20] })];
    const porte = dessin('p', 'porte', { a: [6, 5], b: [6, 6], ouverte: false });
    expect(bloque(scene([...mur, porte]))).toBe(true);
    expect(voitLeGobelin(scene([...mur, porte]))).toBe(false);
    const ouverte = scene([...mur, porte], { p: true });
    expect(bloque(ouverte)).toBe(false);
    expect(voitLeGobelin(ouverte)).toBe(true);
  });
});

describe('gestes de tracé', () => {
  it('aimanter aux demi-cases', () => {
    expect(aimanter([3.2, 4.74])).toEqual([3, 4.5]);
    expect(aimanter([3.26, 0.1])).toEqual([3.5, 0]);
  });

  it('un tracé hors de la carte est ramené au bord', () => {
    expect(bornerPoint([-2, 25], 20, 20)).toEqual([0, 20]);
  });

  it('en deçà de 0,15 case, c\'est un clic (gomme), pas un tracé', () => {
    expect(estUnTrace([1, 1], [1.1, 1])).toBe(false);
    expect(estUnTrace([1, 1], [1.2, 1])).toBe(true);
  });

  it('la gomme prend le plus proche du même outil, à moins d\'une demi-case', () => {
    const dessins = [
      dessin('m', 'mur', { a: [0, 0], b: [10, 0] }),
      dessin('o', 'obstacle', { a: [0, 0.2], b: [10, 0.2] }),
      dessin('f', 'mur', { a: [0, 0.3], b: [10, 0.3], tours: 2 }),
    ];
    expect(dessinProche(dessins, 'mur', [5, 0.1])?.id).toBe('m');
    expect(dessinProche(dessins, 'obstacle', [5, 0.1])?.id).toBe('o');
    expect(dessinProche(dessins, 'mur', [5, 0.1], true)?.id).toBe('f'); // le mur de force a sa propre gomme
    expect(dessinProche(dessins, 'porte', [5, 0.1])).toBeNull();
    expect(dessinProche(dessins, 'mur', [5, 0.6])).toBeNull();
  });
});
