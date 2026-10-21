import { lancerFormule } from '../regles/des';
import type { CARACS } from '../schemas/commun';
import type { Action, Duree, Effet, Element, FamilleArme, Palier, Sauvegarde } from '../schemas/effets';
import type { Combinaison, FicheElement } from '../schemas/elements';
import type { EtatRefonte } from '../schemas/etats';
import { coutSort, ddSort, MAITRISES, seuilEchec, type CoutCalcule, type Maitrise } from './cout';
import { corruptionParLaPlongee } from './chaos';
import { actionAuPalier, paliersDefinis } from './paliers';

/*
 * Moteur de résolution d'un sort (lot L4.3), en fonction pure : un lancer
 * (sort, palier, lanceur, cibles, élément) donne ce qui change, sans rien
 * écrire. Le combat (L6) écrira ces changements dans Firestore ; la carte
 * (L5) fournit qui est dans la zone et à quelle distance.
 *
 * Ordre d'un lancer :
 *   1. coût (lib/effets/cout.ts), refus si le lancer est impossible ;
 *   2. échec d'école (verbe appris par grimoire, décision 6a du 20/10) :
 *      les PP sont dépensés, rien ne se passe ;
 *   3. dérapage de l'élément selon sa maîtrise : le sort entier échoue,
 *      les PP (et les PV du sang) sont dépensés, et le dérapage frappe le
 *      lanceur (décision 1b du 21/10) ;
 *   4. pour chaque cible : jet (attaque magique, sauvegarde, ou rien) puis
 *      effets, élément compris.
 *
 * Dégâts (décisions du 20 et du 21/10/2026, verrouillées) :
 *   - réductions multipliées entre elles, puis un seul arrondi à
 *     l'inférieur (3a) : sauvegarde réussie (moitié), au-delà des dégâts
 *     pleins (Choc : moitié au-delà de 3 cases), zone dégressive (100 % au
 *     centre, 75 % à une case, 50 % au-delà : 8b), double contre le métal
 *     (électricité) ; Choc au-delà de 3 cases et sauvegarde réussie donne
 *     donc un quart (9a) ;
 *   - un lanceur Affaibli retire ensuite 25 % arrondis au plus proche (2b),
 *     sans faire descendre les dégâts sous 1 (1b) ;
 *   - zone : un seul jet de dégâts pour toutes les cibles (2a du 21/10) ;
 *     projectiles : chacun garde son dé (validé, confirmé le 21/10) ;
 *   - un verbe avec un élément inflige des dégâts de cet élément et porte
 *     son effet générique ; un sort mineur n'en prend que le type (validé).
 *
 * Éléments (lot L4.2) : terre et psionique sur un sort sans sauvegarde se
 * jouent sur leur propre sauvegarde (4a, 5a) ; le rebond de l'électricité
 * fait la même sauvegarde que la cible principale (7a) ; le sang ajoute un
 * dé payé en PV en plus des PP (6a), le lanceur en récupère la moitié.
 * Combinaisons de Maître (lot L4.10, décisions de Thomas du 21/10/2026) :
 * le premier élément est Maître ; le second paie son surcoût et peut
 * déraper à son rang (le sort entier échoue alors, comme pour un élément
 * seul) ; une paire signature remplace les deux effets génériques par le
 * sien (12a) ; sinon les deux effets génériques s'appliquent à la suite,
 * modifications du sort comprises (le premier l'emporte en cas de
 * doublon) ; un second élément qui n'est pas Maître est réduit de moitié
 * (durées divisées par deux arrondies au supérieur, dégâts en plus divisés
 * par deux : 13a) et ne sert qu'une fois par combat, que le combat
 * décompte (`cout.combinaisonDuCombat`).
 *
 * Attaques d'arme (lot L4.7, Guerrier ; décisions de Thomas du 21/10/2026) :
 *   - le jet `attaque` prend le bonus d'attaque de l'arme maniée, que la
 *     fiche calcule ; les dés `arme` sont ceux de l'arme, plus son bonus de
 *     dégâts ; un piège attaque avec un mod nommé (DEX contre la DEF, v1) ;
 *   - critique (4a) : un 20 naturel, 19–20 avec Précision létale ; il
 *     touche toujours (règle COF) et double les dés de l'arme, pas ses
 *     bonus ;
 *   - attaque spéciale : il faut une arme de sa famille (1a) ; l'état est
 *     posé d'office si l'attaque touche (2a) et dure 1 round, 2 avec
 *     Précision létale ; elle coûte ce que dit la classe : 2 Endurance au
 *     Guerrier, 1 avec Maniement expert, une fois par combat sans coût aux
 *     hybrides (3c) ;
 *   - les mods de caractéristique sont lus par leur nom (12a) ;
 *   - le moteur ne tient ni l'Endurance, ni la réaction du round, ni les
 *     limites par combat : il rend ce qu'un lancer coûte, le combat (L6)
 *     vérifie et décompte.
 *
 * Barde (lot L4.8, décisions de Thomas du 21/10/2026) : le boost
 * d'Inspiration (1 point, un par chant : +1 cible ou +1 round) se paie en
 * Inspiration ; un DD fixe remplace celui du lanceur (élixirs) ; une durée
 * peut dépendre d'un mod de la cible (3 + mod de CON du buveur, 15a) ; un
 * lanceur réduit au Silence ne lance aucun sort (3a) ; une action peut
 * exiger une famille d'armes (Lancer un couteau).
 *
 * Voies du chaos (lot L4.9, décisions de Thomas du 21/10/2026) : elles ne
 * coûtent ni PP ni ressource de classe, seulement la Plongée qu'elles
 * ajoutent (1a) ; le R3 lance un d20 de chaos, mutation du palier 1 sur
 * 18–20 (5a) ; le Don corrompu donne +1d6 chaotiques ou relance le dé de
 * dégâts le plus bas, une fois par sort, +1 Plongée (4a) ; quand le moteur
 * connaît la Plongée du lanceur, il rend la Corruption d'Âme gagnée, +1
 * par multiple de 6 dépassé (1b ; lib/effets/chaos.ts).
 */

// ---------- Entrées ----------

export type Carac = (typeof CARACS)[number];

export interface Combattant {
  id: string;
  /** Mods des caractéristiques (décision 12a du 21/10/2026, lot L4.7) : un effet qui nomme une caractéristique lit le sien ici ; une durée peut lire celui de la cible (lot L4.8). */
  mods?: Partial<Record<Carac, number>>;
  /** Camp : les alliés du lanceur sont ceux du même camp. */
  camp: string;
  def: number;
  /** DEF sans l'armure (sorts psioniques, qui l'ignorent) ; à défaut, `def`. */
  defSansArmure?: number;
  /** Bonus de sauvegarde par type. */
  sauvegardes: Record<Sauvegarde, number>;
  /** Identifiants des états actifs. */
  etats: readonly string[];
  armureMetal?: boolean;
  demonOuMortVivant?: boolean;
  /** Boss ou démon D5 : immunisé à Sommeil, Ordre et Domination (validé). */
  boss?: boolean;
  /** PV actuels (seuil de Sommeil). */
  pv?: number;
}

export interface CibleEnJeu extends Combattant {
  /** Distance au lanceur, en cases. */
  distance: number;
  /** A déjà agi dans ce combat (Premier coup du Chasseur, lot L4.14) ; absent : pas encore. */
  aAgi?: boolean;
  /** Zone : cases entre la cible et le centre (0 au centre), pour le dégressif. */
  anneau?: number;
}

export interface LanceurEnJeu extends Combattant {
  modMagie: number;
  attaqueMagique: number;
  /** Niveau du lanceur (dés des sorts mineurs) ; 1 par défaut. */
  niveau?: number;
  /** PV actuels et max : coûts en PV (sang, Pacte, Saignée), jamais sous 1 PV ; Seuil critique. */
  pv?: number;
  pvMax?: number;
  /** Plongée du combat en cours et Corruption d'Âme (Voies du chaos, lot L4.9). */
  plongee?: number;
  corruptionAme?: number;
}

/**
 * Capacités de voie du lanceur et choix du moment (lot L4.4b2). Les rangs
 * viennent du profil (lib/effets/profil.ts) ; les limites par combat ou par
 * scénario sont tenues par le combat (L6), qui ne passe un choix que s'il
 * est encore disponible.
 */
export interface ModificateursDeVoie {
  sauvage?: {
    rang: number;
    /** Instinct chaotique (rang 2) : le meilleur de deux jets. */
    instinct?: boolean;
    /** Maîtrise du chaos (rang 4) : +4 sans jet. */
    maitriseDuChaos?: boolean;
    /** Submersion arcanique (rang 5) : la mutation compte double. */
    submersion?: boolean;
    /** Canalisation profonde (rang 3), sur une mutation de +3 ou plus. */
    canalisation?: 'repousse' | 'brulure' | 'aveugle';
  };
  hemomancie?: {
    rang: number;
    /** Sang versé (rang 4) : au moins 5 dégâts subis depuis le dernier sort. */
    sangVerse?: boolean;
    /** Saignée (rang 5) : ce verbe au palier le plus haut, sans coût, +2d6, pour la moitié des PV actuels. */
    saignee?: boolean;
  };
  virtuose?: {
    /** Crans de dé des sorts mineurs (Perfection : 1). */
    crans?: number;
    /** Affinité (rang 2) : l'élément, au moins Adepte, porte son effet complet sur un sort mineur. */
    affinite?: boolean;
    /** Le geste unique (rang 5) : dés doublés. */
    gesteUnique?: boolean;
  };
  /** Voie du chaos (lot L4.9) : Éclat chaotique (Envoûteur R1) ; le Don corrompu choisi pour ce lancer (R2). */
  chaos?: { rang: number; eclatChaotique?: boolean; donCorrompu?: 'plus1d6' | 'relance' };
  /** Voie du soldat (lot L4.7) : son rang plafonne la posture. */
  soldat?: { rang: number };
  maitreDArmes?: {
    rang: number;
    /** Cette attaque spéciale est déjà la seconde du Coup double (rang 4) : pas de troisième. */
    secondeDuCoupDouble?: boolean;
    /** Coup de maître (rang 5, 1x/combat) : un second état, ou l'arme et un élément. */
    coupDeMaitre?: { etat: string } | { element: Element };
  };
}

