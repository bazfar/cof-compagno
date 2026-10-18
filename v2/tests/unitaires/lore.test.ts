import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { aEcrire, lecteursEffectifs, revele, trierParCategorie, versionJoueurs } from '../../src/lib/lore/fiche';
import { convertirLoreV1, fuitesDeCanon, NOMS_JAMAIS_REVELES, paragraphes, slug, type LoreV1 } from '../../src/lib/lore/import-v1';
import { schemaExportLore, schemaFicheLoreJoueurs, type FicheLoreMj } from '../../src/lib/schemas/lore';

/*
 * Lore partagé (lot L2.7a) : ce que voient les joueurs d'une fiche, la
 * datation des révélations, et la conversion du lore réel de la v1.
 */

const fiche = (extra: Partial<FicheLoreMj> = {}): FicheLoreMj => ({
  titre: "L'Atelier des Marges",
  categorie: 'Lieux',
  ordre: 10,
  etiquettes: [],
  visibilite: 'tous',
  lecteurs: [],
  passages: [
    { id: 'p-1', texte: 'Un atelier d’étudiants.', scelle: false },
    { id: 'p-2', intertitre: 'Secret', texte: 'La jauge de Remous.', scelle: true },
  ],
  majLe: 1,
  reveleLe: 1,
  ...extra,
});

describe('version joueurs d’une fiche', () => {
  it('partagée à tous : lecteurs « * », sans passage scellé ni champ du MJ', () => {
    const j = versionJoueurs(fiche({ source: 'v1:x' }))!;
    expect(j.lecteurs).toEqual(['*']);
    expect(j.passages).toEqual([{ id: 'p-1', texte: 'Un atelier d’étudiants.' }]);
    expect(JSON.stringify(j)).not.toContain('Remous');
    expect(j).not.toHaveProperty('visibilite');
    expect(j).not.toHaveProperty('source');
    expect(schemaFicheLoreJoueurs.parse(j)).toEqual(j);
  });

  it('partagée à certains : leurs uid, sans doublon ; à personne : pas de version joueurs', () => {
    expect(versionJoueurs(fiche({ visibilite: 'certains', lecteurs: ['carol', 'alice', 'alice'] }))!.lecteurs).toEqual(['alice', 'carol']);
    expect(versionJoueurs(fiche({ visibilite: 'certains', lecteurs: [] }))).toBeNull();
    expect(versionJoueurs(fiche({ visibilite: 'mj', lecteurs: ['alice'] }))).toBeNull();
    expect(lecteursEffectifs({ visibilite: 'mj', lecteurs: ['alice'] })).toEqual([]);
  });

  it('une fiche partagée dont tout est scellé ne montre que son titre', () => {
    const j = versionJoueurs(fiche({ passages: [{ id: 'p-1', texte: 'Caché.', scelle: true }] }))!;
    expect(j.titre).toBe("L'Atelier des Marges");
    expect(j.passages).toEqual([]);
  });
});

describe('révélations (marque « nouveau »)', () => {
  const cachee = fiche({ visibilite: 'mj' });
  it('comptent : rendre visible, ajouter un lecteur, passer à tous, desceller ou ajouter un passage', () => {
    expect(revele(null, fiche())).toBe(true);
    expect(revele(cachee, fiche())).toBe(true);
    const aAlice = fiche({ visibilite: 'certains', lecteurs: ['alice'] });
    expect(revele(aAlice, fiche({ visibilite: 'certains', lecteurs: ['alice', 'carol'] }))).toBe(true);
    expect(revele(aAlice, fiche())).toBe(true);
    const descellee = fiche({ passages: fiche().passages.map((p) => ({ ...p, scelle: false })) });
    expect(revele(fiche(), descellee)).toBe(true);
    expect(revele(fiche(), fiche({ passages: [...fiche().passages, { id: 'p-3', texte: 'Nouveau.', scelle: false }] }))).toBe(true);
  });

  it('ne comptent pas : corriger un texte, sceller, retirer un lecteur, cacher', () => {
    expect(revele(fiche(), fiche({ passages: [{ ...fiche().passages[0]!, texte: 'Corrigé.' }, fiche().passages[1]!] }))).toBe(false);
    expect(revele(fiche(), fiche({ passages: fiche().passages.map((p) => ({ ...p, scelle: true })) }))).toBe(false);
    expect(revele(fiche({ visibilite: 'certains', lecteurs: ['alice', 'carol'] }), fiche({ visibilite: 'certains', lecteurs: ['alice'] }))).toBe(false);
    expect(revele(fiche(), cachee)).toBe(false);
    expect(revele(null, cachee)).toBe(false);
  });

  it('aEcrire date la modification, et la révélation seulement quand il y en a une', () => {
    const avant = fiche({ reveleLe: 5 });
    expect(aEcrire(avant, fiche({ titre: 'Autre' }), 9)).toMatchObject({ majLe: 9, reveleLe: 5 });
    expect(aEcrire(fiche({ visibilite: 'mj', reveleLe: 5 }), fiche(), 9)).toMatchObject({ majLe: 9, reveleLe: 9 });
  });
});

