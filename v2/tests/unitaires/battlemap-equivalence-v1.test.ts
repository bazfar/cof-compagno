import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contactsPerdus, deplacementBloque, placementParDefaut, placerLot } from '../../src/lib/battlemap/deplacement';
import { jetonsEnZone, ligneCases } from '../../src/lib/battlemap/ciblage';
import { distanceCases, distancePointSegment, sceneCalcul, type JetonCarte, type Point, type Porte, type Segment } from '../../src/lib/battlemap/geometrie';
import { caseVueParLesPJ, plafonnerPortee, polygoneVisibilite, segmentsBloquants, visionsDesPJ } from '../../src/lib/battlemap/visibilite';
import { catalogueScenes } from '../../src/lib/battlemap/scenes';
import { schemaGeometrieScene } from '../../src/lib/schemas/scene';
import { chargerCarteV1, type Brut } from '../outils/carte-v1';

/*
 * ÉQUIVALENCE AVEC LA V1 — BATTLEMAP (lot L5.1).
 *
 * Exécute les VRAIES fonctions de calcul de js/carte.js (extraites par
 * tests/outils/carte-v1.ts) et le port 2.0 sur les scènes du catalogue,
 * avec des portes ouvertes ou fermées, des murs, obstacles et portes
 * dessinés à la main, et des jetons placés au hasard (graine fixe). Compare :
 * préparation du .dd2vtt, blocage du déplacement, polygones de vision,
 * détection des monstres, pose en groupe, placement par défaut, sorts en
 * ligne, zones, distances, attaques d'opportunité.
 *
 * La v1 calcule en pixels de l'image, la 2.0 en cases : les points v1 sont
 * divisés par pixels_per_grid avant comparaison (écart toléré 1e-6 case).
 * Aucun jeton n'est mort ici : la règle des monstres morts est nouvelle et
 * se teste à part (battlemap.test.ts).
 */

const V1 = chargerCarteV1();
const RACINE_V1 = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DOSSIER_SCENES = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/donnees/scenes');

function generateur(graine: number) {
  let a = graine >>> 0;
  const aleatoire = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entier = (min: number, max: number) => min + Math.floor(aleatoire() * (max - min + 1));
  const proba = (p: number) => aleatoire() < p;
  return { entier, proba };
}

const PROCHE = 1e-6;
const TIRAGES = 4;
/** Le point est-il sur le bord d'un des polygones (à 1e-6 case près) ? */
const surUnBord = (pt: Point, polys: readonly (readonly Point[])[]) =>
  polys.some((poly) =>
    poly.some((a, i) => {
      const b = poly[(i + 1) % poly.length] as Point;
      return distancePointSegment(pt[0], pt[1], a[0], a[1], b[0], b[1]) < PROCHE;
    }),
  );
const memePoint = (v1: Brut, px: number, p: Point) => Math.abs(v1[0] / px - p[0]) < PROCHE && Math.abs(v1[1] / px - p[1]) < PROCHE;

function catalogueV1(): Record<string, string> {
  const source = readFileSync(join(RACINE_V1, 'data/donnees.js'), 'utf8');
  const fichiers: Record<string, string> = {};
  for (const m of source.matchAll(/\{ key: '([^']+)', label: '[^']*', file: '([^']+)' \}/g)) fichiers[m[1] as string] = m[2] as string;
  return fichiers;
}
const FICHIERS_V1 = catalogueV1();

