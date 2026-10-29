import { LIMITE_NOTES, type ObjetFiche } from '../schemas/fiche.ts';
import { LIMITE_PORTRAIT, PREFIXE_PORTRAIT } from '../schemas/portrait.ts';
import { CARACS } from '../schemas/commun.ts';
import { migrerEquipement } from './conversion-v1.ts';
import {
  bonusClasseCarac,
  brouillonVide,
  CARACS_LIBRES_MAX_PAR_CARAC,
  CARACS_LIBRES_TOTAL,
  NIVEAU_MAX,
  type AnciensChoix,
  type Brouillon,
} from './creation.ts';
import { classeParId, donParId, objetParId, raceParId } from './donnees.ts';
import type { Carac } from './fiche-calcul.ts';
import { modulesV1, pointsCercleV1 } from './fiche-document.ts';

/*
 * Reprise des fiches v1 dans la 2.0 (lot L2.2c).
 *
 * Décisions : le MJ dépose les exports v1 et attribue chaque fiche à un
 * joueur (6a) ; le joueur la reprend dans l'assistant, où il RECHOISIT ses
 * voies, capacités raciales, voies hors profil et dons, avec ses anciens
 * choix affichés à côté (5b, cadrage « Migration et bascule »). Le reste est
 * reporté tel quel ; les objets sont rafraîchis depuis le catalogue en
 * gardant rareté, enchantement et matériau (décidé le 15/10 : 8 armures sur
 * 9 datent d'avant la refonte DEF → CA et comptent en v1 comme des
 * vêtements).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forme v1 non typée
export type FicheV1 = Record<string, any>;

export class ErreurImportV1 extends Error {}

const CARACS_CODES = CARACS as readonly Carac[];

/**
 * Lit un fichier d'export v1 : une fiche seule (bouton « Exporter » de la
 * v1), une liste de fiches, ou `{ fiches: [...] }`. Lève en nommant la
 * première fiche qui ne peut pas être reprise.
 */
export function lireExportV1(texte: string): FicheV1[] {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new ErreurImportV1('Ce fichier n’est pas un export JSON.');
  }
  const liste = Array.isArray(brut) ? brut : brut && typeof brut === 'object' && Array.isArray((brut as FicheV1).fiches) ? (brut as FicheV1).fiches : [brut];
  if (!liste.length) throw new ErreurImportV1('Aucune fiche dans ce fichier.');
  for (const f of liste) verifierFicheV1(f);
  return liste as FicheV1[];
}

/** Ce qu'une fiche doit avoir pour être reprise (lève sinon, en la nommant). */
export function verifierFicheV1(f: unknown): asserts f is FicheV1 {
  if (!f || typeof f !== 'object' || Array.isArray(f)) throw new ErreurImportV1('Une entrée du fichier n’est pas une fiche.');
  const v1 = f as FicheV1;
  const nom = typeof v1.nom === 'string' ? v1.nom.trim() : '';
  if (!nom || nom.length > 40) throw new ErreurImportV1('Une fiche n’a pas de nom valide (1 à 40 caractères).');
  if (!classeParId.has(v1.classe)) throw new ErreurImportV1(`${nom} : classe inconnue (${String(v1.classe)}).`);
  if (!raceParId.has(v1.race)) throw new ErreurImportV1(`${nom} : race inconnue (${String(v1.race)}).`);
  if (!Number.isInteger(v1.niveau) || v1.niveau < 1 || v1.niveau > NIVEAU_MAX) throw new ErreurImportV1(`${nom} : niveau invalide.`);
  caracsLibresV1(v1);
}

/**
 * Points libres d'une fiche v1 : valeur stockée − 10 − bonus de classe. Ils
 * doivent respecter la règle de création (6 en tout, +3 au plus, rien de
 * négatif) ; sinon la fiche a été retouchée hors règles et n'est pas reprise.
 */
