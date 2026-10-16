import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { schemaDessin, schemaEtatScene, schemaJeton } from '../../src/lib/schemas/carte';

/*
 * Les champs des documents de la battlemap (lot L5.3) sont définis deux
 * fois : par les schémas Zod (l'app) et par les `hasOnly([...])` de
 * firestore.rules (le serveur). Ce test lit les règles et vérifie que les
 * deux listes sont les mêmes : un champ ajouté d'un côté seulement serait
 * refusé en jeu, sans que rien ne le signale avant.
 */
const regles = readFileSync('firestore.rules', 'utf8');

function champsAutorises(fonction: string): string[] {
  const corps = regles.slice(regles.indexOf(`function ${fonction}(`));
  const m = /hasOnly\(\[([^\]]*)\]\)/.exec(corps);
  if (!m?.[1]) throw new Error(`hasOnly introuvable dans ${fonction}`);
  return m[1].split(',').map((c) => c.trim().replace(/'/g, '')).sort();
}

describe('schémas de la battlemap alignés sur firestore.rules', () => {
  it('jeton', () => {
    expect(champsAutorises('jetonValide')).toEqual(Object.keys(schemaJeton.shape).sort());
  });
  it('état de scène', () => {
    expect(champsAutorises('etatSceneValide')).toEqual(Object.keys(schemaEtatScene.shape).sort());
  });
  it('dessin du MJ', () => {
    expect(champsAutorises('dessinValide')).toEqual(Object.keys(schemaDessin.shape).sort());
  });
  it('un jeton valide passe, un jeton avec des PV non', () => {
    const jeton = { genre: 'monstre', nom: 'Gobelin', couleur: '#c0392b', cx: 3, cy: 4, proprietaire: null, creeLe: 1 };
    expect(schemaJeton.safeParse(jeton).success).toBe(true);
    expect(schemaJeton.strict().safeParse({ ...jeton, pv: 12 }).success).toBe(false);
    expect(schemaJeton.safeParse({ ...jeton, cx: 2.5 }).success).toBe(false);
  });
});
