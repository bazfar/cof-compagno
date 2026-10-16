import { progressionVierge, schemaFiche, VERSION_FICHE, type Fiche, type ObjetFiche } from '../schemas/fiche.ts';
import { CalculsPersonnage, decouperCapacite } from './calculs.ts';
import { classeParId, constantes, donParId, equipementDepart, objetParId, raceParId, sorts, voieParId } from './donnees.ts';
import { inventaireEnDictionnaire, versFirestore } from './fiche-document.ts';
import type { CapaciteChoisie, Carac, FicheCalcul } from './fiche-calcul.ts';

/*
 * Règles de l'assistant de création (lot L2.2a), en fonctions pures.
 *
 * Reprises de l'assistant v1 (js/app.js, nouvelleCreation…sauverPersonnage),
 * avec les mêmes nombres, et les décisions du 16/10 :
 *   1a  les bugs de l'assistant v1 sont corrigés (voir « Bugs v1 corrigés ») ;
 *   2a  au-dessus du niveau 1, un jet de PV par niveau, tous obligatoires,
 *       avec le modificateur de CON EFFECTIF (bonus raciaux compris), comme
 *       au niveau 1 ;
 *   3a  dons des niveaux 4, 8 et 12, sorts et Cercle du Prêtre se
 *       choisissent dans l'assistant : le personnage en sort complet ;
 *   4b  la voie raciale est GRATUITE et ses rangs arrivent d'office :
 *       rang 1 au niveau 1, puis un rang tous les 2 niveaux (2 au niveau 3,
 *       3 au 5, 4 au 7, 5 au 9). Seuls les choix qu'ils demandent
 *       (Ambition, Sang Mêlé, Sang de Guerre, nation elfique) restent au
 *       joueur. C'est un CHANGEMENT de règle par rapport à la v1.
 *   Polyvalence (Humain, rang 3, décidé le 16/10, L2.2b) : un rang GRATUIT
 *       dans une voie de classe, au choix du joueur, dans l'ordre des
 *       rangs, quel que soit son coût (v1 : aucun effet). Il est marqué
 *       `offert` sur la fiche.
 *
 * Les calculs eux-mêmes (modificateurs, PV, CA…) restent ceux du port v1
 * (calculs.ts), qu'on ne touche pas ici.
 *
 * Bugs v1 corrigés (1a) : le niveau n'était pas pris en compte dans les
 * bonus de PV par niveau (Nain, Demi-orc, Élite, Robuste) ; le jet de PV
 * des niveaux suivants utilisait la CON brute ; le kit de départ écrasait
 * l'équipement mis à la main ; un déblocage hors profil ne pouvait pas être
 * annulé ; baisser le niveau laissait des points dépensés en trop et la
 * sauvegarde l'acceptait ; le brouillon n'était jamais remis à zéro (écran,
 * L2.2b).
 *
 * Le brouillon est un objet simple et immuable : chaque fonction qui le
 * modifie en rend un nouveau, ou une erreur expliquée.
 */

// ---------------------------------------------------------------- Brouillon

export interface Brouillon {
  nom: string;
  genre: 'homme' | 'femme';
  classe: string | null;
  race: string | null;
  /** Nation elfique (code : aetharion, aelindra, mordanel), exigée dès le rang racial 3. */
  raceVariante: string | null;
  niveau: number;
  /** Points libres par caractéristique (0 à 3, 6 en tout). */
  caracsLibres: Partial<Record<Carac, number>>;
  /** Rangs des voies de classe et des voies hors profil. */
  capacites: CapaciteChoisie[];
  capacitesRaceChoix: Record<string, string>;
  voiesHorsProfil: { voie: string; cout: number }[];
  /** Dé brut tiré pour chaque niveau au-dessus du 1 (index 0 = niveau 2). */
  jetsPV: number[];
  dons: string[];
  donsChoix: Record<string, unknown>;
  /** Sorts appris (hors sorts accordés par les voies et le Cercle). */
  sorts: string[];
  cercleSpecialisation: string | null;
  /** Équipement mis à la main en plus du kit (v1 : le kit l'écrasait). */
  equipementManuel: Partial<Record<string, ObjetFiche | null>>;
}

export const NIVEAU_MAX = 20;
export const CARACS_LIBRES_TOTAL = 6;
export const CARACS_LIBRES_MAX_PAR_CARAC = 3;
const CARACS_BASE = 10;
const CARACS_CODES = constantes.caracs.map((c) => c.code) as Carac[];

