import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

/*
 * Charge des fonctions de js/carte.js (v1) pour les tests d'équivalence de
 * la battlemap (lot L5.1).
 *
 * carte.js est un seul bloc de 4 400 lignes qui touche au DOM dès son
 * chargement : on ne peut pas l'exécuter tel quel. On en extrait donc, par
 * leur nom, les fonctions de CALCUL (sans DOM), et on les exécute dans un
 * contexte isolé. Leurs variables libres (tokensDD, scenes, sceneActive)
 * deviennent des variables de ce contexte, que le test remplit.
 *
 * L'extraction suit les accolades en sautant chaînes et commentaires. Elle
 * échoue bruyamment si une fonction est absente ou en double : si la v1
 * renomme une de ces fonctions, ce test le dira.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- code v1 non typé
export type Brut = any;

const RACINE_V1 = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const FONCTIONS = [
  // VisibilityPolygon
  'compute', '_intersect', '_bounds',
  // DD2VTT : géométrie
  '_segmentsDepuisPolylignes', '_polylignesEtSegments', 'parseDD2VTT',
  '_distancePointSegment', '_pointIntersectionSegments', '_portailProche', '_deplacementBloque',
  '_segmentsBloquants', '_plafonnerPortee', '_pointDansPolygone',
  // DD2VTT : placement et ciblage
  '_casesGrilleAutour', '_resoudreCase', '_posePlacementParDefaut',
  'distanceCases', '_traceBresenham', '_ligneCases', 'jetonsEnZone',
] as const;

/** Rend le texte de `function nom(...) { ... }` dans `source`. */
function extraire(source: string, nom: string): string {
  const motif = new RegExp(`\\bfunction ${nom}\\s*\\(`, 'g');
  const debuts = [...source.matchAll(motif)].map((m) => m.index);
  if (debuts.length !== 1) throw new Error(`js/carte.js : « function ${nom}( » trouvée ${debuts.length} fois (1 attendue).`);
  const debut = debuts[0] as number;
  let i = source.indexOf('{', source.indexOf(')', debut));
  let profondeur = 0;
  for (; i < source.length; i++) {
    const c = source[i];
    const suivant = source[i + 1];
    if (c === '/' && suivant === '/') { i = source.indexOf('\n', i); continue; }
    if (c === '/' && suivant === '*') { i = source.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') {
      for (i++; source[i] !== c; i++) if (source[i] === '\\') i++;
      continue;
    }
    if (c === '{') profondeur++;
    if (c === '}' && --profondeur === 0) return source.slice(debut, i + 1);
  }
  throw new Error(`js/carte.js : fin de « ${nom} » introuvable.`);
}

/** Contexte où les fonctions v1 sont définies ; remplir tokensDD / scenes / sceneActive avant appel. */
export function chargerCarteV1(): Record<string, Brut> {
  const source = readFileSync(join(RACINE_V1, 'js/carte.js'), 'utf8');
  const code = FONCTIONS.map((nom) => extraire(source, nom)).join('\n\n');
  const contexte: Record<string, Brut> = { Math, JSON, Object, Array, Number, Infinity, tokensDD: [], scenes: {}, sceneActive: null };
  createContext(contexte);
  runInContext(code, contexte, { filename: 'js/carte.js (extrait)' });
  return contexte;
}
