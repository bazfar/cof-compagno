<script lang="ts">
  import { onDestroy } from 'svelte';
  import { clePseudo, doublons } from '../lib/acces/pseudo';
  import { retirerJoueur } from '../lib/actions/acces';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { session } from '../lib/session.svelte';

  /*
   * Joueurs de la table, côté MJ (correctif du 19/10/2026). Qui a un code
   * perso (et se retrouve donc sur un autre appareil), ses personnages, et
   * les doublons de pseudo laissés par l'ancienne connexion liée au
   * navigateur, que le MJ retire. Retirer un joueur ne supprime pas ses
   * personnages : ils restent dans le groupe.
   */

  const joueurs = suivreJoueurs(session.table);
  const persos = suivrePersos(session.table);
  onDestroy(() => {
    joueurs.arreter();
    persos.arreter();
  });

  const enDouble = $derived(doublons(joueurs.etat.elements));
  const liste = $derived(
    [...joueurs.etat.elements].sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.rejointLe - b.rejointLe),
  );
  const persosDe = (uid: string) => persos.etat.elements.filter((p) => p.proprietaireUid === uid);
  const date = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  let message = $state('');

  async function retirer(uid: string, nom: string, nbPersos: number) {
    const suite = nbPersos ? ` Ses ${nbPersos} personnage(s) restent dans le groupe, mais plus personne ne pourra les jouer.` : '';
    if (!confirm(`Retirer « ${nom} » de la table ?${suite}`)) return;
    message = '';
    try {
      await retirerJoueur(uid);
      message = `« ${nom} » a été retiré de la table.`;
    } catch (e) {
      message = messageErreurPerso(e);
    }
  }
</script>

<section class="carte" aria-label="Joueurs de la table">
  <h2>Joueurs de la table</h2>
  <p class="aide">
    Un joueur avec un code perso se retrouve sur n'importe quel navigateur. Sans code, son joueur est lié à un seul navigateur : s'il
    se reconnecte ailleurs, un doublon apparaît ici, à retirer.
  </p>
  {#if joueurs.etat.erreur}
    <p class="erreur" role="alert">{joueurs.etat.erreur}</p>
  {:else if !joueurs.etat.pret}
    <p>Chargement…</p>
  {:else if liste.length === 0}
    <p>Aucun joueur n'a encore rejoint la table.</p>
  {:else}
    <ul>
      {#each liste as j (j.id)}
        {@const siens = persosDe(j.id)}
        <li class:double={enDouble.has(clePseudo(j.nom))}>
          <strong>{j.nom}</strong>
          {#if j.protege}<span class="pastille ok">code perso</span>{:else}<span class="pastille">sans code</span>{/if}
          {#if enDouble.has(clePseudo(j.nom))}<span class="pastille alerte">doublon</span>{/if}
          <span class="aide">
            arrivé le {date(j.rejointLe)} · {siens.length ? siens.map((p) => p.nom).join(', ') : 'aucun personnage'}
          </span>
          <span class="espace"></span>
          <button class="discret petit" aria-label={`Retirer ${j.nom} (arrivé le ${date(j.rejointLe)})`} onclick={() => retirer(j.id, j.nom, siens.length)}>Retirer</button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if message}<p role="status">{message}</p>{/if}
</section>

<style>
  h2 {
    font-size: 20px;
  }
  ul {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: 8px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  li.double {
    border-color: var(--couleur-danger);
  }
  .pastille {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    border: 1px solid var(--couleur-bordure);
    color: var(--couleur-encre-douce);
  }
  .pastille.ok {
    border-color: var(--couleur-accent-clair);
    background: var(--couleur-accent-pale);
    color: var(--couleur-encre);
  }
  .pastille.alerte {
    border-color: var(--couleur-danger);
    color: var(--couleur-danger);
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .espace {
    flex: 1 1 auto;
  }
  .petit {
    min-height: 32px;
    padding: 0 10px;
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