export function caracsLibresV1(v1: FicheV1): Partial<Record<Carac, number>> {
  const libres = Object.fromEntries(
    CARACS_CODES.map((c) => [c, Number(v1.caracs?.[c] ?? 10) - 10 - bonusClasseCarac(v1.classe, c)]),
  ) as Record<Carac, number>;
  const total = CARACS_CODES.reduce((t, c) => t + libres[c], 0);
  const horsRegle = CARACS_CODES.filter((c) => !Number.isInteger(libres[c]) || libres[c] < 0 || libres[c] > CARACS_LIBRES_MAX_PAR_CARAC);
  if (horsRegle.length || total !== CARACS_LIBRES_TOTAL) {
    throw new ErreurImportV1(
      `${v1.nom} : caractéristiques hors des règles de création (${horsRegle.length ? horsRegle.join(', ') : `${total} points libres au lieu de ${CARACS_LIBRES_TOTAL}`}).`,
    );
  }
  return libres;
}

/**
 * Champs propres à un exemplaire, gardés au rafraîchissement : rareté,
 * enchantement, matériau, quantité, et le bonus de soin d'une potion rare
 * (soinBonusRarete, L2.4 : la description, elle, revient à celle du catalogue).
 */
const CHAMP_EXEMPLAIRE = /^(rarete|bonusRarete|effetRarete|varianteNom|materiau|degats[A-Z]|bonusDegatsTotal|enchantement|affixes?|quantite|itemRef|soinBonusRarete)/;

/**
 * Objet v1 → objet du catalogue actuel, avec ce qui appartient à
 * l'exemplaire. Un objet absent du catalogue (Forge du MJ, objet libre) est
 * gardé tel quel.
 */
export function rafraichirObjet(o: ObjetFiche): ObjetFiche {
  const modele = typeof o.id === 'string' ? objetParId.get(o.id) : undefined;
  if (!modele) return structuredClone(o);
  const exemplaire = Object.fromEntries(Object.entries(o).filter(([k]) => CHAMP_EXEMPLAIRE.test(k)));
  return { ...(structuredClone(modele) as ObjetFiche), ...structuredClone(exemplaire) };
}

/** Portrait v1 repris s'il est une image dans la limite du document portrait (L2.3), sinon aucun. */
export function portraitV1(v1: FicheV1): string | null {
  const p = v1.portrait;
  return typeof p === 'string' && PREFIXE_PORTRAIT.test(p) && p.length <= LIMITE_PORTRAIT ? p : null;
}

/** Choix v1 à refaire, tels que la v1 les stockait. */
export function anciensChoixV1(v1: FicheV1): AnciensChoix {
  return {
    capacites: (v1.capacites ?? []).map((c: FicheV1) => ({ voie: String(c.voie), rang: Number(c.rang), ...(c.choix !== undefined ? { choix: String(c.choix) } : {}) })),
    capacitesRace: [...(v1.capacitesRace ?? [])],
    capacitesRaceChoix: { ...(v1.capacitesRaceChoix ?? {}) },
    voiesHorsProfil: (v1.voiesHorsProfil ?? []).map((h: FicheV1) => ({ classe: String(h.classe), voie: String(h.voie), ...(typeof h.cout === 'number' ? { cout: h.cout } : {}) })),
    dons: [...(v1.dons ?? [])],
    donsChoix: { ...(v1.donsChoix ?? {}) },
    bonusCompetences: { ...(v1.bonusCompetences ?? {}) },
  };
}

/**
 * Brouillon de reprise d'une fiche v1 : identité, classe, race, niveau,
 * caractéristiques et jets de PV repris (et verrouillés dans l'assistant) ;
 * voies, capacités raciales, hors profil et dons laissés vides, à rechoisir.
 */
