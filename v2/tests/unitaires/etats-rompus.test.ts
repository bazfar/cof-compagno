import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { etatsRefonte } from '../../src/regles/index';

/*
 * Garde-fou du chemin « hors main » des règles (L6.4a, décision du
 * 27/10/2026). `encaisseSesDegats` laisse tomber les états qu'un dégât
 * subi rompt, et rien d'autre. Les règles ne lisent pas `rompuPar` : ce
 * n'est pas un champ du document, mais une donnée de `src/regles/etats.ts`
 * lue par id. La liste est donc recopiée dans `rompusParDegats()`, et ce
 * test échoue si les deux divergent — sinon la divergence se verrait
 * seulement en jeu, par un refus d'écriture.
 */

const regles = readFileSync('firestore.rules', 'utf8');

/** La liste littérale de `function rompusParDegats()`. */
function listeDesRegles(): string[] {
  const corps = /function rompusParDegats\(\) \{\s*return \[([^\]]*)\];/.exec(regles)?.[1];
  expect(corps, 'function rompusParDegats() introuvable dans firestore.rules').toBeDefined();
  return corps!
    .split(',')
    .map((c) => c.trim().replace(/'/g, ''))
    .filter(Boolean);
}

describe('les états que les dégâts rompent, des deux côtés', () => {
  const desDonnees = etatsRefonte.filter((e) => e.rompuPar.includes('degatsSubis')).map((e) => e.id);

  it('src/regles/etats.ts en donne au moins un (sinon le chemin hors main ne sert à rien)', () => {
    expect(desDonnees.length).toBeGreaterThan(0);
  });

  it('firestore.rules recopie exactement ceux des données', () => {
    expect([...listeDesRegles()].sort()).toEqual([...desDonnees].sort());
  });

  it('`retraitsParDegats` vérifie autant d’index que la liste a d’états', () => {
    const corps = regles.slice(regles.indexOf('function retraitsParDegats('));
    const index = [...corps.slice(0, corps.indexOf('\n    }')).matchAll(/retires\[(\d+)\]/g)].map((m) => Number(m[1]));
    for (let i = 0; i < desDonnees.length; i++) {
      expect(index, `il manque la ligne « retires.size() < ${i + 1} || retires[${i}].id in rompusParDegats() »`).toContain(i);
    }
  });
});