export function brouillonVide(): Brouillon {
  return {
    nom: '',
    genre: 'homme',
    classe: null,
    race: null,
    raceVariante: null,
    niveau: 1,
    caracsLibres: {},
    capacites: [],
    capacitesRaceChoix: {},
    voiesHorsProfil: [],
    jetsPV: [],
    dons: [],
    donsChoix: {},
    sorts: [],
    cercleSpecialisation: null,
    equipementManuel: {},
  };
}

/** Refus d'un geste, avec la phrase montrée au joueur. */
export class RefusCreation extends Error {}

// ------------------------------------------------------- Identité et niveau

/**
 * Changer de classe repart de zéro sur ce qui en dépend : voies, déblocages
 * hors profil, sorts, Cercle (v1 gardait voies hors profil et PV payés).
 */
export function choisirClasse(b: Brouillon, classe: string): Brouillon {
  if (!classeParId.has(classe)) throw new RefusCreation(`Classe inconnue : ${classe}`);
  if (b.classe === classe) return b;
  return { ...b, classe, capacites: [], voiesHorsProfil: [], sorts: [], cercleSpecialisation: null, jetsPV: [] };
}

/** Changer de race efface la nation et les choix raciaux. */
export function choisirRace(b: Brouillon, race: string): Brouillon {
  if (!raceParId.has(race)) throw new RefusCreation(`Race inconnue : ${race}`);
  if (b.race === race) return b;
  return sansOffertPerdu({ ...b, race, raceVariante: null, capacitesRaceChoix: {} });
}

/**
 * Niveau de création. Baisser le niveau retire les jets de PV en trop, les
 * dons en trop et les choix raciaux devenus inaccessibles ; les voies, elles,
 * restent, et la validation signale les points dépensés en trop (v1 : rien).
 */
export function changerNiveau(b: Brouillon, niveau: number): Brouillon {
  const n = Math.max(1, Math.min(NIVEAU_MAX, Math.round(niveau)));
  const rangMax = rangRaceMax(n);
  const choix = Object.fromEntries(Object.entries(b.capacitesRaceChoix).filter(([r]) => Number(r) <= rangMax));
  const dons = b.dons.slice(0, CalculsPersonnage.donsRequisPourNiveau(n));
  const donsChoix = Object.fromEntries(Object.entries(b.donsChoix).filter(([d]) => dons.includes(d)));
  return sansOffertPerdu({ ...b, niveau: n, jetsPV: b.jetsPV.slice(0, n - 1), capacitesRaceChoix: choix, dons, donsChoix });
}

/**
 * Quand Polyvalence n'est plus acquise (niveau baissé, autre race), le rang
 * offert redevient un rang payé : il garde sa place dans l'ordre de sa
 * voie, et la validation signale s'il dépasse le budget.
 */
function sansOffertPerdu(b: Brouillon): Brouillon {
  if (polyvalenceAcquise(b) || !b.capacites.some((c) => c.offert)) return b;
  return { ...b, capacites: b.capacites.map(({ offert: _o, ...c }) => c) };
}

// ----------------------------------------------------- Caractéristiques

/** v1 bonusClasseCarac : +2 et +1 fixes selon la classe. */
export function bonusClasseCarac(classe: string | null, c: Carac): number {
  const bonus = classe ? constantes.bonusCaracsClasse[classe] : undefined;
  if (!bonus) return 0;
  return (bonus.plus2 === c ? 2 : 0) + (bonus.plus1 === c ? 1 : 0);
}

/** Valeurs stockées : base 10 + classe + points libres (les bonus raciaux se calculent à part, comme en v1). */
export function caracsDuBrouillon(b: Brouillon): Record<Carac, number> {
  return Object.fromEntries(
    CARACS_CODES.map((c) => [c, CARACS_BASE + bonusClasseCarac(b.classe, c) + (b.caracsLibres[c] ?? 0)]),
  ) as Record<Carac, number>;
}

export function pointsCaracsRestants(b: Brouillon): number {
  return CARACS_LIBRES_TOTAL - CARACS_CODES.reduce((t, c) => t + (b.caracsLibres[c] ?? 0), 0);
}

