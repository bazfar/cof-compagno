/**
 * Prépare les scènes de battlemap du catalogue v1 pour la 2.0.
 *
 *   npm run preparer-scenes             régénère src/donnees/scenes/ et public/scenes/
 *   npm run preparer-scenes -- --verifier   ne touche à rien, échoue si une
 *                                        scène ne correspond plus à son .dd2vtt
 *
 * Pourquoi (cadrage, battlemap) : un .dd2vtt pèse de 5 à 37 Mo parce qu'il
 * embarque l'image en base64 (jusqu'à 10 240 × 6 400 pixels), et la v1 le
 * fait télécharger en entier à chaque joueur. Ce script en tire :
 *   - la géométrie seule (quelques Ko de JSON, en cases) : src/donnees/scenes/ ;
 *   - l'image, réduite à 128 pixels par case au plus et compressée en WebP
 *     (1 à 2 Mo) : public/scenes/<id>-<empreinte>.webp (lot L5.2).
 *
 * L'empreinte dépend de l'image d'origine et des réglages de compression.
 * Le mode --verifier ne recompresse rien (ce serait long) : il recalcule
 * l'empreinte et vérifie que le fichier existe. Une image déjà produite
 * n'est jamais refaite : relancer le script est rapide.
 *
 * Source : le catalogue `CARTES_BATTLEMAP` de data/donnees.js (v1), qui
 * reste la référence jusqu'à la bascule. Ajouter une scène = l'ajouter
 * au catalogue v1, puis relancer ce script.
 *
 * Exécuté directement par Node 24 (types effacés à la volée).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { schemaCatalogueScenes, schemaGeometrieScene, type CatalogueScenes, type GeometrieScene, type Point } from '../src/lib/schemas/scene.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE_V1 = resolve(ICI, '../..');
const DOSSIER = resolve(ICI, '../src/donnees/scenes');
const DOSSIER_IMAGES = resolve(ICI, '../public/scenes');
const MODE_VERIFIER = process.argv.includes('--verifier');

/** Réglages de l'image servie. Les changer change l'empreinte, donc refait les images. */
const PX_PAR_CASE_MAX = 128;
const QUALITE_WEBP = 80;

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

interface ImageAPreparer {
  fichier: string;
  base64: string;
  largeur: number;
  hauteur: number;
}

function preparer(): { fichiers: Record<string, unknown>; images: ImageAPreparer[] } {
  const fichiers: Record<string, unknown> = {};
  const images: ImageAPreparer[] = [];
  const catalogue: CatalogueScenes = catalogueV1().map(({ key, label, file }) => {
    const chemin = join(RACINE_V1, file);
    if (!existsSync(chemin)) echouer(`Scène « ${key} » : fichier ${file} introuvable.`);
    const dd = JSON.parse(readFileSync(chemin, 'utf8'));
    const geo = geometrieDepuisDd2vtt(dd, key, label);
    if (typeof dd.image !== 'string' || !dd.image) echouer(`Scène « ${key} » : le .dd2vtt ne contient pas d'image.`);
    const base64 = (dd.image as string).replace(/^data:[^,]*,/, '');
    const pxParCase = Math.min(PX_PAR_CASE_MAX, geo.pxParCaseSource);
    const empreinte = createHash('sha256').update(`${pxParCase}|${QUALITE_WEBP}|`).update(base64).digest('hex').slice(0, 10);
    const fichier = `${key}-${empreinte}.webp`;
    images.push({ fichier, base64, largeur: geo.colonnes * pxParCase, hauteur: geo.lignes * pxParCase });
    fichiers[`${key}.json`] = geo;
    return { id: key, nom: label, colonnes: geo.colonnes, lignes: geo.lignes, image: `scenes/${fichier}`, pxParCase };
  });
  fichiers['catalogue.json'] = schemaCatalogueScenes.parse(catalogue);
  return { fichiers, images };
}

/** Réduit et compresse une image (sharp n'est chargé que si une image manque). */
async function compresser(img: ImageAPreparer): Promise<void> {
  const { default: sharp } = await import('sharp');
  // Les plus grandes images font 65 mégapixels : au-delà de la limite par défaut de sharp.
  await sharp(Buffer.from(img.base64, 'base64'), { limitInputPixels: false })
    .resize(img.largeur, img.hauteur, { fit: 'fill' })
    .webp({ quality: QUALITE_WEBP })
    .toFile(join(DOSSIER_IMAGES, img.fichier));
}

async function principal(): Promise<number> {
  let resultat: ReturnType<typeof preparer>;
  try {
    resultat = preparer();
  } catch (e) {
    if (e instanceof ErreurPreparation) {
      console.error(`✘ Préparation des scènes impossible.\n${e.message}`);
      return 1;
    }
    throw e;
  }
  const { fichiers, images } = resultat;
  if (!MODE_VERIFIER) {
    mkdirSync(DOSSIER, { recursive: true });
    mkdirSync(DOSSIER_IMAGES, { recursive: true });
  }
  const lister = (dossier: string, extension: string) => (existsSync(dossier) ? readdirSync(dossier).filter((f) => f.endsWith(extension)) : []);
  const orphelins = lister(DOSSIER, '.json').filter((f) => !(f in fichiers));
  const imagesOrphelines = lister(DOSSIER_IMAGES, '.webp').filter((f) => !images.some((i) => i.fichier === f));
  const differents: string[] = [];
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const texte = JSON.stringify(contenu) + '\n';
    const chemin = join(DOSSIER, nom);
    if (existsSync(chemin) && readFileSync(chemin, 'utf8') === texte) continue;
    differents.push(nom);
    if (!MODE_VERIFIER) writeFileSync(chemin, texte);
  }
  const imagesManquantes = images.filter((i) => !existsSync(join(DOSSIER_IMAGES, i.fichier)));

  if (MODE_VERIFIER) {
    const ecarts = [...differents, ...orphelins, ...imagesManquantes.map((i) => i.fichier), ...imagesOrphelines];
    if (ecarts.length) {
      console.error(`✘ Les scènes ne correspondent plus au catalogue v1 : ${ecarts.join(', ')}.\n  Lance « npm run preparer-scenes » puis commite le résultat.`);
      return 1;
    }
    console.log(`✔ Scènes à jour (${images.length} scènes, géométrie et images).`);
    return 0;
  }
  for (const img of imagesManquantes) {
    process.stdout.write(`  … image ${img.fichier} (${img.largeur} × ${img.hauteur})\n`);
    await compresser(img);
  }
  for (const f of orphelins) rmSync(join(DOSSIER, f));
  for (const f of imagesOrphelines) rmSync(join(DOSSIER_IMAGES, f));
  const changes = [
    ...differents,
    ...imagesManquantes.map((i) => i.fichier),
    ...[...orphelins, ...imagesOrphelines].map((f) => `${f} (retiré)`),
  ];
  console.log(changes.length ? `✔ Mis à jour : ${changes.join(', ')}` : '✔ Rien à changer : les scènes sont déjà à jour.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await principal();
