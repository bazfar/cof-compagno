import { describe, expect, it } from 'vitest';
import { TABLE_PAR_DEFAUT, tableDepuisUrl } from '../../src/lib/table';

describe('tableDepuisUrl', () => {
  it('prend la table par défaut sans paramètre', () => {
    expect(tableDepuisUrl('https://exemple.web.app/')).toBe(TABLE_PAR_DEFAUT);
  });

  it('lit ?table= quand il est valide', () => {
    expect(tableDepuisUrl('https://exemple.web.app/?table=test')).toBe('test');
  });

  it("refuse un identifiant qui pourrait détourner un chemin Firestore", () => {
    expect(tableDepuisUrl('https://exemple.web.app/?table=../sessions')).toBe(TABLE_PAR_DEFAUT);
    expect(tableDepuisUrl('https://exemple.web.app/?table=Arbre%20Monde')).toBe(TABLE_PAR_DEFAUT);
    expect(tableDepuisUrl('https://exemple.web.app/?table=')).toBe(TABLE_PAR_DEFAUT);
  });
});
