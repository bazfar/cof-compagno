import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { statistiquesFiche } from '../../src/lib/regles/calculs';
import {
  ajusterCarac,
  caracsDuBrouillon,
  changerNiveau,
  choisirClasse,
  choisirOptionRaciale,
  choixRaciauxRequis,
  donsRequis,
  effacerJetsPV,
  erreursCreation,
  ficheCalculDuBrouillon,
  ficheDepuisBrouillon,
  lancerJetPV,
  pointsVoie,
  prendreDon,
  RefusCreation,
  sortsAChoisir,
  type Brouillon,
} from '../../src/lib/regles/creation';
import { objetParId } from '../../src/lib/regles/donnees';
import { ficheCalculDepuisFiche, modulesV1 } from '../../src/lib/regles/fiche-document';
import {
  anciensChoixLisibles,
  brouillonDepuisV1,
  ErreurImportV1,
  lireExportV1,
  rafraichirObjet,
  reprendreAnciensChoix,
  type FicheV1,
} from '../../src/lib/regles/import-v1';

/*
 * Reprise des fiches v1 (lot L2.2c), éprouvée sur les 9 fiches réelles de
 * la table (tests/fixtures/fiches-v1.json, anonymisées). Décisions : voies,
 * capacités raciales, hors profil et dons rechoisis (5b) ; le reste reporté
 * tel quel, objets rafraîchis depuis le catalogue (15/10).
 */

const FIXTURE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/fiches-v1.json'), 'utf8');
const FICHES: FicheV1[] = JSON.parse(FIXTURE).fiches;
const fiche = (nom: string) => FICHES.find((f) => f.nom.startsWith(nom))!;

/** Complète ce que les nouvelles règles demandent en plus : choix raciaux, jets manquants, dons. */
function completer(b: Brouillon): Brouillon {
  let x = b;
  for (const [rang, options] of choixRaciauxRequis(x)) if (!x.capacitesRaceChoix[String(rang)]) x = choisirOptionRaciale(x, rang, options[0]!);
  while (x.jetsPV.length < x.niveau - 1) x = lancerJetPV(x, () => 0.5);
  for (const d of ['robuste', 'alerte', 'chanceux']) if (x.dons.length < donsRequis(x) && !x.dons.includes(d)) x = prendreDon(x, d);
  return x;
}

describe('lecture des exports v1', () => {
  it('fiche seule (bouton « Exporter » de la v1), liste, ou { fiches: [...] }', () => {
    expect(lireExportV1(FIXTURE)).toHaveLength(9);
    expect(lireExportV1(JSON.stringify(FICHES))).toHaveLength(9);
    expect(lireExportV1(JSON.stringify(FICHES[0]))).toHaveLength(1);
  });

  it('refus nommés : pas du JSON, classe inconnue, nom absent, caractéristiques retouchées hors règles', () => {
    expect(() => lireExportV1('pas du json')).toThrow('pas un export JSON');
    expect(() => lireExportV1(JSON.stringify({ ...FICHES[0], classe: 'paladin' }))).toThrow(`${FICHES[0]!.nom} : classe inconnue`);
    expect(() => lireExportV1(JSON.stringify({ ...FICHES[0], nom: '' }))).toThrow(ErreurImportV1);
    const retouchee = { ...FICHES[0], caracs: { ...FICHES[0]!.caracs, FOR: 18 } };
    expect(() => lireExportV1(JSON.stringify(retouchee))).toThrow('hors des règles de création');
  });
});

describe('objets rafraîchis depuis le catalogue (rareté, enchantement, matériau gardés)', () => {
  it('l’armure cloutée peu commune de Vhorgar : CA du catalogue actuel, rareté gardée, ancienne DEF retirée', () => {
    const v1 = fiche('Vhorgar').equipement.torse;
    expect(v1).toMatchObject({ id: 'armure_cloute', valeurArmure: 4, rarete: 'peu_commun' });
    const neuf = rafraichirObjet(v1);
    expect(neuf.valeurCA).toBe(objetParId.get('armure_cloute')!.valeurCA);
    expect(neuf).toMatchObject({ rarete: 'peu_commun', bonusRarete: 1 });
    expect(neuf).not.toHaveProperty('valeurArmure');
  });

  it('le grimoire de feu de Shyrion garde son matériau ; une quantité est gardée', () => {
    const s = fiche('Shyrion');
    const grimoire = [...Object.values(s.equipement ?? {}), ...(s.inventaireListe ?? [])].find((o) => (o as FicheV1 | null)?.materiau === 'feu') as FicheV1;
    expect(rafraichirObjet(grimoire)).toMatchObject({ id: 'grimoire', materiau: 'feu', materiauRang: 1 });
    expect(rafraichirObjet({ id: 'potion_soin', quantite: 2 } as never)).toMatchObject({ id: 'potion_soin', quantite: 2 });
  });

  it('un objet absent du catalogue (Forge du MJ) est gardé tel quel', () => {
    const forge = { id: 'lame_forgee_xyz', nom: 'Lame forgée', bonusCarac: { FOR: 1 } };
    expect(rafraichirObjet(forge)).toEqual(forge);
  });
});

