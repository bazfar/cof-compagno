/**
 * Prépare les scènes de battlemap du catalogue v1 pour la 2.0.
 *
 *   npm run preparer-scenes             régénère src/donnees/scenes/
 *   npm run preparer-scenes -- --verifier   ne touche à rien, échoue si la
 *                                        géométrie ne correspond plus aux .dd2vtt
 *
 * Pourquoi (cadrage, battlemap) : un .dd2vtt pèse de 5 à 37 Mo parce qu'il
 * embarque l'image en base64, et la v1 le fait télécharger en entier à
 * chaque joueur. Ce script en tire la géométrie seule (quelques Ko de
 * JSON, en cases) ; l'image sera extraite et compressée à part (L5.2).
 *
 * Source : le catalogue `CARTES_BATTLEMAP` de data/donnees.js (v1), qui
 * reste la référence jusqu'à la bascule. Ajouter une scène = l'ajouter
 * au catalogue v1, puis relancer ce script.
 *
 * Exécuté directement par Node 24 (types effacés à la volée).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { schemaCatalogueScenes, schemaGeometrieScene, type GeometrieScene, type Point } from '../src/lib/schemas/scene.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE_V1 = resolve(ICI, '../..');
const DOSSIER = resolve(ICI, '../src/donnees/scenes');
const MODE_VERIFIER = process.argv.includes('--verifier');

type Brut = any;

class ErreurPreparation extends Error {}

function echouer(message: string): never {
  throw new ErreurPreparation(message);
}

/** Lit CARTES_BATTLEMAP dans data/donnees.js (même technique que importer-v1.ts). */
function catalogueV1(): { key: string; label: string; file: string }[] {
  const contexte: Record<string, Brut> = { console, Math, JSON, Object, Array, Number, String, Date };
  contexte.window = contexte;
  createContext(contexte);
  const source = readFileSync(join(RACINE_V1, 'data/donnees.js'), 'utf8')
    .replace(/^const (\w+)\s*=/gm, 'var $1 =')
    .replace(/^let (\w+)\s*=/gm, 'var $1 =');
  runInContext(source, contexte, { filename: 'data/donnees.js' });
  if (!Array.isArray(contexte.CARTES_BATTLEMAP)) echouer('CARTES_BATTLEMAP introuvable dans data/donnees.js.');
  return contexte.CARTES_BATTLEMAP;
}

const point = (p: Brut, ou: string): Point => {
  if (typeof p?.x !== 'number' || typeof p?.y !== 'number') echouer(`${ou} : point illisible ${JSON.stringify(p)}.`);
  return [p.x, p.y];
};

/** Équivalent de parseDD2VTT (js/carte.js), sans l'image et sans passer en pixels. */
export function geometrieDepuisDd2vtt(dd: Brut, id: string, nom: string): GeometrieScene {
  const r = dd?.resolution;
  if (!r?.map_size || !r.pixels_per_grid) echouer(`${id} : bloc « resolution » absent, ce n'est pas un export .dd2vtt.`);
  const polylignes = (liste: Brut, champ: string) =>
    ((liste ?? []) as Brut[])
      .map((poly: Brut[], i: number) => poly.map((p, j) => point(p, `${id}.${champ}[${i}][${j}]`)))
      // Une « polyligne » d'un seul point ne trace aucun segment : la v1 l'ignorait de fait.
      .filter((poly) => poly.length >= 2);
  return schemaGeometrieScene.parse({
    id,
    nom,
    colonnes: r.map_size.x,
    lignes: r.map_size.y,
    pxParCaseSource: r.pixels_per_grid,
    murs: polylignes(dd.line_of_sight, 'line_of_sight'),
    obstacles: polylignes(dd.objects_line_of_sight, 'objects_line_of_sight'),
    // id = ordre d'export, comme en v1 ('p' + i) : c'est la clé de synchro de l'état ouvert/fermé.
    portes: ((dd.portals ?? []) as Brut[]).flatMap((p, i) =>
      p.bounds?.length >= 2
        ? [{ id: 'p' + i, a: point(p.bounds[0], `${id}.portals[${i}]`), b: point(p.bounds[1], `${id}.portals[${i}]`), ouverte: !p.closed }]
        : [],
    ),
  });
}

function preparer(): Record<string, unknown> {
  const fichiers: Record<string, unknown> = {};
  const catalogue = catalogueV1().map(({ key, label, file }) => {
    const chemin = join(RACINE_V1, file);
    if (!existsSync(chemin)) echouer(`Scène « ${key} » : fichier ${file} introuvable.`);
    const geo = geometrieDepuisDd2vtt(JSON.parse(readFileSync(chemin, 'utf8')), key, label);
    fichiers[`${key}.json`] = geo;
    return { id: key, nom: label, colonnes: geo.colonnes, lignes: geo.lignes };
  });
  fichiers['catalogue.json'] = schemaCatalogueScenes.parse(catalogue);
  return fichiers;
}

function principal(): number {
  let fichiers: Record<string, unknown>;
  try {
    fichiers = preparer();
  } catch (e) {
    if (e instanceof ErreurPreparation) {
      console.error(`✘ Préparation des scènes impossible.\n${e.message}`);
      return 1;
    }
    throw e;
  }
  if (!MODE_VERIFIER) mkdirSync(DOSSIER, { recursive: true });
  const presents = existsSync(DOSSIER) ? readdirSync(DOSSIER).filter((f) => f.endsWith('.json')) : [];
  const orphelins = presents.filter((f) => !(f in fichiers));
  const differents: string[] = [];
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const texte = JSON.stringify(contenu) + '\n';
    const chemin = join(DOSSIER, nom);
    if (existsSync(chemin) && readFileSync(chemin, 'utf8') === texte) continue;
    differents.push(nom);
    if (!MODE_VERIFIER) writeFileSync(chemin, texte);
  }
  if (MODE_VERIFIER) {
    if (differents.length || orphelins.length) {
      console.error(
        `✘ src/donnees/scenes ne correspond plus au catalogue v1 : ${[...differents, ...orphelins].join(', ')}.\n  Lance « npm run preparer-scenes » puis commite le résultat.`,
      );
      return 1;
    }
    console.log(`✔ src/donnees/scenes est à jour (${Object.keys(fichiers).length - 1} scènes).`);
    return 0;
  }
  for (const f of orphelins) rmSync(join(DOSSIER, f));
  const changes = [...differents, ...orphelins.map((f) => `${f} (retiré)`)];
  console.log(changes.length ? `✔ Mis à jour : ${changes.join(', ')}` : '✔ Rien à changer : src/donnees/scenes est déjà à jour.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = principal();