export function ajusterCarac(b: Brouillon, c: Carac, delta: 1 | -1): Brouillon {
  const actuel = b.caracsLibres[c] ?? 0;
  const suivant = actuel + delta;
  if (suivant < 0) throw new RefusCreation('Aucun point libre à retirer sur cette caractéristique.');
  if (suivant > CARACS_LIBRES_MAX_PAR_CARAC) throw new RefusCreation(`Au plus +${CARACS_LIBRES_MAX_PAR_CARAC} par caractéristique.`);
  if (delta > 0 && pointsCaracsRestants(b) <= 0) throw new RefusCreation('Plus de points libres.');
  return { ...b, caracsLibres: { ...b.caracsLibres, [c]: suivant } };
}

// ----------------------------------------------------------- Voie raciale

/** Décision 4b : rang 1 au niveau 1, puis un rang tous les 2 niveaux (3, 5, 7, 9). */
export function rangRaceMax(niveau: number): number {
  return Math.min(5, 1 + Math.floor((Math.max(1, niveau) - 1) / 2));
}

/** Rangs raciaux acquis d'office au niveau du brouillon (aucun sans race). */
export function capacitesRaceDuBrouillon(b: Brouillon): number[] {
  if (!b.race) return [];
  return Array.from({ length: rangRaceMax(b.niveau) }, (_, i) => i + 1);
}

/** Rangs raciaux à choix (v1 RACE_CAPACITES_A_CHOIX), clé `race|rang`. */
export const CHOIX_RACIAUX: Record<string, readonly Carac[]> = {
  'humain|4': CARACS_CODES, // Ambition : +2 sur une caractéristique au choix
  'demi_elfe|2': ['DEX', 'CHA'], // Sang Mêlé
  'demi_orc|2': ['FOR', 'CON'], // Sang de Guerre
};

/** Choix raciaux que le niveau du brouillon rend nécessaires : [rang, options]. */
export function choixRaciauxRequis(b: Brouillon): [number, readonly Carac[]][] {
  if (!b.race) return [];
  return capacitesRaceDuBrouillon(b)
    .map((r) => [r, CHOIX_RACIAUX[`${b.race}|${r}`]] as const)
    .filter((e): e is readonly [number, readonly Carac[]] => !!e[1])
    .map(([r, o]) => [r, o]);
}

export function choisirOptionRaciale(b: Brouillon, rang: number, option: string): Brouillon {
  const requis = choixRaciauxRequis(b).find(([r]) => r === rang);
  if (!requis || !requis[1].includes(option as Carac)) throw new RefusCreation('Ce choix racial n’est pas proposé.');
  return { ...b, capacitesRaceChoix: { ...b.capacitesRaceChoix, [String(rang)]: option } };
}

/** La nation elfique est demandée dès que le rang 3 est acquis (il en dépend). */
export function varianteRequise(b: Brouillon): boolean {
  const race = b.race ? raceParId.get(b.race) : undefined;
  return !!race && race.variantes.length > 0 && rangRaceMax(b.niveau) >= 3;
}

/** Polyvalence (Humain, rang 3) : un rang offert dans une voie de classe. */
export function polyvalenceAcquise(b: Brouillon): boolean {
  return b.race === 'humain' && rangRaceMax(b.niveau) >= 3;
}

/** Le rang offert déjà choisi, s'il y en a un. */
export function rangOffert(b: Brouillon): CapaciteChoisie | null {
  return b.capacites.find((c) => c.offert) ?? null;
}

export function choisirVariante(b: Brouillon, code: string | null): Brouillon {
  const race = b.race ? raceParId.get(b.race) : undefined;
  if (code !== null && !race?.variantes.some((v) => v.code === code)) throw new RefusCreation('Nation inconnue pour cette race.');
  return { ...b, raceVariante: code };
}

// ------------------------------------------------- Voies et points de voie

/** v1 CAPACITES_A_CHOIX : capacités qui demandent un choix définitif, et ses valeurs stockées. */
export const CHOIX_CAPACITES: Record<string, readonly string[]> = {
  'chevalier.chaos.4': ['def', 'degats'], // Marque du serment brisé
  'guerrier.elite.1': ['FOR', 'DEX', 'CON'], // Spécimen d'élite
  'necromancien.chaos.4': ['reduction', 'degats'], // Symbiose du chaos
  'magicien.chaos.4': ['degats', 'reduction'], // Esprit fissuré
};