describe.each(FICHES.map((f) => [f.nom, f] as const))('reprise de « %s »', (_nom, v1) => {
  const b = brouillonDepuisV1(v1, 'imp-1');

  it('identité, classe, race, niveau, caractéristiques et jets de PV repris, et verrouillés', () => {
    expect(b).toMatchObject({ nom: v1.nom.trim(), classe: v1.classe, race: v1.race, niveau: v1.niveau });
    expect(caracsDuBrouillon(b)).toEqual(v1.caracs);
    expect(b.jetsPV).toEqual((v1.pvHistorique ?? []).map((j: FicheV1) => j.jet));
    expect(() => choisirClasse(b, v1.classe === 'barde' ? 'guerrier' : 'barde')).toThrow(RefusCreation);
    expect(() => changerNiveau(b, v1.niveau + 1)).toThrow(RefusCreation);
    expect(() => ajusterCarac(b, 'FOR', 1)).toThrow(RefusCreation);
    expect(effacerJetsPV(b).jetsPV).toEqual(b.jetsPV); // les jets repris ne se relancent pas
  });

  it('voies, hors profil et dons laissés à rechoisir ; anciens choix gardés pour l’affichage', () => {
    expect(b).toMatchObject({ capacites: [], voiesHorsProfil: [], dons: [] });
    expect(b.reprise!.anciens.capacites).toHaveLength((v1.capacites ?? []).length);
    expect(anciensChoixLisibles(b.reprise!.anciens).voies.length).toBeGreaterThanOrEqual((v1.capacites ?? []).length);
  });

  it('« Reprendre mes anciens choix » : tout passe par les règles actuelles, rien n’est refusé', () => {
    const { brouillon, nonRepris } = reprendreAnciensChoix(b);
    expect(nonRepris).toEqual([]);
    expect(brouillon.capacites.length).toBe((v1.capacites ?? []).length);
    expect(pointsVoie(brouillon).restants).toBeGreaterThanOrEqual(0);
  });

  it('fiche créée : valeurs reportées telles quelles, PV et PP actuels dans les nouveaux maximums', () => {
    const final = completer(reprendreAnciensChoix(b).brouillon);
    expect(erreursCreation(final)).toEqual([]);
    const f = ficheDepuisBrouillon(final, 'uid-joueur', 1);
    expect(f).toMatchObject({
      piecesOr: v1.piecesOr ?? 0, piecesArgent: v1.piecesArgent ?? 0, piecesBronze: v1.piecesBronze ?? 0,
      corruptionMajeure: v1.corruptionMajeure ?? 0, amesStockees: v1.amesStockees ?? 0, corruptionCombat: 0, etatsActifs: [],
    });
    expect(f.mutations ?? null).toEqual(v1.mutations ?? null);
    expect(f.grimoireSortsConnus.slice(0, (v1.grimoireSortsConnus ?? []).length)).toEqual(v1.grimoireSortsConnus ?? []);
    expect(f.modules).toEqual(JSON.parse(JSON.stringify(modulesV1(v1))));
    expect(Object.keys(f.inventaire)).toHaveLength((v1.inventaireListe ?? []).length);
    expect(f.pvActuel).toBe(Math.min(v1.pvActuel ?? f.pvMax, f.pvMax));
    expect(f.pvActuel!).toBeLessThanOrEqual(f.pvMax);
    expect(statistiquesFiche(ficheCalculDepuisFiche(f))).toEqual(statistiquesFiche(ficheCalculDuBrouillon(final)));
  });
});

describe('ce que la reprise change pour la table (à annoncer aux joueurs)', () => {
  const repris = (nom: string) => reprendreAnciensChoix(brouillonDepuisV1(fiche(nom), 'i')).brouillon;

  it('Vhorgar : son rang racial 2 payé en v1 est rendu (voie raciale gratuite), puis repris au niveau 3', () => {
    expect(repris('Vhorgar').reprise!.anciens.capacitesRace).toEqual([1, 2]);
    expect(pointsVoie(repris('Vhorgar')).restants).toBe(1);
  });

  it('Kylhian : deux jets de PV jamais lancés en v1 sont exigés (niveaux 3 et 4)', () => {
    expect(erreursCreation(repris('Kylhian'))).toContain('Lance les PV des niveaux 2 à 4.');
    expect(repris('Kylhian').jetsPV).toHaveLength(1);
  });

  it('Magnus : le don du niveau 4, jamais choisi en v1, est exigé', () => {
    expect(erreursCreation(repris('Magnus'))).toContain('Choisis 1 don(s).');
  });

  it('Hyrma et Shyrion : le nouveau rang racial 2 demande son choix (Sang de Guerre, Sang Mêlé)', () => {
    expect(erreursCreation(repris('Hyrma'))).toContain('Fais le choix du rang racial 2.');
    expect(erreursCreation(repris('Shyrion'))).toContain('Fais le choix du rang racial 2.');
  });

  it('Kylhian garde ses 6 sorts connus, au-delà du plafond, mais n’en apprend pas d’autre', () => {
    const k = repris('Kylhian');
    expect(sortsAChoisir(k)).toBeLessThan(0);
    expect(erreursCreation(k)).not.toContain('Trop de sorts appris pour ce niveau.');
  });

  it('les armures rafraîchies relèvent la CA (anciennes armures comptées comme des vêtements en v1)', () => {
    const avant = statistiquesFiche(ficheCalculDuBrouillon({ ...repris('Karlach'), reprise: null, equipementManuel: fiche('Karlach').equipement }));
    expect(statistiquesFiche(ficheCalculDuBrouillon(repris('Karlach'))).ca).toBeGreaterThan(avant.ca);
  });
});
