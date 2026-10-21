import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { statistiquesFiche } from '../../src/lib/regles/calculs';
import { ficheV1VersCalcul } from '../../src/lib/regles/conversion-v1';
import {
  CHAMPS_V1_ABANDONNES,
  ficheCalculDepuisFiche,
  ficheDepuisV1,
  inventaireEnDictionnaire,
  versFirestore,
} from '../../src/lib/regles/fiche-document';
import { schemaFiche, schemaFicheV1 } from '../../src/lib/schemas/fiche';

/*
 * La fiche dans Firestore (lot L2.1), éprouvée sur les 9 fiches réelles de
 * la table (tests/fixtures/fiches-v1.json, anonymisées).
 *
 * Garde-fous contre le bug v1 de `versJSON` (champs effacés à chaque
 * sauvegarde) : aucun champ v1 ne disparaît sans être sur la liste des
 * abandons décidés ; le document survit à un aller-retour par Firestore
 * (JSON, pas de tableau dans un tableau) ; et il se calcule EXACTEMENT
 * comme la fiche v1, une fois les abandons appliqués.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fiches v1 non typées
type Brut = any;
const FICHES: Brut[] = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/fiches-v1.json'), 'utf8'),
).fiches;

/** Ce que la v1 aurait calculé après les abandons de l'import (état de combat remis à zéro). */
function v1SansAbandons(v1: Brut): Brut {
  const copie = structuredClone(v1);
  for (const champ of CHAMPS_V1_ABANDONNES) delete copie[champ];
  return copie;
}

describe.each(FICHES.map((f) => [f.nom, f] as const))('fiche réelle « %s »', (_nom, v1) => {
  const { fiche } = ficheDepuisV1(v1, 'uid-joueur', 1);

  it('passe le schéma et survit à un aller-retour par Firestore', () => {
    const relue = schemaFiche.parse(JSON.parse(JSON.stringify(versFirestore(fiche))));
    expect(relue).toEqual(fiche);
  });

  it('aucun champ v1 perdu : repris, rangé dans « modules », ou abandonné sur décision', () => {
    const abandonnes = new Set<string>(CHAMPS_V1_ABANDONNES);
    const copie = JSON.stringify(fiche);
    for (const [cle, valeur] of Object.entries(v1)) {
      if (valeur === undefined || valeur === null || abandonnes.has(cle) || cle === 'id' || cle === 'inventaireListe') continue;
      const retrouve = cle in fiche || cle in fiche.modules || cle.startsWith('points') || cle === 'portrait' || cle === 'illustration';
      expect(retrouve, `champ v1 « ${cle} »`).toBe(true);
    }
    // L'inventaire garde chaque objet, doublons compris.
    expect(Object.keys(fiche.inventaire)).toHaveLength((v1.inventaireListe ?? []).length);
    expect(copie.length).toBeGreaterThan(0);
  });

  it('valeurs reportées telles quelles (cadrage : « Reporté tel quel »)', () => {
    for (const champ of ['nom', 'niveau', 'pvMax', 'pvActuel', 'piecesOr', 'piecesArgent', 'piecesBronze', 'corruptionMajeure', 'amesStockees', 'ppActuel']) {
      if (v1[champ] !== undefined && v1[champ] !== null) expect((fiche as Brut)[champ], champ).toEqual(v1[champ]);
    }
    expect(fiche.pvHistorique).toEqual(v1.pvHistorique ?? []);
    expect(fiche.grimoireSortsConnus).toEqual(v1.grimoireSortsConnus ?? []);
    expect(Object.values(fiche.inventaire)).toEqual(v1.inventaireListe ?? []);
  });

  it('progression et Vécu réservés, vides (cadrage, décidé le 16/10)', () => {
    expect(fiche.progression).toEqual({ crans: 0 });
    expect(fiche.vecu).toEqual({ crans: 0, paliers: 0, points: 0, noeuds: [], noeudOffert: null });
    expect(fiche.usages).toEqual({});
  });

  it('statistiques identiques à la v1 (abandons appliqués)', () => {
    expect(statistiquesFiche(ficheCalculDepuisFiche(fiche))).toEqual(statistiquesFiche(ficheV1VersCalcul(v1SansAbandons(v1))));
  });
});

describe('outils de la fiche', () => {
  it('inventaire : une clé par objet, doublons suffixés', () => {
    const dico = inventaireEnDictionnaire([{ id: 'potion_soin' }, { id: 'potion_soin' }, { id: 'corde' }, { nom: 'Babiole' }]);
    expect(Object.keys(dico)).toEqual(['potion_soin', 'potion_soin~2', 'corde', 'objet']);
  });

  it('Firestore : undefined retiré, tableau dans un tableau refusé avec son chemin', () => {
    expect(versFirestore({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect(() => versFirestore({ modules: { carte: [[1, 2]] } })).toThrow('fiche.modules.carte[0] : tableau dans un tableau');
  });

  it("une fiche dont une voie n'existe plus est refusée, pas tronquée", () => {
    const v1 = { ...FICHES[0], capacites: [{ voie: 'Voie inventée', rang: 1 }] };
    expect(() => ficheDepuisV1(v1, 'u', 1)).toThrow('introuvable');
  });

  it('le schéma refuse un champ inconnu et une version future', () => {
    const { fiche } = ficheDepuisV1(FICHES[0], 'u', 1);
    expect(schemaFicheV1.strict().safeParse({ ...fiche, def: 14 }).success).toBe(false);
    expect(schemaFiche.safeParse({ ...fiche, schemaVersion: 2 }).success).toBe(false);
  });
});