export interface PointsVoie {
  total: number;
  depenses: number;
  /** Négatif quand on a dépensé trop (niveau baissé) : la validation le refuse. */
  restants: number;
}

/**
 * Points de voie : 2 par niveau. Coût d'un rang : 1 (rangs 1-2) ou 2
 * (rangs 3-5) ; déblocage hors profil : son coût. La voie raciale ne coûte
 * rien (décision 4b).
 */
export function pointsVoie(b: Brouillon): PointsVoie {
  const total = 2 * b.niveau;
  const depenses = b.capacites.reduce((t, c) => t + (c.offert ? 0 : CalculsPersonnage.coutRangVoie(decouperCapacite(c.id).rang)), 0)
    + b.voiesHorsProfil.reduce((t, h) => t + h.cout, 0);
  return { total, depenses, restants: total - depenses };
}

/** Voies où le brouillon peut acheter des rangs : celles de sa classe, puis les hors profil débloquées. */
export function voiesOuvertes(b: Brouillon): string[] {
  const classe = b.classe ? classeParId.get(b.classe) : undefined;
  return [...(classe?.voies.map((v) => v.id) ?? []), ...b.voiesHorsProfil.map((h) => h.voie)];
}

export function rangMaxDansVoie(b: Brouillon, idVoie: string): number {
  return b.capacites.reduce((m, c) => {
    const { voie, rang } = decouperCapacite(c.id);
    return voie === idVoie ? Math.max(m, rang) : m;
  }, 0);
}

/**
 * Acheter le rang suivant d'une voie (ordre obligatoire, v1). Avec
 * `offert`, c'est le rang gratuit de Polyvalence : voie de classe
 * seulement, un seul par personnage.
 */
export function prendreRang(b: Brouillon, idVoie: string, rang: number, choix?: string, offert = false): Brouillon {
  if (!voiesOuvertes(b).includes(idVoie)) throw new RefusCreation('Cette voie n’est pas ouverte à ce personnage.');
  if (rang !== rangMaxDansVoie(b, idVoie) + 1 || rang > 5) throw new RefusCreation('Les rangs s’acquièrent dans l’ordre.');
  if (offert) {
    if (!polyvalenceAcquise(b)) throw new RefusCreation('Seul un Humain doté de Polyvalence reçoit un rang offert.');
    if (rangOffert(b)) throw new RefusCreation('Le rang offert par Polyvalence est déjà choisi.');
    if (!classeParId.get(b.classe ?? '')?.voies.some((v) => v.id === idVoie)) throw new RefusCreation('Polyvalence offre un rang dans une voie de ta classe.');
  } else if (pointsVoie(b).restants < CalculsPersonnage.coutRangVoie(rang)) {
    throw new RefusCreation('Pas assez de points de capacité.');
  }
  const id = `${idVoie}.${rang}`;
  const options = CHOIX_CAPACITES[id];
  if (options && (choix === undefined || !options.includes(choix))) throw new RefusCreation('Cette capacité demande un choix.');
  if (!options && choix !== undefined) throw new RefusCreation('Cette capacité ne demande aucun choix.');
  const capacite: CapaciteChoisie = { id, ...(choix === undefined ? {} : { choix }), ...(offert ? { offert: true as const } : {}) };
  return { ...b, capacites: [...b.capacites, capacite] };
}

/** Retirer le rang le plus haut d'une voie (v1 : refusé s'il existe un rang supérieur). */
export function retirerRang(b: Brouillon, idVoie: string, rang: number): Brouillon {
  if (rang !== rangMaxDansVoie(b, idVoie)) throw new RefusCreation('Retire d’abord les rangs supérieurs de cette voie.');
  return { ...b, capacites: b.capacites.filter((c) => c.id !== `${idVoie}.${rang}`) };
}

/**
 * Coût d'un déblocage hors profil (v1 coutDeblocageHorsProfil) : 2 points
 * dans la même famille de classe, 4 sinon ; 0 une fois avec le don Initié
 * aux arcanes pour une voie de classe à magie d'INT.
 */
export function coutHorsProfil(b: Brouillon, idVoie: string): number {
  const cible = voieParId.get(idVoie)?.classe;
  if (!cible || !b.classe) return 4;
  if (b.dons.includes('initie_arcanes') && constantes.caracMagie[cible] === 'INT' && !b.voiesHorsProfil.some((h) => h.cout === 0)) return 0;
  return constantes.familleClasse[cible] === constantes.familleClasse[b.classe] ? 2 : 4;
}