/**
 * Arme maniée (lot L4.7), telle que la fiche la calcule : la famille vient
 * de src/regles/armes.ts ; le bonus d'attaque et le bonus de dégâts
 * (caractéristique, enchantement) viennent de la fiche. Bouclier et mains
 * nues se passent aussi comme une arme.
 */
export interface ArmeEnJeu {
  id: string;
  famille: FamilleArme;
  /** Dés de l'arme (« 1d8 ») ; un critique les double (décision 4a du 21/10/2026). */
  des: string;
  attaque: number;
  degats: number;
  /** Mod de la caractéristique d'attaque : le DD des effets portés par l'arme est 10 + ce mod. */
  modCarac?: number;
  /** Arme légère (src/regles/armes.ts, ARMES_LEGERES ; décision 7a, lot L4.8). */
  legere?: boolean;
}

/** Attaques spéciales permises au personnage et leur coût (profil, lot L4.7). */
export interface AttaquesSpecialesEnJeu {
  familles: 'toutes' | readonly FamilleArme[];
  cout: { ressource: string; montant: number } | 'unParCombat';
}

export type AxePosture = 'attaque' | 'DEF' | 'degats';

export interface Catalogue {
  etats: ReadonlyMap<string, EtatRefonte>;
  elements: ReadonlyMap<string, FicheElement>;
  /** Combinaisons signature (lot L4.10) ; absentes : toute paire applique les deux effets génériques. */
  combinaisons?: readonly Combinaison[];
}

export interface Lancer {
  /** L'action telle qu'écrite (paliers compris) : le moteur la résout au palier lancé. */
  action: Action;
  /** Palier atteint par le lanceur (paliers.ts, palierAtteint). */
  palier: Palier;
  /** Variante choisie au palier lancé (Bouclier III : `deux-cibles`). */
  variante?: string;
  /** Prophétie (lot L4.5) : combien de dés le lanceur tire d'avance. */
  nombreDeDes?: number;
  /** Boost de Sacré du Prêtre (1 point, un par sort ; lot L4.6), propre au Cercle du verbe. */
  boost?: BoostSacre;
  voie?: ModificateursDeVoie;
  surcharge?: boolean;
  /** Maîtrise de l'école du verbe ; Adepte par défaut. */
  ecole?: Maitrise;
  element?: { id: Element; maitrise: Maitrise } | null;
  secondElement?: { id: Element; maitrise: Maitrise } | null;
  lanceur: LanceurEnJeu;
  /** Cibles principales, une entrée par projectile (une même créature peut revenir). */
  cibles: readonly CibleEnJeu[];
  /** Créatures dans la zone, lanceur exclu ; le filtre de la zone est appliqué ici. */
  zone?: readonly CibleEnJeu[];
  /** Allié choisi (effets `vise: 'allie'`, choix de l'eau). */
  allie?: CibleEnJeu;
  /** Électricité : 2ᵉ cible du rebond, à 2 cases au plus de la cible principale. */
  rebond?: CibleEnJeu;
  /** Créatures à 1 case de la cible principale (Onde sismique, lot L4.10), fournies par la carte. */
  voisins?: readonly CibleEnJeu[];
  /** Eau : 2 cases de poussée en plus (défaut), ou retirer un état à l'allié choisi. */
  choixEau?: 'poussee' | 'retraitEtat';
  /** Arme maniée : attaques d'arme, attaques spéciales (lot L4.7). */
  arme?: ArmeEnJeu;
  /** Attaques spéciales du personnage (profil) ; absent : il n'en a pas. */
  attaquesSpeciales?: AttaquesSpecialesEnJeu;
  /** Posture choisie : un axe en bonus, un autre en malus, de la même valeur. */
  posture?: { plus: AxePosture; moins: AxePosture; valeur: number };
  /** Le lanceur n'a pas bougé ce tour (L'exemple). */
  immobile?: boolean;
  /** Le lanceur protège activement un allié, déclaré par le joueur (Pilier du village). */
  protegeUnAllie?: boolean;
  /** Premier round du combat (Entrée en scène, lot L4.8). */
  premierRound?: boolean;
  /** Caractéristique choisie au lancer (élixirs : bonus `caracAuChoix`, lot L4.8). */
  caracChoisie?: Carac;
  alea?: () => number;
}

// ---------- Sorties ----------

export type Changement =
  | { type: 'degats'; cible: string; montant: number; typeDegats: string; calcul: string }
  | { type: 'soin'; cible: string; montant: number }
  | { type: 'pvTemp'; cible: string; montant: number }
  | { type: 'etat'; cible: string; etat: string; duree: Duree; charges?: number; contre?: { cible: 'attaque' | 'degats'; valeur: number }[]; drainePour?: string }
  | { type: 'chargeConsommee'; cible: string; etat: string }
  | { type: 'jetsReserves'; cible: string; valeurs: number[] }
  | { type: 'retraitEtat'; cible: string; etats: readonly string[]; nombre: number }
  | { type: 'deplacement'; cible: string; sens: 'repousse' | 'attire' | 'teleporte' | 'libre'; cases: number }
  | { type: 'relance'; cible: string }
  | { type: 'bonus'; cible: string; sur: string; valeur: number | string; duree: Duree; typeDegats?: string; consomme?: 'prochaineFrappe'; parAllieAuContact?: true }
  | { type: 'plancherPv'; cible: string; valeur: number; duree?: Duree }
  | { type: 'ressource'; cible: string; ressource: string; montant: number | 'vider' }
  | { type: 'tombe'; cible: string }
  | { type: 'mutation'; cible: string; palier: 1 }
  | { type: 'invocation'; creature: string; nombre: number; duree: Duree; element?: Element }
  | { type: 'terrain'; nature: string; duree: Duree }
  | { type: 'dissipation'; cible: string; nombre: number }
  | { type: 'reductionDegats'; cible: string; part: 'moitie'; renvoi: boolean }
  | { type: 'soinComplet'; cible: string }
  | { type: 'narratif'; cible: string; texte: string };

export interface JetNote {
  quoi: string;
  cible?: string;
  des: number[];
  total: number;
  /** DD ou DEF visés, et l'issue. */
  contre?: number;
  reussi?: boolean;
  /** Critique (lot L4.7). */
  critique?: true;
}

export type Resultat =
  | {
      ok: true;
      issue: 'reussi' | 'echecEcole' | 'derapage';
      palierLance: Palier;
      /**
       * `ressources` : Endurance et autres ressources de classe (lot L4.7) ;
       * `attaqueSpecialeDuCombat` : l'attaque spéciale gratuite du combat
       * d'un hybride (3c), que le combat décompte.
       */
      cout: { pp: number; pv: number; sacre?: number; ressources?: Record<string, number>; attaqueSpecialeDuCombat?: true; combinaisonDuCombat?: true };
      dd: number;
      jets: JetNote[];
      changements: Changement[];
      /** Coup double (Maître d'armes 4) : l'attaque spéciale a touché, une seconde peut suivre. */
      coupDouble?: true;
    }
  | { ok: false; raison: string };

// ---------- Outils ----------

/** Somme d'une formule « 2d6+1d4+3 », dé par dé. */
function lancerDes(formule: string, alea: () => number): { des: number[]; total: number } {
  const des: number[] = [];
  let total = 0;
  for (const terme of formule.match(/[+-]?[^+-]+/g) ?? []) {
    const signe = terme.startsWith('-') ? -1 : 1;
    const t = terme.replace(/^[+-]/, '');
    if (t.includes('d')) {
      const j = lancerFormule(t, alea)!;
      des.push(...j.des);
      total += signe * j.total;
    } else total += signe * Number(t);
  }
  return { des, total };
}

function d20(alea: () => number, avantage: number): { des: number[]; garde: number } {
  const a = lancerFormule('1d20', alea)!.total;
  if (!avantage) return { des: [a], garde: a };
  const b = lancerFormule('1d20', alea)!.total;
  return { des: [a, b], garde: avantage > 0 ? Math.max(a, b) : Math.min(a, b) };
}

function etatsDe(c: Combattant, cat: Catalogue): EtatRefonte[] {
  return c.etats.map((id) => cat.etats.get(id)).filter((e): e is EtatRefonte => !!e);
}

function modificateur(c: Combattant, cat: Catalogue, cibles: readonly string[]): number {
  return etatsDe(c, cat)
    .flatMap((e) => e.modificateurs)
    .filter((m) => cibles.includes(m.cible))
    .reduce((s, m) => s + m.valeur, 0);
}

/** +1 avantage, −1 désavantage, 0 s'ils s'annulent (6a : 2d20). */
function avantageAttaque(lanceur: Combattant, cible: Combattant, cat: Catalogue): number {
  const l = etatsDe(lanceur, cat);
  const c = etatsDe(cible, cat);
  const av = l.some((e) => e.avantage.includes('attaques') || e.avantage.includes('prochaineAttaque')) || c.some((e) => e.avantage.includes('attaquesContre'));
  const des =
    l.some((e) => e.desavantage.includes('attaques') || e.desavantage.includes('prochaineAttaque')) ||
    c.some((e) => e.desavantage.includes('attaquesContre'));
  return (av ? 1 : 0) - (des ? 1 : 0);
}