describe.each(catalogueScenes.map((s) => s.id))('scène %s', (id) => {
  const geo = schemaGeometrieScene.parse(JSON.parse(readFileSync(join(DOSSIER_SCENES, `${id}.json`), 'utf8')));
  const fichier = FICHIERS_V1[id];
  if (!fichier) throw new Error(`Scène ${id} absente de CARTES_BATTLEMAP (data/donnees.js).`);
  const dd = JSON.parse(readFileSync(join(RACINE_V1, fichier), 'utf8'));
  delete dd.image; // inutile au calcul, et 20 à 50 Mo de base64
  const px: number = dd.resolution.pixels_per_grid;
  const sceneV1Base = V1.parseDD2VTT(dd, id, geo.nom);

  it('préparation : même géométrie que parseDD2VTT', () => {
    expect(geo.colonnes * px).toBe(sceneV1Base.largeur);
    expect(geo.lignes * px).toBe(sceneV1Base.hauteur);
    const nos = sceneCalcul(geo);
    expect(nos.murs.length).toBe(sceneV1Base.segments.length);
    nos.murs.forEach((s, i) => expect(memePoint(sceneV1Base.segments[i][0], px, s[0]) && memePoint(sceneV1Base.segments[i][1], px, s[1])).toBe(true));
    expect(nos.obstacles.length).toBe(sceneV1Base.segmentsObjets.length);
    expect(nos.portes.map((p) => [p.id, p.ouverte])).toEqual(sceneV1Base.portails.map((p: Brut) => [p.id, p.ouvert]));
    nos.portes.forEach((p, i) => {
      const b = sceneV1Base.portails[i].bounds;
      expect(memePoint([b[0].x, b[0].y], px, p.a) && memePoint([b[1].x, b[1].y], px, p.b)).toBe(true);
    });
  });

  // Plusieurs tirages : portes, dessins du MJ et jetons différents à chaque fois.
  for (let tirage = 0; tirage < TIRAGES; tirage++) {
    const alea = generateur(1000 * (catalogueScenes.findIndex((s) => s.id === id) + 1) + tirage);
    const { colonnes, lignes } = geo;
    const caseAuHasard = () => ({ cx: alea.entier(0, colonnes - 1), cy: alea.entier(0, lignes - 1) });
    // Points sur des demi-cases : exacts en pixels comme en cases.
    const pointAuHasard = (): Point => [alea.entier(0, colonnes * 2) / 2, alea.entier(0, lignes * 2) / 2];
    const segmentAuHasard = (): Segment => {
      const a = pointAuHasard();
      return [a, [Math.min(colonnes, a[0] + alea.entier(-6, 6) / 2), Math.min(lignes, a[1] + alea.entier(-6, 6) / 2)]];
    };

    const portesOuvertes = Object.fromEntries(geo.portes.map((p) => [p.id, alea.proba(0.5)]));
    const mursManuels = Array.from({ length: alea.entier(0, 4) }, segmentAuHasard);
    const obstaclesManuels = Array.from({ length: alea.entier(0, 4) }, segmentAuHasard);
    const portesManuelles: Porte[] = Array.from({ length: alea.entier(0, 2) }, (_, i) => {
      const [a, b] = segmentAuHasard();
      return { id: `m${i}`, a, b, ouverte: alea.proba(0.5) };
    });
    const scene = sceneCalcul(geo, { portesOuvertes, mursManuels, obstaclesManuels, portesManuelles });

    const enPixels = (s: Segment) => [[s[0][0] * px, s[0][1] * px], [s[1][0] * px, s[1][1] * px]];
    const sceneV1 = {
      ...sceneV1Base,
      portails: [
        ...sceneV1Base.portails.map((p: Brut) => ({ ...p, ouvert: portesOuvertes[p.id] })),
        ...portesManuelles.map((p) => ({ id: p.id, bounds: [{ x: p.a[0] * px, y: p.a[1] * px }, { x: p.b[0] * px, y: p.b[1] * px }], ouvert: p.ouverte })),
      ],
      segmentsMursManuels: mursManuels.map(enPixels),
      segmentsObjetsManuels: obstaclesManuels.map(enPixels),
    };

    // Jetons : PJ, monstres, invocations, jetons libres.
    const genres: JetonCarte['genre'][] = ['pj', 'monstre', 'invocation', 'libre'];
    const jetons: JetonCarte[] = Array.from({ length: alea.entier(2, 14) }, (_, i) => ({
      id: `t${i}`,
      genre: genres[alea.entier(0, 3)] as JetonCarte['genre'],
      ...caseAuHasard(),
    }));
    const tokensV1 = () => jetons.map((j) => ({ id: j.id, cx: j.cx, cy: j.cy, pj: j.genre === 'pj', monstreId: j.genre === 'monstre' ? 'm' : null, invocateur: j.genre === 'invocation' ? 'p' : null }));
    const brancherV1 = () => {
      V1.tokensDD = tokensV1();
      V1.scenes = { [id]: sceneV1 };
      V1.sceneActive = id;
    };

    it(`tirage ${tirage} : blocage du déplacement d'un PJ (1 500 trajets)`, () => {
      const ecarts: string[] = [];
      for (let k = 0; k < 1500; k++) {
        const de = caseAuHasard();
        const long = alea.proba(0.2);
        const vers = long ? caseAuHasard() : { cx: Math.max(0, Math.min(colonnes - 1, de.cx + alea.entier(-3, 3))), cy: Math.max(0, Math.min(lignes - 1, de.cy + alea.entier(-3, 3))) };
        const v1 = V1._deplacementBloque(sceneV1, de.cx, de.cy, vers.cx, vers.cy);
        const v2 = deplacementBloque(scene, de, vers);
        if (v1 !== v2) ecarts.push(`(${de.cx},${de.cy})→(${vers.cx},${vers.cy}) : v1 ${v1} ≠ 2.0 ${v2}`);
      }
      expect(ecarts).toEqual([]);
    });

    it(`tirage ${tirage} : polygones de vision et détection des monstres`, { timeout: 30_000 }, () => {
      const segsV1 = V1._segmentsBloquants(sceneV1);
      expect(segmentsBloquants(scene).length).toBe(segsV1.length);
      for (let k = 0; k < 8; k++) {
        const c = caseAuHasard();
        const pos: Point = [c.cx + 0.5, c.cy + 0.5];
        const polyV1 = V1.compute([pos[0] * px, pos[1] * px], segsV1, [0, 0, sceneV1.largeur, sceneV1.hauteur], 32);
        const poly = polygoneVisibilite(pos, segmentsBloquants(scene), [0, 0, colonnes, lignes], 32);
        expect(poly.length, `vision depuis (${c.cx},${c.cy})`).toBe(polyV1.length);
        poly.forEach((p, i) => expect(memePoint(polyV1[i], px, p), `sommet ${i} depuis (${c.cx},${c.cy})`).toBe(true));
        for (const portee of [8, 12]) {
          const platV1 = V1._plafonnerPortee(polyV1, pos[0] * px, pos[1] * px, portee * px);
          plafonnerPortee(poly, pos[0], pos[1], portee).forEach((p, i) => expect(memePoint(platV1[i], px, p)).toBe(true));
        }
      }
      // Détection : un monstre est-il vu par au moins un PJ ? (v1 : _monstreVisiblePourJoueurs)
      const visions = visionsDesPJ(scene, jetons);
      const polysV1: Brut[] = jetons
        .filter((j) => j.genre === 'pj')
        .flatMap((j) => {
          const [x, y] = [(j.cx + 0.5) * px, (j.cy + 0.5) * px];
          const p = V1.compute([x, y], segsV1, [0, 0, sceneV1.largeur, sceneV1.hauteur], 32);
          return p.length >= 3 ? [V1._plafonnerPortee(p, x, y, 12 * px)] : [];
        });
      expect(visions.length).toBe(polysV1.length);
      // Un centre de case pile sur le bord d'un polygone peut tomber d'un côté
      // ou de l'autre selon l'arrondi (pixels en v1, cases ici) : seul cet
      // écart est toléré, et il doit rester rare.
      let auBord = 0;
      for (let k = 0; k < 300; k++) {
        const c = caseAuHasard();
        const v1 = polysV1.some((poly: Brut) => V1._pointDansPolygone([(c.cx + 0.5) * px, (c.cy + 0.5) * px], poly));
        const v2 = caseVueParLesPJ(visions, c.cx, c.cy);
        if (v1 !== v2 && surUnBord([c.cx + 0.5, c.cy + 0.5], visions.map((v) => v.alteree))) { auBord++; continue; }
        expect(v2, `case (${c.cx},${c.cy})`).toBe(v1);
      }
      expect(auBord).toBeLessThan(6);
    });

    it(`tirage ${tirage} : pose en groupe, placement par défaut`, () => {
      for (let k = 0; k < 6; k++) {
        const ancre = caseAuHasard();
        const lot = Array.from({ length: alea.entier(1, 9) }, (_, i) => ({ id: `n${k}-${i}`, genre: (alea.proba(0.5) ? 'pj' : 'monstre') as JetonCarte['genre'] }));
        // v1 : la boucle de ajouterTokensLot, sans droits ni rendu.
        brancherV1();
        const cellules = V1._casesGrilleAutour(lot.length, ancre.cx, ancre.cy);
        let ox = ancre.cx, oy = ancre.cy, empV1 = 0;
        const posesV1 = lot.map((d, i) => {
          const r = V1._resoudreCase(sceneV1, cellules[i].cx, cellules[i].cy, d.genre === 'pj', ox, oy, ancre.cx, ancre.cy);
          V1.tokensDD.push({ id: d.id, cx: r.cx, cy: r.cy, pj: d.genre === 'pj' });
          ox = r.cx; oy = r.cy;
          if (r.empile) empV1++;
          return { cx: r.cx, cy: r.cy };
        });
        const { poses, empilements } = placerLot(scene, jetons, lot, ancre);
        expect(poses.map(({ cx, cy }) => ({ cx, cy }))).toEqual(posesV1);
        expect(empilements).toBe(empV1);
      }
      brancherV1();
      for (const estPJ of [true, false]) {
        const v1 = V1._posePlacementParDefaut({ lc: colonnes, hc: lignes }, { pj: estPJ });
        expect(placementParDefaut(scene, jetons, estPJ)).toEqual({ cx: v1.cx, cy: v1.cy });
      }
    });

    it(`tirage ${tirage} : sorts en ligne, zones, distances, attaques d'opportunité`, () => {
      brancherV1();
      for (let k = 0; k < 60; k++) {
        const a = jetons[alea.entier(0, jetons.length - 1)] as JetonCarte;
        const b = jetons[alea.entier(0, jetons.length - 1)] as JetonCarte;
        const longueur = alea.entier(1, 12);
        const v1 = V1._ligneCases(a.id, b.id, longueur);
        const v2 = a.id === b.id ? { cases: [], impact: null } : ligneCases(scene, a, b, longueur);
        expect(v2.cases).toEqual(v1.cases);
        if (v1.impact === null) expect(v2.impact).toBeNull();
        else expect(v2.impact && memePoint(v1.impact, px, v2.impact)).toBe(true);

        const rayon = alea.entier(0, 4);
        expect(jetonsEnZone(jetons, a.id, rayon)).toEqual(V1.jetonsEnZone(a.id, rayon));
        expect(distanceCases(a, b)).toBe(V1.distanceCases(a.id, b.id));
      }
      // Attaque d'opportunité : la v1 compare les distances avant et après le glisser.
      for (const bouge of jetons) {
        const avant = { cx: bouge.cx, cy: bouge.cy };
        const apres = { cx: Math.max(0, bouge.cx + alea.entier(-2, 2)), cy: Math.max(0, bouge.cy + alea.entier(-2, 2)) };
        const attendus = bouge.genre === 'pj'
          ? []
          : jetons.filter((j) => j.genre === 'pj' && distanceCases(avant, j) <= 1 && distanceCases(apres, j) > 1).map((j) => j.id);
        expect(contactsPerdus(jetons, bouge, avant, apres)).toEqual(attendus);
      }
    });
  }
});
