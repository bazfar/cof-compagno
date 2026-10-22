import { choixRequis, pointsDeVoies, profilMagique, verifierChoix, type ChoixDePersonnage, type ProfilMagique, type Regles } from '../effets/profil.ts';
import { CalculsPersonnage } from '../regles/calculs.ts';
import { RefusCreation, rangRaceMax } from '../regles/creation.ts';
import { ficheCalculDepuisFiche, versFirestore } from '../regles/fiche-document.ts';
import type { ClasseRefonte } from '../schemas/classes.ts';
import { ELEMENTS, MAITRISES, type Action, type Element, type Maitrise } from '../schemas/effets.ts';
import { JAUGES_DE_CLASSE, octroisVierges, schemaFicheV2, VERSION_FICHE_REFONTE, type Fiche, type FicheV1, type FicheV2, type Octrois, type RefonteFiche } from '../schemas/fiche.ts';
import { actionParId, actionsCommunes, classeParId, elementParId, voieParId } from '../../regles/index.ts';

/*
 * La refonte sur la fiche (lot L4.11a), en fonctions pures : les choix
 * d'un personnage de la refonte, ses points de voie, ses jauges, et la
 * conversion d'une fiche v1. Les écrans (assistant, montée, « Refaire mes
 * voies », poste MJ) viennent au lot L4.11b et ne font qu'appeler ces
 * fonctions ; les refus sont des RefusCreation, avec une phrase pour le
 * joueur, comme dans l'assistant de création.
 *
 * Décisions de Thomas du 21/10/2026 (verrouillées) :
 *   - 1b : la conversion REMPLACE les champs propres à la v1 par le bloc
 *     `refonte` ; une fiche non convertie reste une fiche v1 ;
 *   - 2a : budget v1, 2 points par niveau, rangs 3 à 5 à 2 points, le rang
 *     offert de la Polyvalence gratuit (lib/effets/profil.ts) ;
 *   - 3a : pas de voie hors profil ; les points v1 qui y étaient sont rendus
 *     (la conversion repart du budget du niveau) ;
 *   - 4a : le joueur convertit, au même niveau ; caractéristiques, PV,
 *     équipement, bourse, mutations, notes, crans et Vécu sont gardés ;
 *   - 5a : il valide seul ; le MJ peut rouvrir la conversion
 *     (`octrois.reconversion`) ;
 *   - 6a, 7a : verbes appris par grimoire et éléments découverts, accordés
 *     par le MJ (`octrois`) ; rien n'est converti d'office du grimoire v1 ;
 *   - 8a : points de Cercle et spécialisation v1 disparaissent ; le Sacré
 *     part plein ;
 *   - 9a : Endurance, Inspiration et Sacré pleins à la conversion ; la
 *     Corruption d'Âme reprend la corruption majeure v1 ; la Plongée part
 *     de 0 ;
 *   - 12a : la Voie du chaos est ouverte par le MJ ; un personnage qui
 *     l'avait en v1 l'a ouverte d'office ;
 *   - 13a : la voie raciale ne change pas (elle reste dans les champs
 *     communs) ; 14a : les dons non plus.
 * Le champ `classe` garde l'identifiant v1 (Enchanteur), que lisent les
 * calculs de la fiche ; `refonte.classe` porte celui de la refonte
 * (Envoûteur).
 */

/** Classes v1 refondues, vers leur identifiant de la refonte (les cinq du groupe, puis le Chevalier au lot L4.13, décision 12a, le Chasseur au lot L4.14, le Druide au lot L4.15 et le Moine au lot L4.16 ; le Nécromancien suit). */
export const CLASSE_REFONTE: Readonly<Record<string, string>> = {
  guerrier: 'guerrier',
  chevalier: 'chevalier',
  chasseur: 'chasseur',
  druide: 'druide',
  magicien: 'magicien',
  enchanteur: 'envouteur',
  pretre: 'pretre',
  barde: 'barde',
  moine: 'moine',
};

