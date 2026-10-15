<script lang="ts">
  import { onMount } from 'svelte';
  import Accueil from './ecrans/Accueil.svelte';
  import EcranJoueur from './ecrans/EcranJoueur.svelte';
  import PosteMj from './ecrans/PosteMj.svelte';
  import { demarrerSession } from './lib/actions/acces';
  import { session } from './lib/session.svelte';
  import { tableDepuisUrl } from './lib/table';

  onMount(() => {
    void demarrerSession(tableDepuisUrl(window.location.href));
  });
</script>

{#if session.etape === 'chargement'}
  <p class="centre">Connexion à la table…</p>
{:else if session.etape === 'accueil'}
  <Accueil />
{:else if session.etape === 'joueur'}
  <EcranJoueur />
{:else if session.etape === 'mj'}
  <PosteMj />
{:else}
  <p class="centre erreur" role="alert">Impossible de rejoindre la table : {session.erreur}</p>
{/if}

<style>
  .centre {
    max-width: 480px;
    margin: 120px auto;
    text-align: center;
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
