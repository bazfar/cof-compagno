import type { CapaciteDeVoie, ClasseRefonte, RegleDeVoie, VoieRefonte } from '../schemas/classes';
import type { AttaquesSpecialesEnJeu, Carac, ModificateursDeVoie } from './resolution';
import type { Action, Element, Limite, Maitrise, Palier } from '../schemas/effets';
import { MAITRISES } from '../schemas/effets';
import { palierAtteint } from './paliers';

/*
 * Profil magique d'un personnage de la refonte (lot L4.4b1), en fonction
 * pure : à partir de ses choix (classe, école, éléments, rangs de voies,
 * sorts mineurs), ce qu'il sait faire et à quel rang. C'est le pont entre
 * la fiche (assistant de création, conversion des personnages : lots
 * suivants) et le moteur de résolution, qui prend école et élément avec
 * leur maîtrise.
 *
 * `verifierChoix` refuse un choix impossible avec une phrase pour le joueur.
 * Budget de voies (règle v1 conservée, corrigée au lot L4.11a : le lot
 * L4.4b1 comptait 2 RANGS par niveau) : 2 POINTS par niveau ; un rang coûte
 * 1 point aux rangs 1 et 2, 2 points aux rangs 3 à 5 ; le rang offert de la
 * Polyvalence (Humain) ne coûte rien.
 *
 * Lot L4.11a, décisions de Thomas du 21/10/2026 : la Voie du chaos ne se
 * prend qu'ouverte par le MJ (12a) ; les éléments découverts en jeu et les
 * verbes appris par grimoire sont accordés par le MJ (6a, 7a) ; les voies
 * hors profil de la v1 n'existent pas dans la refonte (3a).
 *
 * Classes physiques (lot L4.7) : la ressource de classe et sa réserve, les
 * attaques spéciales permises et leur coût, les attaques d'arme ouvertes
 * (attaque, attaque d'opportunité pour toutes les classes : décision 6a du
 * 21/10/2026 ; attaques spéciales des familles permises), et la
 * caractéristique choisie au Spécimen d'élite.
 */

export interface ChoixDePersonnage {
  niveau: number;
  modMagie: number;
  ecole?: string;
  elementDepart?: Element;
  secondElement?: Element;
  /** Élément passé Maître au rang 3 de la Voie élémentaire. */
  elementMaitre?: Element;
  /** Rang atteint dans chaque voie (0 ou absent : pas prise). */
  rangs: Readonly<Record<string, number>>;
  mineurs: readonly string[];
  /** Répertoire (Virtuose 1) : le sort mineur qui passe au palier II. */
  mineurPalierII?: string;
  /** Spécimen d'élite (Maître d'armes 2) : la caractéristique qui gagne +1. */
  caracEnPlus?: Carac;
  /** Polyvalence (Humain) : un rang d'une voie de la classe, offert. */
  rangOffert?: { voie: string; rang: number } | null;
  /** La Voie du chaos est ouverte par le MJ (lot L4.11a). */
  chaosOuvert?: boolean;
  /** Éléments découverts en jeu, accordés par le MJ, avec leur maîtrise. */
  elementsAccordes?: Partial<Record<Element, Maitrise>>;
  /** Verbes d'une autre école appris par grimoire (palier I), accordés par le MJ. */
  verbesHorsVoie?: readonly { id: string; maitrise: 'nonMaitrise' | 'initie' }[];
}

/** Coût d'un rang de voie (v1) : 1 point aux rangs 1 et 2, 2 aux rangs 3 à 5. */
export function coutDuRang(rang: number): number {
  return rang >= 3 ? 2 : 1;
}

/** Points de voie : 2 par niveau ; dépensés, rang offert déduit ; restants (négatifs : trop dépensé). */
export function pointsDeVoies(c: Pick<ChoixDePersonnage, 'niveau' | 'rangs' | 'rangOffert'>): { total: number; depenses: number; restants: number } {
  const total = 2 * c.niveau;
  let depenses = 0;
  for (const rang of Object.values(c.rangs)) for (let r = 1; r <= (rang ?? 0); r++) depenses += coutDuRang(r);
  if (c.rangOffert && (c.rangs[c.rangOffert.voie] ?? 0) >= c.rangOffert.rang) depenses -= coutDuRang(c.rangOffert.rang);
  return { total, depenses, restants: total - depenses };
}

