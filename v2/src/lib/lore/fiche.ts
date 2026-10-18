import { TOUS, type FicheLoreJoueurs, type FicheLoreMj } from '../schemas/lore.ts';

/*
 * Règles du lore partagé (lot L2.7a), en fonctions pures et testées. Les
 * actions (lib/actions/lore.ts) ne font qu'écrire ce qu'elles rendent.
 */

/** Qui lit la version joueurs : [TOUS], des uid, ou personne (liste vide). */
export function lecteursEffectifs(f: Pick<FicheLoreMj, 'visibilite' | 'lecteurs'>): string[] {
  if (f.visibilite === 'tous') return [TOUS];
  if (f.visibilite === 'certains') return [...new Set(f.lecteurs)].sort();
  return [];
}

/**
 * Ce que voient les joueurs d'une fiche : sans les passages scellés, ni la
 * visibilité, ni la source. `null` quand personne ne la voit : son
 * document joueurs est alors supprimé (rien n'en reste lisible, pas même
 * le titre).
 */
export function versionJoueurs(f: FicheLoreMj): FicheLoreJoueurs | null {
  const lecteurs = lecteursEffectifs(f);
  if (lecteurs.length === 0) return null;
  return {
    titre: f.titre,
    ...(f.sousTitre ? { sousTitre: f.sousTitre } : {}),
    categorie: f.categorie,
    ordre: f.ordre,
    etiquettes: [...f.etiquettes],
    lecteurs,
    passages: f.passages.filter((p) => !p.scelle).map((p) => ({ id: p.id, ...(p.intertitre ? { intertitre: p.intertitre } : {}), texte: p.texte })),
    majLe: f.majLe,
    reveleLe: f.reveleLe,
  };
}

/**
 * Vrai si un joueur au moins gagne quelque chose à lire en passant de
 * `avant` à `apres` : la fiche devient visible, un lecteur s'ajoute, un
 * passage est descellé ou ajouté. Une correction de texte ne compte pas
 * (pas de marque « nouveau » pour une faute de frappe).
 */
export function revele(avant: FicheLoreMj | null, apres: FicheLoreMj): boolean {
  const a = avant ? lecteursEffectifs(avant) : [];
  const b = lecteursEffectifs(apres);
  if (b.length === 0) return false;
  if (a.length === 0) return true;
  if (b.includes(TOUS) && !a.includes(TOUS)) return true;
  if (!b.includes(TOUS) && b.some((u) => !a.includes(u))) return true;
  const visiblesAvant = new Set(avant!.passages.filter((p) => !p.scelle).map((p) => p.id));
  return apres.passages.some((p) => !p.scelle && !visiblesAvant.has(p.id));
}

/** Fiche prête à écrire : dates à jour, `reveleLe` avancé si les joueurs y gagnent. */
export function aEcrire(avant: FicheLoreMj | null, apres: FicheLoreMj, maintenant: number): FicheLoreMj {
  return { ...apres, majLe: maintenant, reveleLe: revele(avant, apres) ? maintenant : (avant?.reveleLe ?? apres.reveleLe) };
}

/** Identifiant d'un nouveau passage. */
export function nouvelIdPassage(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Identifiant d'une nouvelle fiche. */
export function nouvelIdFiche(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Tri d'affichage : catégories dans l'ordre de leur première fiche, puis rang, puis titre. */
export function trierParCategorie<T extends { categorie: string; ordre: number; titre: string }>(fiches: T[]): { categorie: string; fiches: T[] }[] {
  const triees = [...fiches].sort((a, b) => a.ordre - b.ordre || a.titre.localeCompare(b.titre, 'fr'));
  const groupes = new Map<string, T[]>();
  for (const f of triees) groupes.set(f.categorie, [...(groupes.get(f.categorie) ?? []), f]);
  return [...groupes].map(([categorie, liste]) => ({ categorie, fiches: liste }));
}
