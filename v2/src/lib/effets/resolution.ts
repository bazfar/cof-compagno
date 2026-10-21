import { lancerFormule } from '../regles/des';
import type { Action, Duree, Effet, Element, Palier, Sauvegarde } from '../schemas/effets';
import type { FicheElement } from '../schemas/elements';
import type { EtatRefonte } from '../schemas/etats';
import { coutSort, ddSort, MAITRISES, seuilEchec, type CoutCalcule, type Maitrise } from './cout';
import { actionAuPalier } from './paliers';

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
 * Les combinaisons de deux éléments viendront avec leurs signatures, dans
 * les lots des classes : le moteur les refuse d'ici là.
 */

// ---------- Entrées ----------

export interface Combattant {
  id: string;
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
}

export interface CibleEnJeu extends Combattant {
  /** Distance au lanceur, en cases. */
  distance: number;
  /** Zone : cases entre la cible et le centre (0 au centre), pour le dégressif. */
  anneau?: number;
}

export interface LanceurEnJeu extends Combattant {
  modMagie: number;
  attaqueMagique: number;
  /** Niveau du lanceur (dés des sorts mineurs) ; 1 par défaut. */
  niveau?: number;
}

export interface Catalogue {
  etats: ReadonlyMap<string, EtatRefonte>;
  elements: ReadonlyMap<string, FicheElement>;
}

export interface Lancer {
  /** L'action telle qu'écrite (paliers compris) : le moteur la résout au palier lancé. */
  action: Action;
  /** Palier atteint par le lanceur (paliers.ts, palierAtteint). */
  palier: Palier;
  /** Variante choisie au palier lancé (Bouclier III : `deux-cibles`). */
  variante?: string;
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
  /** Eau : 2 cases de poussée en plus (défaut), ou retirer un état à l'allié choisi. */
  choixEau?: 'poussee' | 'retraitEtat';
  alea?: () => number;
}

// ---------- Sorties ----------

export type Changement =
  | { type: 'degats'; cible: string; montant: number; typeDegats: string; calcul: string }
  | { type: 'soin'; cible: string; montant: number }
  | { type: 'pvTemp'; cible: string; montant: number }
  | { type: 'etat'; cible: string; etat: string; duree: Duree }
  | { type: 'retraitEtat'; cible: string; etats: readonly string[]; nombre: number }
  | { type: 'deplacement'; cible: string; sens: 'repousse' | 'attire' | 'teleporte'; cases: number }
  | { type: 'bonus'; cible: string; sur: string; valeur: number | string; duree: Duree }
  | { type: 'ressource'; cible: string; ressource: string; montant: number }
  | { type: 'invocation'; creature: string; nombre: number; duree: Duree; element?: Element }
  | { type: 'terrain'; nature: string; duree: Duree }
  | { type: 'dissipation'; cible: string; nombre: number }
  | { type: 'reductionDegats'; cible: string; part: 'moitie'; renvoi: boolean }
  | { type: 'narratif'; cible: string; texte: string };

export interface JetNote {
  quoi: string;
  cible?: string;
  des: number[];
  total: number;
  /** DD ou DEF visés, et l'issue. */
  contre?: number;
  reussi?: boolean;
}