export interface Regles {
  voies: ReadonlyMap<string, VoieRefonte>;
  actions: ReadonlyMap<string, Action>;
  /** Actions de toutes les classes : attaque à l'arme, attaque d'opportunité (lot L4.7). */
  actionsCommunes?: readonly string[];
}

export interface ProfilMagique {
  reservePP: number;
  /** Réserve de Sacré (Prêtre) ; 0 pour les autres classes. */
  reserveSacre: number;
  maitriseEcole: Maitrise | null;
  /** Seconde école (4ᵉ voie de l'Envoûteur) : plafonnée à Adepte (validé). */
  maitriseSecondeEcole: Maitrise | null;
  elements: Partial<Record<Element, Maitrise>>;
  /** Verbes connus dans la voie de l'école, avec le palier atteint. */
  verbes: { id: string; palier: Palier }[];
  /** Autres actions débloquées par les voies (Cataclysme…). */
  actions: string[];
  annuleDerapage: Limite | null;
  mineursMax: number;
  /** Sorts mineurs avec leur palier (Virtuose : Répertoire II, Perfection III). */
  mineurs: { id: string; palier: Palier }[];
  /** Capacités de voie que lit le moteur, avec leur limite (lot L4.4b2). */
  capacites: { nom: CapaciteDeVoie; limite: Limite }[];
  /** PV max en plus : le Pacte de sang y verse la réserve de PP. */
  pvEnPlus: number;
  /** Ce que le moteur de résolution reçoit du profil (lancer.voie), avant les choix du moment. */
  voie: ModificateursDeVoie;
  /** Règles écrites que l'app ne calcule pas encore. */
  textes: string[];
  /** Verbes appris par grimoire (palier I), avec la maîtrise de leur école (lot L4.11a). */
  verbesHorsVoie: { id: string; maitrise: 'nonMaitrise' | 'initie' }[];
  /** Ressource martiale et sa réserve (Endurance du Guerrier : 3 + niveau / 3). */
  ressourceDeClasse: { ressource: string; max: number } | null;
  /** Attaques spéciales permises et leur coût, Maniement expert compris : ce que le moteur reçoit (lancer.attaquesSpeciales). */
  attaquesSpeciales: AttaquesSpecialesEnJeu | null;
  /** Attaques d'arme ouvertes : actions communes, puis attaques spéciales des familles permises. */
  attaques: string[];
  /** Caractéristiques augmentées par les voies (Spécimen d'élite). */
  caracs: Partial<Record<Carac, number>>;
  /** Palier des actions de classe à paliers (Frappe sacrée : celui de la voie la plus avancée). */
  paliersDActions: Record<string, Palier>;
}

const plusHaute = (a: Maitrise | undefined, b: Maitrise): Maitrise => (a && MAITRISES.indexOf(a) > MAITRISES.indexOf(b) ? a : b);
const ORDRE_PALIERS: Palier[] = ['I', 'II', 'III'];
const plafonner = (p: Palier, max?: Palier): Palier => (max && ORDRE_PALIERS.indexOf(p) > ORDRE_PALIERS.indexOf(max) ? max : p);

/** La seconde école : l'autre école de création que celle choisie (Envoûteur : Illusion ou Enchantement). */
export function secondeEcole(classe: ClasseRefonte, c: Pick<ChoixDePersonnage, 'ecole'>): string | undefined {
  return classe.creation.ecoles.find((e) => e !== c.ecole);
}

export function mineursAutorises(classe: ClasseRefonte, niveau: number, repertoire = false): number {
  return classe.mineurs.creation + classe.mineurs.plusUnAuNiveau.filter((n) => n <= niveau).length + (repertoire ? 1 : 0);
}

const aCapacite = (regles: readonly RegleDeVoie[], nom: CapaciteDeVoie) => regles.some((x) => x.type === 'capacite' && x.nom === nom);

/** Les règles de voie atteintes par un choix, rang par rang. */
function reglesAtteintes(classe: ClasseRefonte, c: ChoixDePersonnage, r: Regles): RegleDeVoie[] {
  return classe.voies.flatMap((id) => (r.voies.get(id)?.rangs ?? []).slice(0, c.rangs[id] ?? 0).flatMap((rv) => rv.regles));
}

