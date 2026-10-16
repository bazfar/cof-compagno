import { suivrePortrait } from './persos.svelte';

/*
 * Portraits des PJ posés sur la carte (lot L2.3), chargés en images prêtes
 * à dessiner. Un abonnement par personnage présent sur la scène, ouvert et
 * fermé au fil des jetons : on ne télécharge pas les portraits de toute la
 * table.
 */
export function suivrePortraitsJetons(table: string) {
  const images = $state<Record<string, HTMLImageElement>>({});
  const suivis = new Map<string, () => void>();

  function suivre(ids: readonly string[]) {
    for (const [id, arreter] of suivis) {
      if (ids.includes(id)) continue;
      arreter();
      suivis.delete(id);
      delete images[id];
    }
    for (const id of ids) {
      if (suivis.has(id)) continue;
      const portrait = suivrePortrait(table, id);
      const fin = $effect.root(() => {
        $effect(() => {
          const src = portrait.etat.donnees?.image;
          if (!src) {
            delete images[id];
            return;
          }
          const img = new Image();
          img.onload = () => {
            images[id] = img;
          };
          img.src = src;
        });
      });
      suivis.set(id, () => {
        fin();
        portrait.arreter();
      });
    }
  }

  function arreter() {
    for (const f of suivis.values()) f();
    suivis.clear();
  }

  return { images, suivre, arreter };
}