const NOM_MAITRISE: Record<Maitrise, string> = { nonMaitrise: 'Non maîtrisé', initie: 'Initié', adepte: 'Adepte', maitre: 'Maître' };

/**
 * Coût fixe en PP d'une action qui n'est pas un sort (Cataclysme : 6 PP).
 * Ses autres ressources (PV, Endurance…) sont rendues à part (lot L4.7).
 * Une capacité à paliers (Frappe sacrée) se lance au palier donné.
 */
function coutFixe(action: Action, palier: Palier, surcharge?: boolean): CoutCalcule {
  if (surcharge) return { ok: false, raison: 'seul un verbe se surcharge' };
  const palierLance = paliersDefinis(action).includes(palier) ? palier : 'I';
  const pp = (action.cout ?? []).filter((c) => c.ressource === 'pp').reduce((s, c) => s + c.montant, 0);
  return { ok: true, pp, palierLance, detail: [{ terme: 'base', valeur: pp }] };
}

type Mods = { magie: number; caracs: Partial<Record<Carac, number>>; choix?: Carac; pointsDeChaos?: number; lanceur?: string };

/** Mod ajouté par un effet : celui de magie (`plusMod`) ou celui d'une caractéristique nommée (12a). */
function modDeLEffet(e: { plusMod?: boolean; mod?: Carac }, m: Mods): number {
  if (e.plusMod) return m.magie;
  return e.mod ? (m.caracs[e.mod] ?? 0) : 0;
}

/** Caractéristiques qu'une action lit par leur nom (12a) : le lanceur doit en donner le mod. */
/** Combinaison réduite (13a) : les durées en rounds divisées par deux, arrondies au supérieur (les dégâts : au calcul). */
export function reduire(e: Effet): Effet {
  if ('duree' in e && e.duree && typeof e.duree === 'object' && 'rounds' in e.duree) return { ...e, duree: { rounds: Math.ceil(e.duree.rounds / 2) } } as Effet;
  return e;
}

/** Une durée qui lit un mod de la cible (élixirs, lot L4.8) devient des rounds, au moins 1. */
function dureePourLaCible(d: Duree, c: Combattant): Duree {
  if (typeof d === 'string' || !('plusModCible' in d)) return d;
  return { rounds: Math.max(1, d.base + (c.mods?.[d.plusModCible] ?? 0)) };
}

function caracsLues(action: Action): Carac[] {
  const lues: Carac[] = action.attaquePar ? [action.attaquePar] : [];
  for (const e of action.effets) {
    if ((e.type === 'degats' || e.type === 'soin' || e.type === 'pvTemp') && e.mod) lues.push(e.mod);
    if (e.type === 'bonus' && typeof e.valeur === 'object') lues.push(e.valeur.mod);
  }
  return lues;
}

/** Dé d'un sort mineur selon le niveau (validé) : 1d6 (1 à 4), 1d8 (5 à 8), 1d10 (9 à 12) ; `crans` le monte (Perfection). */
export function deMineur(niveau: number, crans = 0): string {
  const echelle = ['1d6', '1d8', '1d10', '1d12'];
  const base = niveau <= 4 ? 0 : niveau <= 8 ? 1 : 2;
  return echelle[Math.min(base + crans, echelle.length - 1)]!;
}

/** Remplace chaque durée à dés par des rounds tirés une fois pour tout le sort (au moins 1). */
function avecDureesTirees(action: Action, alea: () => number, modMagie: number, jets: JetNote[]): Action {
  const tirees = new Map<string, Duree>();
  const tirer = (d: Duree): Duree => {
    if (typeof d === 'string' || !('des' in d)) return d;
    const cle = `${d.des}|${d.plusModMagie}`;
    if (!tirees.has(cle)) {
      const j = lancerDes(d.des, alea);
      const rounds = Math.max(1, j.total + (d.plusModMagie ? modMagie : 0));
      jets.push({ quoi: 'durée', des: j.des, total: rounds });
      tirees.set(cle, { rounds });
    }
    return tirees.get(cle)!;
  };
  return { ...action, effets: action.effets.map((e) => ('duree' in e && e.duree !== undefined ? { ...e, duree: tirer(e.duree) } : e)) as Action['effets'] };
}

/** Le geste unique (Virtuose 5, décision 15b du 21/10/2026) : « 1d8 » devient « 2d8 ». */
export function doublerDes(formule: string): string {
  return formule.replace(/(\d*)d(\d+)/g, (_m, n: string, f: string) => `${2 * Number(n || 1)}d${f}`);
}

/** Zone : un seul jet de dégâts pour toutes les cibles (décision 2a du 21/10/2026). */
const UN_JET_PAR_ZONE = true;

/**
 * Boosts de Sacré (doc de cadre, « Prêtre — Points de Sacré », validé) :
 * Guérison → un 2ᵉ allié ou retirer un état ; Foi → pas de sauvegarde ou +1
 * round ; Bannissement → double effet contre démons et morts-vivants ;
 * Jugement → ignore les résistances ou Marque partagée par le groupe.
 */
export const BOOSTS_PAR_CERCLE = {
  guerison: ['secondAllie', 'retraitEtat'],
  foi: ['sansSauvegarde', 'plusUnRound'],
  bannissement: ['doubleContreDemons'],
  jugement: ['ignoreResistances', 'marquePartagee'],
  /** Boost d'Inspiration du Barde (validé, lot L4.8) : +1 cible ou +1 round, payé en Inspiration. */
  chant: ['plusUneCible', 'plusUnRound'],
} as const;
export type BoostSacre = (typeof BOOSTS_PAR_CERCLE)[keyof typeof BOOSTS_PAR_CERCLE][number];

const FACTEUR_DEGRESSIF = (anneau: number) => (anneau <= 0 ? 1 : anneau === 1 ? 0.75 : 0.5);

/** Affaibli (décisions 1b et 2b du 21/10/2026) : −25 % arrondis au plus proche, jamais sous 1. */
export function appliquerAffaibli(montant: number, pourcent: number, minimum: number): number {
  if (montant <= 0) return montant;
  return Math.max(minimum, montant - Math.round((montant * pourcent) / 100));
}

/** Dégâts après réductions (3a : produit des facteurs, un seul arrondi à l'inférieur). */
export function degatsReduits(base: number, facteurs: readonly number[]): number {
  return Math.floor(base * facteurs.reduce((p, f) => p * f, 1));
}

// ---------- Résolution ----------

