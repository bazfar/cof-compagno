import { describe, expect, it } from 'vitest';
import { schemaJoueur, schemaMj } from '../../src/lib/schemas/acces';

describe('schemaJoueur', () => {
  it('accepte un joueur minimal', () => {
    expect(schemaJoueur.parse({ nom: 'Thomas', rejointLe: 1 })).toEqual({ nom: 'Thomas', rejointLe: 1 });
  });

  it('nettoie les espaces autour du nom', () => {
    expect(schemaJoueur.parse({ nom: '  Fred ', rejointLe: 1 }).nom).toBe('Fred');
  });

  it('refuse un nom vide ou trop long', () => {
    expect(schemaJoueur.safeParse({ nom: '   ', rejointLe: 1 }).success).toBe(false);
    expect(schemaJoueur.safeParse({ nom: 'x'.repeat(41), rejointLe: 1 }).success).toBe(false);
  });

  it('refuse une couleur mal formée', () => {
    expect(schemaJoueur.safeParse({ nom: 'Fred', couleur: 'rouge', rejointLe: 1 }).success).toBe(false);
  });
});

describe('schemaMj', () => {
  it("ne renvoie jamais le code, même s'il est stocké dans le document", () => {
    const lu = schemaMj.parse({ nom: 'Thomas', code: 'secret', rejointLe: 1 });
    expect(lu).toEqual({ nom: 'Thomas', rejointLe: 1 });
  });
});
