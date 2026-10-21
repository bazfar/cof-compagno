import { CalculsPersonnage } from '../regles/calculs.ts';
import * as C from '../regles/creation.ts';
import { constantes } from '../regles/donnees.ts';
import { ficheCalculDepuisFiche, versFirestore } from '../regles/fiche-document.ts';
import type { Carac } from '../regles/fiche-calcul.ts';
import { barreNiveau } from '../regles/progression.ts';
import type { ClasseRefonte } from '../schemas/classes.ts';
import { schemaFicheV2, type Fiche, type FicheV2, type RefonteFiche } from '../schemas/fiche.ts';
import { contexteDuBrouillon } from './creation-refonte.ts';
import * as R from './refonte.ts';
import { classeParId } from '../../regles/index.ts';

/*
 * Montée de niveau d'un personnage de la refonte (lot L4.11b, décision 11a
 * du 21/10/2026) : la même montée que la v1 (lib/regles/montee.ts) pour le
 * dé de vie, les dons, les rangs raciaux et Polyvalence, mais l'étape Voies
 * est celle de la refonte :
 *   - les points de voie du niveau (2 par niveau, rangs 3 à 5 à 2 points) ;
 *   - les sorts mineurs des niveaux qui en ajoutent un ;
 *   - les choix déjà faits sont FIGÉS : rangs acquis, rang offert, école,
 *     éléments, Répertoire, Spécimen, sorts mineurs et variantes acquis ne
 *     se retirent pas ; un choix encore vide (second élément quand la voie
 *     qui le donne arrive) se fait ici.
 *
 * Jauges : leur maximum monte avec le niveau (Endurance, Inspiration,
 * Sacré) ; la valeur du moment gagne le même écart, sans rien perdre de ce
 * qui a été dépensé. Plongée et Corruption d'Âme ne bougent pas.
 *
 * PV : comme en v1 (écart de pvCalcule entre avant et après). PP : la
 * réserve de la refonte (décision 11a du lot L4.12, 4 + 2 × niveau +
 * 2 × mod), les PP du moment gagnant l'écart de la réserve.
 *
 * Écriture (actions/montee.ts) : `appliquerMonteeRefonte` est rejouée sur
 * la fiche relue dans une transaction ; jauges relues comprises, puisque le
 * joueur a pu en dépenser pendant la montée.
 */

export interface MonteeRefonte {
  /** Fiche au moment de l'ouverture : ses choix sont figés. */
  avant: FicheV2;
  /** Brouillon de règles au niveau suivant : identité, race, dons (voies et sorts v1 vides). */
  b: C.Brouillon;
  /** Choix de la refonte au niveau suivant : acquis + nouveaux. */
  r: RefonteFiche;
  /** Dé de vie tiré pour le nouveau niveau ; null tant qu'il n'est pas lancé. */
  jetPV: number | null;
}

export const RefusMontee = C.RefusCreation;

const CARACS_CODES = constantes.caracs.map((c) => c.code) as Carac[];

function classeDe(f: FicheV2): ClasseRefonte {
  const classe = classeParId.get(f.refonte.classe);
  if (!classe) throw new RefusMontee('Classe de la refonte inconnue.');
  return classe;
}

/** Ouvre la montée d'une fiche v2 : refusée si la barre n'est pas pleine ou au plafond. */
export function ouvrirMonteeRefonte(lue: Fiche): MonteeRefonte {
  if (lue.schemaVersion !== 2) throw new RefusMontee('Ce personnage n’est pas passé à la refonte.');
  // Copie simple : la fiche affichée est un état réactif (proxy), que structuredClone refuse.
  const f = JSON.parse(JSON.stringify(lue)) as FicheV2;
  classeDe(f);
  const barre = barreNiveau(f);
  if (barre.requis === null) throw new RefusMontee('Niveau maximum atteint.');
  if (!barre.pleine) throw new RefusMontee(`Il manque ${barre.requis - barre.crans} cran(s) pour monter de niveau.`);
  const caracsLibres = Object.fromEntries(
    CARACS_CODES.map((c) => [c, (f.caracs[c] ?? 10) - 10 - C.bonusClasseCarac(f.classe, c)]),
  ) as Partial<Record<Carac, number>>;
  const b: C.Brouillon = {
    ...C.brouillonVide(),
    nom: f.nom,
    genre: f.genre === 'femme' ? 'femme' : 'homme',
    classe: f.classe,
    race: f.race,
    raceVariante: f.raceVariante ?? null,
    niveau: f.niveau + 1,
    caracsLibres,
    capacitesRaceChoix: { ...f.capacitesRaceChoix },
    dons: [...f.dons],
    donsChoix: f.donsChoix,
  };
  return { avant: f, b, r: structuredClone(f.refonte), jetPV: null };
}

