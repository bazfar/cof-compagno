<script lang="ts">
  import { LONGUEUR_MIN_CODE } from '../lib/acces/pseudo';
  import { changerDeJoueur, protegerJoueur } from '../lib/actions/acces';
  import { session } from '../lib/session.svelte';

  /*
   * Joueurs inscrits avant le correctif du 19/10 (connexion anonyme, liée à
   * ce navigateur) : choisir un code perso pour se retrouver ailleurs. Le
   * compte garde son uid, donc ses personnages. Disparaît une fois fait.
   * « Me reconnecter » sert à qui a déjà protégé ce pseudo sur un autre
   * navigateur : il revient à l'accueil et choisit « Je suis déjà venu ».
   */

  let code = $state('');
  let envoi = $state(false);
  let erreur = $state('');

  async function enregistrer(evenement: SubmitEvent) {
    evenement.preventDefault();
    envoi = true;
    erreur = '';
    try {
      await protegerJoueur(code);
      code = '';
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    } finally {
      envoi = false;
    }
  }

  async function reconnecter() {
    erreur = '';
    try {
      await changerDeJoueur();
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    }
  }
</script>

{#if !session.protege}
  <form class="carte proteger" aria-label="Choisir un code perso" onsubmit={enregistrer}>
    <p>
      <strong>Choisis un code perso</strong> pour retrouver « {session.nom} » et tes personnages sur un autre navigateur ou un autre PC.
      Sans lui, ton joueur reste lié à ce navigateur.
    </p>
    <div class="ligne">
      <input aria-label="Code perso" type="password" bind:value={code} autocomplete="new-password" minlength={LONGUEUR_MIN_CODE} maxlength="64" required />
      <button type="submit" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer mon code'}</button>
      <button type="button" class="discret" onclick={reconnecter}>J'ai déjà un code : me reconnecter</button>
    </div>
    <p class="aide">{LONGUEUR_MIN_CODE} caractères au moins. Pas ton vrai mot de passe : un code rien que pour la table.</p>
    {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
  </form>
{/if}

<style>
  .proteger {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-color: var(--couleur-accent-clair);
    background: var(--couleur-accent-pale);
  }
  p {
    margin: 0;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .discret {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
