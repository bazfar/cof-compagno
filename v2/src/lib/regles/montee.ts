import { schemaFiche, type Fiche } from '../schemas/fiche.ts';
import { CalculsPersonnage, decouperCapacite } from './calculs.ts';
import * as C from './creation.ts';
import { constantes, voieParId } from './donnees.ts';
import { ficheCalculDepuisFiche, versFirestore } from './fiche-document.ts';
import type { Carac } from './fiche-calcul.ts';
import { barreNiveau } from './progression.ts';

/*
 * Montée de niveau guidée (lot L2.5b, décision 3a du 16/10 : règles
 * actuelles, celles de l'assistant de création). Quand la barre de crans
 * est pleine, le joueur passe au niveau suivant :
 *   - un jet de PV (dé de vie + modificateur de CON effectif, minimum 1) ;
 *   - 2 points de capacité, à dépenser dans l'ordre des rangs (ou à garder) ;
 *   - les dons des niveaux 4, 8 et 12 ;
 *   - les rangs raciaux des niveaux 3, 5, 7 et 9, d'office, avec leur choix
 *     s'ils en demandent un (Ambition, Sang Mêlé, Sang de Guerre, nation) ;
 *   - Polyvalence au niveau 5 pour l'Humain ;
 *   - les sorts que le plafond du Grimoire permet d'inscrire.
 *
 * Les règles sont celles de creation.ts, appliquées à un brouillon tiré de
 * la fiche au niveau suivant. Les choix déjà acquis sont VERROUILLÉS : on
 * ajoute, on ne retire que ce qu'on vient d'ajouter.
 *
 * Écriture (actions/progression.ts) : `appliquerMontee` est rejouée sur la
 * fiche relue dans une transaction. Les PV max et actuels gagnent l'écart
 * de pvCalcule entre avant et après (les PV max d'une fiche v1 ne sont donc
 * jamais « corrigés » au passage), les PP de même ; les crans requis sont
 * dépensés, le surplus reste.
 *
 * Modificateur de CON (décision 2a, comme à la création) : il est recalculé
 * pour TOUS les jets de PV, donc une CON relevée à la montée (Ambition,
 * Amélioration de caractéristique) compte aussi pour les niveaux passés.
 */

/** Ce que le joueur a choisi pour ce niveau, sur la fiche lue à l'ouverture. */
export interface Montee {
  /** Fiche au moment de l'ouverture : ses choix sont verrouillés. */
  avant: Fiche;
  /** Brouillon de règles au niveau suivant : choix acquis + nouveaux. */
  b: C.Brouillon;
  /** Dé de vie tiré pour le nouveau niveau ; null tant qu'il n'est pas lancé. */
  jetPV: number | null;
}

export const RefusMontee = C.RefusCreation;

const CARACS_CODES = constantes.caracs.map((c) => c.code) as Carac[];

/** Sorts appris de la fiche, hors sorts accordés (ceux-là se recalculent). */
function apprisDe(f: Fiche, b: C.Brouillon): string[] {
  const accordes = C.sortsAccordes(b);
  return f.grimoireSortsConnus.filter((s) => !accordes.includes(s));
}

/** Ouvre la montée : refusée si la barre n'est pas pleine ou au plafond. */
export function ouvrirMontee(lue: Fiche): Montee {
  // Copie simple : la fiche affichée est un état réactif (proxy), que structuredClone refuse.
  const f = JSON.parse(JSON.stringify(lue)) as Fiche;
  const barre = barreNiveau(f);
  if (barre.requis === null) throw new RefusMontee('Niveau maximum atteint.');
  if (!barre.pleine) throw new RefusMontee(`Il manque ${barre.requis - barre.crans} cran(s) pour monter de niveau.`);
  // Points « libres » reconstitués : caracsDuBrouillon rend alors exactement les caractéristiques de la fiche.
  const caracsLibres = Object.fromEntries(
    CARACS_CODES.map((c) => [c, (f.caracs[c] ?? 10) - 10 - C.bonusClasseCarac(f.classe, c)]),
  ) as Partial<Record<Carac, number>>;
  const base: C.Brouillon = {
    ...C.brouillonVide(),
    nom: f.nom,
    genre: f.genre === 'femme' ? 'femme' : 'homme',
    classe: f.classe,
    race: f.race,
    raceVariante: f.raceVariante ?? null,
    niveau: f.niveau + 1,
    caracsLibres,
    capacites: f.capacites.map((c) => ({ ...c })),
    capacitesRaceChoix: { ...f.capacitesRaceChoix },
    voiesHorsProfil: f.voiesHorsProfil.map((h) => ({ voie: h.voie, cout: h.cout ?? 0 })),
    dons: [...f.dons],
    donsChoix: f.donsChoix,
    cercleSpecialisation: f.cercleSpecialisation,
  };
  return { avant: f, b: { ...base, sorts: apprisDe(f, base) }, jetPV: null };
}