/** Les règles de la refonte, telles que les lit le profil. */
export const REGLES_REFONTE: Regles = { voies: voieParId, actions: actionParId, actionsCommunes };

/** La classe de la refonte d'une classe v1, ou null tant qu'elle n'est pas refondue. */
export function classeRefonteDe(classeV1: string | null): ClasseRefonte | null {
  const id = classeV1 ? CLASSE_REFONTE[classeV1] : undefined;
  return id ? (classeParId.get(id) ?? null) : null;
}

/** Ce qui, hors des choix eux-mêmes, compte pour les valider. */
export interface ContexteRefonte {
  niveau: number;
  race: string | null;
  modMagie: number;
  octrois: Octrois;
}

/** Contexte d'une fiche : son niveau, sa race, le mod de la caractéristique de magie de sa classe, ce que le MJ a accordé. */
export function contexteDe(f: Fiche, classe: ClasseRefonte, octrois: Octrois = f.schemaVersion === 2 ? f.octrois : octroisVierges()): ContexteRefonte {
  const modMagie = classe.caracMagie ? new CalculsPersonnage(ficheCalculDepuisFiche(f)).mod(classe.caracMagie) : 0;
  return { niveau: f.niveau, race: f.race, modMagie, octrois };
}

/** Polyvalence (Humain, rang racial 3) : un rang offert dans une voie de la classe. */
export function polyvalence(ctx: Pick<ContexteRefonte, 'niveau' | 'race'>): boolean {
  return ctx.race === 'humain' && rangRaceMax(ctx.niveau) >= 3;
}

/** Les choix du bloc `refonte`, dans la forme que lit le profil. */
export function choixDe(r: RefonteFiche, ctx: ContexteRefonte): ChoixDePersonnage {
  const sans = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
  return {
    niveau: ctx.niveau,
    modMagie: ctx.modMagie,
    ecole: sans(r.ecole),
    elementDepart: sans(r.elementDepart),
    secondElement: sans(r.secondElement),
    elementMaitre: sans(r.elementMaitre),
    rangs: r.rangs,
    mineurs: r.mineurs,
    mineurPalierII: sans(r.mineurPalierII),
    caracEnPlus: sans(r.caracEnPlus),
    rangOffert: r.rangOffert,
    chaosOuvert: ctx.octrois.chaos,
    elementsAccordes: ctx.octrois.elements,
    verbesHorsVoie: ctx.octrois.verbes,
  };
}

/** Les erreurs d'un bloc `refonte`, en phrases pour le joueur ; vide : il est valide. */
export function erreursRefonte(classe: ClasseRefonte, r: RefonteFiche, ctx: ContexteRefonte): string[] {
  const e = r.classe === classe.id ? [] : [`Ces choix sont ceux d’une autre classe (${r.classe}).`];
  e.push(...verifierChoix(classe, choixDe(r, ctx), REGLES_REFONTE));
  if (r.rangOffert && !polyvalence(ctx)) e.push('Seul un Humain doté de Polyvalence reçoit un rang offert.');
  for (const [action, variante] of Object.entries(r.variantes)) {
    if (!actionParId.get(action)?.variantes.some((v) => v.id === variante && v.palier === 'I')) e.push(`Choix inconnu pour ${action} : ${variante}.`);
  }
  return e;
}

/** Ce qui reste à faire sans bloquer : le rang offert de la Polyvalence, des points de voie à dépenser. */
export function avertissementsRefonte(r: RefonteFiche, ctx: ContexteRefonte): string[] {
  const a: string[] = [];
  if (polyvalence(ctx) && !r.rangOffert) a.push('Polyvalence : le rang offert reste à choisir.');
  const p = pointsDeVoies({ niveau: ctx.niveau, rangs: r.rangs, rangOffert: r.rangOffert });
  if (p.restants > 0) a.push(`${p.restants} point${p.restants > 1 ? 's' : ''} de voie à dépenser.`);
  return a;
}