/** Voies d'autres classes proposées hors profil (jamais une Voie du chaos). */
export function voiesHorsProfilProposees(b: Brouillon): string[] {
  if (!b.classe) return [];
  const ouvertes = new Set(voiesOuvertes(b));
  return [...voieParId.values()]
    .filter((v) => v.classe !== b.classe && !v.speciale && classeParId.has(v.classe) && !ouvertes.has(v.id))
    .map((v) => v.id);
}

export function debloquerHorsProfil(b: Brouillon, idVoie: string): Brouillon {
  if (!voiesHorsProfilProposees(b).includes(idVoie)) throw new RefusCreation('Cette voie ne peut pas être débloquée.');
  const cout = coutHorsProfil(b, idVoie);
  if (pointsVoie(b).restants < cout) throw new RefusCreation('Pas assez de points de capacité.');
  return { ...b, voiesHorsProfil: [...b.voiesHorsProfil, { voie: idVoie, cout }] };
}

/** Annuler un déblocage (v1 : impossible) : seulement s'il n'y a plus aucun rang dans la voie. */
export function annulerHorsProfil(b: Brouillon, idVoie: string): Brouillon {
  if (rangMaxDansVoie(b, idVoie) > 0) throw new RefusCreation('Retire d’abord les rangs pris dans cette voie.');
  return { ...b, voiesHorsProfil: b.voiesHorsProfil.filter((h) => h.voie !== idVoie) };
}

// ------------------------------------------------------------------- Dons

export function donsRequis(b: Brouillon): number {
  return CalculsPersonnage.donsRequisPourNiveau(b.niveau);
}

/** Affinités raciales (v1 AFFINITES_RACE_CARAC) : le plafond d'Amélioration y est 20 au lieu de 18. */
const AFFINITES_RACE: Record<string, readonly Carac[]> = {
  elfe: ['INT', 'DEX'],
  nain: ['CON', 'FOR'],
  demi_orc: ['CON', 'FOR'],
  demi_gobelin: ['DEX', 'INT'],
};
export function plafondAmelioration(b: Brouillon, c: Carac): number {
  return b.race && AFFINITES_RACE[b.race]?.includes(c) ? 20 : 18;
}

/**
 * Prendre un don (aucun prérequis, comme en v1). Choix : Amélioration de
 * caractéristique = deux caractéristiques différentes, sous leur plafond
 * (valeur stockée, comme en v1) ; Athlète = FOR ou DEX.
 */
export function prendreDon(b: Brouillon, idDon: string, choix?: unknown): Brouillon {
  if (!donParId.has(idDon)) throw new RefusCreation(`Don inconnu : ${idDon}`);
  if (b.dons.includes(idDon)) throw new RefusCreation('Don déjà pris.');
  if (b.dons.length >= donsRequis(b)) throw new RefusCreation('Aucun don à choisir à ce niveau.');
  if (idDon === 'amelioration_carac') {
    const caracs = caracsDuBrouillon(b);
    const ok = Array.isArray(choix) && choix.length === 2 && choix[0] !== choix[1]
      && choix.every((c) => CARACS_CODES.includes(c as Carac) && caracs[c as Carac] < plafondAmelioration(b, c as Carac));
    if (!ok) throw new RefusCreation('Choisis deux caractéristiques différentes, sous leur plafond.');
  } else if (idDon === 'athlete') {
    if (choix !== 'FOR' && choix !== 'DEX') throw new RefusCreation('Athlète : choisis FOR ou DEX.');
  } else if (choix !== undefined) {
    throw new RefusCreation('Ce don ne demande aucun choix.');
  }
  return {
    ...b,
    dons: [...b.dons, idDon],
    donsChoix: choix === undefined ? b.donsChoix : { ...b.donsChoix, [idDon]: choix },
  };
}

export function retirerDon(b: Brouillon, idDon: string): Brouillon {
  const { [idDon]: _retire, ...donsChoix } = b.donsChoix;
  const voiesHorsProfil = idDon === 'initie_arcanes' ? b.voiesHorsProfil.filter((h) => h.cout !== 0) : b.voiesHorsProfil;
  const retirees = new Set(b.voiesHorsProfil.filter((h) => !voiesHorsProfil.includes(h)).map((h) => h.voie));
  const capacites = b.capacites.filter((c) => !retirees.has(decouperCapacite(c.id).voie));
  return { ...b, dons: b.dons.filter((d) => d !== idDon), donsChoix, voiesHorsProfil, capacites };
}