// ------------------------------------------------------------- Verrous

const capaciteAcquise = (m: Montee, id: string) => m.avant.capacites.some((c) => c.id === id);

function refuserSiAcquis(acquis: boolean, quoi: string) {
  if (acquis) throw new RefusMontee(`${quoi} est acquis(e) : une montée de niveau ajoute, elle ne retire rien.`);
}

const avec = (m: Montee, b: C.Brouillon): Montee => ({ ...m, b });

// ------------------------------------------------------------- Gestes

/** Le dé de vie du nouveau niveau, tiré une seule fois. */
export function lancerPV(m: Montee, alea: () => number = Math.random): Montee {
  if (m.jetPV !== null) throw new RefusMontee('Le dé de vie de ce niveau est déjà lancé.');
  const faces = C.facesDeVie(m.b);
  return { ...m, jetPV: 1 + Math.floor(alea() * faces) };
}

export function prendreRang(m: Montee, idVoie: string, rang: number, choix?: string, offert = false): Montee {
  return avec(m, C.prendreRang(m.b, idVoie, rang, choix, offert));
}

export function retirerRang(m: Montee, idVoie: string, rang: number): Montee {
  refuserSiAcquis(capaciteAcquise(m, `${idVoie}.${rang}`), 'Ce rang');
  return avec(m, C.retirerRang(m.b, idVoie, rang));
}

export function debloquerHorsProfil(m: Montee, idVoie: string): Montee {
  return avec(m, C.debloquerHorsProfil(m.b, idVoie));
}

export function annulerHorsProfil(m: Montee, idVoie: string): Montee {
  refuserSiAcquis(m.avant.voiesHorsProfil.some((h) => h.voie === idVoie), 'Ce déblocage');
  return avec(m, C.annulerHorsProfil(m.b, idVoie));
}

export function prendreDon(m: Montee, idDon: string, choix?: unknown): Montee {
  return avec(m, C.prendreDon(m.b, idDon, choix));
}

export function retirerDon(m: Montee, idDon: string): Montee {
  refuserSiAcquis(m.avant.dons.includes(idDon), 'Ce don');
  return avec(m, C.retirerDon(m.b, idDon));
}

export function choisirOptionRaciale(m: Montee, rang: number, option: string): Montee {
  refuserSiAcquis(String(rang) in m.avant.capacitesRaceChoix, 'Ce choix racial');
  return avec(m, C.choisirOptionRaciale(m.b, rang, option));
}

export function choisirVariante(m: Montee, code: string | null): Montee {
  refuserSiAcquis(!!m.avant.raceVariante, 'La nation');
  return avec(m, C.choisirVariante(m.b, code));
}

export function apprendreSort(m: Montee, idSort: string): Montee {
  return avec(m, C.apprendreSort(m.b, idSort));
}

export function oublierSort(m: Montee, idSort: string): Montee {
  refuserSiAcquis(m.avant.grimoireSortsConnus.includes(idSort), 'Ce sort');
  return avec(m, C.oublierSort(m.b, idSort));
}

export function choisirCercle(m: Montee, cercle: string | null): Montee {
  refuserSiAcquis(!!m.avant.cercleSpecialisation, 'Le Cercle');
  return avec(m, C.choisirCercle(m.b, cercle));
}

// ------------------------------------------------------------- Ce qui est nouveau

/** Ajouts de ce niveau, par rapport à la fiche d'ouverture. */
export function nouveautes(m: Montee) {
  const { b, avant } = m;
  return {
    capacites: b.capacites.filter((c) => !avant.capacites.some((a) => a.id === c.id)),
    voiesHorsProfil: b.voiesHorsProfil.filter((h) => !avant.voiesHorsProfil.some((a) => a.voie === h.voie)),
    dons: b.dons.filter((d) => !avant.dons.includes(d)),
    sorts: b.sorts.filter((s) => !avant.grimoireSortsConnus.includes(s)),
    rangsRace: C.capacitesRaceDuBrouillon(b).filter((r) => !avant.capacitesRace.includes(r)),
  };
}

