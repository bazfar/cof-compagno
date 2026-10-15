<script lang="ts">
  import { rejoindreCommeJoueur, rejoindreCommeMj } from '../lib/actions/acces';
  import { session } from '../lib/session.svelte';

  let nom = $state('');
  let role = $state<'joueur' | 'mj'>('joueur');
  let code = $state('');
  let envoi = $state(false);
  let erreur = $state('');

  async function rejoindre(evenement: SubmitEvent): Promise<void> {
    evenement.preventDefault();
    envoi = true;
    erreur = '';
    try {
      if (role === 'mj') await rejoindreCommeMj(nom, code);
      else await rejoindreCommeJoueur(nom);
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    } finally {
      envoi = false;
    }
  }
</script>

<main>
  <form class="carte" onsubmit={rejoindre}>
    <h1>cof-compagno</h1>
    <p class="table">Table : {session.table}</p>

    <label for="nom">Ton nom</label>
    <input id="nom" bind:value={nom} autocomplete="nickname" maxlength="40" required />

    <fieldset>
      <legend>Tu rejoins la table comme</legend>
      <label class="choix"><input type="radio" bind:group={role} value="joueur" /> Joueur</label>
      <label class="choix"><input type="radio" bind:group={role} value="mj" /> Maître du jeu</label>
    </fieldset>

    {#if role === 'mj'}
      <label for="code">Code MJ</label>
      <input id="code" type="password" bind:value={code} autocomplete="off" required />
    {/if}

    {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}

    <button type="submit" disabled={envoi}>{envoi ? 'Connexion…' : 'Rejoindre la table'}</button>
  </form>
</main>

<style>
  main {
    max-width: 440px;
    margin: 96px auto;
    padding: 0 16px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h1 {
    font-size: 30px;
  }
  .table {
    margin: 0 0 8px;
    color: var(--couleur-encre-douce);
  }
  label {
    font-weight: 600;
  }
  fieldset {
    border: 1px solid var(--couleur-bordure-douce);
    border-radius: var(--rayon);
    padding: 10px 14px;
    display: flex;
    gap: 20px;
  }
  legend {
    font-weight: 600;
    padding: 0 4px;
  }
  .choix {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 400;
    min-height: 44px;
  }
  .choix input {
    min-height: auto;
  }
  .erreur {
    color: var(--couleur-danger);
    margin: 0;
  }
  button {
    margin-top: 8px;
  }
</style>