// ------------------------------------------------- Fiche de calcul provisoire

/** Kit de départ de la classe (v1 appliquerEquipementDepart), complété par l'équipement mis à la main. */
export function kitDepart(classe: string | null): { equipement: Record<string, ObjetFiche | null>; inventaire: ObjetFiche[] } {
  const kit = classe ? equipementDepart[classe] : undefined;
  const equipement: Record<string, ObjetFiche | null> = {};
  const inventaire: ObjetFiche[] = [];
  if (!kit) return { equipement, inventaire };
  const copie = (id: string | null | undefined): ObjetFiche | null => {
    const o = id ? objetParId.get(id) : undefined;
    return o ? (structuredClone(o) as ObjetFiche) : null;
  };
  const arme = copie(kit.arme);
  if (arme) {
    equipement.main_droite = arme;
    if (arme.deuxMains) equipement.main_gauche = arme; // même objet dans les deux mains, comme Personnage.equiper()
  }
  if (!equipement.main_gauche) {
    const bouclier = copie(kit.bouclier);
    if (bouclier) equipement.main_gauche = bouclier;
  }
  const armure = copie(kit.armure);
  if (armure) equipement.torse = armure;
  for (const id of [kit.accessoire, ...kit.consommables]) {
    const o = copie(id);
    if (o) inventaire.push(o);
  }
  return { equipement, inventaire };
}

/** L'équipement mis à la main remplace le kit sur son emplacement (v1 : le kit l'écrasait). */
function equipementDuBrouillon(b: Brouillon) {
  const kit = kitDepart(b.classe);
  return { equipement: { ...kit.equipement, ...b.equipementManuel }, inventaire: kit.inventaire };
}

function ficheCalculSansPV(b: Brouillon): FicheCalcul {
  const { equipement, inventaire } = equipementDuBrouillon(b);
  return {
    niveau: b.niveau,
    classe: b.classe,
    race: b.race,
    raceVariante: b.raceVariante,
    caracs: caracsDuBrouillon(b),
    capacites: b.capacites,
    capacitesRace: capacitesRaceDuBrouillon(b),
    capacitesRaceChoix: b.capacitesRaceChoix,
    voiesHorsProfil: b.voiesHorsProfil,
    dons: b.dons,
    donsChoix: b.donsChoix,
    bonusCompetences: {},
    equipement,
    inventaireListe: inventaire,
    grimoireSortsConnus: b.sorts,
    grimoireSortsPrepares: [],
    cercleSpecialisation: b.cercleSpecialisation,
  };
}

// --------------------------------------------------------------- Points de vie

export interface JetPV {
  niveau: number;
  faces: number;
  jet: number;
  modCON: number;
  total: number;
}

/** Faces du dé de vie de la classe (6 sans classe, comme en v1). */
export function facesDeVie(b: Brouillon): number {
  return new CalculsPersonnage(ficheCalculSansPV(b)).facesDeVie();
}

/**
 * Historique des jets, recalculé à partir des dés bruts : un changement de
 * CON après coup est donc toujours pris en compte (v1 figeait modCON).
 * Décision 2a : modificateur de CON effectif, minimum 1 par niveau.
 */
export function historiquePV(b: Brouillon): JetPV[] {
  const c = new CalculsPersonnage(ficheCalculSansPV(b));
  const faces = c.facesDeVie();
  const modCON = c.mod('CON');
  return b.jetsPV.map((jet, i) => ({ niveau: i + 2, faces, jet, modCON, total: Math.max(1, jet + modCON) }));
}

/** Tire le dé du prochain niveau. `alea` rend un nombre dans [0, 1[ (Math.random par défaut). */
export function lancerJetPV(b: Brouillon, alea: () => number = Math.random): Brouillon {
  if (b.jetsPV.length >= b.niveau - 1) throw new RefusCreation('Tous les niveaux ont déjà leur jet.');
  const faces = facesDeVie(b);
  const jet = 1 + Math.floor(alea() * faces);
  return { ...b, jetsPV: [...b.jetsPV, jet] };
}