/** Contexte de la refonte au niveau suivant (mod de magie compris, dons de la montée pris en compte). */
export function contexteMontee(m: MonteeRefonte): R.ContexteRefonte {
  return contexteDuBrouillon(m.b, classeDe(m.avant), m.avant.octrois);
}

// ------------------------------------------------------------- Verrous

function refuserSiFige(fige: boolean, quoi: string) {
  if (fige) throw new RefusMontee(`${quoi} : un choix fait ne se reprend pas à la montée de niveau.`);
}

const avecR = (m: MonteeRefonte, r: RefonteFiche): MonteeRefonte => ({ ...m, r });
const avecB = (m: MonteeRefonte, b: C.Brouillon): MonteeRefonte => ({ ...m, b });

// ------------------------------------------------------------- Gestes

/** Le dé de vie du nouveau niveau, tiré une seule fois. */
export function lancerPV(m: MonteeRefonte, alea: () => number = Math.random): MonteeRefonte {
  if (m.jetPV !== null) throw new RefusMontee('Le dé de vie de ce niveau est déjà lancé.');
  return { ...m, jetPV: 1 + Math.floor(alea() * C.facesDeVie(m.b)) };
}

export function prendreRang(m: MonteeRefonte, voie: string): MonteeRefonte {
  return avecR(m, R.prendreRang(classeDe(m.avant), m.r, contexteMontee(m), voie));
}

export function offrirRang(m: MonteeRefonte, voie: string): MonteeRefonte {
  return avecR(m, R.offrirRang(classeDe(m.avant), m.r, contexteMontee(m), voie));
}

export function retirerRang(m: MonteeRefonte, voie: string): MonteeRefonte {
  refuserSiFige((m.r.rangs[voie] ?? 0) <= (m.avant.refonte.rangs[voie] ?? 0), 'Ce rang est acquis');
  return avecR(m, R.retirerRang(m.r, voie));
}

export function poserChoix<K extends R.ChampDeChoix>(m: MonteeRefonte, champ: K, valeur: RefonteFiche[K]): MonteeRefonte {
  refuserSiFige(m.avant.refonte[champ] !== null, 'Ce choix est fait');
  return avecR(m, R.poserChoix(m.r, champ, valeur));
}

export function basculerMineur(m: MonteeRefonte, id: string): MonteeRefonte {
  refuserSiFige(m.avant.refonte.mineurs.includes(id), 'Ce sort mineur est acquis');
  return avecR(m, R.basculerMineur(classeDe(m.avant), m.r, contexteMontee(m), id));
}

export function choisirVarianteAction(m: MonteeRefonte, action: string, variante: string | null): MonteeRefonte {
  refuserSiFige(action in m.avant.refonte.variantes, 'Ce choix est fait');
  return avecR(m, R.choisirVarianteAction(m.r, action, variante));
}

/** Un geste de l'étape Voies (ChoixRefonte.svelte), avec les verrous de la montée. */
export function appliquerGeste(m: MonteeRefonte, g: R.GesteRefonte): MonteeRefonte {
  switch (g.type) {
    case 'prendre':
      return prendreRang(m, g.voie);
    case 'offrir':
      return offrirRang(m, g.voie);
    case 'retirer':
      return retirerRang(m, g.voie);
    case 'choix':
      return poserChoix(m, g.champ, g.valeur);
    case 'mineur':
      return basculerMineur(m, g.id);
    case 'variante':
      return choisirVarianteAction(m, g.action, g.variante);
  }
}

export function prendreDon(m: MonteeRefonte, idDon: string, choix?: unknown): MonteeRefonte {
  return avecB(m, C.prendreDon(m.b, idDon, choix));
}

export function retirerDon(m: MonteeRefonte, idDon: string): MonteeRefonte {
  refuserSiFige(m.avant.dons.includes(idDon), 'Ce don est acquis');
  return avecB(m, C.retirerDon(m.b, idDon));
}

export function choisirOptionRaciale(m: MonteeRefonte, rang: number, option: string): MonteeRefonte {
  refuserSiFige(String(rang) in m.avant.capacitesRaceChoix, 'Ce choix racial est fait');
  return avecB(m, C.choisirOptionRaciale(m.b, rang, option));
}