/** Choix que les voies prises demandent (lot L4.11b) : second élément, élément Maître, Répertoire, caractéristique en plus. */
export function choixRequis(
  classe: ClasseRefonte,
  c: ChoixDePersonnage,
  r: Regles,
): { secondElement: boolean; elementMaitre: boolean; repertoire: boolean; caracEnPlus: { valeur: number; parmi: readonly Carac[] } | null } {
  const regles = reglesAtteintes(classe, c, r);
  const carac = regles.find((x) => x.type === 'caracEnPlus');
  return {
    secondElement: regles.some((x) => x.type === 'secondElement'),
    elementMaitre: regles.some((x) => x.type === 'maitriseElement' && x.quel === 'auChoix'),
    repertoire: aCapacite(regles, 'repertoire'),
    caracEnPlus: carac?.type === 'caracEnPlus' ? { valeur: carac.valeur, parmi: carac.parmi } : null,
  };
}

/** Les erreurs d'un choix, en phrases pour le joueur ; vide : le choix est valide. */
export function verifierChoix(classe: ClasseRefonte, c: ChoixDePersonnage, r: Regles): string[] {
  const e: string[] = [];
  if (!Number.isInteger(c.niveau) || c.niveau < 1 || c.niveau > 12) e.push('Le niveau va de 1 à 12.');
  if (classe.creation.ecoles.length && (!c.ecole || !classe.creation.ecoles.includes(c.ecole))) e.push(`Choisis une école : ${classe.creation.ecoles.join(', ')}.`);
  if (classe.creation.elements && (!c.elementDepart || !classe.creation.elements.includes(c.elementDepart)))
    e.push(`Choisis un élément de départ : ${classe.creation.elements.join(', ')}.`);
  for (const [voie, rang] of Object.entries(c.rangs)) {
    if (!rang) continue;
    if (!classe.voies.includes(voie)) e.push(`La voie ${voie} n’est pas une voie de ${classe.nom}.`);
    else if (!r.voies.has(voie)) e.push(`La voie ${voie} n’existe pas encore.`);
    if (!Number.isInteger(rang) || rang < 0 || rang > 5) e.push(`Rang ${rang} impossible dans ${voie}.`);
    if (r.voies.get(voie)?.surAccordDuMJ && !c.chaosOuvert) e.push(`${r.voies.get(voie)!.nom} : elle s’ouvre avec l’accord du MJ.`);
  }
  const points = pointsDeVoies(c);
  if (points.restants < 0) e.push(`${points.depenses} points de voie pour ${points.total} au niveau ${c.niveau}.`);
  if (c.rangOffert) {
    if (!classe.voies.includes(c.rangOffert.voie) || r.voies.get(c.rangOffert.voie)?.surAccordDuMJ) e.push('Le rang offert se prend dans une voie de la classe.');
    else if ((c.rangs[c.rangOffert.voie] ?? 0) < c.rangOffert.rang) e.push('Le rang offert doit être un rang pris.');
  }
  for (const groupe of classe.voiesExclusives)
    if (groupe.filter((v) => (c.rangs[v] ?? 0) > 0).length > 1) e.push(`Une seule voie parmi : ${groupe.join(', ')}.`);
  const regles = reglesAtteintes(classe, c, r);
  if (regles.some((x) => x.type === 'secondElement')) {
    if (!c.secondElement || !classe.creation.elementsSecond.includes(c.secondElement)) e.push('Choisis un second élément.');
    else if (c.secondElement === c.elementDepart) e.push('Le second élément doit différer du premier.');
  } else if (c.secondElement) e.push('Le second élément vient avec la voie qui le donne.');
  if (regles.some((x) => x.type === 'maitriseElement' && x.quel === 'auChoix')) {
    if (!c.elementMaitre || ![c.elementDepart, c.secondElement].includes(c.elementMaitre)) e.push('Choisis lequel de tes éléments devient Maître.');
  } else if (c.elementMaitre) e.push('Un élément devient Maître avec la voie qui le donne.');
  const repertoire = aCapacite(regles, 'repertoire');
  const max = mineursAutorises(classe, c.niveau, repertoire);
  if (repertoire && (!c.mineurPalierII || !c.mineurs.includes(c.mineurPalierII))) e.push('Répertoire : choisis lequel de tes sorts mineurs passe au palier II.');
  if (!repertoire && c.mineurPalierII) e.push('Un sort mineur passe au palier II avec Répertoire (Voie du virtuose).');
  const carac = regles.find((x) => x.type === 'caracEnPlus');
  if (carac?.type === 'caracEnPlus') {
    if (!c.caracEnPlus || !carac.parmi.includes(c.caracEnPlus)) e.push(`Choisis la caractéristique qui gagne +${carac.valeur} : ${carac.parmi.join(', ')}.`);
  } else if (c.caracEnPlus) e.push('Une caractéristique gagne un point avec la voie qui le donne.');
  if (new Set(c.mineurs).size !== c.mineurs.length) e.push('Un sort mineur ne se prend qu’une fois.');
  if (c.mineurs.length > max) e.push(`${max} sorts mineurs au plus au niveau ${c.niveau}.`);
  for (const m of c.mineurs) if (!classe.mineurs.liste.includes(m)) e.push(`${m} n’est pas un sort mineur de ${classe.nom}.`);
  return e;
}