export type Resultat =
  | {
      ok: true;
      issue: 'reussi' | 'echecEcole' | 'derapage';
      palierLance: Palier;
      cout: { pp: number; pv: number };
      dd: number;
      jets: JetNote[];
      changements: Changement[];
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
 * Coût fixe d'une capacité (Cataclysme : 6 PP). Le moteur ne paie que les
 * PP et les PV ; les ressources de classe (Endurance, Sacré…) viendront avec
 * les classes qui les utilisent.
 */
function coutFixe(cout: readonly { ressource: string; montant: number }[], surcharge?: boolean): CoutCalcule {
  if (surcharge) return { ok: false, raison: 'seul un verbe se surcharge' };
  const autre = cout.find((c) => c.ressource !== 'pp');
  if (autre) return { ok: false, raison: `ressource ${autre.ressource} : pas encore gérée par le moteur` };
  const pp = cout.reduce((s, c) => s + c.montant, 0);
  return { ok: true, pp, palierLance: 'I', detail: [{ terme: 'base', valeur: pp }] };
}

/** Dé d'un sort mineur selon le niveau (validé) : 1d6 (1 à 4), 1d8 (5 à 8), 1d10 (9 à 12) ; `crans` le monte (Perfection). */
export function deMineur(niveau: number, crans = 0): string {
  const echelle = ['1d6', '1d8', '1d10', '1d12'];
  const base = niveau <= 4 ? 0 : niveau <= 8 ? 1 : 2;
  return echelle[Math.min(base + crans, echelle.length - 1)]!;
}

/** Zone : un seul jet de dégâts pour toutes les cibles (décision 2a du 21/10/2026). */
const UN_JET_PAR_ZONE = true;

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
  if (l.secondElement) return { ok: false, raison: 'les combinaisons de deux éléments arrivent avec leurs signatures (lots des classes)' };
  const cout = l.action.cout
    ? coutFixe(l.action.cout, l.surcharge)
    : coutSort(l.action, {
        palier: l.palier,
        surcharge: l.surcharge,
        element: l.element?.maitrise ?? null,
        ecole: l.ecole,
      });
  if (!cout.ok) return cout;
  if (l.variante !== undefined && !l.action.variantes.some((v) => v.id === l.variante && v.palier === cout.palierLance))
    return { ok: false, raison: `${l.action.id} n'a pas de variante ${l.variante} au palier ${cout.palierLance}` };
  const action = actionAuPalier(l.action, cout.palierLance, l.variante);
  if (action.elementMin) {
    // Serviteur : un élément au moins Initié (validé) ; Cataclysme : un élément Maître.
    if (!l.element) return { ok: false, raison: `${action.id} demande un élément` };
    if (MAITRISES.indexOf(l.element.maitrise) < MAITRISES.indexOf(action.elementMin))
      return { ok: false, raison: `${action.id} demande un élément au moins ${NOM_MAITRISE[action.elementMin]}` };
  }
  if (action.effets.some((e) => e.type === 'invocation' && e.parElement) && !l.element) return { ok: false, raison: `${action.id} s'invoque avec un élément` };
  const dd = ddSort(l.lanceur.modMagie, l.ecole ?? 'adepte');
  const jets: JetNote[] = [];
  const changements: Changement[] = [];
  const fiche = l.element ? cat.elements.get(l.element.id) : undefined;
  if (l.element && !fiche) return { ok: false, raison: `élément inconnu : ${l.element.id}` };
  const mineur = action.nature === 'mineur';
  const sang = l.element?.id === 'sang' && !mineur;
  const fin = (issue: 'reussi' | 'echecEcole' | 'derapage', pv: number): Resultat => ({
    ok: true,
    issue,
    palierLance: cout.palierLance,
    cout: { pp: cout.pp, pv },
    dd,
    jets,
    changements,
  });

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
  const seuilElement = l.element && !mineur ? seuilEchec(l.element.maitrise) : 0;
  if (seuilElement) {
    const j = d20(alea, 0);
    derape = j.garde <= seuilElement;
    jets.push({ quoi: 'maîtrise de l’élément', des: j.des, total: j.garde, contre: seuilElement, reussi: !derape });
  }
  const elementActif = fiche && !mineur ? fiche : undefined;
  let pv = sang ? cout.pp : 0;
  if (derape && fiche) {
    if (fiche.derapage.modifie.coutPvMultiplie) pv *= fiche.derapage.modifie.coutPvMultiplie;
    for (const e of fiche.derapage.effets) appliquerSimple(e, l.lanceur.id, changements, alea, l.lanceur.modMagie);
    return fin('derapage', pv);
  }

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
    action.resolution.jet === 'sauvegarde' ? (elementActif?.sort.modifie.sauvegarde ?? action.resolution.sauvegarde) : undefined;
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

  type Issue = { touche?: boolean; sauveReussie?: boolean };
  const issueDe = (c: CibleEnJeu): Issue => {
    if (attaque) {
      const av = avantageAttaque(l.lanceur, c, cat);
      const defBase = elementActif?.sort.modifie.ignoreArmure ? (c.defSansArmure ?? c.def) : c.def;
      const def = defBase + modificateur(c, cat, ['DEF']);
      const j = d20(alea, av);
      const total = j.garde + l.lanceur.attaqueMagique;
      const touche = total >= def;
      jets.push({ quoi: 'attaque magique', cible: c.id, des: j.des, total, contre: def, reussi: touche });
      return { touche };
    }
    // Un allié consentant accepte l'effet sans sauvegarder (Portail, lot L4.4a).
    if (sauvegarde && action.resolution.consentant && memeCamp(c)) return { sauveReussie: false };
    if (sauvegarde) return { sauveReussie: sauve(c, sauvegarde, `sauvegarde de ${sauvegarde}`) };
    return {};
  };

  const conditionRemplie = (e: Effet, c: CibleEnJeu, i: Issue, sauvegardeEffet?: Sauvegarde): boolean => {
    switch (e.condition) {
      case undefined:
        if (i.touche === false) return false;
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
    }
  };

  const typeDegats = (e: Extract<Effet, { type: 'degats' }>) => (l.element ? l.element.id : e.typeDegats);
  const jetsZone = new Map<number, { des: number[]; total: number }>();
  const premierDegats = action.effets.findIndex((e) => e.type === 'degats');
  let baseRebond: number | null = null;
  let deSang: { des: number[]; total: number } | null = null;

  const degatsSur = (e: Extract<Effet, { type: 'degats' }>, indice: number, c: CibleEnJeu, i: Issue, base: number, deJet: number[]) => {
    const facteurs: number[] = [];
    const calcul: string[] = [`${base} (${deJet.join(' + ') || base})`];
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
    if (elementActif?.sort.modifie.contreMetal && c.armureMetal) {
      facteurs.push(elementActif.sort.modifie.contreMetal);
      calcul.push(`armure de métal ×${elementActif.sort.modifie.contreMetal}`);
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

  const appliquer = (e: Effet, indice: number, c: CibleEnJeu, i: Issue, sauvegardeEffet?: Sauvegarde) => {
    if (!conditionRemplie(e, c, i, sauvegardeEffet)) return;
    if (e.type === 'degats') {
      const formule = e.progression === 'mineur' ? deMineur(l.lanceur.niveau ?? 1) : e.des;
      let jet: { des: number[]; total: number };
      if (e.vise === 'zone' && UN_JET_PAR_ZONE) {
        if (!jetsZone.has(indice)) jetsZone.set(indice, lancerDes(formule, alea));
        jet = jetsZone.get(indice)!;
      } else jet = lancerDes(formule, alea);
      let base = jet.total + (e.plusMod ? l.lanceur.modMagie : 0);
      const des = [...jet.des];
      if (sang && indice === premierDegats) {
        if (!deSang) {
          const faces = /d(\d+)/.exec(e.des)?.[1];
          deSang = lancerDes(`1d${faces ?? 6}`, alea);
          jets.push({ quoi: 'dé de sang', des: deSang.des, total: deSang.total });
        }
        base += deSang.total;
        des.push(...deSang.des);
      }
      jets.push({ quoi: 'dégâts', cible: c.id, des, total: base });
      degatsSur(e, indice, c, i, base, des);
      return;
    }
    if (e.type === 'invocation') {
      // L'élément choisi suit l'invocation : ses coups portent l'effet générique (Arme spirituelle, Serviteur).
      const element = l.element && action.element ? l.element.id : undefined;
      const creature = e.parElement && l.element ? `${e.creature}.${l.element.id}` : e.creature;
      changements.push({ type: 'invocation', creature, nombre: e.nombre, duree: e.duree, ...(element ? { element } : {}) });
      return;
    }
    if (e.type === 'deplacement' && e.sens === 'repousse' && elementActif?.sort.modifie.pousseeEnPlus && (l.choixEau ?? 'poussee') === 'poussee') {
      changements.push({ type: 'deplacement', cible: c.id, sens: e.sens, cases: e.cases + elementActif.sort.modifie.pousseeEnPlus });
      return;
    }
    appliquerSimple(e, c.id, changements, alea, l.lanceur.modMagie);
  };

  const ciblesPour = (e: Effet): CibleEnJeu[] =>
    e.vise === 'zone' ? [...zone] : e.vise === 'allie' ? (l.allie ? [l.allie] : []) : e.vise === 'lanceur' ? [{ ...l.lanceur, distance: 0 }] : [...l.cibles];

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

  // Effet générique de l'élément.
  if (elementActif && action.element) {
    const surZone = action.zone !== null && action.effets.some((e) => e.vise === 'zone');
    const porteurs = surZone ? zone : action.element.application === 'ciblePrincipale' ? l.cibles.slice(0, 1) : [...l.cibles];
    const sauvegardeEffet = action.resolution.jet === 'sauvegarde' ? undefined : elementActif.sort.sauvegardeSiAucune;
    const effetsElement = l.choixEau === 'retraitEtat' ? [] : elementActif.sort.effets;
    porteurs.forEach((c, p) => {
      const i = issuePour(c, p);
      for (const e of effetsElement) appliquer({ ...e, vise: 'cible' } as Effet, -1, c, i, sauvegardeEffet);
    });
    if (l.choixEau === 'retraitEtat' && l.allie) for (const e of elementActif.sort.auChoix) appliquerSimple(e, l.allie.id, changements, alea, l.lanceur.modMagie);
    // Rebond de l'électricité : moitié des dégâts de la cible principale, même sauvegarde (7a).
    const rebond = elementActif.sort.modifie.rebond;
    const premier = action.effets[premierDegats];
    if (rebond && l.rebond && baseRebond !== null && premier?.type === 'degats') {
      const c = l.rebond;
      const i: Issue = sauvegarde ? { sauveReussie: sauve(c, sauvegarde, `sauvegarde de ${sauvegarde} (rebond)`) } : {};
      if (!(i.sauveReussie && action.resolution.siSauvegarde === 'annule')) {
        const base = Math.floor(baseRebond / 2);
        degatsSur({ ...premier, attenuation: undefined, vise: 'cible' }, -1, { ...c, distance: 0 }, i, base, [base]);
      }
    }
  }

  // Sang : le lanceur récupère la moitié du dé ajouté.
  const de = deSang as { total: number } | null;
  if (de) changements.push({ type: 'soin', cible: l.lanceur.id, montant: Math.floor(de.total / 2) });

  if (rompus.length) changements.push({ type: 'retraitEtat', cible: l.lanceur.id, etats: [...new Set(rompus)], nombre: new Set(rompus).size });
  return fin('reussi', pv);
}

/** Effets qui ne demandent ni jet ni calcul de dégâts. */
function appliquerSimple(e: Effet, cible: string, out: Changement[], alea: () => number, modMagie: number): void {
  switch (e.type) {
    case 'degats':
      out.push({ type: 'degats', cible, montant: lancerDes(e.des, alea).total + (e.plusMod ? modMagie : 0), typeDegats: e.typeDegats, calcul: e.des });
      return;
    case 'soin':
      out.push({ type: 'soin', cible, montant: lancerDes(e.des, alea).total + (e.plusMod ? modMagie : 0) });
      return;
    case 'pvTemp':
      out.push({ type: 'pvTemp', cible, montant: lancerDes(e.des, alea).total + (e.plusMod ? modMagie : 0) });
      return;
    case 'etat':
      out.push({ type: 'etat', cible, etat: e.etat, duree: e.duree });
      return;
    case 'retraitEtat':
      out.push({ type: 'retraitEtat', cible, etats: e.etats, nombre: e.nombre });
      return;
    case 'deplacement':
      out.push({ type: 'deplacement', cible, sens: e.sens, cases: e.cases });
      return;
    case 'bonus':
      out.push({ type: 'bonus', cible, sur: e.cible, valeur: e.valeur, duree: e.duree });
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
    case 'narratif':
      out.push({ type: 'narratif', cible, texte: e.texte });
      return;
  }
}