/** Jauges pleines (9a) : la ressource de classe (Endurance, Honneur, Inspiration…) et le Sacré ; Plongée à 0 ; la Corruption d'Âme donnée. */
export function jaugesPleines(classe: ClasseRefonte, niveau: number, corruptionAme: number): RefonteFiche['jauges'] {
  const res = classe.ressourceDeClasse;
  const max = res ? res.base + Math.floor(niveau / res.diviseurNiveau) : 0;
  // Les ressources ajoutées au lot L4.13 n'apparaissent que pour leur classe (champs optionnels).
  const autre = res && res.ressource !== 'endurance' && res.ressource !== 'inspiration' && (JAUGES_DE_CLASSE as readonly string[]).includes(res.ressource) ? { [res.ressource]: max } : {};
  return {
    endurance: res?.ressource === 'endurance' ? max : null,
    inspiration: res?.ressource === 'inspiration' ? max : null,
    ...autre,
    sacre: classe.reserveSacre ? classe.reserveSacre.base + Math.floor(niveau / classe.reserveSacre.diviseurNiveau) : null,
    plongee: 0,
    corruptionAme,
  };
}

/** Jauges d'un personnage neuf ou converti : pleines, sauf une ressource qui repart à chaque combat (Ki du Moine : 1, lot L4.16). */
export function jaugesDeDepart(classe: ClasseRefonte, niveau: number, corruptionAme: number): RefonteFiche['jauges'] {
  const j = jaugesPleines(classe, niveau, corruptionAme);
  const res = classe.ressourceDeClasse;
  return res?.debutCombat !== undefined ? { ...j, [res.ressource]: res.debutCombat } : j;
}

/** Un bloc `refonte` vide pour cette classe : aucun rang, jauges de départ. */
export function refonteVierge(classe: ClasseRefonte, niveau: number, corruptionAme = 0): RefonteFiche {
  return {
    classe: classe.id,
    rangs: {},
    rangOffert: null,
    ecole: null,
    elementDepart: null,
    secondElement: null,
    elementMaitre: null,
    mineurs: [],
    mineurPalierII: null,
    caracEnPlus: null,
    variantes: {},
    jauges: jaugesDeDepart(classe, niveau, corruptionAme),
  };
}

// ---------------------------------------------------------------- Gestes

/** Prendre le rang suivant d'une voie : dans l'ordre, voie de la classe, chaos ouvert, groupe exclusif, budget. */
export function prendreRang(classe: ClasseRefonte, r: RefonteFiche, ctx: ContexteRefonte, voie: string): RefonteFiche {
  if (!classe.voies.includes(voie)) throw new RefusCreation('Cette voie n’est pas une voie de ta classe.');
  if (voieParId.get(voie)?.surAccordDuMJ && !ctx.octrois.chaos) throw new RefusCreation('La Voie du chaos s’ouvre avec l’accord du MJ.');
  const rang = (r.rangs[voie] ?? 0) + 1;
  if (rang > 5) throw new RefusCreation('Cette voie est déjà au rang 5.');
  const groupe = classe.voiesExclusives.find((g) => g.includes(voie));
  if (groupe?.some((v) => v !== voie && (r.rangs[v] ?? 0) > 0)) throw new RefusCreation(`Une seule voie parmi : ${groupe.map((v) => voieParId.get(v)?.nom ?? v).join(', ')}.`);
  const rangs = { ...r.rangs, [voie]: rang };
  if (pointsDeVoies({ niveau: ctx.niveau, rangs, rangOffert: r.rangOffert }).restants < 0) throw new RefusCreation('Pas assez de points de voie.');
  return { ...r, rangs };
}

