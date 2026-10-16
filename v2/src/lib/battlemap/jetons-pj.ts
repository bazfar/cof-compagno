import type { JetonAffiche } from './rendu.ts';

/*
 * Jetons de PJ reliés aux personnages (lot L2.3, décision 2a du 16/10 :
 * plusieurs personnages par joueur, un seul joué).
 *
 * Le jeton d'un PJ a pour identifiant `pj-<id du personnage>` (L5.3 :
 * `pj-<uid du joueur>`). Son nom, ses PV et son portrait viennent de la
 * fiche, relus en direct : un nom changé ou des PV perdus se voient
 * aussitôt sur la carte (v1 : nom copié à la pose, figé). Les anciens jetons
 * `pj-<uid>` restent affichés tels quels jusqu'à ce que le MJ les retire.
 */

export const PREFIXE_PJ = 'pj-';

export const idJetonPerso = (idPerso: string) => `${PREFIXE_PJ}${idPerso}`;

/** Identifiant du personnage d'un jeton de PJ, ou null. */
export function persoDuJeton(idJeton: string): string | null {
  return idJeton.startsWith(PREFIXE_PJ) ? idJeton.slice(PREFIXE_PJ.length) : null;
}

export interface InfoPersoJeton {
  nom: string;
  pv: { actuel: number; max: number };
  portrait?: CanvasImageSource | null;
}

/** Nom, PV et portrait des jetons de PJ, pris dans les fiches. */
export function enrichirJetons(jetons: readonly JetonAffiche[], persos: ReadonlyMap<string, InfoPersoJeton>): JetonAffiche[] {
  return jetons.map((j) => {
    const idPerso = j.genre === 'pj' ? persoDuJeton(j.id) : null;
    const info = idPerso ? persos.get(idPerso) : undefined;
    return info ? { ...j, nom: info.nom, pv: info.pv, portrait: info.portrait ?? null } : j;
  });
}

export interface JoueurPourJeton {
  id: string;
  nom: string;
  couleur?: string;
  persoActif?: string;
}

/**
 * MJ, « + PJ des joueurs » : le personnage joué de chaque joueur qui n'a pas
 * encore son jeton sur la scène. Un joueur sans personnage joué (ou dont le
 * personnage n'est pas à lui) est ignoré.
 */
export function pjAPoser(
  joueurs: readonly JoueurPourJeton[],
  persos: ReadonlyMap<string, { nom: string; proprietaireUid: string }>,
  jetons: readonly { id: string }[],
): { joueur: JoueurPourJeton; idPerso: string; nom: string }[] {
  const poses = new Set(jetons.map((j) => j.id));
  return joueurs.flatMap((joueur) => {
    const idPerso = joueur.persoActif;
    const perso = idPerso ? persos.get(idPerso) : undefined;
    if (!idPerso || !perso || perso.proprietaireUid !== joueur.id || poses.has(idJetonPerso(idPerso))) return [];
    return [{ joueur, idPerso, nom: perso.nom }];
  });
}
