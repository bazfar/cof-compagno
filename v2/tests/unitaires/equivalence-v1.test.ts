import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CalculsPersonnage } from '../../src/lib/regles/calculs';
import { ficheV1VersCalcul } from '../../src/lib/regles/conversion-v1';
import { classes, constantes, dons, objets, races, sorts } from '../../src/lib/regles/donnees';

/*
 * ÉQUIVALENCE AVEC LA V1 (lot L1.3).
 *
 * Exécute le VRAI code v1 (js/personnage.js et ses dépendances, à la racine
 * du dépôt) et le port 2.0 (src/lib/regles/calculs.ts) sur les mêmes fiches,
 * puis compare chaque statistique. Tant que la v1 est la source des règles,
 * ce test garantit que la 2.0 calcule exactement pareil.
 *
 * Fiches : générées de façon reproductible (graine fixe) pour couvrir les
 * 10 classes, les 6 races, niveaux 1 à 12, équipements, états, mutations,
 * corruption, voies hors profil, Grimoire. Le lot L1.4 y ajoute les vraies
 * fiches de la table.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- code et données v1 non typés
type Brut = any;

const RACINE_V1 = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function chargerV1(): Record<string, Brut> {
  const contexte: Record<string, Brut> = { console, Math, JSON, Object, Array, Number, String, Date, Set, Map };
  contexte.window = contexte;
  createContext(contexte);
  for (const fichier of [
    'js/entite.js', 'js/formule.js', 'js/etats.js',
    'data/donnees.js', 'data/dons.js', 'data/mutations.js', 'js/personnage.js',
  ]) {
    const source = readFileSync(join(RACINE_V1, fichier), 'utf8')
      .replace(/^const (\w+)\s*=/gm, 'var $1 =')
      .replace(/^let (\w+)\s*=/gm, 'var $1 =')
      .replace(/^class (\w+)/gm, 'var $1 = class $1');
    runInContext(source, contexte, { filename: fichier });
  }
  return contexte;
}
const V1 = chargerV1();

// ---------- Générateur reproductible ----------
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
  const parmi = <T,>(liste: readonly T[]): T => liste[Math.floor(aleatoire() * liste.length)] as T;
  const proba = (p: number) => aleatoire() < p;
  return { entier, parmi, proba };
}

const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const;
const parType = (type: string) => objets.filter((o) => o.type === type);

function ficheSynthetique(n: number): Brut {
  const g = generateur(1000 + n);
  const classe = classes[n % classes.length]!;
  const race = races[Math.floor(n / classes.length) % races.length]!;
  const niveau = g.entier(1, 12);
  const caracs = Object.fromEntries(CARACS.map((c) => [c, g.entier(8, 18)]));

  // Voies : un rang max par voie, tous les rangs inférieurs pris (comme en jeu).
  const capacites: Brut[] = [];
  for (const voie of classe.voies) {
    const max = g.proba(0.6) ? g.entier(1, 5) : 0;
    for (let r = 1; r <= max; r++) {
      const c: Brut = { voie: voie.nom, rang: r };
      if (voie.id === 'guerrier.elite' && r === 1) c.choix = g.parmi(CARACS);
      if (voie.nom === 'Voie du chaos' && r === 4) c.choix = g.parmi(['def', 'reduction', 'degats']);
      capacites.push(c);
    }
  }
  const voiesHorsProfil: Brut[] = [];
  if (g.proba(0.3)) {
    const autre = g.parmi(classes.filter((k) => k.id !== classe.id));
    const voie = g.parmi(autre.voies.filter((v) => !classe.voies.some((x) => x.nom === v.nom)));
    voiesHorsProfil.push({ classe: autre.id, voie: voie.nom, cout: 2 });
    for (let r = 1; r <= g.entier(1, 4); r++) capacites.push({ voie: voie.nom, rang: r });
  }

  const capacitesRace = [1, 2, 3, 4, 5].filter(() => g.proba(0.5));
  const capacitesRaceChoix: Brut = {};
  if (race.id === 'humain') capacitesRaceChoix[4] = g.parmi(CARACS);
  if (race.id === 'demi_elfe' || race.id === 'demi_orc') capacitesRaceChoix[2] = g.parmi(CARACS);

  const idsDons = dons.map((d) => d.id);
  const donsPris = idsDons.filter(() => g.proba(0.12));
  const donsChoix: Brut = {};
  if (g.proba(0.3)) donsChoix.amelioration_carac = [g.parmi(CARACS)];
  if (g.proba(0.2)) donsChoix.athlete = g.parmi(CARACS);

  // Équipement : objets du catalogue, enrichis comme le fait la rareté en jeu.
  const enrichir = (o: Brut) => {
    const it = { ...o };
    if (g.proba(0.4)) it.bonusRarete = g.entier(0, 3);
    if (g.proba(0.15)) it.bonusDefSansArmure = g.entier(1, 2);
    if (g.proba(0.15)) it.bonusResistanceMentale = 1;
    if (g.proba(0.1)) it.bonusPvMax = g.entier(1, 6);
    if (g.proba(0.1)) it.reductionDegats = (it.reductionDegats || 0) + 1;
    if (g.proba(0.1)) it.bonusSauvegardes = { [g.parmi(['toutes', 'Reflexes', 'Vigueur', 'Volonte'])]: 1 };
    if (g.proba(0.08)) it.bonusSauvegardesVs = { [g.parmi(['magie', 'poison', 'corruption'])]: 2 };
    if (g.proba(0.08)) {
      it.formules = [{ cible: g.parmi(['DEF', 'initiative', 'carac', 'competence']), expr: 'floor(@player-coin/100)+@player-mod-dex', carac: g.parmi(CARACS), competence: 'Perception' }];
    }
    return it;
  };
  const equipement: Brut = {};
  if (g.proba(0.8)) equipement.torse = enrichir(g.parmi(parType('armure')));
  const armes = parType('arme');
  if (g.proba(0.85)) equipement.main_droite = enrichir(g.parmi(armes));
  if (equipement.main_droite?.deuxMains && g.proba(0.7)) equipement.main_gauche = equipement.main_droite;
  else if (g.proba(0.4)) equipement.main_gauche = enrichir(g.parmi(parType('bouclier')));
  else if (g.proba(0.4)) equipement.main_gauche = enrichir(g.parmi(armes));
  for (const o of parType('accessoire')) if (o.slot && !equipement[o.slot] && g.proba(0.06)) equipement[o.slot] = enrichir(o);
  if (g.proba(0.05)) equipement.botte = enrichir(g.parmi(parType('accessoire')));
  const inventaireListe: Brut[] = objets.filter((o) => o.grimoireClasses && g.proba(0.3)).map(enrichir);

  const etatsActifs: Brut[] = [];
  for (const cible of ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA', 'DEF', 'attaque', 'initiative', 'sauvegardes', 'Volonte', 'Reflexes', 'reduction_degats']) {
    if (g.proba(0.06)) etatsActifs.push({ idEtat: 'benie', bonus: { cible, valeur: g.entier(-2, 3) } });
  }
  if (g.proba(0.05)) etatsActifs.push({ idEtat: 'apogee_physique', carac: g.parmi(CARACS) });
  if (g.proba(0.05)) etatsActifs.push({ idEtat: 'ascension_chaotique' });
  if (g.proba(0.05)) etatsActifs.push({ idEtat: 'benie', bonus: { cible: 'sauvegardes', valeur: 2, vs: 'magie' } });

  const mutations = Array.from({ length: g.proba(0.3) ? g.entier(1, 3) : 0 }, () => {
    const palier = g.entier(1, 3);
    const d6 = g.entier(1, 6);
    return { palier, d6, nom: palier === 2 && d6 === 5 ? 'Troisième œil (fermé)' : 'mutation' };
  });

  const listeSorts = classe.id === 'pretre' ? 'pretre' : ['magicien', 'enchanteur', 'necromancien'].includes(classe.id) ? 'arcanique' : null;
  const connus = listeSorts ? sorts.filter((s) => s.listes.includes(listeSorts) && g.proba(0.15)).map((s) => s.id) : [];

  return {
    id: `synthetique-${n}`,
    nom: `Synthétique ${n}`,
    niveau,
    classe: classe.id,
    race: race.id,
    raceVariante: race.variantes.length ? g.parmi(race.variantes).code : null,
    caracs,
    capacites,
    capacitesRace,
    capacitesRaceChoix,
    voiesHorsProfil,
    dons: donsPris,
    donsChoix,
    bonusCompetences: g.proba(0.3) ? { Perception: 1 } : {},
    pvMax: g.entier(5, 80),
    pvActuel: g.proba(0.2) ? null : g.entier(0, 80),
    pvHistorique: Array.from({ length: niveau - 1 }, () => ({ total: g.entier(1, 12) })),
    equipement,
    inventaireListe,
    etatsActifs,
    mutations,
    corruptionCombat: g.entier(0, 6),
    corruptionMajeure: g.entier(0, 10),
    contratDemoniaquePenalite: g.proba(0.1) ? { carac: g.parmi(CARACS), valeur: 1 } : null,
    amesStockees: g.entier(0, 3),
    piecesOr: g.entier(0, 900),
    cercleSpecialisation: classe.id === 'pretre' ? g.parmi(['vie', 'foi', 'bannissement', 'jugement', null]) : null,
    grimoireSortsConnus: connus,
    grimoireSortsPrepares: connus.filter(() => g.proba(0.5)),
  };
}

// ---------- Comparaison ----------
const COMPETENCES = Object.entries(constantes.competencesParCarac).flatMap(([carac, liste]) =>
  liste.map((nom) => [nom, carac as (typeof CARACS)[number]] as const),
);
const CATEGORIES_SORTS = [...new Set(sorts.map((s) => s.categorie))];

/** Toutes les mesures comparées, avec leur calcul v1 et 2.0. */
function mesures(p1: Brut, p2: CalculsPersonnage): [string, unknown, unknown][] {
  const m: [string, unknown, unknown][] = [];
  const ajouter = (nom: string, v1: () => unknown, v2: () => unknown) => m.push([nom, v1(), v2()]);
  for (const c of CARACS) ajouter(`mod(${c})`, () => p1.mod(c), () => p2.mod(c));
  ajouter('calculerCA', () => p1.calculerCA(), () => p2.calculerCA());
  ajouter('dexEffectifCA', () => p1.dexEffectifCA(), () => p2.dexEffectifCA());
  ajouter('calculerInitiative', () => p1.calculerInitiative(), () => p2.calculerInitiative());
  ajouter('pvCalcule', () => p1.pvCalcule(), () => p2.pvCalcule());
  ajouter('calculerPPMax', () => p1.calculerPPMax(), () => p2.calculerPPMax());
  for (const t of ['contact', 'distance', 'lancer', 'magique']) ajouter(`bonusAttaque(${t})`, () => p1.bonusAttaque(t), () => p2.bonusAttaque(t));
  ajouter('degatsMagiques', () => p1.degatsMagiques(), () => p2.degatsMagiques());
  ajouter('degatsPoings', () => p1.degatsPoings(), () => p2.degatsPoings());
  for (const s of Object.keys(constantes.sauvegardes)) {
    for (const ctx of [null, 'magie', 'poison', 'corruption']) {
      ajouter(`modSauvegarde(${s}, ${ctx})`, () => p1.modSauvegarde(s, ctx), () => p2.modSauvegarde(s, ctx));
    }
  }
  for (const [nom, carac] of COMPETENCES) ajouter(`modCompetence(${nom})`, () => p1.modCompetence(nom, carac), () => p2.modCompetence(nom, carac));
  ajouter('reductionDegats', () => p1.reductionDegats(), () => p2.reductionDegats());
  ajouter('reductionDegatsNaturels', () => p1.reductionDegatsNaturels(), () => p2.reductionDegatsNaturels());
  ajouter('bonusReductionLourdeDons', () => p1.bonusReductionLourdeDons(), () => p2.bonusReductionLourdeDons());
  ajouter('estArmureNonMaitrisee', () => V1.Personnage.estArmureNonMaitrisee(p1), () => p2.estArmureNonMaitrisee());
  ajouter('pointsVoieTotal', () => p1.pointsVoieTotal(), () => p2.pointsVoieTotal());
  ajouter('pointsVoieDepenses', () => p1.pointsVoieDepenses(), () => p2.pointsVoieDepenses());
  ajouter('pointsVoieRestants', () => p1.pointsVoieRestants(), () => p2.pointsVoieRestants());
  ajouter('donsRequis', () => p1.donsRequis(), () => p2.donsRequis());
  ajouter('donsManquants', () => p1.donsManquants(), () => p2.donsManquants());
  ajouter('pointsBenedictionMax', () => p1.pointsBenedictionMax(), () => p2.pointsBenedictionMax());
  ajouter('pointsConvictionMax', () => p1.pointsConvictionMax(), () => p2.pointsConvictionMax());
  ajouter('pointsBannissementMax', () => p1.pointsBannissementMax(), () => p2.pointsBannissementMax());
  ajouter('pointsJugementMax', () => p1.pointsJugementMax(), () => p2.pointsJugementMax());
  ajouter('soinsMineurs', () => p1.soinsMineurs(), () => p2.soinsMineurs());
  ajouter('nombrePaliersMutationAtteints', () => p1.nombrePaliersMutationAtteints(), () => p2.nombrePaliersMutationAtteints());
  ajouter('aAtteintRupture', () => p1.aAtteintRupture(), () => p2.aAtteintRupture());
  ajouter('slotsGrimoire', () => p1.slotsGrimoire(), () => p2.slotsGrimoire());
  ajouter('grimoireSlotsOccupes', () => p1.grimoireSlotsOccupes(), () => p2.grimoireSlotsOccupes());
  ajouter('plafondInscriptionGrimoire', () => p1.plafondInscriptionGrimoire(), () => p2.plafondInscriptionGrimoire());
  ajouter('sortsGrimoireAccordes', () => [...p1.sortsGrimoireAccordes()], () => p2.sortsGrimoireAccordes());
  ajouter('idsGrimoireInscrits', () => [...p1.idsGrimoireInscrits()], () => p2.idsGrimoireInscrits());
  ajouter('idsGrimoireHorsPlafond', () => [...p1.idsGrimoireHorsPlafond()], () => p2.idsGrimoireHorsPlafond());
  ajouter('placeInscriptionLibre', () => p1.placeInscriptionLibre(), () => p2.placeInscriptionLibre());
  for (const id of p1.grimoireSortsConnus ?? []) {
    ajouter(`sortGrimoireADesEmplacements(${id})`, () => p1.sortGrimoireADesEmplacements(id), () => p2.sortGrimoireADesEmplacements(id));
  }
  for (const cat of CATEGORIES_SORTS) ajouter(`ecoleSortDebloquee(${cat})`, () => p1.ecoleSortDebloquee(cat), () => p2.ecoleSortDebloquee(cat));
  return m;
}

