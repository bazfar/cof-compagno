import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dimensionsPortrait } from '../../src/lib/fiche/portrait';
import { vueFiche } from '../../src/lib/fiche/vue-fiche';
import { statistiquesFiche } from '../../src/lib/regles/calculs';
import { raceParId } from '../../src/lib/regles/donnees';
import { ficheCalculDepuisFiche, ficheDepuisV1 } from '../../src/lib/regles/fiche-document';
import { brouillonDepuisV1, portraitV1, type FicheV1 } from '../../src/lib/regles/import-v1';
import { LIMITE_PORTRAIT } from '../../src/lib/schemas/portrait';

/*
 * Fiche vivante (lot L2.3) : ce que l'écran affiche, éprouvé sur les 9
 * fiches réelles. Une seule CA, la calculée (v1 : trois valeurs selon
 * l'endroit), et chaque capacité retrouvée dans les données.
 */

const FICHES: FicheV1[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const fiche = (nom: string) => ficheDepuisV1(FICHES.find((f) => f.nom.startsWith(nom))!, 'u', 1).fiche;

describe.each(FICHES.map((f) => [f.nom, f] as const))('fiche vivante de « %s »', (_nom, v1) => {
  const f = ficheDepuisV1(v1, 'u', 1).fiche;
  const vue = vueFiche(f);

  it('statistiques : exactement celles des calculs (une seule CA)', () => {
    expect(vue.stats).toEqual(statistiquesFiche(ficheCalculDepuisFiche(f)));
    expect(vue.pv).toEqual({ actuel: f.pvActuel ?? f.pvMax, max: f.pvMax });
  });

  it('chaque capacité, rang racial et don est retrouvé dans les données', () => {
    const rangs = vue.voies.flatMap((v) => v.rangs);
    expect(rangs).toHaveLength(f.capacites.length);
    for (const r of rangs) {
      expect(r.nom).not.toMatch(/\.\d$/);
      expect(r.effet.length).toBeGreaterThan(0);
    }
    expect(vue.race?.rangs).toHaveLength(f.capacitesRace.length);
    expect(vue.dons.map((d) => d.nom)).not.toContain(undefined);
  });

  it('caractéristiques et 18 compétences, avec les modificateurs effectifs', () => {
    expect(vue.caracs.map((c) => c.valeur)).toEqual(vue.caracs.map((c) => f.caracs[c.code]));
    expect(vue.caracs.map((c) => c.mod)).toEqual(vue.caracs.map((c) => vue.stats.mods[c.code]));
    expect(vue.competences).toHaveLength(18);
  });
});

describe('cas particuliers de la table', () => {
  it('Karlach : Spécimen d’élite avec son choix, mutation nommée, pas de PP', () => {
    const vue = vueFiche(fiche('Karlach'));
    expect(vue.voies.find((v) => v.id === 'guerrier.elite')?.rangs[0]).toMatchObject({ rang: 1, choix: 'FOR' });
    expect(vue.mutations).toEqual([{ palier: 1, nom: 'Veines sombres', effet: '+1 FOR, -1 CHA' }]);
    expect(vue.pp).toBeNull();
  });

  it('Hermione : rangs raciaux nommés d’après la voie de sa race', () => {
    const vue = vueFiche(fiche('Hermione'));
    expect(vue.race?.rangs[0]?.nom).toBe(raceParId.get('nain')!.voie.rangs[0]!.nom);
  });

  it('Kylhian : ses PP, son don, et ses voies dans l’ordre de la classe', () => {
    const vue = vueFiche(fiche('Kylhian'));
    expect(vue.pp?.max).toBe(vue.stats.ppMax);
    expect(vue.dons.map((d) => d.nom)).toEqual(['Alerte']);
    expect(vue.voies.map((v) => v.id)).toEqual(['magicien.magie-universitaire', 'magicien.magie-elementaire']);
  });

  it('un rang offert (Polyvalence) est signalé comme tel', () => {
    const f = fiche('Karlach');
    const vue = vueFiche({ ...f, capacites: f.capacites.map((c, i) => (i === 0 ? { ...c, offert: true as const } : c)) });
    expect(vue.voies.flatMap((v) => v.rangs).filter((r) => r.offert)).toHaveLength(1);
  });
});

describe('notes et portrait repris de la v1 (L2.3)', () => {
  it('les notes v1 passent dans la fiche, plus dans « modules »', () => {
    const { fiche: f } = ficheDepuisV1({ ...FICHES[0], notes: 'Doit 3 po au tavernier.' }, 'u', 1);
    expect(f.notes).toBe('Doit 3 po au tavernier.');
    expect(f.modules).not.toHaveProperty('notes');
    expect(brouillonDepuisV1({ ...FICHES[0], notes: 'Note' }, 'i').reprise?.report.notes).toBe('Note');
  });

  it('portrait v1 repris s’il est une image dans la limite ; sinon aucun', () => {
    const image = `data:image/jpeg;base64,${'A'.repeat(1000)}`;
    expect(portraitV1({ portrait: image })).toBe(image);
    expect(portraitV1({ portrait: 'assets/portraits/mage.png' })).toBeNull();
    expect(portraitV1({ portrait: `data:image/jpeg;base64,${'A'.repeat(LIMITE_PORTRAIT)}` })).toBeNull();
    expect(brouillonDepuisV1({ ...FICHES[0], portrait: image }, 'i').reprise?.report.portrait).toBe(image);
  });

  it('dimensions du portrait : 256 px au plus, proportions gardées, jamais agrandi', () => {
    expect(dimensionsPortrait(1024, 512)).toEqual({ largeur: 256, hauteur: 128 });
    expect(dimensionsPortrait(300, 900)).toEqual({ largeur: 85, hauteur: 256 });
    expect(dimensionsPortrait(100, 80)).toEqual({ largeur: 100, hauteur: 80 });
    expect(() => dimensionsPortrait(0, 10)).toThrow();
  });
});