/** Le rang offert de la Polyvalence : le rang suivant d'une voie de la classe, sans coût. */
export function offrirRang(classe: ClasseRefonte, r: RefonteFiche, ctx: ContexteRefonte, voie: string): RefonteFiche {
  if (!polyvalence(ctx)) throw new RefusCreation('Seul un Humain doté de Polyvalence reçoit un rang offert.');
  if (r.rangOffert) throw new RefusCreation('Le rang offert par Polyvalence est déjà choisi.');
  if (!classe.voies.includes(voie) || voieParId.get(voie)?.surAccordDuMJ) throw new RefusCreation('Polyvalence offre un rang dans une voie de ta classe.');
  const rang = (r.rangs[voie] ?? 0) + 1;
  if (rang > 5) throw new RefusCreation('Cette voie est déjà au rang 5.');
  return { ...r, rangs: { ...r.rangs, [voie]: rang }, rangOffert: { voie, rang } };
}

/** Retirer le rang le plus haut d'une voie ; le rang offert part avec lui. */
export function retirerRang(r: RefonteFiche, voie: string): RefonteFiche {
  const rang = r.rangs[voie] ?? 0;
  if (rang < 1) throw new RefusCreation('Aucun rang à retirer dans cette voie.');
  const { [voie]: _retire, ...autres } = r.rangs;
  const rangs = rang > 1 ? { ...autres, [voie]: rang - 1 } : autres;
  const offertParti = r.rangOffert?.voie === voie && r.rangOffert.rang === rang;
  return { ...r, rangs, rangOffert: offertParti ? null : r.rangOffert };
}

// ------------------------------------------------- Choix de magie (L4.11b)

/** Le profil que donnent ces choix : verbes, éléments, sorts mineurs permis… */
export function profilDe(classe: ClasseRefonte, r: RefonteFiche, ctx: ContexteRefonte): ProfilMagique {
  return profilMagique(classe, choixDe(r, ctx), REGLES_REFONTE);
}

/** Choix uniques du bloc `refonte` : école, éléments, Répertoire, Spécimen d'élite. */
export const CHAMPS_DE_CHOIX = ['ecole', 'elementDepart', 'secondElement', 'elementMaitre', 'mineurPalierII', 'caracEnPlus'] as const;
export type ChampDeChoix = (typeof CHAMPS_DE_CHOIX)[number];

/**
 * Pose (ou efface, avec null) un choix unique. Les valeurs proposées par
 * l'écran viennent de la classe ; ce qui ne va pas avec les voies prises
 * (second élément sans la voie qui le donne…) remonte dans erreursRefonte.
 */
export function poserChoix<K extends ChampDeChoix>(r: RefonteFiche, champ: K, valeur: RefonteFiche[K]): RefonteFiche {
  return { ...r, [champ]: valeur };
}

/** Prendre ou rendre un sort mineur ; rendre celui du Répertoire efface aussi ce choix. */
export function basculerMineur(classe: ClasseRefonte, r: RefonteFiche, ctx: ContexteRefonte, id: string): RefonteFiche {
  if (r.mineurs.includes(id)) return { ...r, mineurs: r.mineurs.filter((m) => m !== id), mineurPalierII: r.mineurPalierII === id ? null : r.mineurPalierII };
  if (!classe.mineurs.liste.includes(id)) throw new RefusCreation('Ce sort mineur n’est pas un sort de ta classe.');
  const max = profilDe(classe, r, ctx).mineursMax;
  if (r.mineurs.length >= max) throw new RefusCreation(`${max} sort${max > 1 ? 's' : ''} mineur${max > 1 ? 's' : ''} au plus à ce niveau.`);
  return { ...r, mineurs: [...r.mineurs, id] };
}

/** Passifs du profil qui offrent un choix permanent (variantes du palier I), à faire une fois pour toutes. */
export function variantesAChoisir(classe: ClasseRefonte, r: RefonteFiche, ctx: ContexteRefonte): Action[] {
  return profilDe(classe, r, ctx)
    .actions.map((id) => actionParId.get(id))
    .filter((a): a is Action => !!a && a.nature === 'passif' && a.variantes.some((v) => v.palier === 'I'));
}

