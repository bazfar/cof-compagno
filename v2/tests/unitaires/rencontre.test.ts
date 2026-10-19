import { describe, expect, it } from 'vitest';
import { equilibrage } from '../../src/lib/regles/donnees-bestiaire';
import {
  ajouterMonstres,
  budgetRencontre,
  coutRencontre,
  groupe,
  idJetonRencontre,
  manquePourLancer,
  placerLesNonPlaces,
  verdict,
} from '../../src/lib/rencontres/rencontre';
import { schemaRencontre, type BrouillonRencontre } from '../../src/lib/schemas/rencontre';

/*
 * Prépa combat (lot L3.5) : jauge d'équilibrage reprise de la v1
 * (data/equilibrage.js), monstres ajoutés et placés d'avance.
 */

const vide: BrouillonRencontre = { nom: 'Embuscade', scene: null, monstres: [], butin: [] };

describe('jauge d’équilibrage (v1 coutRencontre et budgetRencontre)', () => {
  it('Pm par dangerosité, pondérés par le rôle', () => {
    expect(coutRencontre([{ dangerosite: 2, role: 'soldat' }, { dangerosite: 2, role: 'brute' }], equilibrage)).toBe(40);
    expect(coutRencontre([{ dangerosite: 3, role: 'artilleur' }], equilibrage)).toBe(Math.round(40 * equilibrage.roles.artilleur!.coeffPm));
    expect(coutRencontre([], equilibrage)).toBe(0);
  });

  it('un boss (la plus haute dangerosité mêlée à des plus faibles) multiplie tout par le coefficient de boss', () => {
    const brut = 80 + 10 + 10;
    expect(coutRencontre([{ dangerosite: 4, role: 'soldat' }, { dangerosite: 1, role: 'soldat' }, { dangerosite: 1, role: 'soldat' }], equilibrage)).toBe(Math.round(brut * equilibrage.coeffBoss));
  });

  it('rôle inconnu : compté comme soldat', () => {
    expect(coutRencontre([{ dangerosite: 1, role: 'inconnu' }], equilibrage)).toBe(10);
  });

  it('budget : 5 Pm par PJ et par niveau ; verdict autour de ce budget (rencontre sérieuse)', () => {
    expect(budgetRencontre(4, 3)).toBe(60);
    expect(verdict(0, 60)).toBe('vide');
    expect(verdict(20, 60)).toBe('facile');
    expect(verdict(40, 60)).toBe('moderee');
    expect(verdict(60, 60)).toBe('serieuse');
    expect(verdict(80, 60)).toBe('dure');
    expect(verdict(120, 60)).toBe('mortelle');
  });

  it('groupe : nombre de PJ et niveau moyen à une décimale', () => {
    expect(groupe([3, 3, 4])).toEqual({ nbPJ: 3, niveauMoyen: 3.3 });
    expect(groupe([])).toEqual({ nbPJ: 0, niveauMoyen: 0 });
  });
});

describe('monstres de la rencontre', () => {
  it('ajouter : clés uniques, noms distincts, non placés', () => {
    let b = ajouterMonstres(vide, 'gobelin_eclaireur', 'Gobelin éclaireur', 2);
    b = ajouterMonstres(b, 'gobelin_eclaireur', 'Gobelin éclaireur', 1);
    expect(b.monstres.map((m) => m.cle)).toEqual(['gobelin_eclaireur-1', 'gobelin_eclaireur-2', 'gobelin_eclaireur-3']);
    expect(b.monstres.map((m) => m.nom)).toEqual(['Gobelin éclaireur', 'Gobelin éclaireur 2', 'Gobelin éclaireur 3']);
    expect(b.monstres.every((m) => m.cx === null)).toBe(true);
  });

  it('jamais plus de 60 monstres', () => {
    expect(ajouterMonstres(vide, 'rat', 'Rat', 100).monstres).toHaveLength(60);
  });

  it('placer : les non placés autour du centre, sur des cases libres ; les placés ne bougent pas', () => {
    const b = ajouterMonstres(vide, 'rat', 'Rat', 3);
    const deja = { ...b.monstres[0]!, cx: 5, cy: 5 };
    const places = placerLesNonPlaces([deja, ...b.monstres.slice(1)], { colonnes: 10, lignes: 10 });
    expect(places[0]).toBe(deja);
    const cases = places.map((m) => `${m.cx},${m.cy}`);
    expect(new Set(cases).size).toBe(3);
    expect(places.every((m) => m.cx !== null && Math.abs((m.cx ?? 0) - 5) <= 1 && Math.abs((m.cy ?? 0) - 5) <= 1)).toBe(true);
  });

  it('placer : une case hors de la scène (scène plus petite) est ramenée dedans', () => {
    const b = ajouterMonstres(vide, 'rat', 'Rat', 1);
    const [m] = placerLesNonPlaces([{ ...b.monstres[0]!, cx: 40, cy: 2 }], { colonnes: 10, lignes: 10 });
    expect(m).toMatchObject({ cx: 9, cy: 2 });
  });

  it('lancer : une scène, au moins un monstre, tous placés', () => {
    expect(manquePourLancer(vide)).toBe('Choisis une scène.');
    const avecScene = { ...vide, scene: 'clos' };
    expect(manquePourLancer(avecScene)).toBe('Ajoute au moins un monstre.');
    const b = ajouterMonstres(avecScene, 'rat', 'Rat', 1);
    expect(manquePourLancer(b)).toMatch(/pas encore placés/);
    expect(manquePourLancer({ ...b, monstres: placerLesNonPlaces(b.monstres, { colonnes: 5, lignes: 5 }) })).toBeNull();
    expect(idJetonRencontre('r1', 'rat-1')).toBe('m-r1-rat-1');
  });

  it('schéma : nom de jeton trop long ou clé invalide refusés', () => {
    const base = { ...vide, statut: 'preparee', creeLe: 1, majLe: 1, lanceeLe: null, butinEnvoyeLe: null };
    expect(schemaRencontre.safeParse(base).success).toBe(true);
    const m = { cle: 'rat-1', monstre: 'rat', nom: 'Rat', cx: null, cy: null };
    expect(schemaRencontre.safeParse({ ...base, monstres: [{ ...m, nom: 'x'.repeat(41) }] }).success).toBe(false);
    expect(schemaRencontre.safeParse({ ...base, monstres: [{ ...m, cle: 'Rat 1' }] }).success).toBe(false);
    expect(schemaRencontre.safeParse({ ...base, id: 'r1' }).success).toBe(false);
  });
});
