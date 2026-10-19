<script lang="ts">
  import { LONGUEUR_MIN_CODE } from '../lib/acces/pseudo';
  import { rejoindreCommeJoueur, rejoindreCommeMj, retrouverJoueur } from '../lib/actions/acces';
  import { session } from '../lib/session.svelte';

  /*
   * Accueil. Correctif du 19/10/2026 (décision de Thomas : pseudo + code
   * perso) : un joueur choisit un code à sa première venue ; « Je suis déjà
   * venu » le retrouve, avec ses personnages, sur n'importe quel navigateur
   * ou PC. Un pseudo déjà pris est refusé. Le MJ garde son code MJ.
   */

  let nom = $state('');
  let role = $state<'joueur' | 'mj'>('joueur');
  let venue = $state<'premiere' | 'retour'>('premiere');
  let code = $state('');
  let codeMj = $state('');
  let envoi = $state(false);
  let erreur = $state('');

  const libelleBouton = $derived(role === 'mj' || venue === 'premiere' ? 'Rejoindre la table' : 'Retrouver mon joueur');

  async function rejoindre(evenement: SubmitEvent): Promise<void> {
    evenement.preventDefault();
    envoi = true;
    erreur = '';
    try {
      if (role === 'mj') await rejoindreCommeMj(nom, codeMj);
      else if (venue === 'premiere') await rejoindreCommeJoueur(nom, code);
      else await retrouverJoueur(nom, code);
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

    <fieldset>
      <legend>Tu rejoins la table comme</legend>
      <label class="choix"><input type="radio" bind:group={role} value="joueur" /> Joueur</label>
      <label class="choix"><input type="radio" bind:group={role} value="mj" /> Maître du jeu</label>
    </fieldset>

    {#if role === 'joueur'}
      <fieldset>
        <legend>Tu es déjà venu ?</legend>
        <label class="choix"><input type="radio" bind:group={venue} value="premiere" /> Première fois</label>
        <label class="choix"><input type="radio" bind:group={venue} value="retour" /> Je suis déjà venu</label>
      </fieldset>
    {/if}

    <label for="nom">{role === 'joueur' ? 'Ton pseudo' : 'Ton nom'}</label>
    <input id="nom" bind:value={nom} autocomplete={role === 'joueur' ? 'username' : 'nickname'} maxlength="40" required />

    {#if role === 'mj'}
      <label for="code-mj">Code MJ</label>
      <input id="code-mj" type="password" bind:value={codeMj} autocomplete="off" required />
    {:else}
      <label for="code">Code perso</label>
      <input
        id="code"
        type="password"
        bind:value={code}
        autocomplete={venue === 'premiere' ? 'new-password' : 'current-password'}
        minlength={LONGUEUR_MIN_CODE}
        maxlength="64"
        required
      />
      {#if venue === 'premiere'}
        <p class="aide">
          {LONGUEUR_MIN_CODE} caractères au moins. Avec ton pseudo, il te fait retrouver ton joueur et tes personnages sur un autre navigateur ou un autre PC. Pas ton vrai mot de passe : un code rien que pour la table.
        </p>
      {/if}
    {/if}

    {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}

    <button type="submit" disabled={envoi}>{envoi ? 'Connexion…' : libelleBouton}</button>
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
  .aide {
    margin: 0;
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .erreur {
    color: var(--couleur-danger);
    margin: 0;
  }
  button {
    margin-top: 8px;
  }
</style>