/** Choisir la variante d'un passif ; null revient à l'effet de base. */
export function choisirVarianteAction(r: RefonteFiche, action: string, variante: string | null): RefonteFiche {
  const { [action]: _ancienne, ...autres } = r.variantes;
  if (variante === null) return { ...r, variantes: autres };
  if (!actionParId.get(action)?.variantes.some((v) => v.id === variante && v.palier === 'I')) throw new RefusCreation('Ce choix n’existe pas pour cette capacité.');
  return { ...r, variantes: { ...autres, [action]: variante } };
}

/** Un geste de l'étape Voies de la refonte, tel que l'écran le transmet (ChoixRefonte.svelte). */
export type GesteRefonte =
  | { type: 'prendre'; voie: string }
  | { type: 'offrir'; voie: string }
  | { type: 'retirer'; voie: string }
  | { [K in ChampDeChoix]: { type: 'choix'; champ: K; valeur: RefonteFiche[K] } }[ChampDeChoix]
  | { type: 'mineur'; id: string }
  | { type: 'variante'; action: string; variante: string | null };

/** Applique un geste au bloc `refonte` ; refus expliqué (RefusCreation) sinon. */
export function appliquerGeste(classe: ClasseRefonte, r: RefonteFiche, ctx: ContexteRefonte, g: GesteRefonte): RefonteFiche {
  switch (g.type) {
    case 'prendre':
      return prendreRang(classe, r, ctx, g.voie);
    case 'offrir':
      return offrirRang(classe, r, ctx, g.voie);
    case 'retirer':
      return retirerRang(r, g.voie);
    case 'choix':
      return poserChoix(r, g.champ, g.valeur);
    case 'mineur':
      return basculerMineur(classe, r, ctx, g.id);
    case 'variante':
      return choisirVarianteAction(r, g.action, g.variante);
  }
}

/** Ce que l'écran propose, d'après la classe et les voies prises : listes vides ou null quand le choix ne s'offre pas. */
export interface ChoixOuverts {
  ecoles: readonly string[];
  elementsDepart: readonly Element[];
  elementsSecond: readonly Element[];
  elementsMaitre: readonly Element[];
  caracEnPlus: { valeur: number; parmi: readonly string[] } | null;
  repertoire: boolean;
  /** Sorts mineurs permis à ce niveau (Répertoire compris), et la liste de la classe. */
  mineursMax: number;
  mineurs: readonly string[];
  /** Voies montrées : celles de la classe, la Voie du chaos seulement si le MJ l'a ouverte (12a). */
  voies: readonly string[];
}

export function choixOuverts(classe: ClasseRefonte, r: RefonteFiche, ctx: ContexteRefonte): ChoixOuverts {
  const requis = choixRequis(classe, choixDe(r, ctx), REGLES_REFONTE);
  const departs = [r.elementDepart, r.secondElement].filter((e): e is Element => e !== null);
  return {
    ecoles: classe.creation.ecoles,
    elementsDepart: classe.creation.elements ?? [],
    elementsSecond: requis.secondElement ? classe.creation.elementsSecond.filter((e) => e !== r.elementDepart) : [],
    elementsMaitre: requis.elementMaitre ? departs : [],
    caracEnPlus: requis.caracEnPlus,
    repertoire: requis.repertoire,
    mineursMax: profilDe(classe, r, ctx).mineursMax,
    mineurs: classe.mineurs.liste,
    voies: classe.voies.filter((v) => ctx.octrois.chaos || !voieParId.get(v)?.surAccordDuMJ),
  };
}

// --------------------------------------------- Noms pour l'écran (L4.11b)