export function choisirVariante(m: MonteeRefonte, code: string | null): MonteeRefonte {
  refuserSiFige(!!m.avant.raceVariante, 'La nation est choisie');
  return avecB(m, C.choisirVariante(m.b, code));
}

// ------------------------------------------------------------- Ce qui est nouveau

/** Ajouts de ce niveau, par rapport à la fiche d'ouverture. */
export function nouveautes(m: MonteeRefonte) {
  const a = m.avant.refonte;
  return {
    rangs: Object.entries(m.r.rangs)
      .filter(([v, rang]) => rang > (a.rangs[v] ?? 0))
      .map(([voie, rang]) => ({ voie, de: a.rangs[voie] ?? 0, a: rang })),
    mineurs: m.r.mineurs.filter((x) => !a.mineurs.includes(x)),
    choix: R.CHAMPS_DE_CHOIX.filter((k) => a[k] === null && m.r[k] !== null),
    dons: m.b.dons.filter((d) => !m.avant.dons.includes(d)),
    rangsRace: C.capacitesRaceDuBrouillon(m.b).filter((r) => !m.avant.capacitesRace.includes(r)),
  };
}

// ------------------------------------------------------------- Validation

/** Ce qui empêche de valider. Vide = la montée peut être écrite. */
export function erreursMontee(m: MonteeRefonte): string[] {
  const { b } = m;
  const e: string[] = [];
  if (m.jetPV === null) e.push(`Lance le dé de vie du niveau ${b.niveau}.`);
  for (const [rang] of C.choixRaciauxRequis(b)) {
    if (!b.capacitesRaceChoix[String(rang)]) e.push(`Fais le choix du rang racial ${rang}.`);
  }
  if (C.varianteRequise(b) && !b.raceVariante) e.push('Choisis la nation elfique.');
  if (b.dons.length < C.donsRequis(b)) e.push(`Choisis ${C.donsRequis(b) - b.dons.length} don(s).`);
  e.push(...R.erreursRefonte(classeDe(m.avant), m.r, contexteMontee(m)));
  return e;
}

/** Ce qui est signalé sans bloquer : points gardés, Polyvalence, sort mineur encore libre. */
export function avertissementsMontee(m: MonteeRefonte): string[] {
  const ctx = contexteMontee(m);
  const a = R.avertissementsRefonte(m.r, ctx);
  const libres = R.profilDe(classeDe(m.avant), m.r, ctx).mineursMax - m.r.mineurs.length;
  if (libres > 0) a.push(`${libres} sort${libres > 1 ? 's' : ''} mineur${libres > 1 ? 's' : ''} encore à choisir.`);
  return a;
}

// ------------------------------------------------------------- Application

/** Champs qu'une montée de la refonte écrit (plus `progression.crans`, écrit par l'action). */
export const CHAMPS_MONTEE_REFONTE = [
  'niveau', 'capacitesRace', 'capacitesRaceChoix', 'raceVariante', 'dons', 'donsChoix', 'refonte', 'pvMax', 'pvActuel', 'pvHistorique', 'ppActuel',
] as const;

export interface MonteeRefonteAppliquee {
  /** Fiche après la montée (validée par le schéma), crans déjà dépensés. */
  fiche: FicheV2;
  /** Champs à écrire, sans `progression` (dépensée par l'action). */
  champs: Partial<Record<(typeof CHAMPS_MONTEE_REFONTE)[number], unknown>>;
  requis: number;
  pvGagnes: number;
}

/** Choix figés d'une fiche (jauges exclues : elles se dépensent pendant la montée). */
const acquis = (f: FicheV2) => {
  const { jauges: _j, ...choix } = f.refonte;
  return JSON.stringify([f.niveau, f.classe, f.race, f.raceVariante ?? null, f.caracs, f.capacitesRace, f.capacitesRaceChoix, f.dons, f.donsChoix, choix, f.octrois]);
};

/**
 * Rejoue la montée sur la fiche `f` (celle d'ouverture, ou la même relue
 * dans la transaction). RefusMontee si la montée n'est pas complète, si la
 * barre n'est plus pleine, ou si les choix figés ont changé entre-temps.
 */