export function effacerJetsPV(b: Brouillon): Brouillon {
  return { ...b, jetsPV: [] };
}

/** Fiche de calcul complète du brouillon (pour les statistiques affichées pendant la création). */
export function ficheCalculDuBrouillon(b: Brouillon): FicheCalcul {
  const base = { ...ficheCalculSansPV(b), pvHistorique: historiquePV(b) };
  const pvMax = new CalculsPersonnage(base).pvCalcule();
  return { ...base, pvMax, pvActuel: pvMax };
}

// ------------------------------------------------------- Sorts et Cercle

/** Liste de sorts des classes à Grimoire (même table que calculs.ts). */
const LISTE_SORTS: Record<string, 'arcanique' | 'pretre'> = { magicien: 'arcanique', enchanteur: 'arcanique', necromancien: 'arcanique', pretre: 'pretre' };

/** Classes qui choisissent des sorts à la création : celles qui ont un Grimoire. */
export function aUnGrimoire(classe: string | null): boolean {
  return !!classe && classe in LISTE_SORTS;
}

/** Sorts accordés d'office par les voies prises et le Cercle (v1 sortsGrimoireAccordes). */
export function sortsAccordes(b: Brouillon): string[] {
  const c = new CalculsPersonnage({ classe: b.classe, capacites: b.capacites, cercleSpecialisation: b.cercleSpecialisation, niveau: b.niveau });
  return c.sortsGrimoireAccordes();
}

/** Combien de sorts le joueur peut encore apprendre : plafond d'inscription moins les accordés et les appris. */
export function sortsAChoisir(b: Brouillon): number {
  if (!aUnGrimoire(b.classe)) return 0;
  const plafond = new CalculsPersonnage({ niveau: b.niveau }).plafondInscriptionGrimoire();
  return plafond - sortsAccordes(b).length - b.sorts.length;
}

/**
 * Sorts proposés (v1, Apprentissage du Grimoire) : la liste de la classe,
 * hors sorts déjà accordés ou appris, d'un rang permis par le niveau
 * (niveauMinParRang). L'école ne filtre pas (elle double le coût en PP si
 * elle n'est pas débloquée, comme en v1).
 */
export function sortsProposes(b: Brouillon): string[] {
  const liste = b.classe ? LISTE_SORTS[b.classe] : undefined;
  if (!liste) return [];
  const exclus = new Set([...sortsAccordes(b), ...b.sorts]);
  return sorts
    .filter((s) => s.listes.includes(liste) && !exclus.has(s.id) && b.niveau >= (constantes.niveauMinParRang[String(s.rang)] ?? 99))
    .map((s) => s.id);
}

export function apprendreSort(b: Brouillon, idSort: string): Brouillon {
  if (sortsAChoisir(b) <= 0) throw new RefusCreation('Plafond d’inscription du Grimoire atteint.');
  if (!sortsProposes(b).includes(idSort)) throw new RefusCreation('Ce sort n’est pas proposé à ce personnage.');
  return { ...b, sorts: [...b.sorts, idSort] };
}

export function oublierSort(b: Brouillon, idSort: string): Brouillon {
  return { ...b, sorts: b.sorts.filter((s) => s !== idSort) };
}

export const CERCLES = Object.keys(constantes.cercleSortGratuit);

/** Cercle du Prêtre (v1 : choisi sur la fiche ; décision 3a : dans l'assistant, facultatif comme en v1). */
export function choisirCercle(b: Brouillon, cercle: string | null): Brouillon {
  if (b.classe !== 'pretre') throw new RefusCreation('Seul le Prêtre choisit un Cercle.');
  if (cercle !== null && !CERCLES.includes(cercle)) throw new RefusCreation(`Cercle inconnu : ${cercle}`);
  // Le sort gratuit du nouveau Cercle ne doit pas rester aussi parmi les sorts appris.
  const gratuit = cercle ? constantes.cercleSortGratuit[cercle] : undefined;
  return { ...b, cercleSpecialisation: cercle, sorts: b.sorts.filter((s) => s !== gratuit) };
}

// ------------------------------------------------------------- Validation