export function resoudreLancer(l: Lancer, cat: Catalogue): Resultat {
  const alea = l.alea ?? Math.random;
  const v = l.voie ?? {};
  const hemo = v.hemomancie?.rang ?? 0;
  const saignee = hemo >= 5 && !!v.hemomancie?.saignee;
  if (saignee && (l.action.nature !== 'verbe' || l.surcharge)) return { ok: false, raison: 'la Saignée porte un verbe, sans surcharge' };
  // Seuil critique (Hémomancie 3, décision 1a du 21/10) : sous la moitié des PV, la surcharge perd ses +2.
  const seuilCritique = hemo >= 3 && l.lanceur.pv !== undefined && l.lanceur.pvMax !== undefined && l.lanceur.pv < l.lanceur.pvMax / 2;
  const estSort = l.action.nature === 'verbe' || l.action.nature === 'mineur';
  // Silence (Requiem du silence, décision 3a du lot L4.8) : aucun sort.
  const baillonne = l.lanceur.etats.map((id) => cat.etats.get(id)).find((e) => e?.interditSorts);
  if (estSort && baillonne) return { ok: false, raison: `${baillonne.nom} : aucun sort` };
  const cout = !estSort
    ? coutFixe(l.action, l.palier, l.surcharge)
    : coutSort(l.action, {
        palier: saignee ? paliersDefinis(l.action).at(-1)! : l.palier,
        surcharge: l.surcharge,
        surchargeSansSurcout: seuilCritique,
        element: l.element?.maitrise ?? null,
        secondElement: l.secondElement?.maitrise ?? null,
        ecole: l.ecole,
      });
  if (!cout.ok) return cout;
  if (l.variante !== undefined && !l.action.variantes.some((v) => v.id === l.variante && (v.palier === cout.palierLance || v.palier === 'I')))
    return { ok: false, raison: `${l.action.id} n'a pas de variante ${l.variante} au palier ${cout.palierLance}` };
  let action = actionAuPalier(l.action, cout.palierLance, l.variante);
  const reserve = action.effets.find((e) => e.type === 'jetsReserves');
  if (reserve && (!l.nombreDeDes || l.nombreDeDes < 1 || !Number.isInteger(l.nombreDeDes))) return { ok: false, raison: `${action.id} : combien de dés ?` };
  if (l.boost) {
    const permis: readonly string[] = (BOOSTS_PAR_CERCLE as Record<string, readonly string[]>)[action.ecole ?? ''] ?? [];
    if (!permis.includes(l.boost)) return { ok: false, raison: `le boost ${l.boost} ne s’applique pas à ${action.nom}` };
  }
  if (action.elementMin) {
    // Serviteur : un élément au moins Initié (validé) ; Cataclysme : un élément Maître.
    if (!l.element) return { ok: false, raison: `${action.id} demande un élément` };
    if (MAITRISES.indexOf(l.element.maitrise) < MAITRISES.indexOf(action.elementMin))
      return { ok: false, raison: `${action.id} demande un élément au moins ${NOM_MAITRISE[action.elementMin]}` };
  }
  if (action.effets.some((e) => e.type === 'invocation' && e.parElement) && !l.element) return { ok: false, raison: `${action.id} s'invoque avec un élément` };

  // Attaques d'arme et ressources de classe (lot L4.7).
  const ressources: Record<string, number> = {};
  let pvFixes = 0;
  for (const c of action.cout ?? []) {
    if (c.ressource === 'pv') pvFixes += c.montant;
    else if (c.ressource !== 'pp') ressources[c.ressource] = (ressources[c.ressource] ?? 0) + c.montant;
  }
  const aLArme = action.resolution.jet === 'attaque' && !action.attaquePar;
  if (aLArme && !l.arme) return { ok: false, raison: `${action.nom} demande une arme` };
  if (action.armes && !action.armes.includes(l.arme!.famille)) return { ok: false, raison: `${action.nom} demande une arme : ${action.armes.join(', ')}` };
  // Élixirs (lot L4.8) : la caractéristique choisie, et le mod de la cible que lit la durée.
  if (action.effets.some((e) => e.type === 'bonus' && e.cible === 'caracAuChoix') && !l.caracChoisie) return { ok: false, raison: 'choisis la caractéristique' };
  // Une durée qui lit un mod (élixirs, Avatars : lot L4.9) : chaque créature qu'elle vise doit le donner.
  for (const e of action.effets) {
    if (!('duree' in e) || typeof e.duree !== 'object' || !('plusModCible' in e.duree)) continue;
    const k = e.duree.plusModCible;
    const visees = e.vise === 'lanceur' ? [l.lanceur] : e.vise === 'allie' ? (l.allie ? [l.allie] : []) : e.vise === 'zone' ? [...(l.zone ?? [])] : [...l.cibles];
    const sans = visees.find((c) => c.mods?.[k] === undefined);
    if (sans) return { ok: false, raison: `il faut le mod de ${k} de ${sans.id}` };
  }
  // Voies du chaos (lot L4.9).
  if (action.corruptionAmeMin && (l.lanceur.corruptionAme ?? 0) < action.corruptionAmeMin)
    return { ok: false, raison: `${action.nom} : actif dès ${action.corruptionAmeMin} de Corruption d’Âme` };
  if (ressources.plongee && l.lanceur.plongee !== undefined && l.lanceur.plongee < ressources.plongee) return { ok: false, raison: 'pas assez de Plongée' };
  const litLeChaos = (typeof action.sacrifice === 'object' && 'parPointDeChaos' in action.sacrifice) || action.effets.some((e) => e.type === 'bonus' && e.valeur === 'pointsDeChaos');
  let pointsDeChaos: number | undefined;
  if (litLeChaos) {
    if (l.lanceur.plongee === undefined || l.lanceur.corruptionAme === undefined) return { ok: false, raison: 'il faut la Plongée et la Corruption d’Âme du lanceur' };
    const plafond = typeof action.sacrifice === 'object' && 'parPointDeChaos' in action.sacrifice ? action.sacrifice.plafond : Infinity;
    pointsDeChaos = Math.min(plafond, l.lanceur.plongee + l.lanceur.corruptionAme);
    if (pointsDeChaos < 1) return { ok: false, raison: 'aucun point de chaos' };
  }
  const don = v.chaos?.donCorrompu;
  if (don && (v.chaos?.rang ?? 0) < 2) return { ok: false, raison: 'le Don corrompu vient au rang 2 de la Voie du chaos' };
  if (don && !action.effets.some((e) => e.type === 'degats')) return { ok: false, raison: 'le Don corrompu force un sort ou une attaque qui fait des dégâts' };
  let attaqueSpecialeDuCombat = false;
  let coupDouble = false;
  if (l.boost && action.ecole === 'chant') ressources.inspiration = (ressources.inspiration ?? 0) + 1;
  if (action.famille) {
    const permises = l.attaquesSpeciales;
    if (!permises) return { ok: false, raison: 'ce personnage n’a pas d’attaque spéciale' };
    if (permises.familles !== 'toutes' && !permises.familles.includes(action.famille)) return { ok: false, raison: `${action.nom} n’est pas une attaque spéciale de sa classe` };
    if (l.arme!.famille !== action.famille) return { ok: false, raison: `${action.nom} demande une arme de la famille ${action.famille}` };
    if (permises.cout === 'unParCombat') attaqueSpecialeDuCombat = true;
    else ressources[permises.cout.ressource] = (ressources[permises.cout.ressource] ?? 0) + permises.cout.montant;
  }
  const sansMod = caracsLues(action).find((c) => l.lanceur.mods?.[c] === undefined);
  if (sansMod) return { ok: false, raison: `il faut le mod de ${sansMod} du lanceur` };
  const m: Mods = {
    magie: l.lanceur.modMagie,
    caracs: l.lanceur.mods ?? {},
    ...(l.caracChoisie ? { choix: l.caracChoisie } : {}),
    ...(pointsDeChaos !== undefined ? { pointsDeChaos } : {}),
    lanceur: l.lanceur.id,
  };
  const maitre = v.maitreDArmes?.rang ?? 0;
  const coupDeMaitre = maitre >= 5 ? v.maitreDArmes?.coupDeMaitre : undefined;
  if (v.maitreDArmes?.coupDeMaitre && !action.famille) return { ok: false, raison: 'le Coup de maître porte une attaque spéciale' };
  if (v.maitreDArmes?.coupDeMaitre && !coupDeMaitre) return { ok: false, raison: 'le Coup de maître vient au rang 5 de la Voie du maître d’armes' };
  const ficheCoup = coupDeMaitre && 'element' in coupDeMaitre ? cat.elements.get(coupDeMaitre.element) : undefined;
  if (coupDeMaitre && 'element' in coupDeMaitre && !ficheCoup) return { ok: false, raison: `élément inconnu : ${coupDeMaitre.element}` };
  if (coupDeMaitre && 'etat' in coupDeMaitre && !cat.etats.has(coupDeMaitre.etat)) return { ok: false, raison: `état inconnu : ${coupDeMaitre.etat}` };
  const posture = action.effets.find((e) => e.type === 'posture');
  if (posture?.type === 'posture') {
    // Plafond : le rang dans la Voie du soldat, doublé sous Maîtrise tactique (décision du 20/10/2026).
    const plafond = (v.soldat?.rang ?? 0) * (l.lanceur.etats.includes('maitrise_tactique') ? 2 : 1);
    const p = l.posture;
    if (!p) return { ok: false, raison: 'choisis la posture : un axe en bonus, un autre en malus, et la valeur' };
    if (p.plus === p.moins || !posture.axes.includes(p.plus) || !posture.axes.includes(p.moins)) return { ok: false, raison: 'une posture prend deux axes différents' };
    if (!Number.isInteger(p.valeur) || p.valeur < 1 || p.valeur > plafond) return { ok: false, raison: `posture de 1 à ${plafond}` };
  }
  // DD : celui du lanceur ; un effet porté par l'arme se sauve contre 10 + le mod de sa caractéristique.
  const dd =
    action.resolution.ddFixe ?? (aLArme && l.arme?.modCarac !== undefined ? ddSort(l.arme.modCarac) : ddSort(l.lanceur.modMagie, l.ecole ?? 'adepte'));
  const jets: JetNote[] = [];
  const changements: Changement[] = [];
  const fiche = l.element ? cat.elements.get(l.element.id) : undefined;
  if (l.element && !fiche) return { ok: false, raison: `élément inconnu : ${l.element.id}` };
  // Combinaison de Maître (lot L4.10) : coût et premier élément Maître déjà vérifiés par coutSort.
  const fiche2 = l.secondElement ? cat.elements.get(l.secondElement.id) : undefined;
  if (l.secondElement && !fiche2) return { ok: false, raison: `élément inconnu : ${l.secondElement.id}` };
  if (l.secondElement && l.secondElement.id === l.element?.id) return { ok: false, raison: 'une combinaison prend deux éléments différents' };
  const paire = l.element && l.secondElement ? [l.element.id, l.secondElement.id].sort().join('+') : null;
  const signature = paire ? cat.combinaisons?.find((x) => [...x.elements].sort().join('+') === paire) : undefined;
  const combinaisonReduite = !!l.secondElement && l.secondElement.maitrise !== 'maitre';
  const mineur = action.nature === 'mineur';
  // Affinité (Virtuose 2) : un sort mineur porte l'effet complet d'un élément au moins Adepte.
  const affinite = mineur && !!v.virtuose?.affinite && !!l.element && MAITRISES.indexOf(l.element.maitrise) >= MAITRISES.indexOf('adepte');
  // Sang : son dé en plus, sauf quand une signature remplace les effets génériques ; réduit de moitié en second élément non Maître.
  const sangSecond = !signature && l.secondElement?.id === 'sang';
  const sang = !signature && (l.element?.id === 'sang' || sangSecond) && (!mineur || affinite);
  // Paiement : le Pacte de sang paie les PP en PV ; la Saignée ne coûte que la moitié des PV actuels.
  let pp = (saignee ? 0 : cout.pp) + (reserve?.type === 'jetsReserves' ? reserve.ppParDe * l.nombreDeDes! : 0);
  let pvPaye = pvFixes;
  if (hemo >= 1) {
    pvPaye += pp;
    pp = 0;
  }
  if (saignee || action.sacrifice === 'moitiePvActuels') {
    if (l.lanceur.pv === undefined) return { ok: false, raison: 'il faut connaître les PV du lanceur' };
    pvPaye += Math.floor(l.lanceur.pv / 2);
  }
  // Prouesse : 1d4 PV sacrifiés (v1) ; Corruption motivante : X d4 (lot L4.9). Tirés avant tout autre dé.
  if (typeof action.sacrifice === 'object') {
    const j = lancerDes('des' in action.sacrifice ? action.sacrifice.des : `${pointsDeChaos}${action.sacrifice.parPointDeChaos}`, alea);
    jets.push({ quoi: 'sacrifice', des: j.des, total: j.total });
    pvPaye += j.total;
  }
  const sansSousUnPv = (pv: number): string | null =>
    l.lanceur.pv !== undefined && pv > 0 && l.lanceur.pv - pv < 1 ? 'un sort ne fait jamais tomber son lanceur sous 1 PV' : null;
  const fin = (issue: 'reussi' | 'echecEcole' | 'derapage', pvEnPlus: number): Resultat => ({
    ok: true,
    issue,
    palierLance: cout.palierLance,
    cout: {
      pp,
      pv: pvPaye + pvEnPlus,
      // Boost : 1 Sacré (Prêtre), ou 1 Inspiration (chant du Barde, rendue avec les ressources).
      ...(l.boost && action.ecole !== 'chant' ? { sacre: 1 } : {}),
      ...(Object.keys(ressources).length ? { ressources } : {}),
      ...(attaqueSpecialeDuCombat ? { attaqueSpecialeDuCombat: true as const } : {}),
      ...(combinaisonReduite ? { combinaisonDuCombat: true as const } : {}),
    },
    dd,
    jets,
    changements,
    ...(coupDouble ? { coupDouble: true as const } : {}),
  });
  const refusPv = sansSousUnPv(pvPaye + (sang ? cout.pp : 0));
  if (refusPv) return { ok: false, raison: refusPv };

  // 2. Échec d'école.
  const seuilEcole = seuilEchec(l.ecole ?? 'adepte');
  if (seuilEcole) {
    const j = d20(alea, 0);
    const rate = j.garde <= seuilEcole;
    jets.push({ quoi: 'maîtrise de l’école', des: j.des, total: j.garde, contre: seuilEcole, reussi: !rate });
    if (rate) return fin('echecEcole', 0);
  }

  // 3. Dérapage de l'élément.
  let derape = false; // élément raté : le sort entier échoue (1b)
  const seuilElement = l.element && (!mineur || affinite) ? seuilEchec(l.element.maitrise) : 0;
  let ficheDerapee = fiche;
  if (seuilElement) {
    const j = d20(alea, 0);
    derape = j.garde <= seuilElement;
    jets.push({ quoi: 'maîtrise de l’élément', des: j.des, total: j.garde, contre: seuilElement, reussi: !derape });
  }
  // Second élément d'une combinaison : il dérape à son rang (Initié 1–4, Non maîtrisé 1–10).
  const seuilSecond = l.secondElement && !derape ? seuilEchec(l.secondElement.maitrise) : 0;
  if (seuilSecond) {
    const j = d20(alea, 0);
    derape = j.garde <= seuilSecond;
    if (derape) ficheDerapee = fiche2;
    jets.push({ quoi: 'maîtrise du second élément', des: j.des, total: j.garde, contre: seuilSecond, reussi: !derape });
  }
  // Voie sauvage (2a, 7b du 21/10) : le dérapage devient une Mutation sauvage, le sort part sans élément.
  const sauvage = v.sauvage?.rang ?? 0;
  const sansElement = derape && sauvage >= 1;
  if (sansElement) derape = false;
  const elementActif = fiche && (!mineur || affinite) && !sansElement && !signature ? fiche : undefined;
  const secondActif = fiche2 && !sansElement && !signature ? fiche2 : undefined;
  const signatureActive = signature && !sansElement ? signature : undefined;
  // Ce que les éléments changent au sort : le premier l'emporte sur le second.
  const modifs = { ...(secondActif?.sort.modifie ?? {}), ...(elementActif?.sort.modifie ?? {}) };
  const rebondDuSecond = !elementActif?.sort.modifie.rebond && !!secondActif?.sort.modifie.rebond;
  let pv = sang && !sansElement ? cout.pp : 0;
  if (derape && ficheDerapee) {
    if (ficheDerapee.derapage.modifie.coutPvMultiplie) pv *= ficheDerapee.derapage.modifie.coutPvMultiplie;
    for (const e of ficheDerapee.derapage.effets) appliquerSimple(e, l.lanceur.id, changements, alea, m);
    return fin('derapage', pv);
  }

  // d20 de chaos (R3 des Voies du chaos, 5a) : 18 à 20, mutation du palier 1.
  if (action.jetDeChaos) {
    const j = d20(alea, 0);
    jets.push({ quoi: 'd20 de chaos', des: j.des, total: j.garde, contre: 18, reussi: j.garde < 18 });
    if (j.garde >= 18) changements.push({ type: 'mutation', cible: l.lanceur.id, palier: 1 });
  }

  // Durées tirées au lancement (Pierre en chair : 1d4 + CHA), un seul jet par sort.
  action = avecDureesTirees(action, alea, l.lanceur.modMagie, jets);
  // Boost de Foi : +1 round.
  if (l.boost === 'plusUnRound')
    action = {
      ...action,
      effets: action.effets.map((e) => ('duree' in e && typeof e.duree === 'object' && 'rounds' in e.duree ? { ...e, duree: { rounds: e.duree.rounds + 1 } } : e)) as Action['effets'],
    };

  // Le lanceur qui attaque perd Dissimulé, Invisible ; Déséquilibré tombe après son jet d'attaque.
  const offensif = action.ciblage.camp === 'ennemi' || action.effets.some((e) => e.type === 'degats');
  const rompus = etatsDe(l.lanceur, cat)
    .filter((e) => offensif && e.rompuPar.includes('sesAttaques'))
    .map((e) => e.id);
  const attaque = action.resolution.jet === 'attaqueMagique' || action.resolution.jet === 'attaque';
  if (attaque) rompus.push(...etatsDe(l.lanceur, cat).filter((e) => e.desavantage.includes('prochaineAttaque')).map((e) => e.id));

  // 4. Cibles.
  const memeCamp = (c: Combattant) => c.camp === l.lanceur.camp;
  const zone = (l.zone ?? []).filter((c) =>
    action.zone?.filtre === 'ennemis' ? !memeCamp(c) : action.zone?.filtre === 'allies' ? memeCamp(c) : true,
  );
  const sauvegarde: Sauvegarde | undefined =
    action.resolution.jet === 'sauvegarde' ? (modifs.sauvegarde ?? action.resolution.sauvegarde) : undefined;
  const saves = new Map<string, boolean>();
  const sauve = (c: CibleEnJeu, type: Sauvegarde, quoi: string): boolean => {
    const cle = `${c.id}|${type}`;
    if (saves.has(cle)) return saves.get(cle)!;
    const bonus = c.sauvegardes[type] + modificateur(c, cat, ['sauvegardes', `sauvegarde${type}`]);
    const j = d20(alea, 0);
    const reussi = j.garde + bonus >= dd;
    jets.push({ quoi, cible: c.id, des: j.des, total: j.garde + bonus, contre: dd, reussi });
    saves.set(cle, reussi);
    return reussi;
  };
  const affaibli = etatsDe(l.lanceur, cat).find((e) => e.degatsInfliges);

  type Issue = { touche?: boolean; critique?: boolean; sauveReussie?: boolean };
  // Critique (4a) : 20 naturel, 19–20 avec Précision létale (Maître d'armes 3).
  const seuilCoupCritique = maitre >= 3 ? 19 : 20;
  const nomJet = action.resolution.jet === 'attaque' ? 'attaque' : 'attaque magique';
  let aTouche = false;
  const issueDe = (c: CibleEnJeu): Issue => {
    if (attaque) {
      // Double (lot L4.5) : une charge fait rater l'attaque, sans jet.
      const leurre = etatsDe(c, cat).find((e) => e.annuleAttaquesContre);
      if (leurre) {
        changements.push({ type: 'chargeConsommee', cible: c.id, etat: leurre.id });
        jets.push({ quoi: `${nomJet} (${leurre.nom} : ratée d’office)`, cible: c.id, des: [], total: 0, reussi: false });
        return { touche: false };
      }
      const av = avantageAttaque(l.lanceur, c, cat);
      const defBase = modifs.ignoreArmure || action.ignoreArmure ? (c.defSansArmure ?? c.def) : c.def;
      const def = defBase + modificateur(c, cat, ['DEF']);
      const j = d20(alea, av);
      const bonus = action.resolution.jet === 'attaqueMagique' ? l.lanceur.attaqueMagique : action.attaquePar ? m.caracs[action.attaquePar]! : l.arme!.attaque;
      const total = j.garde + bonus;
      const critique = aLArme && j.garde >= seuilCoupCritique;
      const touche = critique || total >= def;
      if (touche) aTouche = true;
      jets.push({ quoi: nomJet, cible: c.id, des: j.des, total, contre: def, reussi: touche, ...(critique ? { critique: true as const } : {}) });
      return { touche, critique };
    }
    // Un allié consentant accepte l'effet sans sauvegarder (Portail, lot L4.4a).
    if (sauvegarde && action.resolution.consentant && memeCamp(c)) return { sauveReussie: false };
    // Boost de Foi : pas de sauvegarde.
    if (sauvegarde && l.boost === 'sansSauvegarde') return { sauveReussie: false };
    if (sauvegarde) return { sauveReussie: sauve(c, sauvegarde, `sauvegarde de ${sauvegarde}`) };
    return {};
  };

  const conditionRemplie = (e: Effet, c: CibleEnJeu, i: Issue, sauvegardeEffet?: Sauvegarde): boolean => {
    // Une attaque ratée ne porte rien, quelle que soit la condition (Botte mortelle : +2d6 sur cible affaiblie, lot L4.8).
    if (i.touche === false) return false;
    switch (e.condition) {
      case undefined:
        return !(i.sauveReussie && action.resolution.siSauvegarde === 'annule');
      case 'touche':
        return i.touche === true;
      case 'sauvegardeRatee':
      case 'sauvegardeReussie': {
        let reussie = i.sauveReussie;
        if (reussie === undefined && sauvegardeEffet) reussie = sauve(c, sauvegardeEffet, `sauvegarde de ${sauvegardeEffet} (élément)`);
        if (reussie === undefined) return false;
        return e.condition === 'sauvegardeReussie' ? reussie : !reussie;
      }
      case 'contreMetal':
        return !!c.armureMetal;
      case 'contreDemonsMortsVivants':
        return !!c.demonOuMortVivant;
      case 'cibleMarquee':
        return c.etats.includes('marque');
      case 'cibleAccusee':
        return c.etats.includes('accuse');
      case 'cibleNAPasAgi':
        return !c.aAgi;
      case 'immobile':
        return !!l.immobile;
      case 'protegeUnAllie':
        return !!l.protegeUnAllie;
      case 'armeLegere':
        return !!l.arme?.legere;
      case 'cibleAffaiblie':
        return etatsDe(c, cat).some((x) => x.categorie === 'malus' || x.categorie === 'controle');
      case 'premierRound':
        return !!l.premierRound;
    }
  };

  const typeDegats = (e: Extract<Effet, { type: 'degats' }>) => (l.element && !sansElement ? l.element.id : (ficheCoup?.id ?? e.typeDegats));
  // Précision létale (Maître d'armes 3) : l'état d'une attaque spéciale dure 1 round de plus.
  const roundsEnPlus = action.famille && maitre >= 3 ? 1 : 0;

  // Mutation sauvage (Voie sauvage 1, règle v1 conservée) : 2d4 − 4 aux dégâts de chaque sort offensif.
  let mutation = 0;
  const offensifDegats = action.effets.some((e) => e.type === 'degats');
  if (sauvage >= 1 && offensifDegats) {
    if (sauvage >= 4 && v.sauvage?.maitriseDuChaos) {
      mutation = 4;
      jets.push({ quoi: 'Maîtrise du chaos', des: [], total: 4 });
    } else {
      const tirer = () => lancerDes('2d4', alea);
      const a = tirer();
      let garde = a;
      if (sauvage >= 2 && v.sauvage?.instinct) {
        const b = tirer();
        garde = b.total > a.total ? b : a;
        jets.push({ quoi: 'Instinct chaotique', des: [...a.des, ...b.des], total: garde.total - 4 });
      } else jets.push({ quoi: 'Mutation sauvage', des: a.des, total: a.total - 4 });
      mutation = garde.total - 4;
    }
    if (sauvage >= 5 && v.sauvage?.submersion) mutation *= 2;
  }
  // Dés en plus sur le premier effet de dégâts : Sang versé (Hémomancie 4) et Saignée (+2d6).
  const desEnPlus = [hemo >= 4 && v.hemomancie?.sangVerse ? 'sangVerse' : null, saignee ? 'saignee' : null].filter((x): x is string => !!x);
  const jetsZone = new Map<number, { des: number[]; total: number }>();
  const premierDegats = action.effets.findIndex((e) => e.type === 'degats');
  let baseRebond: number | null = null;
  let deSang: { des: number[]; total: number } | null = null;
  const desSupplementaires = new Map<string, { des: number[]; total: number }>();
  const pris = new Set<string>();
  const chaines = new Map<number, { total: number; vues: number }>();
  let premierJetFait = false;
  let donApplique = false;
  let deDuDon: { des: number[]; total: number } | null = null;

  const degatsSur = (e: Extract<Effet, { type: 'degats' }>, indice: number, c: CibleEnJeu, i: Issue, base: number, deJet: number[], reduit = false) => {
    const facteurs: number[] = [];
    const calcul: string[] = [`${base} (${deJet.join(' + ') || base})`];
    if (reduit) {
      facteurs.push(0.5);
      calcul.push('second élément non Maître ×½');
    }
    if (i.sauveReussie && action.resolution.siSauvegarde === 'moitie' && !e.condition) {
      facteurs.push(0.5);
      calcul.push('sauvegarde réussie ×½');
    }
    if (e.attenuation && c.distance > e.attenuation.pleinsJusqua) {
      facteurs.push(0.5);
      calcul.push(`au-delà de ${e.attenuation.pleinsJusqua} cases ×½`);
    }
    if (e.vise === 'zone' && action.zone?.degressif) {
      const f = FACTEUR_DEGRESSIF(c.anneau ?? 0);
      if (f !== 1) {
        facteurs.push(f);
        calcul.push(`dégressif ×${f}`);
      }
    }
    if (e.doubleContre === 'demonsMortsVivants' && c.demonOuMortVivant) {
      facteurs.push(2);
      calcul.push('démon ou mort-vivant ×2');
    }
    if (l.boost === 'doubleContreDemons' && c.demonOuMortVivant) {
      facteurs.push(2);
      calcul.push('boost de Sacré ×2');
    }
    if (modifs.contreMetal && c.armureMetal) {
      facteurs.push(modifs.contreMetal);
      calcul.push(`armure de métal ×${modifs.contreMetal}`);
    }
    let montant = degatsReduits(base, facteurs);
    if (affaibli?.degatsInfliges) {
      const avant = montant;
      montant = appliquerAffaibli(montant, affaibli.degatsInfliges.pourcent, affaibli.degatsInfliges.minimum);
      if (montant !== avant) calcul.push(`Affaibli ${avant} → ${montant}`);
    }
    changements.push({ type: 'degats', cible: c.id, montant, typeDegats: typeDegats(e), calcul: calcul.join(', ') });
    if (indice === premierDegats && baseRebond === null) baseRebond = base;
  };

  const appliquer = (e0: Effet, indice: number, c: CibleEnJeu, i: Issue, sauvegardeEffet?: Sauvegarde, reduit = false) => {
    const e = 'duree' in e0 && e0.duree !== undefined ? ({ ...e0, duree: dureePourLaCible(e0.duree, c) } as Effet) : e0;
    if (!conditionRemplie(e, c, i, sauvegardeEffet)) return;
    // Boss et démons D5 : immunisés à Sommeil, Ordre, Domination (validé).
    if (e.saufBoss && c.boss) {
      changements.push({ type: 'narratif', cible: c.id, texte: `${c.id} n’y est pas soumis (boss).` });
      return;
    }
    // Sommeil : seulement sous un seuil de PV actuels (4 × niveau du lanceur, validé).
    if (e.type === 'etat' && e.siPvAuPlus) {
      const seuil = e.siPvAuPlus.parNiveau * (l.lanceur.niveau ?? 1);
      if (c.pv === undefined || c.pv > seuil) return;
    }
    // « Sinon » (Bannissement) : seulement si l'effet visé n'a pas pris sur cette cible.
    if (e.sinon !== undefined && pris.has(`${e.sinon}|${c.id}`)) return;
    pris.add(`${indice}|${c.id}`);
    if ((e.type === 'soin' || e.type === 'pvTemp') && e.vise === 'zone' && UN_JET_PAR_ZONE) {
      // Zone : un seul jet de soin pour tous, comme pour les dégâts (2a du 21/10/2026).
      if (!jetsZone.has(indice)) {
        const j = lancerDes(e.des, alea);
        jets.push({ quoi: e.type === 'soin' ? 'soin' : 'PV temporaires', des: j.des, total: j.total });
        jetsZone.set(indice, j);
      }
      changements.push({ type: e.type, cible: c.id, montant: jetsZone.get(indice)!.total + modDeLEffet(e, m) });
      return;
    }
    if (e.type === 'soin' && e.enChaine) {
      // Chaîne de vie : un seul jet ; la première cible le reçoit entier, les suivantes pour moitié.
      if (!chaines.has(indice)) {
        const j = lancerDes(e.des, alea);
        jets.push({ quoi: 'soin', des: j.des, total: j.total });
        chaines.set(indice, { total: j.total + modDeLEffet(e, m), vues: 0 });
      }
      const ch = chaines.get(indice)!;
      changements.push({ type: 'soin', cible: c.id, montant: ch.vues++ === 0 ? ch.total : Math.floor(ch.total / 2) });
      return;
    }
    if (e.type === 'etat' && l.boost === 'doubleContreDemons' && c.demonOuMortVivant && typeof e.duree === 'object' && 'rounds' in e.duree) {
      appliquerSimple({ ...e, duree: { rounds: e.duree.rounds * 2 } }, c.id, changements, alea, m);
      return;
    }
    // Pas sur l'effet générique d'un élément (indice −1) : seulement l'état de l'attaque spéciale, ou le second du Coup de maître (−2).
    if (e.type === 'etat' && roundsEnPlus && indice !== -1 && typeof e.duree === 'object' && 'rounds' in e.duree) {
      appliquerSimple({ ...e, duree: { rounds: e.duree.rounds + roundsEnPlus } }, c.id, changements, alea, m);
      return;
    }
    if (e.type === 'posture') {
      const p = l.posture!;
      changements.push({ type: 'bonus', cible: c.id, sur: p.plus, valeur: p.valeur, duree: 'prochainTour' });
      changements.push({ type: 'bonus', cible: c.id, sur: p.moins, valeur: -p.valeur, duree: 'prochainTour' });
      return;
    }
    if (e.type === 'degats') {
      // Dés de l'arme (lot L4.7) : doublés sur un critique (4a), son bonus de dégâts ajouté une fois.
      let formule = e.des === 'arme' ? (i.critique ? doublerDes(l.arme!.des) : l.arme!.des) : e.progression === 'mineur' ? deMineur(l.lanceur.niveau ?? 1, v.virtuose?.crans ?? 0) : e.des;
      if (mineur && v.virtuose?.gesteUnique) formule = doublerDes(formule);
      let jet: { des: number[]; total: number };
      if (e.vise === 'zone' && UN_JET_PAR_ZONE) {
        if (!jetsZone.has(indice)) jetsZone.set(indice, lancerDes(formule, alea));
        jet = jetsZone.get(indice)!;
      } else jet = lancerDes(formule, alea);
      // Don corrompu, relance (4a) : le dé le plus bas du premier jet de dégâts, une fois par sort.
      if (don === 'relance' && indice === premierDegats && !donApplique) {
        const t = /^(\d*)d(\d+)/.exec(formule.replace(/^[+]/, ''));
        const n = Math.min(Number(t?.[1] || 1), jet.des.length);
        if (t && n > 0) {
          const k = jet.des.slice(0, n).reduce((kMin, d, ix, arr) => (d < arr[kMin]! ? ix : kMin), 0);
          const r = lancerDes(`1d${t[2]}`, alea);
          jets.push({ quoi: 'Don corrompu : relance', des: [jet.des[k]!, ...r.des], total: r.total });
          const desNeufs = [...jet.des];
          desNeufs[k] = r.total;
          jet = { des: desNeufs, total: jet.total - jet.des[k]! + r.total };
          if (e.vise === 'zone' && UN_JET_PAR_ZONE) jetsZone.set(indice, jet);
        }
        donApplique = true;
      }
      let base = jet.total + modDeLEffet(e, m) + (e.des === 'arme' ? l.arme!.degats : 0);
      const des = [...jet.des];
      // Dés en plus (sang, Sang versé, Saignée) et Mutation sauvage : une fois par sort,
      // donc sur le jet commun d'une zone, ou sur le premier projectile seulement.
      const porteDesEnPlus = indice === premierDegats && (e.vise === 'zone' || !premierJetFait);
      if (indice === premierDegats) premierJetFait = true;
      if (porteDesEnPlus) {
        for (const quoi of desEnPlus) {
          if (!desSupplementaires.has(quoi)) {
            const faces = /d(\d+)/.exec(formule)?.[1] ?? '6';
            const d = lancerDes(quoi === 'saignee' ? '2d6' : `1d${faces}`, alea);
            jets.push({ quoi: quoi === 'saignee' ? 'Saignée' : 'Sang versé', des: d.des, total: d.total });
            desSupplementaires.set(quoi, d);
          }
          const d = desSupplementaires.get(quoi)!;
          base += d.total;
          des.push(...d.des);
        }
      }
      if (mutation && porteDesEnPlus) base = Math.max(0, base + mutation);
      if (sang && porteDesEnPlus) {
        if (!deSang) {
          const faces = /d(\d+)/.exec(e.des)?.[1];
          deSang = lancerDes(`1d${faces ?? 6}`, alea);
          jets.push({ quoi: 'dé de sang', des: deSang.des, total: deSang.total });
        }
        // Sang en second élément non Maître : son dé compte pour moitié (13a).
        base += sangSecond && combinaisonReduite ? Math.floor(deSang.total / 2) : deSang.total;
        des.push(...deSang.des);
      }
      jets.push({ quoi: 'dégâts', cible: c.id, des, total: base });
      degatsSur(e, indice, c, i, base, des, reduit);
      // Don corrompu, +1d6 chaotiques (4a) : un jet par sort, porté comme les dés en plus.
      if (don === 'plus1d6' && porteDesEnPlus) {
        if (!deDuDon) {
          deDuDon = lancerDes('1d6', alea);
          jets.push({ quoi: 'Don corrompu', des: deDuDon.des, total: deDuDon.total });
        }
        changements.push({ type: 'degats', cible: c.id, montant: deDuDon.total, typeDegats: 'chaotique', calcul: `Don corrompu 1d6 (${deDuDon.total})` });
      }
      return;
    }
    // Table au d20 (Murmure terrifiant, lot L4.9) : un d20 par cible, la ligne du plus haut `min` atteint.
    if (e.type === 'tableD20') {
      const j = d20(alea, 0);
      const ligne = e.lignes.find((x) => j.garde >= x.min)!;
      jets.push({ quoi: `${action.nom} : d20`, cible: c.id, des: j.des, total: j.garde });
      const base = 1000 * (indice + 1);
      ligne.effets.forEach((x, k) => appliquer({ ...x, ...(x.sinon !== undefined ? { sinon: base + x.sinon } : {}) } as Effet, base + k, c, { ...i, touche: undefined, sauveReussie: undefined }));
      return;
    }
    if (e.type === 'jetsReserves') {
      const valeurs = Array.from({ length: l.nombreDeDes ?? 0 }, () => lancerDes(e.des, alea).total);
      jets.push({ quoi: `${action.nom} : dés tirés d’avance`, des: valeurs, total: valeurs.length });
      changements.push({ type: 'jetsReserves', cible: c.id, valeurs });
      return;
    }
    if (e.type === 'invocation') {
      // L'élément choisi suit l'invocation : ses coups portent l'effet générique (Arme spirituelle, Serviteur).
      const element = l.element && action.element ? l.element.id : undefined;
      const creature = e.parElement && l.element ? `${e.creature}.${l.element.id}` : e.creature;
      changements.push({ type: 'invocation', creature, nombre: e.nombre, duree: e.duree, ...(element ? { element } : {}) });
      return;
    }
    if (e.type === 'deplacement' && e.sens === 'repousse' && modifs.pousseeEnPlus && (l.choixEau ?? 'poussee') === 'poussee') {
      changements.push({ type: 'deplacement', cible: c.id, sens: e.sens, cases: e.cases + modifs.pousseeEnPlus });
      return;
    }
    appliquerSimple(e, c.id, changements, alea, m);
  };

  const ciblesPour = (e: Effet): CibleEnJeu[] =>
    e.vise === 'zone'
      ? [...zone]
      : e.vise === 'allie'
        ? l.allie
          ? [l.allie]
          : []
        : e.vise === 'lanceur'
          ? [{ ...l.lanceur, distance: 0 }]
          : e.vise === 'voisins'
            ? [...(l.voisins ?? [])]
            : [...l.cibles];

  const issues = new Map<string, Issue>();
  const issuePour = (c: CibleEnJeu, projectile: number) => {
    const cle = attaque ? `${c.id}#${projectile}` : c.id;
    if (!issues.has(cle)) issues.set(cle, issueDe(c));
    return issues.get(cle)!;
  };

  action.effets.forEach((e, indice) => {
    // Terrain et invocation : une fois par lancer, sans cible (Rempart, Serviteur…).
    if (e.type === 'terrain' || e.type === 'invocation') {
      appliquer(e, indice, { ...l.lanceur, distance: 0 }, {});
      return;
    }
    if (e.vise === 'lanceur' || e.vise === 'allie') {
      for (const c of ciblesPour(e)) appliquer(e, indice, c, {});
      return;
    }
    ciblesPour(e).forEach((c, p) => appliquer(e, indice, c, issuePour(c, p)));
  });

  // Boosts de Sacré sans effet propre au verbe.
  if (l.boost === 'retraitEtat') for (const c of l.cibles) changements.push({ type: 'retraitEtat', cible: c.id, etats: [], nombre: 1 });
  if (l.boost === 'ignoreResistances') changements.push({ type: 'narratif', cible: l.lanceur.id, texte: 'Boost de Sacré : ce sort ignore les résistances.' });
  if (l.boost === 'marquePartagee') changements.push({ type: 'narratif', cible: l.lanceur.id, texte: 'Boost de Sacré : le bonus de la Marque vaut aussi pour les sorts des alliés.' });

  // Effets génériques des éléments, ou la signature de la paire (lot L4.10).
  if ((elementActif || secondActif || signatureActive) && action.element) {
    const surZone = action.zone !== null && action.effets.some((e) => e.vise === 'zone');
    const porteurs = surZone ? zone : action.element.application === 'ciblePrincipale' ? l.cibles.slice(0, 1) : [...l.cibles];
    const sansSauvegarde = action.resolution.jet !== 'sauvegarde';
    type Volet = { effets: readonly Effet[]; sauvegarde?: Sauvegarde; propre?: boolean; reduit: boolean };
    const volets: Volet[] = [];
    const genere = (f: FicheElement, reduit: boolean) => {
      // Eau : retirer un état à l'allié choisi plutôt que la poussée.
      if (f.id === 'eau' && l.choixEau === 'retraitEtat') {
        if (l.allie) for (const e of f.sort.auChoix) appliquerSimple(reduit ? reduire(e) : e, l.allie.id, changements, alea, m);
        return;
      }
      volets.push({ effets: f.sort.effets, ...(sansSauvegarde && f.sort.sauvegardeSiAucune ? { sauvegarde: f.sort.sauvegardeSiAucune } : {}), reduit });
    };
    if (signatureActive) volets.push({ effets: signatureActive.effets, ...(signatureActive.sauvegarde ? { sauvegarde: signatureActive.sauvegarde, propre: true } : {}), reduit: combinaisonReduite });
    else {
      if (elementActif) genere(elementActif, false);
      if (secondActif) genere(secondActif, combinaisonReduite);
    }
    const principal = porteurs[0];
    for (const volet of volets) {
      // Une signature joue sa propre sauvegarde (Vapeur : CON), indépendante de celle du sort.
      const issueVolet = (i: Issue): Issue => (volet.propre ? { ...(i.touche !== undefined ? { touche: i.touche } : {}) } : i);
      for (const e0 of volet.effets) {
        const e = volet.reduit ? reduire(e0) : e0;
        // Terrain : une fois, si le sort a pris sur la cible principale. Voisins : autour d'elle, chacun sa sauvegarde.
        if (e.type === 'terrain') {
          if (principal && conditionRemplie({ type: 'narratif', texte: '-', vise: 'cible' }, principal, issuePour(principal, 0))) appliquerSimple(e, l.lanceur.id, changements, alea, m);
          continue;
        }
        if (e.vise === 'voisins') {
          if (principal && conditionRemplie({ type: 'narratif', texte: '-', vise: 'cible' }, principal, issuePour(principal, 0)))
            for (const c of l.voisins ?? []) appliquer(e, -1, c, {}, volet.sauvegarde, volet.reduit);
          continue;
        }
        porteurs.forEach((c, p) => appliquer({ ...e, vise: 'cible' } as Effet, -1, c, issueVolet(issuePour(c, p)), volet.sauvegarde, volet.reduit));
      }
    }
    // Rebond de l'électricité : moitié des dégâts de la cible principale, même sauvegarde (7a) ; un quart en second élément réduit.
    const rebond = modifs.rebond;
    const premier = action.effets[premierDegats];
    if (rebond && l.rebond && baseRebond !== null && premier?.type === 'degats') {
      const c = l.rebond;
      const i: Issue = sauvegarde ? { sauveReussie: sauve(c, sauvegarde, `sauvegarde de ${sauvegarde} (rebond)`) } : {};
      if (!(i.sauveReussie && action.resolution.siSauvegarde === 'annule')) {
        const base = Math.floor(baseRebond / 2);
        degatsSur({ ...premier, attenuation: undefined, vise: 'cible' }, -1, { ...c, distance: 0 }, i, base, [base], rebondDuSecond && combinaisonReduite);
      }
    }
  }

  // Coup de maître (Maître d'armes 5, 1x/combat) : un second état, ou l'effet générique d'un élément, sur la cible touchée.
  if (coupDeMaitre && action.famille) {
    l.cibles.forEach((c, p) => {
      const i = issuePour(c, p);
      if ('etat' in coupDeMaitre) appliquer({ type: 'etat', etat: coupDeMaitre.etat, duree: { rounds: 1 }, vise: 'cible' }, -2, c, i);
      else for (const e of ficheCoup!.sort.effets) appliquer({ ...e, vise: 'cible' } as Effet, -1, c, i, ficheCoup!.sort.sauvegardeSiAucune);
    });
  }
  // Éclat chaotique (Envoûteur, Voie du chaos 1 ; 8a) : un sort d'Illusion inflige aussi 1d6 chaotiques à chaque ennemi qu'il affecte.
  if (v.chaos?.eclatChaotique && action.ecole === 'illusion') {
    const ennemis = new Set([...l.cibles, ...(l.zone ?? [])].filter((c) => !memeCamp(c)).map((c) => c.id));
    const touchees = [...new Set(changements.filter((c) => 'cible' in c && ennemis.has(c.cible) && c.type !== 'narratif').map((c) => (c as { cible: string }).cible))];
    for (const id of touchees) {
      const d = lancerDes('1d6', alea);
      jets.push({ quoi: 'Éclat chaotique', cible: id, des: d.des, total: d.total });
      changements.push({ type: 'degats', cible: id, montant: d.total, typeDegats: 'chaotique', calcul: `Éclat chaotique 1d6 (${d.total})` });
    }
    if (touchees.length) changements.push({ type: 'ressource', cible: l.lanceur.id, ressource: 'plongee', montant: 1 });
  }
  if (don) changements.push({ type: 'ressource', cible: l.lanceur.id, ressource: 'plongee', montant: 1 });

  // Coup double (Maître d'armes 4, décision 10a ; nommé au lot L4.8, 9a) : une attaque spéciale qui touche en ouvre une seconde, une seule fois.
  coupDouble = !!action.famille && maitre >= 4 && !v.maitreDArmes?.secondeDuCoupDouble && aTouche;

  // Mutation sauvage : Canalisation profonde (rang 3) sur +3 ou plus ; Submersion négative ou positive (rang 5).
  if (sauvage >= 1 && offensifDegats) {
    const premiere = changements.find((c) => c.type === 'degats' && c.cible !== l.lanceur.id);
    if (sauvage >= 3 && mutation >= 3 && v.sauvage?.canalisation && premiere?.type === 'degats') {
      const choix = v.sauvage.canalisation;
      if (choix === 'repousse') changements.push({ type: 'deplacement', cible: premiere.cible, sens: 'repousse', cases: 1 });
      else changements.push({ type: 'etat', cible: premiere.cible, etat: choix === 'brulure' ? 'brulure' : 'aveugle', duree: { rounds: 1 } });
    }
    if (sauvage >= 5 && v.sauvage?.submersion) {
      if (mutation < 0) {
        const choc = lancerDes('1d4', alea);
        jets.push({ quoi: 'Submersion : contrecoup', des: choc.des, total: choc.total });
        changements.push({ type: 'degats', cible: l.lanceur.id, montant: choc.total, typeDegats: 'magique', calcul: `1d4 (${choc.total})` });
        changements.push({ type: 'etat', cible: l.lanceur.id, etat: 'etourdi', duree: { rounds: 1 } });
      } else if (mutation > 0) changements.push({ type: 'narratif', cible: l.lanceur.id, texte: 'Submersion arcanique : un effet spectaculaire, au choix du MJ.' });
    }
  }

  // Sang appelle sang (Hémomancie 2, 10c et 3a du 21/10) : un quart des dégâts infligés, au plus la moitié du coût du sort.
  if (hemo >= 2) {
    const inflige = changements.reduce((s, c) => (c.type === 'degats' && c.cible !== l.lanceur.id ? s + c.montant : s), 0);
    const rendu = Math.min(Math.floor(inflige / 4), Math.ceil(cout.pp / 2));
    if (rendu > 0) changements.push({ type: 'soin', cible: l.lanceur.id, montant: rendu });
  }

  // Sang : le lanceur récupère la moitié du dé ajouté.
  const de = deSang as { total: number } | null;
  if (de) changements.push({ type: 'soin', cible: l.lanceur.id, montant: Math.floor(de.total / 2) });

  if (rompus.length) changements.push({ type: 'retraitEtat', cible: l.lanceur.id, etats: [...new Set(rompus)], nombre: new Set(rompus).size });
  // Corruption d'Âme (1b) : +1 par multiple de 6 de Plongée dépassé, quand le moteur connaît la Plongée du lanceur.
  if (l.lanceur.plongee !== undefined) {
    const gain = changements.reduce((s, c) => (c.type === 'ressource' && c.cible === l.lanceur.id && c.ressource === 'plongee' && typeof c.montant === 'number' ? s + c.montant : s), 0);
    const avant = l.lanceur.plongee - (ressources.plongee ?? 0);
    const ame = corruptionParLaPlongee(avant, avant + gain);
    if (ame) changements.push({ type: 'ressource', cible: l.lanceur.id, ressource: 'corruptionAme', montant: ame });
  }
  return fin('reussi', pv);
}

