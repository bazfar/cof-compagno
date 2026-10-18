<script lang="ts">
  import { onDestroy } from 'svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { session } from '../lib/session.svelte';

  /*
   * Joueurs inscrits à la table, en direct. Depuis L2.6, une rangée de
   * pastilles dans la barre du haut (le nom au survol et pour les lecteurs
   * d'écran) au lieu d'un bloc en bas de page. Ce sont les inscrits, pas les
   * connectés : l'app ne suit pas encore la présence (séances, L3).
   */

  const joueurs = suivreJoueurs(session.table);
  onDestroy(joueurs.arreter);

  const triees = $derived([...joueurs.etat.elements].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
  const initiales = (nom: string) =>
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m[0]?.toUpperCase())
      .join('');
</script>

{#if joueurs.etat.erreur}
  <span class="erreur" role="alert">Joueurs indisponibles : {joueurs.etat.erreur}</span>
{:else if joueurs.etat.pret}
  {#if triees.length === 0}
    <span class="vide">Aucun joueur n'a encore rejoint la table.</span>
  {:else}
    <ul aria-label="Joueurs de la table">
      {#each triees as joueur (joueur.id)}
        <li class:moi={joueur.id === session.uid} title={joueur.id === session.uid ? `${joueur.nom} (toi)` : joueur.nom} style:border-color={joueur.couleur}>
          <span aria-hidden="true">{initiales(joueur.nom)}</span>
          <span class="lecteur">{joueur.nom}{#if joueur.id === session.uid} (toi){/if}</span>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  li {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    background: var(--couleur-surface);
    color: var(--couleur-accent);
    border: 2px solid var(--couleur-or);
  }
  li.moi {
    box-shadow: 0 0 0 2px var(--couleur-sur-accent);
  }
  .lecteur {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .vide {
    font-size: 13px;
    opacity: 0.8;
  }
  .erreur {
    font-size: 13px;
    color: var(--couleur-danger-pale);
  }
</style>
