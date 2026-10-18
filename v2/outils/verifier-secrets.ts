/**
 * Cherche dans le code livré (dist/, après `npm run build`) les noms que
 * les joueurs ne doivent jamais lire (src/lib/canon.ts). Correctif du
 * 18/10/2026 : le bestiaire v1, Roi des Mendiants compris, était livré
 * avec les données de règles chargées par l'écran joueur.
 *
 *   npm run secrets:verifier     (lancé par `npm run verifier`, après le build)
 *
 * Exécuté directement par Node 24 (types effacés à la volée).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOMS_JAMAIS_REVELES } from '../src/lib/canon.ts';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const chemin = join(dossier, n);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

function principal(): number {
  if (!existsSync(DIST)) {
    console.error('✘ dist/ absent : lancer `npm run build` avant `npm run secrets:verifier`.');
    return 1;
  }
  const fuites: string[] = [];
  for (const f of fichiers(DIST).filter((x) => /\.(js|html|css|json|map)$/.test(x))) {
    const texte = readFileSync(f, 'utf8');
    for (const nom of NOMS_JAMAIS_REVELES) if (texte.includes(nom)) fuites.push(`${relative(DIST, f)} : ${nom}`);
  }
  if (fuites.length) {
    console.error(`✘ Un nom secret est livré aux joueurs :\n  ${fuites.join('\n  ')}`);
    return 1;
  }
  console.log(`✔ Aucun nom secret dans dist/ (${NOMS_JAMAIS_REVELES.length} nom${NOMS_JAMAIS_REVELES.length > 1 ? 's' : ''} cherché${NOMS_JAMAIS_REVELES.length > 1 ? 's' : ''}).`);
  return 0;
}

process.exitCode = principal();