/** Points de capacité dépensés à ce niveau (le rang offert ne coûte rien). */
function depensesNouvelles(m: Montee): number {
  const n = nouveautes(m);
  return n.capacites.reduce((t, c) => t + (c.offert ? 0 : CalculsPersonnage.coutRangVoie(decouperCapacite(c.id).rang)), 0)
    + n.voiesHorsProfil.reduce((t, h) => t + h.cout, 0);
}

// ------------------------------------------------------------- Validation

/** Ce qui empêche de valider. Vide = la montée peut être écrite. */
export function erreursMontee(m: Montee): string[] {
  const { b } = m;
  const e: string[] = [];
  if (m.jetPV === null) e.push(`Lance le dé de vie du niveau ${b.niveau}.`);
  for (const [rang] of C.choixRaciauxRequis(b)) {
    if (!b.capacitesRaceChoix[String(rang)]) e.push(`Fais le choix du rang racial ${rang}.`);
  }
  if (C.varianteRequise(b) && !b.raceVariante) e.push('Choisis la nation elfique.');
  // Une fiche reprise de la v1 peut déjà dépasser son budget : on refuse seulement d'y ajouter.
  const pts = C.pointsVoie(b);
  if (pts.restants < 0 && depensesNouvelles(m) > 0) e.push(`Trop de points de capacité dépensés (${pts.depenses}/${pts.total}).`);
  if (b.dons.length < C.donsRequis(b)) e.push(`Choisis ${C.donsRequis(b) - b.dons.length} don(s).`);
  if (C.sortsAChoisir(b) < 0 && nouveautes(m).sorts.length > 0) e.push('Trop de sorts appris pour ce niveau.');
  return e;
}

/** Ce qui est signalé sans bloquer. */
export function avertissementsMontee(m: Montee): string[] {
  const { b } = m;
  const a: string[] = [];
  const pts = C.pointsVoie(b);
  if (pts.restants > 0) a.push(`${pts.restants} point(s) de capacité gardé(s) pour plus tard.`);
  if (C.aUnGrimoire(b.classe) && C.sortsAChoisir(b) > 0) a.push(`${C.sortsAChoisir(b)} sort(s) encore à apprendre.`);
  // Un rang qui accorde un sort à un Grimoire plein : rien n'est retiré, le dernier appris sort du plafond (v1 idem).
  if (C.aUnGrimoire(b.classe) && C.sortsAChoisir(b) < 0) a.push(`Grimoire plein : ${-C.sortsAChoisir(b)} sort(s) hors plafond, non inscrit(s).`);
  if (b.classe === 'pretre' && !b.cercleSpecialisation) a.push('Aucun Cercle choisi.');
  if (C.polyvalenceAcquise(b) && !C.rangOffert(b)) a.push('Polyvalence : le rang offert reste à choisir.');
  if (nouveautes(m).capacites.some((c) => voieParId.get(decouperCapacite(c.id).voie)?.speciale)) a.push('Voie du chaos : à valider avec le MJ.');
  return a;
}

// ------------------------------------------------------------- Application

/** Champs qu'une montée écrit sur la fiche (plus `progression.crans`, écrit par l'action). */
export const CHAMPS_MONTEE = [
  'niveau', 'capacites', 'capacitesRace', 'capacitesRaceChoix', 'raceVariante', 'voiesHorsProfil', 'dons', 'donsChoix',
  'grimoireSortsConnus', 'cercleSpecialisation', 'pvMax', 'pvActuel', 'pvHistorique', 'ppActuel',
] as const;

export interface MonteeAppliquee {
  /** Fiche après la montée (validée par le schéma), crans déjà dépensés. */
  fiche: Fiche;
  /** Champs à écrire, sans `progression` (dépensée par l'action). */
  champs: Partial<Record<(typeof CHAMPS_MONTEE)[number], unknown>>;
  /** Crans dépensés. */
  requis: number;
  pvGagnes: number;
}

/** Choix acquis d'une fiche : s'ils ont changé depuis l'ouverture, la montée est à refaire. */
const acquis = (f: Fiche) => JSON.stringify([
  f.niveau, f.classe, f.race, f.raceVariante ?? null, f.caracs, f.capacites, f.capacitesRace, f.capacitesRaceChoix,
  f.voiesHorsProfil, f.dons, f.donsChoix, f.grimoireSortsConnus, f.cercleSpecialisation,
]);