/** Noms des écoles (les données les désignent par identifiant). */
export const NOMS_ECOLES: Readonly<Record<string, string>> = {
  evocation: 'Évocation',
  abjuration: 'Abjuration',
  invocation: 'Invocation',
  illusion: 'Illusion',
  enchantement: 'Enchantement',
  // Cercles du Prêtre, Chant du Barde (lot L4.12 : noms affichés dans l'onglet Actions) et école du Druide (L4.15).
  guerison: 'Guérison',
  foi: 'Foi',
  bannissement: 'Bannissement',
  jugement: 'Jugement',
  chant: 'Chant',
  nature: 'Éléments naturels',
};
export const nomEcole = (id: string): string => NOMS_ECOLES[id] ?? id;
export const nomElement = (id: string): string => elementParId.get(id)?.nom ?? id;
export const nomAction = (id: string): string => actionParId.get(id)?.nom ?? id;
export const voieDeLaRefonte = (id: string) => voieParId.get(id);

export const classeDeLaRefonte = (id: string) => classeParId.get(id);

/** Noms des maîtrises, pour les octrois du MJ. */
export const NOMS_MAITRISES: Readonly<Record<Maitrise, string>> = { nonMaitrise: 'Non maîtrisé', initie: 'Initié', adepte: 'Adepte', maitre: 'Maître' };

/**
 * Où en est un personnage avec la refonte, pour le badge du MJ et le bouton
 * de la fiche : passé à la refonte, conversion rouverte par le MJ, à
 * convertir (classe refondue, fiche v1), ou v1 (classe pas encore refondue).
 */
export function etatRefonte(f: Fiche): 'refonte' | 'reconversion' | 'aConvertir' | 'v1' {
  if (f.schemaVersion === 2) return f.octrois.reconversion ? 'reconversion' : 'refonte';
  return classeRefonteDe(f.classe) ? 'aConvertir' : 'v1';
}

/** Verbes que le MJ peut accorder par grimoire (7a) : tous les verbes des écoles, par école puis rang. */
export function verbesAccordables(): Action[] {
  return [...actionParId.values()].filter((a) => a.nature === 'verbe').sort((x, y) => (x.ecole ?? '').localeCompare(y.ecole ?? '') || x.rang - y.rang);
}

// ------------------------------------------------ Octrois du MJ (L4.11b)

/** Ouvrir ou fermer la Voie du chaos (12a) ; la fermer suppose qu'aucun rang n'y est pris. */
export function ouvrirChaos(f: FicheV2, ouvert: boolean): Octrois {
  if (!ouvert && Object.entries(f.refonte.rangs).some(([v, rang]) => rang > 0 && voieParId.get(v)?.surAccordDuMJ)) {
    throw new RefusCreation('Ce personnage a des rangs dans la Voie du chaos : rouvre sa conversion pour qu’il les retire, puis ferme la voie.');
  }
  return { ...f.octrois, chaos: ouvert };
}

/** Accorder un élément découvert en jeu (6a), avec sa maîtrise ; null le retire. */
export function accorderElement(o: Octrois, element: Element, maitrise: Maitrise | null): Octrois {
  if (!ELEMENTS.includes(element)) throw new RefusCreation(`Élément inconnu : ${element}.`);
  const { [element]: _ancien, ...autres } = o.elements;
  if (maitrise === null) return { ...o, elements: autres };
  if (!MAITRISES.includes(maitrise)) throw new RefusCreation(`Maîtrise inconnue : ${maitrise}.`);
  return { ...o, elements: { ...autres, [element]: maitrise } };
}

/** Plafond des verbes accordés, aligné sur les règles Firestore (octroisValides). */
export const VERBES_ACCORDES_MAX = 30;

/** Accorder un verbe appris par grimoire (7a), au palier I, Non maîtrisé ou Initié ; null le retire. */
export function accorderVerbe(o: Octrois, id: string, maitrise: 'nonMaitrise' | 'initie' | null): Octrois {
  const autres = o.verbes.filter((v) => v.id !== id);
  if (maitrise === null) return { ...o, verbes: autres };
  if (actionParId.get(id)?.nature !== 'verbe') throw new RefusCreation('Seul un verbe s’apprend par grimoire.');
  if (autres.length >= VERBES_ACCORDES_MAX) throw new RefusCreation(`${VERBES_ACCORDES_MAX} verbes accordés au plus.`);
  return { ...o, verbes: [...autres, { id, maitrise }] };
}