/** Le profil d'un choix valide (verifierChoix d'abord). */
export function profilMagique(classe: ClasseRefonte, c: ChoixDePersonnage, r: Regles): ProfilMagique {
  const p: ProfilMagique = {
    reservePP: classe.reservePP ? classe.reservePP.base + classe.reservePP.parNiveau * c.niveau + classe.reservePP.parMod * c.modMagie : 0,
    reserveSacre: classe.reserveSacre ? classe.reserveSacre.base + Math.floor(c.niveau / classe.reserveSacre.diviseurNiveau) : 0,
    maitriseEcole: null,
    maitriseSecondeEcole: null,
    elements: c.elementDepart ? { [c.elementDepart]: classe.creation.maitriseElementDepart } : {},
    verbes: [],
    verbesHorsVoie: [...(c.verbesHorsVoie ?? [])],
    actions: [...classe.actionsDeClasse],
    annuleDerapage: null,
    mineursMax: mineursAutorises(classe, c.niveau),
    mineurs: c.mineurs.map((id) => ({ id, palier: 'I' as Palier })),
    capacites: [],
    pvEnPlus: 0,
    voie: {},
    textes: [],
    ressourceDeClasse: classe.ressourceDeClasse
      ? { ressource: classe.ressourceDeClasse.ressource, max: classe.ressourceDeClasse.base + Math.floor(c.niveau / classe.ressourceDeClasse.diviseurNiveau) }
      : null,
    attaquesSpeciales: classe.attaquesSpeciales ? { familles: classe.attaquesSpeciales.familles, cout: classe.attaquesSpeciales.cout } : null,
    attaques: [],
    caracs: {},
    paliersDActions: {},
  };
  for (const id of classe.voies) {
    const voie = r.voies.get(id);
    const rang = c.rangs[id] ?? 0;
    if (!voie || !rang) continue;
    for (const rv of voie.rangs.slice(0, rang)) {
      p.actions.push(...rv.actions);
      for (const regle of rv.regles) {
        switch (regle.type) {
          case 'verbeDeLEcole': {
            const ecole = regle.ecole ?? (regle.quelle === 'seconde' ? secondeEcole(classe, c) : c.ecole);
            const verbe = [...r.actions.values()].find((a) => a.nature === 'verbe' && a.ecole === ecole && a.rang === rv.rang);
            // Paliers (validé) : selon le rang atteint dans CETTE voie, plafonnés au besoin (seconde école : II).
            if (verbe) p.verbes.push({ id: verbe.id, palier: plafonner(palierAtteint(verbe, rang, true), regle.palierMax) });
            break;
          }
          case 'maitriseEcole':
            if (regle.quelle === 'seconde') p.maitriseSecondeEcole = plusHaute(p.maitriseSecondeEcole ?? undefined, regle.niveau);
            else p.maitriseEcole = plusHaute(p.maitriseEcole ?? undefined, regle.niveau);
            break;
          case 'maitriseElement': {
            const el = regle.quel === 'depart' ? c.elementDepart : c.elementMaitre;
            if (el) p.elements[el] = plusHaute(p.elements[el], regle.niveau);
            break;
          }
          case 'secondElement':
            if (c.secondElement) p.elements[c.secondElement] = plusHaute(p.elements[c.secondElement], regle.niveau);
            break;
          case 'annuleDerapage':
            p.annuleDerapage = regle.limite;
            break;
          case 'texte':
            p.textes.push(regle.texte);
            break;
          case 'capacite':
            p.capacites.push({ nom: regle.nom, limite: regle.limite });
            // Posture de combat : plafond = rang dans la voie qui la donne (v1).
            if (regle.nom === 'postureDeCombat') p.voie.soldat = { rang };
            // Voie du maître d'armes : son rang, qui compte aussi Spécimen d'élite. Le Maniement expert
            // d'une autre voie (Bouclier du Chevalier, Gâchette du Chasseur, lots L4.13-14) ne baisse que
            // le coût : il n'ouvre ni Précision létale, ni Coup double, ni Coup de maître.
            if (regle.nom === 'maniementExpert' && id === 'guerrier.maitre-d-armes') p.voie.maitreDArmes = { rang };
            // Tir fatal (Gâchette 5 du Chasseur, lot L4.14) : le Coup de maître seul.
            if (regle.nom === 'coupDeMaitre' && id !== 'guerrier.maitre-d-armes') p.voie.coupDeMaitre = true;
            // Voie du chaos (lot L4.9) : son rang (Don corrompu dès 2), et l'Éclat chaotique de l'Envoûteur.
            if (regle.nom === 'donCorrompu' || regle.nom === 'eclatChaotique')
              p.voie.chaos = { ...p.voie.chaos, rang, ...(regle.nom === 'eclatChaotique' ? { eclatChaotique: true } : {}) };
            break;
          case 'caracEnPlus':
            if (c.caracEnPlus) p.caracs[c.caracEnPlus] = (p.caracs[c.caracEnPlus] ?? 0) + regle.valeur;
            break;
        }
      }
    }
  }
  // Éléments découverts en jeu (lot L4.11a, 7a) : la plus haute des maîtrises.
  for (const [el, m] of Object.entries(c.elementsAccordes ?? {}) as [Element, Maitrise][]) p.elements[el] = plusHaute(p.elements[el], m);
  // Capacités de voie (lot L4.4b2) : ce qu'elles changent au profil, et ce que le moteur en reçoit.
  const a = (nom: CapaciteDeVoie) => p.capacites.some((x) => x.nom === nom);
  const rangDe = (noms: CapaciteDeVoie[]) => noms.filter(a).length;
  const sauvage = rangDe(['mutationSauvage', 'instinctChaotique', 'canalisation', 'maitriseDuChaos', 'submersion']);
  const hemomancie = rangDe(['pacteDeSang', 'sangAppelleSang', 'seuilCritique', 'sangVerse', 'saignee']);
  if (sauvage) p.voie.sauvage = { rang: sauvage };
  if (hemomancie) p.voie.hemomancie = { rang: hemomancie };
  if (a('pacteDeSang')) {
    p.pvEnPlus = p.reservePP;
    p.reservePP = 0;
  }
  if (a('repertoire')) p.mineursMax += 1;
  if (a('perfection')) p.mineurs = p.mineurs.map((m) => ({ id: m.id, palier: 'III' }));
  else if (a('repertoire') && c.mineurPalierII) p.mineurs = p.mineurs.map((m) => (m.id === c.mineurPalierII ? { id: m.id, palier: 'II' } : m));
  if (a('perfection') || a('affinite')) p.voie.virtuose = { ...(a('perfection') ? { crans: 1 } : {}), ...(a('affinite') ? { affinite: true } : {}) };
  // Maniement expert (Maître d'armes 1, lot L4.7) : attaque spéciale −1.
  const as = p.attaquesSpeciales;
  if (as && a('maniementExpert') && as.cout !== 'unParCombat') p.attaquesSpeciales = { ...as, cout: { ...as.cout, montant: Math.max(1, as.cout.montant - 1) } };
  const permises = p.attaquesSpeciales?.familles;
  const speciales = [...r.actions.values()].filter((x) => x.famille && permises && (permises === 'toutes' || permises.includes(x.famille))).map((x) => x.id);
  p.attaques = [...(r.actionsCommunes ?? []), ...speciales];
  // Actions de classe à paliers (Frappe sacrée, lot L4.7) : palier de la voie la plus avancée.
  const rangMax = Math.max(0, ...classe.voies.map((v) => c.rangs[v] ?? 0));
  for (const id of classe.actionsDeClasse) {
    const x = r.actions.get(id);
    if (x && x.paliers.II) p.paliersDActions[id] = palierAtteint(x, rangMax, true);
  }
  return p;
}
