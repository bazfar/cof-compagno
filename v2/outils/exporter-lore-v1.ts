/**
 * Exporte le lore de la v1 (data/donnees.js : LORE, CHRONOLOGIE, FACTIONS,
 * PNJ_CLES) vers v2/lore-v1.json, que le MJ dépose ensuite dans l'app
 * (poste MJ › Données › Lore de la v1). Lot L2.7a.
 *
 *   npm run lore:exporter
 *
 * Pourquoi un fichier à déposer plutôt qu'un import dans le code de
 * l'app : tout ce qui est livré avec l'app est lisible par les joueurs
 * (c'était le défaut de la v1). Le fichier contient les secrets du MJ :
 * il est ignoré par git (.gitignore), ne pas le partager.
 *
 * L'export échoue si un nom de NOMS_JAMAIS_REVELES paraît dans un texte
 * que les joueurs verraient (garde-fou de canon).
 *
 * Exécuté directement par Node 24 (types effacés à la volée) : seulement
 * de la syntaxe TypeScript effaçable, imports relatifs avec extension.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { convertirLoreV1, fuitesDeCanon, type LoreV1 } from '../src/lib/lore/import-v1.ts';
import { schemaExportLore } from '../src/lib/schemas/lore.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE_V1 = resolve(ICI, '../..');
const SORTIE = resolve(ICI, '../lore-v1.json');

/** Charge data/donnees.js dans un contexte isolé (même technique que importer-v1.ts). */
function chargerLoreV1(): LoreV1 {
  const contexte: Record<string, unknown> = { console, Math, JSON, Object, Array, Number, String, Date };
  contexte.window = contexte;
  createContext(contexte);
  const source = readFileSync(join(RACINE_V1, 'data/donnees.js'), 'utf8').replace(/^const (\w+)\s*=/gm, 'var $1 =').replace(/^let (\w+)\s*=/gm, 'var $1 =');
  runInContext(source, contexte, { filename: 'data/donnees.js' });
  const { LORE, CHRONOLOGIE, FACTIONS, PNJ_CLES } = contexte as unknown as LoreV1;
  if (!LORE || !CHRONOLOGIE || !FACTIONS || !PNJ_CLES) throw new Error('data/donnees.js : LORE, CHRONOLOGIE, FACTIONS ou PNJ_CLES introuvable.');
  return { LORE, CHRONOLOGIE, FACTIONS, PNJ_CLES };
}

function principal(): number {
  const maintenant = Date.now();
  const fiches = convertirLoreV1(chargerLoreV1(), maintenant);
  const fuites = fuitesDeCanon(fiches);
  if (fuites.length) {
    console.error(`✘ Export refusé : un nom secret serait lisible par les joueurs.\n  ${fuites.join('\n  ')}`);
    return 1;
  }
  const exportLore = schemaExportLore.parse({ format: 'cof-compagno/lore-v1', exporteLe: maintenant, fiches });
  writeFileSync(SORTIE, JSON.stringify(exportLore));
  const parVisibilite = (v: string) => fiches.filter((f) => f.fiche.visibilite === v).length;
  const scelles = fiches.reduce((n, f) => n + f.fiche.passages.filter((p) => p.scelle).length, 0);
  console.log(
    `✔ ${fiches.length} fiches exportées vers lore-v1.json : ${parVisibilite('tous')} partagées, ${parVisibilite('mj')} pour le MJ seul, ${scelles} passages scellés.\n` +
      '  Fichier secret : ne pas le committer ni le partager. À déposer dans Poste MJ › Données.',
  );
  return 0;
}

process.exitCode = principal();
