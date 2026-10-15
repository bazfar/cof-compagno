<script lang="ts">
  import { onDestroy } from 'svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { session } from '../lib/session.svelte';

  const joueurs = suivreJoueurs(session.table);
  onDestroy(joueurs.arreter);

  const triees = $derived([...joueurs.etat.elements].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
</script>

<section class="carte" aria-label="Joueurs de la table">
  <h2>Joueurs de la table</h2>
  {#if joueurs.etat.erreur}
    <p class="erreur" role="alert">{joueurs.etat.erreur}</p>
  {:else if !joueurs.etat.pret}
    <p>Chargement…</p>
  {:else if triees.length === 0}
    <p>Aucun joueur n'a encore rejoint la table.</p>
  {:else}
    <ul>
      {#each triees as joueur (joueur.id)}
        <li>
          <strong>{joueur.nom}</strong>
          {#if joueur.id === session.uid}<span class="moi">toi</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h2 {
    font-size: 20px;
    margin-bottom: 12px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .moi {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-accent-pale);
    color: var(--couleur-accent);
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