/** Ce qui empêche d'enregistrer, dans l'ordre des étapes. Vide = le personnage peut être créé. */
export function erreursCreation(b: Brouillon): string[] {
  const e: string[] = [];
  if (!b.classe) e.push('Choisis une classe.');
  if (!b.race) e.push('Choisis une race.');
  for (const [rang] of choixRaciauxRequis(b)) {
    if (!b.capacitesRaceChoix[String(rang)]) e.push(`Fais le choix du rang racial ${rang}.`);
  }
  if (varianteRequise(b) && !b.raceVariante) e.push('Choisis la nation elfique.');
  if (pointsCaracsRestants(b) !== 0) e.push(`Répartis tes ${CARACS_LIBRES_TOTAL} points de caractéristique.`);
  const pts = pointsVoie(b);
  if (pts.restants < 0) e.push(`Trop de points de capacité dépensés (${pts.depenses}/${pts.total}).`);
  if (b.jetsPV.length < b.niveau - 1) e.push(`Lance les PV des niveaux 2 à ${b.niveau}.`);
  if (b.dons.length < donsRequis(b)) e.push(`Choisis ${donsRequis(b) - b.dons.length} don(s).`);
  if (aUnGrimoire(b.classe) && sortsAChoisir(b) < 0) e.push('Trop de sorts appris pour ce niveau.');
  if (!b.nom.trim()) e.push('Donne un nom au personnage.');
  else if (b.nom.trim().length > 40) e.push('Le nom fait au plus 40 caractères.');
  return e;
}

/** Ce qui est signalé sans bloquer. */
export function avertissementsCreation(b: Brouillon): string[] {
  const a: string[] = [];
  const pts = pointsVoie(b);
  if (pts.restants > 0) a.push(`${pts.restants} point(s) de capacité non dépensé(s).`);
  if (aUnGrimoire(b.classe) && sortsAChoisir(b) > 0) a.push(`${sortsAChoisir(b)} sort(s) encore à apprendre.`);
  if (b.classe === 'pretre' && !b.cercleSpecialisation) a.push('Aucun Cercle choisi.');
  if (polyvalenceAcquise(b) && !rangOffert(b)) a.push('Polyvalence : le rang offert reste à choisir.');
  if (b.capacites.some((c) => voieParId.get(decouperCapacite(c.id).voie)?.speciale)) a.push('Voie du chaos : à valider avec le MJ.');
  return a;
}

// ------------------------------------------------------------ Fiche finale

/**
 * La fiche Firestore du personnage créé (validée par le schéma). Lève une
 * RefusCreation listant les erreurs si le brouillon n'est pas complet.
 */
export function ficheDepuisBrouillon(b: Brouillon, proprietaireUid: string, creeLe: number): Fiche {
  const erreurs = erreursCreation(b);
  if (erreurs.length) throw new RefusCreation(erreurs.join(' '));
  const calc = ficheCalculDuBrouillon(b);
  const ppMax = new CalculsPersonnage(calc).calculerPPMax();
  const brute = {
    schemaVersion: VERSION_FICHE,
    proprietaireUid,
    creeLe,
    nom: b.nom.trim(),
    genre: b.genre,
    niveau: b.niveau,
    classe: b.classe,
    race: b.race,
    raceVariante: b.raceVariante,
    caracs: calc.caracs ?? {},
    capacites: b.capacites,
    capacitesRace: calc.capacitesRace ?? [],
    capacitesRaceChoix: b.capacitesRaceChoix,
    voiesHorsProfil: b.voiesHorsProfil,
    dons: b.dons,
    donsChoix: b.donsChoix,
    bonusCompetences: {},
    pvMax: calc.pvMax ?? 1,
    pvActuel: calc.pvMax ?? 1,
    pvHistorique: calc.pvHistorique ?? [],
    ...(ppMax === null ? {} : { ppActuel: ppMax }),
    equipement: calc.equipement ?? {},
    inventaire: inventaireEnDictionnaire(calc.inventaireListe ?? []),
    piecesOr: 0,
    piecesArgent: 0,
    piecesBronze: 0,
    etatsActifs: [],
    mutations: null,
    corruptionCombat: 0,
    corruptionMajeure: 0,
    contratDemoniaquePenalite: null,
    amesStockees: 0,
    // Seuls les sorts appris sont stockés : les accordés se recalculent (v1 idem).
    grimoireSortsConnus: b.sorts,
    grimoireSortsPrepares: [],
    cercleSpecialisation: b.cercleSpecialisation,
    ...progressionVierge(),
    modules: {},
  };
  return schemaFiche.parse(versFirestore(brute, b.nom || 'fiche'));
}
