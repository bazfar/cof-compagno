/**
 * Exporte le bestiaire de la 2.0 (src/donnees : bestiaire, armes et
 * armures de monstres, équilibrage, importés de la v1 par importer-v1.ts)
 * vers v2/bestiaire-v1.json, que le MJ dépose ensuite dans l'app
 * (Poste MJ › Données › Imports). Lot L3.2.
 *
 *   npm run bestiaire:exporter
 *
 * Pourquoi un fichier à déposer : depuis le correctif du 18/10/2026, le
 * bestiaire n'est plus livré avec l'app (fiches secrètes, Roi des
 * Mendiants compris). Il vit dans Firestore, lisible du MJ seul. Le
 * fichier contient ces secrets : il est ignoré par git, ne pas le partager.
 *
 * Exécuté directement par Node 24 (types effacés à la volée).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaExportBestiaire } from '../src/lib/schemas/bestiaire.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const DONNEES = resolve(ICI, '../src/donnees');
const SORTIE = resolve(ICI, '../bestiaire-v1.json');
const lire = (fichier: string): unknown => JSON.parse(readFileSync(join(DONNEES, fichier), 'utf8'));

const exportBestiaire = schemaExportBestiaire.parse({
  format: 'cof-compagno/bestiaire-v1',
  exporteLe: Date.now(),
  monstres: (lire('bestiaire.json') as { monstres: unknown }).monstres,
  armes: lire('armes-monstres.json'),
  armures: lire('armures-monstres.json'),
  equilibrage: lire('equilibrage.json'),
});
writeFileSync(SORTIE, JSON.stringify(exportBestiaire));
console.log(
  `✔ ${exportBestiaire.monstres.length} monstres, ${exportBestiaire.armes.length} armes et ${exportBestiaire.armures.length} armures exportés vers bestiaire-v1.json.\n` +
    '  Fichier secret : ne pas le committer ni le partager. À déposer dans Poste MJ › Données › Imports.',
);