/** Écarts entre v1 et 2.0 pour une fiche v1. */
function ecartsAvecV1(ficheV1: Brut): string[] {
  const p1 = new V1.Personnage(JSON.parse(JSON.stringify(ficheV1)));
  const p2 = new CalculsPersonnage(ficheV1VersCalcul(JSON.parse(JSON.stringify(ficheV1))));
  const ecarts: string[] = [];
  for (const [nom, a, b] of mesures(p1, p2)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) ecarts.push(`${ficheV1.id} ${nom} : v1 ${JSON.stringify(a)} ≠ 2.0 ${JSON.stringify(b)}`);
  }
  return ecarts;
}

const NOMBRE_FICHES = 600;

/** Vraies fiches de la table, exportées et anonymisées par exporter_fiches_v1.js (lot L1.4). */
const FICHES_REELLES: Brut[] = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/fiches-v1.json'), 'utf8'),
).fiches;

describe('équivalence des calculs avec la v1', () => {
  it(`${NOMBRE_FICHES} fiches générées : toutes les statistiques identiques`, () => {
    const ecarts = Array.from({ length: NOMBRE_FICHES }, (_, n) => ecartsAvecV1(ficheSynthetique(n))).flat();
    expect(ecarts.slice(0, 20)).toEqual([]);
  });

  it.each(FICHES_REELLES.map((f) => [f.nom, f] as const))('fiche réelle « %s » : toutes les statistiques identiques', (_nom, fiche) => {
    expect(ecartsAvecV1(fiche)).toEqual([]);
  });

  it('le générateur couvre bien les cas qui comptent', () => {
    const fiches = Array.from({ length: NOMBRE_FICHES }, (_, n) => ficheSynthetique(n));
    const p = fiches.map((f) => new V1.Personnage(JSON.parse(JSON.stringify(f))));
    expect(new Set(fiches.map((f) => f.classe)).size).toBe(10);
    expect(new Set(fiches.map((f) => f.race)).size).toBe(6);
    expect(p.filter((x) => V1.Personnage.estArmureNonMaitrisee(x)).length).toBeGreaterThan(10);
    expect(fiches.filter((f) => f.voiesHorsProfil.length).length).toBeGreaterThan(50);
    expect(p.filter((x) => x.slotsGrimoire() > 0).length).toBeGreaterThan(20);
    expect(p.filter((x) => x.grimoireSlotsOccupes() > 0).length).toBeGreaterThan(10);
    expect(p.filter((x) => x.enCombatDeuxArmes()).length).toBeGreaterThan(10);
    expect(p.filter((x) => x.bonusFormuleEquipement('DEF') !== 0).length).toBeGreaterThan(3);
  });
});
