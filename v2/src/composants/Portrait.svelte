<script lang="ts">
  import { onDestroy } from 'svelte';
  import { suivrePortrait } from '../lib/magasins/persos.svelte';
  import { session } from '../lib/session.svelte';

  /*
   * Portrait d'un personnage (lot L2.3), lu en direct dans son propre
   * document. Sans portrait : les initiales sur un disque de couleur.
   */
  let { idPerso, nom, taille = 48 }: { idPerso: string; nom: string; taille?: number } = $props();

  // svelte-ignore state_referenced_locally -- un composant par personnage (clé {#each})
  const portrait = suivrePortrait(session.table, idPerso);
  onDestroy(portrait.arreter);

  const initiales = $derived(
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m[0]?.toUpperCase())
      .join(''),
  );
</script>

{#if portrait.etat.donnees}
  <img src={portrait.etat.donnees.image} alt={`Portrait de ${nom}`} width={taille} height={taille} style:width="{taille}px" style:height="{taille}px" />
{:else}
  <span class="initiales" role="img" aria-label={`Portrait de ${nom} (aucun)`} style:width="{taille}px" style:height="{taille}px" style:font-size="{Math.round(taille / 2.6)}px">{initiales}</span>
{/if}

<style>
  img,
  .initiales {
    flex: none;
    border-radius: 50%;
    border: 2px solid var(--couleur-or);
    object-fit: cover;
  }
  .initiales {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--couleur-accent-clair);
    color: var(--couleur-sur-accent);
    font-family: var(--police-titre);
    font-weight: 700;
  }
</style>
