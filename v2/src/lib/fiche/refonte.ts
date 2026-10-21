import { pointsDeVoies, verifierChoix, type ChoixDePersonnage, type Regles } from '../effets/profil.ts';
import { CalculsPersonnage } from '../regles/calculs.ts';
import { RefusCreation, rangRaceMax } from '../regles/creation.ts';
import { ficheCalculDepuisFiche, versFirestore } from '../regles/fiche-document.ts';
import type { ClasseRefonte } from '../schemas/classes.ts';
import { octroisVierges, schemaFicheV2, VERSION_FICHE_REFONTE, type Fiche, type FicheV1, type FicheV2, type Octrois, type RefonteFiche } from '../schemas/fiche.ts';
import { actionParId, actionsCommunes, classeParId, voieParId } from '../../regles/index.ts';

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

/** Classes v1 refondues, vers leur identifiant de la refonte (les cinq du groupe ; les autres suivent). */
export const CLASSE_REFONTE: Readonly<Record<string, string>> = {
  guerrier: 'guerrier',
  magicien: 'magicien',
  enchanteur: 'envouteur',
  pretre: 'pretre',
  barde: 'barde',
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

/** Jauges pleines (9a) : Endurance, Inspiration ou Sacré selon la classe ; Plongée à 0 ; la Corruption d'Âme donnée. */
export function jaugesPleines(classe: ClasseRefonte, niveau: number, corruptionAme: number): RefonteFiche['jauges'] {
  const res = classe.ressourceDeClasse;
  const max = res ? res.base + Math.floor(niveau / res.diviseurNiveau) : 0;
  return {
    endurance: res?.ressource === 'endurance' ? max : null,
    inspiration: res?.ressource === 'inspiration' ? max : null,
    sacre: classe.reserveSacre ? classe.reserveSacre.base + Math.floor(niveau / classe.reserveSacre.diviseurNiveau) : null,
    plongee: 0,
    corruptionAme,
  };
}

/** Un bloc `refonte` vide pour cette classe : aucun rang, jauges pleines. */
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
    jauges: jaugesPleines(classe, niveau, corruptionAme),
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
  const refonte: RefonteFiche = { ...r, jauges: jaugesPleines(classe, v1.niveau, v1.corruptionMajeure) };
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
