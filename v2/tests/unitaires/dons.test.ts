import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { destinataires, donsEnAttente, libelleObjet } from '../../src/lib/dons/dons';
import { ajouterDuCatalogue, appliquer, recevoirObjet, RefusEquipement, retirerPourDon } from '../../src/lib/regles/equipement';
import { ficheDepuisV1 } from '../../src/lib/regles/fiche-document';
import type { FicheV1 } from '../../src/lib/regles/import-v1';
import type { Don } from '../../src/lib/schemas/don';
import { schemaDon } from '../../src/lib/schemas/don';
import type { Fiche } from '../../src/lib/schemas/fiche';

/*
 * Dons d'objets entre joueurs (lot L3.3) : un objet donné quitte un sac et
 * entre dans l'autre, sans se perdre ni se dupliquer.
 */

const FICHES: FicheV1[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, uid = 'u') => ficheDepuisV1(FICHES.find((f) => f.nom.startsWith(nom))!, uid, 1).fiche;
/** Nombre total d'unités d'un objet du catalogue dans le sac. */
const combien = (f: Fiche, id: string) =>
  Object.values(f.inventaire).filter((o) => o.id === id).reduce((n, o) => n + (typeof o.quantite === 'number' ? o.quantite : 1), 0);

describe('sortir un objet du sac pour le donner', () => {
  it('une partie d’une pile : la pile diminue, l’objet donné porte la quantité', () => {
    const k0 = reelle('Karlach');
    const ch = ajouterDuCatalogue(k0, 'potion_soin', 3);
    const k = appliquer(k0, ch);
    const cle = Object.keys(ch.inventaire)[0]!;
    const { changement, objet } = retirerPourDon(k, cle, 2);
    expect(objet).toMatchObject({ id: 'potion_soin', quantite: 2 });
    expect(changement.equipement).toEqual({});
    expect(changement.inventaire).toEqual({ [cle]: expect.objectContaining({ quantite: 1 }) });
  });

  it('toute la pile, ou un objet seul : la clé est retirée du sac', () => {
    const k0 = reelle('Karlach');
    const ch = ajouterDuCatalogue(k0, 'dague');
    const k = appliquer(k0, ch);
    const cle = Object.keys(ch.inventaire)[0]!;
    const { changement, objet } = retirerPourDon(k, cle);
    expect(changement.inventaire).toEqual({ [cle]: null });
    expect(objet.id).toBe('dague');
    expect(objet).not.toHaveProperty('quantite');
  });

  it('refus expliqués : objet absent (équipé ou déjà donné), quantité trop grande ou nulle', () => {
    const k0 = reelle('Karlach');
    const ch = ajouterDuCatalogue(k0, 'potion_soin', 2);
    const k = appliquer(k0, ch);
    const cle = Object.keys(ch.inventaire)[0]!;
    expect(() => retirerPourDon(k, 'introuvable')).toThrow('n’est plus dans le sac');
    expect(() => retirerPourDon(k, cle, 3)).toThrow('Tu n’en as que 2.');
    expect(() => retirerPourDon(k, cle, 0)).toThrow(RefusEquipement);
  });
});

describe('recevoir un objet', () => {
  it('un consommable rejoint la pile existante ; le reste prend une clé neuve', () => {
    const c0 = reelle('Kylhian');
    const c = appliquer(c0, ajouterDuCatalogue(c0, 'potion_soin', 1));
    const avant = combien(c, 'potion_soin');
    const recu = recevoirObjet(c, { id: 'potion_soin', nom: 'Potion de soin', type: 'consommable', quantite: 2 });
    expect(Object.keys(recu.inventaire)).toHaveLength(1);
    expect(c.inventaire).toHaveProperty(Object.keys(recu.inventaire)[0]!);
    expect(combien(appliquer(c, recu), 'potion_soin')).toBe(avant + 2);
    const dague = recevoirObjet(c, { id: 'dague', nom: 'Dague', type: 'arme' });
    const cle = Object.keys(dague.inventaire)[0]!;
    expect(c.inventaire).not.toHaveProperty(cle);
  });

  it('conservation : ce que le donneur perd, le receveur le gagne, ni plus ni moins', () => {
    const a0 = reelle('Karlach', 'alice');
    const b0 = reelle('Kylhian', 'carol');
    const ch = ajouterDuCatalogue(a0, 'potion_soin', 5);
    const a = appliquer(a0, ch);
    const b = appliquer(b0, ajouterDuCatalogue(b0, 'potion_soin', 1));
    const total = combien(a, 'potion_soin') + combien(b, 'potion_soin');
    const { changement, objet } = retirerPourDon(a, Object.keys(ch.inventaire)[0]!, 3);
    const apresA = appliquer(a, changement);
    const apresB = appliquer(b, recevoirObjet(b, objet));
    expect(combien(apresA, 'potion_soin')).toBe(combien(a, 'potion_soin') - 3);
    expect(combien(apresB, 'potion_soin')).toBe(combien(b, 'potion_soin') + 3);
    expect(combien(apresA, 'potion_soin') + combien(apresB, 'potion_soin')).toBe(total);
  });
});