describe('tri d’affichage', () => {
  it('catégories dans l’ordre de leur première fiche, puis rang, puis titre', () => {
    const g = trierParCategorie([
      { categorie: 'Personnages', ordre: 30, titre: 'Bob' },
      { categorie: 'Lieux', ordre: 20, titre: 'Zélie' },
      { categorie: 'Lieux', ordre: 20, titre: 'Anse' },
      { categorie: 'Lieux', ordre: 5, titre: 'Libris' },
    ]);
    expect(g.map((x) => [x.categorie, x.fiches.map((f) => f.titre)])).toEqual([
      ['Lieux', ['Libris', 'Anse', 'Zélie']],
      ['Personnages', ['Bob']],
    ]);
  });
});

// ---- Le lore réel de la v1 ----
const RACINE_V1 = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
function chargerLoreV1(): LoreV1 {
  const contexte: Record<string, unknown> = { console, Math, JSON, Object, Array, Number, String, Date };
  contexte.window = contexte;
  createContext(contexte);
  const source = readFileSync(join(RACINE_V1, 'data/donnees.js'), 'utf8').replace(/^const (\w+)\s*=/gm, 'var $1 =').replace(/^let (\w+)\s*=/gm, 'var $1 =');
  runInContext(source, contexte, { filename: 'data/donnees.js' });
  return contexte as unknown as LoreV1;
}

describe('conversion du lore v1 (data/donnees.js)', () => {
  const v1 = chargerLoreV1();
  const fiches = convertirLoreV1(v1, 1);
  const par = (id: string) => fiches.find((f) => f.id === id)!.fiche;

  it('rien n’est perdu : chaque section, période, faction, entité et PNJ devient une fiche', () => {
    const entites = v1.FACTIONS.reduce((n, g) => n + (g.entites ?? []).length, 0);
    expect(fiches).toHaveLength(v1.LORE.sections.length + v1.CHRONOLOGIE.length + v1.FACTIONS.length + entites + v1.PNJ_CLES.length);
    expect(new Set(fiches.map((f) => f.id)).size).toBe(fiches.length);
    // Chaque paragraphe v1 d'une section se retrouve dans un passage.
    for (const s of v1.LORE.sections) {
      const f = par(`section-${slug(s.titre)}`);
      expect(f.passages.map((p) => p.texte)).toEqual(paragraphes(s.contenu));
    }
    expect(() => schemaExportLore.parse({ format: 'cof-compagno/lore-v1', exporteLe: 1, fiches })).not.toThrow();
  });

  it('partage comme la v1 : sections MJ cachées, accroches scellées, secrets des PNJ et des entités scellés', () => {
    for (const s of v1.LORE.sections) expect(par(`section-${slug(s.titre)}`).visibilite).toBe(s.mjSeulement ? 'mj' : 'tous');
    for (const p of v1.PNJ_CLES) {
      const f = par(`pnj-${p.id}`);
      expect(f.visibilite).toBe('tous');
      expect(f.passages.filter((x) => x.id.startsWith('accroche-')).every((x) => x.scelle)).toBe(true);
      expect(f.passages.filter((x) => !x.id.startsWith('accroche-')).every((x) => x.scelle === !!p.secret)).toBe(true);
    }
    const secretes = v1.FACTIONS.flatMap((g) => g.entites ?? []).filter((e: { descriptionSecrete?: string }) => e.descriptionSecrete);
    expect(secretes.length).toBeGreaterThan(0);
    for (const e of secretes) {
      const f = fiches.find((x) => x.fiche.titre === e.nom)!.fiche;
      expect(f.passages.filter((p) => p.id.startsWith('secret-')).every((p) => p.scelle)).toBe(true);
    }
  });

  it('les sections que la v1 range sous une faction vont dans Factions', () => {
    for (const s of v1.LORE.sections.filter((x) => x.deplaceVersFaction)) {
      expect(par(`section-${slug(s.titre)}`)).toMatchObject({ categorie: 'Factions', sousTitre: s.deplaceVersFaction });
    }
  });

  it('garde-fou de canon : aucun nom secret dans ce que voient les joueurs', () => {
    expect(fuitesDeCanon(fiches)).toEqual([]);
    const versions = fiches.map((f) => versionJoueurs(f.fiche)).filter(Boolean);
    for (const nom of NOMS_JAMAIS_REVELES) expect(JSON.stringify(versions)).not.toContain(nom);
    // Le contrôle voit bien une fuite quand il y en a une.
    const fuite = [{ id: 'x', fiche: fiche({ passages: [{ id: 'p-1', texte: 'Le Roi des Mendiants tient le B0.', scelle: false }] }) }];
    expect(fuitesDeCanon(fuite)).toEqual(['x : Roi des Mendiants']);
  });

  it('chaque document tient largement dans la limite Firestore (1 Mo)', () => {
    for (const { fiche: f } of fiches) expect(JSON.stringify(f).length).toBeLessThan(200_000);
  });
});
