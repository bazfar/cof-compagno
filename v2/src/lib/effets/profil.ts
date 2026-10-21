import type { CapaciteDeVoie, ClasseRefonte, RegleDeVoie, VoieRefonte } from '../schemas/classes';
import type { ModificateursDeVoie } from './resolution';
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
 * Budget de voies : 2 rangs par niveau, dans l'ordre (règle v1 conservée).
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
}

export interface Regles {
  voies: ReadonlyMap<string, VoieRefonte>;
  actions: ReadonlyMap<string, Action>;
}

export interface ProfilMagique {
  reservePP: number;
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

/** Les erreurs d'un choix, en phrases pour le joueur ; vide : le choix est valide. */
export function verifierChoix(classe: ClasseRefonte, c: ChoixDePersonnage, r: Regles): string[] {
  const e: string[] = [];
  if (!Number.isInteger(c.niveau) || c.niveau < 1 || c.niveau > 12) e.push('Le niveau va de 1 à 12.');
  if (classe.creation.ecoles.length && (!c.ecole || !classe.creation.ecoles.includes(c.ecole))) e.push(`Choisis une école : ${classe.creation.ecoles.join(', ')}.`);
  if (classe.creation.elements && (!c.elementDepart || !classe.creation.elements.includes(c.elementDepart)))
    e.push(`Choisis un élément de départ : ${classe.creation.elements.join(', ')}.`);
  let total = 0;
  for (const [voie, rang] of Object.entries(c.rangs)) {
    if (!rang) continue;
    if (!classe.voies.includes(voie)) e.push(`La voie ${voie} n’est pas une voie de ${classe.nom}.`);
    else if (!r.voies.has(voie)) e.push(`La voie ${voie} n’existe pas encore.`);
    if (!Number.isInteger(rang) || rang < 0 || rang > 5) e.push(`Rang ${rang} impossible dans ${voie}.`);
    total += rang;
  }
  if (total > 2 * c.niveau) e.push(`${total} rangs pour ${2 * c.niveau} possibles au niveau ${c.niveau}.`);
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
  if (new Set(c.mineurs).size !== c.mineurs.length) e.push('Un sort mineur ne se prend qu’une fois.');
  if (c.mineurs.length > max) e.push(`${max} sorts mineurs au plus au niveau ${c.niveau}.`);
  for (const m of c.mineurs) if (!classe.mineurs.liste.includes(m)) e.push(`${m} n’est pas un sort mineur de ${classe.nom}.`);
  return e;
}

/** Le profil d'un choix valide (verifierChoix d'abord). */
export function profilMagique(classe: ClasseRefonte, c: ChoixDePersonnage, r: Regles): ProfilMagique {
  const p: ProfilMagique = {
    reservePP: classe.reservePP ? classe.reservePP.base + classe.reservePP.parNiveau * c.niveau + classe.reservePP.parMod * c.modMagie : 0,
    maitriseEcole: null,
    maitriseSecondeEcole: null,
    elements: c.elementDepart ? { [c.elementDepart]: classe.creation.maitriseElementDepart } : {},
    verbes: [],
    actions: [],
    annuleDerapage: null,
    mineursMax: mineursAutorises(classe, c.niveau),
    mineurs: c.mineurs.map((id) => ({ id, palier: 'I' as Palier })),
    capacites: [],
    pvEnPlus: 0,
    voie: {},
    textes: [],
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
            const ecole = regle.quelle === 'seconde' ? secondeEcole(classe, c) : c.ecole;
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
            break;
        }
      }
    }
  }
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
  return p;
}
