import type { ClasseRefonte, RegleDeVoie, VoieRefonte } from '../schemas/classes';
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
}

export interface Regles {
  voies: ReadonlyMap<string, VoieRefonte>;
  actions: ReadonlyMap<string, Action>;
}

export interface ProfilMagique {
  reservePP: number;
  maitriseEcole: Maitrise | null;
  elements: Partial<Record<Element, Maitrise>>;
  /** Verbes connus dans la voie de l'école, avec le palier atteint. */
  verbes: { id: string; palier: Palier }[];
  /** Autres actions débloquées par les voies (Cataclysme…). */
  actions: string[];
  annuleDerapage: Limite | null;
  mineursMax: number;
  mineurs: string[];
  /** Règles écrites que l'app ne calcule pas encore. */
  textes: string[];
}

const plusHaute = (a: Maitrise | undefined, b: Maitrise): Maitrise => (a && MAITRISES.indexOf(a) > MAITRISES.indexOf(b) ? a : b);

export function mineursAutorises(classe: ClasseRefonte, niveau: number): number {
  return classe.mineurs.creation + classe.mineurs.plusUnAuNiveau.filter((n) => n <= niveau).length;
}

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
  const max = mineursAutorises(classe, c.niveau);
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
    elements: c.elementDepart ? { [c.elementDepart]: classe.creation.maitriseElementDepart } : {},
    verbes: [],
    actions: [],
    annuleDerapage: null,
    mineursMax: mineursAutorises(classe, c.niveau),
    mineurs: [...c.mineurs],
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
            const verbe = [...r.actions.values()].find((a) => a.nature === 'verbe' && a.ecole === c.ecole && a.rang === rv.rang);
            if (verbe) p.verbes.push({ id: verbe.id, palier: 'I' });
            break;
          }
          case 'maitriseEcole':
            p.maitriseEcole = plusHaute(p.maitriseEcole ?? undefined, regle.niveau);
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
        }
      }
    }
    // Paliers (validé) : selon le rang atteint dans la voie de l'école.
    if (voie.rangs.some((rv) => rv.regles.some((x) => x.type === 'verbeDeLEcole')))
      p.verbes = p.verbes.map((v) => ({ id: v.id, palier: palierAtteint(r.actions.get(v.id)!, rang, true) }));
  }
  return p;
}
