import classesJson from '../../donnees/classes.json';
import constantesJson from '../../donnees/constantes.json';
import donsJson from '../../donnees/dons.json';
import etatsJson from '../../donnees/etats.json';
import mutationsJson from '../../donnees/mutations.json';
import racesJson from '../../donnees/races.json';
import sortsJson from '../../donnees/sorts.json';
import type { z } from 'zod';
import type {
  Capacite,
  Classe,
  Constantes,
  Race,
  Sort,
  Voie,
  schemaDon,
  schemaEtat,
  schemaMutations,
} from '../schemas/regles';

/*
 * Accès typé aux données de règles (src/donnees/*.json, générées par
 * outils/importer-v1.ts). Pas de validation au chargement : elle est faite
 * à l'import et par tests/unitaires/donnees-regles.test.ts, à chaque
 * `npm run verifier`. Les conversions `as` ci-dessous reposent sur ces
 * deux contrôles.
 */
export const classes = classesJson as Classe[];
export const races = racesJson as Race[];
export const sorts = sortsJson as Sort[];
export const etats = etatsJson as z.infer<typeof schemaEtat>[];
export const dons = donsJson as z.infer<typeof schemaDon>[];
export const mutations = mutationsJson as z.infer<typeof schemaMutations>;
export const constantes = constantesJson as Constantes;

/** Voie enrichie de la classe (ou race) qui la porte. */
export type VoieSituee = Voie & { classe: string };

function indexer<T extends { id: string }>(elements: T[], quoi: string): Map<string, T> {
  const index = new Map<string, T>();
  for (const e of elements) {
    if (index.has(e.id)) throw new Error(`${quoi} en double : ${e.id}`);
    index.set(e.id, e);
  }
  return index;
}

export const classeParId = indexer(classes, 'Classe');
export const sortParId = indexer(sorts, 'Sort');
export const etatParId = indexer(etats, 'État');
export const donParId = indexer(dons, 'Don');
export const raceParId = indexer(races, 'Race');
export const voieParId = indexer<VoieSituee>(
  classes.flatMap((k) => k.voies.map((v) => ({ ...v, classe: k.id }))),
  'Voie',
);
export const capaciteParId = indexer<Capacite>(
  [...classes.flatMap((k) => k.voies.flatMap((v) => v.rangs)), ...races.flatMap((r) => r.voie.rangs)],
  'Capacité',
);