/** Effets qui ne demandent ni jet ni calcul de dégâts. */
function appliquerSimple(e: Effet, cible: string, out: Changement[], alea: () => number, m: Mods): void {
  switch (e.type) {
    case 'degats':
      // Les dés de l'arme ne passent que par le jet d'attaque (resoudreLancer).
      if (e.des === 'arme') return;
      out.push({ type: 'degats', cible, montant: lancerDes(e.des, alea).total + modDeLEffet(e, m), typeDegats: e.typeDegats, calcul: e.des });
      return;
    case 'soin':
      out.push({ type: 'soin', cible, montant: lancerDes(e.des, alea).total + modDeLEffet(e, m) });
      return;
    case 'pvTemp':
      out.push({ type: 'pvTemp', cible, montant: lancerDes(e.des, alea).total + modDeLEffet(e, m) });
      return;
    case 'etat':
      out.push({
        type: 'etat',
        cible,
        etat: e.etat,
        duree: e.duree,
        ...(e.charges ? { charges: e.charges } : {}),
        ...(e.contre ? { contre: e.contre } : {}),
        ...(e.draine && m.lanceur ? { drainePour: m.lanceur } : {}),
      });
      return;
    case 'retraitEtat':
      out.push({ type: 'retraitEtat', cible, etats: e.etats, nombre: e.nombre });
      return;
    case 'deplacement':
      out.push({ type: 'deplacement', cible, sens: e.sens, cases: e.cases });
      return;
    case 'bonus':
      out.push({
        type: 'bonus',
        cible,
        sur: e.cible === 'caracAuChoix' ? (m.choix ?? e.cible) : e.cible,
        valeur: e.valeur === 'modMagie' ? m.magie : e.valeur === 'pointsDeChaos' ? (m.pointsDeChaos ?? 0) : typeof e.valeur === 'object' ? (m.caracs[e.valeur.mod] ?? 0) : e.valeur,
        duree: e.duree,
        ...(e.typeDegats ? { typeDegats: e.typeDegats } : {}),
        ...(e.consomme ? { consomme: e.consomme } : {}),
        ...(e.parAllieAuContact ? { parAllieAuContact: true as const } : {}),
      });
      return;
    case 'posture':
      return;
    case 'relance':
      out.push({ type: 'relance', cible });
      return;
    case 'ressource':
      out.push({ type: 'ressource', cible, ressource: e.ressource, montant: e.montant });
      return;
    case 'invocation':
      out.push({ type: 'invocation', creature: e.creature, nombre: e.nombre, duree: e.duree });
      return;
    case 'terrain':
      out.push({ type: 'terrain', nature: e.nature, duree: e.duree });
      return;
    case 'dissipation':
      out.push({ type: 'dissipation', cible, nombre: e.nombre });
      return;
    case 'reductionDegats':
      out.push({ type: 'reductionDegats', cible, part: e.part, renvoi: e.renvoi });
      return;
    case 'soinComplet':
      out.push({ type: 'soinComplet', cible });
      return;
    case 'narratif':
      out.push({ type: 'narratif', cible, texte: e.texte });
      return;
    case 'jetsReserves':
      return;
    case 'plancherPv':
      out.push({ type: 'plancherPv', cible, valeur: e.valeur, ...(e.duree ? { duree: e.duree } : {}) });
      return;
    case 'tombe':
      out.push({ type: 'tombe', cible });
      return;
    case 'tableD20':
      return;
  }
}