export function appliquerMonteeRefonte(f: Fiche, m: MonteeRefonte): MonteeRefonteAppliquee {
  if (f.schemaVersion !== 2) throw new RefusMontee('Ce personnage n’est pas passé à la refonte.');
  if (acquis(f) !== acquis(m.avant)) throw new RefusMontee('La fiche a changé pendant la montée de niveau : recommence-la.');
  const barre = barreNiveau(f);
  if (barre.requis === null || !barre.pleine) throw new RefusMontee('La barre de progression n’est plus pleine.');
  const erreurs = erreursMontee(m);
  if (erreurs.length) throw new RefusMontee(erreurs.join(' '));
  return construire(f, m, barre.requis);
}

/** Aperçu pendant la montée (PV, PP, jauges), dès que le dé de vie est lancé. */
export function apercuMontee(m: MonteeRefonte): MonteeRefonteAppliquee | null {
  const requis = barreNiveau(m.avant).requis;
  return m.jetPV === null || requis === null ? null : construire(m.avant, m, requis);
}

/** Jauges du niveau suivant : chaque réserve gagne l'écart de son maximum. */
export function jaugesMontees(classe: ClasseRefonte, niveau: number, j: RefonteFiche['jauges']): RefonteFiche['jauges'] {
  const avant = R.jaugesPleines(classe, niveau, 0);
  const apres = R.jaugesPleines(classe, niveau + 1, 0);
  const monte = (k: 'endurance' | 'inspiration' | 'sacre') =>
    apres[k] === null ? null : Math.max(0, Math.min(apres[k]!, (j[k] ?? avant[k] ?? 0) + apres[k]! - (avant[k] ?? 0)));
  return { ...j, endurance: monte('endurance'), inspiration: monte('inspiration'), sacre: monte('sacre') };
}

function construire(lue: FicheV2, m: MonteeRefonte, requis: number): MonteeRefonteAppliquee {
  const { id: _id, ...f } = lue as FicheV2 & { id?: string };
  const { b } = m;
  const classe = classeDe(f);
  const calcAvant = new CalculsPersonnage(ficheCalculDepuisFiche(f));
  const sansPV: FicheV2 = {
    ...f,
    niveau: b.niveau,
    capacitesRace: [...new Set([...f.capacitesRace, ...C.capacitesRaceDuBrouillon(b)])].sort((x, y) => x - y),
    capacitesRaceChoix: b.capacitesRaceChoix,
    raceVariante: b.raceVariante,
    dons: b.dons,
    donsChoix: b.donsChoix,
    refonte: { ...m.r, jauges: jaugesMontees(classe, f.niveau, f.refonte.jauges) },
  };
  // Décision 2a (montée v1) : modificateur de CON effectif, recalculé pour tous les jets.
  const calcSansPV = new CalculsPersonnage(ficheCalculDepuisFiche(sansPV));
  const modCON = calcSansPV.mod('CON');
  const historique = [
    ...f.pvHistorique.map((j) => (typeof j.jet === 'number' ? { ...j, modCON, total: Math.max(1, j.jet + modCON) } : j)),
    { niveau: b.niveau, faces: calcSansPV.facesDeVie(), jet: m.jetPV!, modCON, total: Math.max(1, m.jetPV! + modCON) },
  ];
  const avecPV = { ...sansPV, pvHistorique: historique };
  const calcApres = new CalculsPersonnage(ficheCalculDepuisFiche(avecPV));

  const pvGagnes = calcApres.pvCalcule() - calcAvant.pvCalcule();
  const pvMax = Math.max(1, f.pvMax + pvGagnes);
  const pvActuel = Math.max(0, Math.min(pvMax, (f.pvActuel ?? f.pvMax) + pvGagnes));
  const ppAvant = R.profilDe(classe, f.refonte, R.contexteDe(f, classe)).reservePP;
  const ppApres = R.profilDe(classe, avecPV.refonte, R.contexteDe(avecPV, classe)).reservePP;
  const ppActuel = ppApres <= 0 ? undefined : Math.max(0, Math.min(ppApres, Math.min(f.ppActuel ?? ppAvant, ppAvant) + ppApres - ppAvant));

  const { ppActuel: _pp, ...sansPP } = avecPV;
  const fiche = schemaFicheV2.parse(versFirestore({
    ...sansPP,
    pvMax,
    pvActuel,
    ...(ppActuel === null || ppActuel === undefined ? {} : { ppActuel }),
    progression: { crans: Math.max(0, f.progression.crans - requis) },
  }, f.nom));
  const champs = Object.fromEntries(
    CHAMPS_MONTEE_REFONTE.filter((k) => fiche[k] !== undefined && JSON.stringify(fiche[k]) !== JSON.stringify(f[k])).map((k) => [k, fiche[k]]),
  );
  return { fiche, champs, requis, pvGagnes };
}