/**
 * Rejoue les choix de la montée sur la fiche `f` (celle d'ouverture, ou la
 * même relue dans la transaction). Lève une RefusMontee si la montée n'est
 * pas complète, si la barre n'est plus pleine, ou si les choix acquis ont
 * changé entre-temps.
 */
export function appliquerMontee(f: Fiche, m: Montee): MonteeAppliquee {
  if (acquis(f) !== acquis(m.avant)) throw new RefusMontee('La fiche a changé pendant la montée de niveau : recommence-la.');
  const barre = barreNiveau(f);
  if (barre.requis === null || !barre.pleine) throw new RefusMontee('La barre de progression n’est plus pleine.');
  const erreurs = erreursMontee(m);
  if (erreurs.length) throw new RefusMontee(erreurs.join(' '));
  return construire(f, m, barre.requis);
}

/** Aperçu pendant la montée (PV, PP…), dès que le dé de vie est lancé, choix incomplets compris. */
export function apercuMontee(m: Montee): MonteeAppliquee | null {
  const requis = barreNiveau(m.avant).requis;
  return m.jetPV === null || requis === null ? null : construire(m.avant, m, requis);
}

function construire(lue: Fiche, m: Montee, requis: number): MonteeAppliquee {
  // La fiche affichée porte son identifiant de document, que le schéma ne connaît pas.
  const { id: _id, ...f } = lue as Fiche & { id?: string };
  const { b } = m;
  const n = nouveautes(m);
  const calcAvant = new CalculsPersonnage(ficheCalculDepuisFiche(f));

  const sansPV = {
    ...f,
    niveau: b.niveau,
    capacites: b.capacites,
    capacitesRace: [...new Set([...f.capacitesRace, ...C.capacitesRaceDuBrouillon(b)])].sort((x, y) => x - y),
    capacitesRaceChoix: b.capacitesRaceChoix,
    raceVariante: b.raceVariante,
    voiesHorsProfil: b.voiesHorsProfil,
    dons: b.dons,
    donsChoix: b.donsChoix,
    grimoireSortsConnus: [...f.grimoireSortsConnus, ...n.sorts],
    cercleSpecialisation: b.cercleSpecialisation,
  };
  // Décision 2a : modificateur de CON effectif, recalculé pour tous les jets.
  const calcSansPV = new CalculsPersonnage(ficheCalculDepuisFiche(sansPV));
  const modCON = calcSansPV.mod('CON');
  const faces = calcSansPV.facesDeVie();
  const historique = [
    ...f.pvHistorique.map((j) => (typeof j.jet === 'number' ? { ...j, modCON, total: Math.max(1, j.jet + modCON) } : j)),
    { niveau: b.niveau, faces, jet: m.jetPV!, modCON, total: Math.max(1, m.jetPV! + modCON) },
  ];
  const avecPV = { ...sansPV, pvHistorique: historique };
  const calcApres = new CalculsPersonnage(ficheCalculDepuisFiche(avecPV));

  const pvGagnes = calcApres.pvCalcule() - calcAvant.pvCalcule();
  const pvMax = Math.max(1, f.pvMax + pvGagnes);
  const pvActuel = Math.max(0, Math.min(pvMax, (f.pvActuel ?? f.pvMax) + pvGagnes));
  const ppAvant = calcAvant.calculerPPMax();
  const ppApres = calcApres.calculerPPMax();
  const ppActuel = ppApres === null ? f.ppActuel : Math.max(0, Math.min(ppApres, (f.ppActuel ?? ppAvant ?? 0) + ppApres - (ppAvant ?? 0)));

  const fiche = schemaFiche.parse(versFirestore({
    ...avecPV,
    pvMax,
    pvActuel,
    ...(ppActuel === null || ppActuel === undefined ? {} : { ppActuel }),
    progression: { crans: Math.max(0, f.progression.crans - requis) },
  }, f.nom));
  const champs = Object.fromEntries(
    CHAMPS_MONTEE.filter((k) => fiche[k] !== undefined && JSON.stringify(fiche[k]) !== JSON.stringify(f[k])).map((k) => [k, fiche[k]]),
  );
  return { fiche, champs, requis, pvGagnes };
}