/** Rouvrir la conversion (5a) : le joueur refait ses voies une fois, puis elle se referme. */
export function rouvrirConversion(o: Octrois, ouverte: boolean): Octrois {
  return { ...o, reconversion: ouverte };
}

// ------------------------------------------------------------ Conversion

/** Le personnage avait-il des rangs dans la Voie du chaos de sa classe en v1 ? (décision 12a) */
export function avaitLeChaos(v1: FicheV1): boolean {
  return v1.capacites.some((c) => c.id.startsWith(`${v1.classe}.chaos.`));
}

/** Champs propres à la v1, que la conversion retire (1b). */
export const CHAMPS_V1_RETIRES = [
  'capacites',
  'voiesHorsProfil',
  'pointsCercle',
  'corruptionCombat',
  'corruptionMajeure',
  'grimoireSortsConnus',
  'grimoireSortsPrepares',
  'cercleSpecialisation',
] as const;

/**
 * Convertit une fiche v1 à la refonte, avec les choix du joueur : refusée
 * si la classe n'est pas refondue ou si un choix est invalide. Les jauges
 * repartent pleines (9a), quelles que soient celles du bloc donné.
 */
export function convertirFiche(lue: FicheV1, r: RefonteFiche): FicheV2 {
  const { id: _id, ...v1 } = lue as FicheV1 & { id?: string };
  const classe = classeRefonteDe(v1.classe);
  if (!classe) throw new RefusCreation('Cette classe n’est pas encore passée à la refonte.');
  const octrois: Octrois = { ...octroisVierges(), chaos: avaitLeChaos(v1) };
  const erreurs = erreursRefonte(classe, r, contexteDe(v1, classe, octrois));
  if (erreurs.length) throw new RefusCreation(erreurs.join(' '));
  const communs: Record<string, unknown> = { ...v1 };
  for (const k of [...CHAMPS_V1_RETIRES, 'schemaVersion']) delete communs[k];
  const refonte: RefonteFiche = { ...r, jauges: jaugesDeDepart(classe, v1.niveau, v1.corruptionMajeure) };
  return schemaFicheV2.parse(versFirestore({ ...communs, schemaVersion: VERSION_FICHE_REFONTE, refonte, octrois }, v1.nom));
}

/** Refaire ses voies quand le MJ a rouvert la conversion (5a) : jauges et octrois gardés, la reconversion refermée. */
export function refaireVoies(lue: FicheV2, r: RefonteFiche): FicheV2 {
  const { id: _id, ...f } = lue as FicheV2 & { id?: string };
  if (!f.octrois.reconversion) throw new RefusCreation('Le MJ n’a pas rouvert la conversion de ce personnage.');
  const classe = classeParId.get(f.refonte.classe);
  if (!classe) throw new RefusCreation('Classe de la refonte inconnue.');
  const erreurs = erreursRefonte(classe, r, contexteDe(f, classe));
  if (erreurs.length) throw new RefusCreation(erreurs.join(' '));
  return schemaFicheV2.parse(versFirestore({ ...f, refonte: { ...r, jauges: f.refonte.jauges }, octrois: { ...f.octrois, reconversion: false } }, f.nom));
}

/** Ce qu'écrit la conversion dans Firestore : les champs posés, et ceux de la v1 à retirer. */
export function champsDeConversion(v2: FicheV2): { aEcrire: Pick<FicheV2, 'schemaVersion' | 'refonte' | 'octrois'>; aRetirer: readonly string[] } {
  return { aEcrire: { schemaVersion: v2.schemaVersion, refonte: v2.refonte, octrois: v2.octrois }, aRetirer: CHAMPS_V1_RETIRES };
}
