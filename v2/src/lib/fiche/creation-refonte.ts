import { CalculsPersonnage } from '../regles/calculs.ts';
import * as C from '../regles/creation.ts';
import type { ClasseRefonte } from '../schemas/classes.ts';
import { octroisVierges, type FicheV2, type Octrois, type RefonteFiche } from '../schemas/fiche.ts';
import { avertissementsRefonte, classeRefonteDe, convertirFiche, erreursRefonte, refonteVierge, type ContexteRefonte } from './refonte.ts';

/*
 * Création d'un personnage de la refonte (lot L4.11b, décision 10a du
 * 21/10/2026) : pour une classe refondue, l'assistant garde ses étapes
 * Identité, Caractéristiques, PV et dons, Récapitulatif, mais l'étape Voies
 * prend les choix de la refonte (voies, école, éléments, sorts mineurs) et
 * l'étape Magie v1 (Grimoire, Cercle) disparaît.
 *
 * Le brouillon v1 sert toujours pour l'identité, les caractéristiques, la
 * race, les PV et les dons ; ses voies, sorts et Cercle restent vides et le
 * bloc `brouillon.refonte` porte le reste. La fiche finale est la fiche v1
 * du brouillon, aussitôt convertie (lib/fiche/refonte.ts) : mêmes règles,
 * mêmes jauges pleines, rien d'accordé par le MJ (une création ne s'ouvre
 * pas la Voie du chaos, 12a).
 */

/** La classe de la refonte du brouillon, ou null si sa classe n'est pas refondue. */
export function classeDuBrouillon(b: C.Brouillon): ClasseRefonte | null {
  return classeRefonteDe(b.classe);
}

/** Niveau, race, mod de magie du brouillon ; octrois donnés (vierges à la création). */
export function contexteDuBrouillon(b: C.Brouillon, classe: ClasseRefonte, octrois: Octrois = octroisVierges()): ContexteRefonte {
  const modMagie = classe.caracMagie ? new CalculsPersonnage(C.ficheCalculDuBrouillon(b)).mod(classe.caracMagie) : 0;
  return { niveau: b.niveau, race: b.race, modMagie, octrois };
}

/** Le bloc `refonte` du brouillon (vierge s'il n'existe pas encore ou s'il est d'une autre classe), ou null hors refonte. */
export function refonteDuBrouillon(b: C.Brouillon): RefonteFiche | null {
  const classe = classeDuBrouillon(b);
  if (!classe) return null;
  return b.refonte?.classe === classe.id ? b.refonte : refonteVierge(classe, b.niveau);
}

/** Applique un geste de lib/fiche/refonte.ts au bloc `refonte` du brouillon. */
export function gesteRefonte(b: C.Brouillon, f: (classe: ClasseRefonte, r: RefonteFiche, ctx: ContexteRefonte) => RefonteFiche): C.Brouillon {
  const classe = classeDuBrouillon(b);
  if (!classe) throw new C.RefusCreation('Cette classe n’est pas encore passée à la refonte.');
  return { ...b, refonte: f(classe, refonteDuBrouillon(b)!, contexteDuBrouillon(b, classe)) };
}

/** Le brouillon sans ses choix v1 de voies, sorts et Cercle : ceux de la refonte les remplacent. */
const sansChoixV1 = (b: C.Brouillon): C.Brouillon => ({ ...b, capacites: [], voiesHorsProfil: [], sorts: [], cercleSpecialisation: null });

/** Erreurs d'une création de la refonte : celles de l'assistant (identité, caractéristiques, PV, dons), puis celles des choix de la refonte. */
export function erreursCreationRefonte(b: C.Brouillon): string[] {
  const classe = classeDuBrouillon(b);
  if (!classe) return C.erreursCreation(b);
  return [...C.erreursCreation(sansChoixV1(b)), ...erreursRefonte(classe, refonteDuBrouillon(b)!, contexteDuBrouillon(b, classe))];
}

/** Ce qui est signalé sans bloquer : Polyvalence, points de voie à dépenser. */
export function avertissementsCreationRefonte(b: C.Brouillon): string[] {
  const classe = classeDuBrouillon(b);
  if (!classe) return C.avertissementsCreation(b);
  return avertissementsRefonte(refonteDuBrouillon(b)!, contexteDuBrouillon(b, classe));
}

/** La fiche v2 du personnage créé ; RefusCreation listant les erreurs si le brouillon n'est pas complet. */
export function ficheV2DepuisBrouillon(b: C.Brouillon, proprietaireUid: string, creeLe: number): FicheV2 {
  const classe = classeDuBrouillon(b);
  if (!classe) throw new C.RefusCreation('Cette classe n’est pas encore passée à la refonte.');
  const erreurs = erreursCreationRefonte(b);
  if (erreurs.length) throw new C.RefusCreation(erreurs.join(' '));
  return convertirFiche(C.ficheDepuisBrouillon(sansChoixV1(b), proprietaireUid, creeLe), refonteDuBrouillon(b)!);
}