describe('qui peut recevoir, et ce que le panneau montre', () => {
  const fiche = (id: string, nom: string, proprietaireUid: string) => ({ ...reelle('Karlach', proprietaireUid), id, nom });

  it('les personnages joués des autres joueurs, triés ; ni soi, ni un perso sans propriétaire cohérent', () => {
    const joueurs = [
      { id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'pa' },
      { id: 'carol', nom: 'Carol', rejointLe: 1, persoActif: 'pc' },
      { id: 'dan', nom: 'Dan', rejointLe: 1, persoActif: 'pd' },
      { id: 'eve', nom: 'Eve', rejointLe: 1 },
      { id: 'fred', nom: 'Fred', rejointLe: 1, persoActif: 'pa' },
    ];
    const persos = [fiche('pa', 'Aëlys', 'alice'), fiche('pc', 'Corvin', 'carol'), fiche('pd', 'Brann', 'dan')];
    expect(destinataires(joueurs, persos, 'alice')).toEqual([
      { uid: 'dan', perso: 'pd', nom: 'Brann', joueur: 'Dan' },
      { uid: 'carol', perso: 'pc', nom: 'Corvin', joueur: 'Carol' },
    ]);
  });

  it('libellé : nom et quantité au-delà de 1', () => {
    expect(libelleObjet({ nom: 'Potion de soins', quantite: 3 })).toBe('Potion de soins ×3');
    expect(libelleObjet({ nom: 'Dague' })).toBe('Dague');
    expect(libelleObjet({})).toBe('Objet');
  });

  it('en attente : reçus à accepter, proposés à annuler, refusés à reprendre ; le reste est réglé', () => {
    const d = (id: string, extra: Partial<Don>) => ({ id, ...schemaDon.parse({ deUid: 'alice', dePerso: 'pa', deNom: 'Aëlys', aUid: 'carol', aPerso: 'pc', aNom: 'Corvin', objet: { nom: 'x' }, statut: 'propose', creeLe: 1, resoluLe: null, ...extra }) });
    const dons = [
      d('d1', {}),
      d('d2', { deUid: 'carol', aUid: 'alice', creeLe: 3 }),
      d('d3', { deUid: 'carol', aUid: 'alice', creeLe: 2 }),
      d('d4', { statut: 'refuse', resoluLe: 2 }),
      d('d5', { statut: 'accepte', resoluLe: 2 }),
      d('d6', { deUid: 'carol', aUid: 'alice', statut: 'refuse', resoluLe: 2 }),
    ];
    const a = donsEnAttente(dons, 'alice');
    expect(a.entrants.map((x) => x.id)).toEqual(['d3', 'd2']);
    expect(a.sortants.map((x) => x.id)).toEqual(['d1']);
    expect(a.refuses.map((x) => x.id)).toEqual(['d4']);
  });

  it('schéma : un champ inconnu ou un statut inventé est refusé', () => {
    const base = { deUid: 'a', dePerso: 'pa', deNom: 'A', aUid: 'c', aPerso: 'pc', aNom: 'C', objet: { nom: 'x' }, statut: 'propose', creeLe: 1, resoluLe: null };
    expect(schemaDon.safeParse(base).success).toBe(true);
    expect(schemaDon.safeParse({ ...base, cadeau: true }).success).toBe(false);
    expect(schemaDon.safeParse({ ...base, statut: 'vole' }).success).toBe(false);
  });
});
