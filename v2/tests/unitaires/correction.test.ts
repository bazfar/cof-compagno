import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  avecRang,
  avertissements,
  champsCorriges,
  correctionDepuis,
  rangDeVoie,
  rangsRace,
  refusCorrection,
  voiesCorrigeables,
} from '../../src/lib/fiche/correction';
import { ficheDepuisV1 } from '../../src/lib/regles/fiche-document';
import type { FicheV1 } from '../../src/lib/regles/import-v1';

/*
 * Correction d'une fiche par le MJ (lot L3.6) : seuls les champs changés
 * depuis l'ouverture sont écrits ; les rangs se règlent voie par voie.
 */

const FICHES: FicheV1[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string) => ficheDepuisV1(FICHES.find((f) => f.nom.startsWith(nom))!, 'u', 1).fiche;

describe('champs corrigés', () => {
  it('rien de changé : rien à écrire ; seuls les champs touchés partent', () => {
    const k = reelle('Karlach');
    const base = correctionDepuis(k);
    expect(champsCorriges(base, correctionDepuis(k))).toEqual({});
    const c = correctionDepuis(k);
    c.pvMax += 3;
    c.caracs = { ...c.caracs, FOR: (c.caracs.FOR ?? 10) + 1 };
    expect(Object.keys(champsCorriges(base, c)).sort()).toEqual(['caracs', 'pvMax']);
  });

  it('refus en phrase : nom vide, caractéristique hors bornes, niveau hors bornes', () => {
    const k = reelle('Karlach');
    expect(refusCorrection(k, { nom: '  ' })).toBe('Le nom est obligatoire.');
    expect(refusCorrection(k, { caracs: { ...k.caracs, FOR: 40 } })).toBe('FOR doit être un entier entre 1 et 30.');
    expect(refusCorrection(k, { niveau: 25 })).toMatch(/^Correction refusée \(niveau\)/);
    expect(refusCorrection({ ...k, id: 'p1' } as typeof k, { pvMax: 30 })).toBeNull();
  });
});

describe('voies et rangs', () => {
  it('les voies de la classe sont réglables, avec le rang atteint', () => {
    const k = reelle('Karlach');
    const voies = voiesCorrigeables(k, k);
    expect(voies.length).toBeGreaterThanOrEqual(5);
    const prise = voies.find((v) => rangDeVoie(k.capacites, v.id) > 0)!;
    expect(prise.max).toBeGreaterThanOrEqual(rangDeVoie(k.capacites, prise.id));
  });

  it('monter ajoute les rangs manquants ; descendre retire au-delà ; les choix des rangs gardés restent', () => {
    const caps = [{ id: 'guerrier.soldat.1', choix: 'x' }, { id: 'guerrier.soldat.2' }, { id: 'guerrier.ingenieur.1' }];
    const plus = avecRang(caps, 'guerrier.soldat', 4);
    expect(plus.filter((c) => c.id.startsWith('guerrier.soldat')).map((c) => c.id)).toEqual(['guerrier.soldat.1', 'guerrier.soldat.2', 'guerrier.soldat.3', 'guerrier.soldat.4']);
    expect(plus.find((c) => c.id === 'guerrier.soldat.1')).toEqual({ id: 'guerrier.soldat.1', choix: 'x' });
    const moins = avecRang(plus, 'guerrier.soldat', 1);
    expect(moins.map((c) => c.id)).toEqual(['guerrier.ingenieur.1', 'guerrier.soldat.1']);
    expect(avecRang(moins, 'guerrier.soldat', 0).map((c) => c.id)).toEqual(['guerrier.ingenieur.1']);
  });

  it('voie raciale : les rangs de la race ; avertissements utiles', () => {
    const k = reelle('Karlach');
    expect(rangsRace(k.race).length).toBeGreaterThan(0);
    expect(rangsRace(null)).toEqual([]);
    const c = correctionDepuis(k);
    expect(avertissements(k, c)).toEqual([]);
    c.pvActuel = c.pvMax + 5;
    c.dons = [...c.dons, 'don_inconnu'];
    c.capacites = avecRang(c.capacites, 'magicien.elementaire', 1);
    const a = avertissements(k, c);
    expect(a).toContain('Les PV actuels dépassent les PV max.');
    expect(a).toContain('Des dons inconnus sont dans la fiche.');
    expect(a.some((x) => x.startsWith('Rangs dans des voies hors de la classe'))).toBe(true);
  });
});