export function brouillonDepuisV1(v1: FicheV1, idImport: string): Brouillon {
  verifierFicheV1(v1);
  const jets = [...(v1.pvHistorique ?? [])]
    .filter((j: FicheV1) => Number.isInteger(j?.jet) && j.jet >= 1)
    .sort((a: FicheV1, b: FicheV1) => (a.niveau ?? 0) - (b.niveau ?? 0))
    .map((j: FicheV1) => j.jet as number)
    .slice(0, v1.niveau - 1);
  const { equipement, inventaire } = migrerEquipement(v1);
  const nombre = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  // Un objet à deux mains est le MÊME objet dans les deux mains : on le rafraîchit une seule fois.
  const rafraichis = new Map<unknown, ObjetFiche>();
  const rafraichir = (o: ObjetFiche) => {
    if (!rafraichis.has(o)) rafraichis.set(o, rafraichirObjet(o));
    return rafraichis.get(o)!;
  };
  return {
    ...brouillonVide(),
    nom: v1.nom.trim(),
    genre: v1.genre === 'femme' ? 'femme' : 'homme',
    classe: v1.classe,
    race: v1.race,
    raceVariante: v1.raceVariante ?? null,
    niveau: v1.niveau,
    caracsLibres: caracsLibresV1(v1),
    jetsPV: jets,
    cercleSpecialisation: v1.classe === 'pretre' ? (v1.cercleSpecialisation ?? null) : null,
    reprise: {
      idImport,
      anciens: anciensChoixV1(v1),
      report: {
        jetsRepris: jets.length,
        pvActuel: typeof v1.pvActuel === 'number' ? v1.pvActuel : null,
        ppActuel: typeof v1.ppActuel === 'number' ? v1.ppActuel : null,
        pointsCercle: pointsCercleV1(v1),
        equipement: Object.fromEntries(Object.entries(equipement ?? {}).map(([slot, o]) => [slot, o ? rafraichir(o as ObjetFiche) : null])),
        inventaire: (inventaire ?? []).map((o) => rafraichirObjet(o as ObjetFiche)),
        piecesOr: nombre(v1.piecesOr),
        piecesArgent: nombre(v1.piecesArgent),
        piecesBronze: nombre(v1.piecesBronze),
        corruptionMajeure: nombre(v1.corruptionMajeure),
        mutations: Array.isArray(v1.mutations) ? structuredClone(v1.mutations) : null,
        contratDemoniaquePenalite: v1.contratDemoniaquePenalite ?? null,
        amesStockees: nombre(v1.amesStockees),
        sortsConnus: [...(v1.grimoireSortsConnus ?? [])],
        sortsPrepares: [...(v1.grimoireSortsPrepares ?? [])],
        modules: JSON.parse(JSON.stringify(modulesV1(v1))),
        notes: typeof v1.notes === 'string' ? v1.notes.slice(0, LIMITE_NOTES) : '',
        portrait: portraitV1(v1),
      },
    },
  };
}

/** Anciens choix en phrases, pour l'affichage à côté de l'assistant. */
export function anciensChoixLisibles(a: AnciensChoix): { voies: string[]; race: string[]; dons: string[] } {
  return {
    voies: [
      ...a.voiesHorsProfil.map((h) => `${h.voie} débloquée hors profil (${classeParId.get(h.classe)?.nom ?? h.classe})`),
      ...[...a.capacites].sort((x, y) => x.voie.localeCompare(y.voie, 'fr') || x.rang - y.rang).map((c) => `${c.voie}, rang ${c.rang}${c.choix ? ` (${c.choix})` : ''}`),
    ],
    race: a.capacitesRace.map((r) => `rang ${r}${a.capacitesRaceChoix[String(r)] ? ` (${a.capacitesRaceChoix[String(r)]})` : ''}`),
    dons: a.dons.map((d) => {
      const choix = a.donsChoix[d];
      return `${donParId.get(d)?.nom ?? d}${choix ? ` (${Array.isArray(choix) ? choix.join(', ') : String(choix)})` : ''}`;
    }),
  };
}
