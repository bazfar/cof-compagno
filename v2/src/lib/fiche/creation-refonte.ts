import { CalculsPersonnage } from '../regles/calculs.ts';
import { ficheCalculDepuisFiche } from '../regles/fiche-document.ts';
import * as C from '../regles/creation.ts';
import type { ClasseRefonte } from '../schemas/classes.ts';
import { octroisVierges, type FicheV2, type Octrois, type RefonteFiche } from '../schemas/fiche.ts';
import { avertissementsRefonte, classeRefonteDe, contexteDe, convertirFiche, erreursRefonte, profilDe, refonteVierge, type ContexteRefonte } from './refonte.ts';

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
  // Reprise d'une fiche v1 (lot L4.18, 5a) : ses capacités hors combat appellent des nœuds du Vécu, que le MJ accordera.
  const anciennes = (b.reprise?.anciens.capacites ?? []).map((c) => ({ id: `${c.voie}.${c.rang}` }));
  const v1 = { ...C.ficheDepuisBrouillon(sansChoixV1(b), proprietaireUid, creeLe), ...(anciennes.length ? { capacites: anciennes } : {}) };
  const converti = convertirFiche(v1, refonteDuBrouillon(b)!);
  // L4.12 : le Spécimen d'élite (14a) compte dans les PV — jets de PV recalculés avec le mod de CON
  // effectif, comme à la montée (décision 2a) —, et les PP sont la réserve de la refonte (11a).
  const modCON = new CalculsPersonnage(ficheCalculDepuisFiche(converti)).mod('CON');
  const v2 = { ...converti, pvHistorique: converti.pvHistorique.map((j) => (typeof j.jet === 'number' ? { ...j, modCON, total: Math.max(1, j.jet + modCON) } : j)) };
  const pvGagnes = pvCalcules(v2) - pvCalcules(v1);
  const pvMax = Math.max(1, v2.pvMax + pvGagnes);
  const pvActuel = Math.max(0, Math.min(pvMax, (v2.pvActuel ?? v2.pvMax) + pvGagnes));
  const reserve = profilDe(classe, v2.refonte, contexteDe(v2, classe)).reservePP;
  const { ppActuel: _pp, ...sansPP } = v2;
  if (reserve <= 0) return { ...sansPP, pvMax, pvActuel };
  // Reprise d'une fiche v1 : ses PP actuels, dans la réserve ; sinon, réserve pleine.
  const ppActuel = b.reprise && b.reprise.report.ppActuel !== null ? Math.max(0, Math.min(reserve, b.reprise.report.ppActuel)) : reserve;
  return { ...sansPP, pvMax, pvActuel, ppActuel };
}

const pvCalcules = (f: Parameters<typeof ficheCalculDepuisFiche>[0]) => new CalculsPersonnage(ficheCalculDepuisFiche(f)).pvCalcule();
