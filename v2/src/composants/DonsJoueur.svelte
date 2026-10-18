<script lang="ts">
  import { onDestroy } from 'svelte';
  import { accepterDon, annulerDon, refuserDon, reprendreDon, RefusDon } from '../lib/actions/dons';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { donsEnAttente, libelleObjet } from '../lib/dons/dons';
  import { suivreMesDons } from '../lib/magasins/dons.svelte';
  import { session } from '../lib/session.svelte';

  /*
   * Dons d'objets du joueur connecté (lot L3.3, décision du 18/10/2026 :
   * proposé puis accepté). Ne montre que ce qui attend un geste : les
   * objets qu'on lui propose (Accepter / Refuser), ceux qu'il a proposés
   * (Annuler), et ceux qu'on lui a refusés (Reprendre). Rien quand il n'y a
   * rien : le panneau ne prend pas de place pour rien.
   */

  const dons = suivreMesDons(session.table, session.uid);
  onDestroy(() => dons.arreter());
  const attente = $derived(donsEnAttente(dons.etat.elements, session.uid));
  const vide = $derived(!attente.entrants.length && !attente.sortants.length && !attente.refuses.length);

  let enCours = $state<string | null>(null);
  let message = $state('');

  async function geste(id: string, f: (id: string) => Promise<void>, fait: string) {
    enCours = id;
    message = '';
    try {
      await f(id);
      message = fait;
    } catch (e) {
      message = e instanceof RefusDon ? e.message : messageErreurPerso(e);
    } finally {
      enCours = null;
    }
  }
</script>

{#if dons.etat.erreur}
  <p class="erreur" role="alert">Dons illisibles : {dons.etat.erreur}</p>
{:else if !vide || message}
  <section class="carte dons" aria-label="Dons d’objets">
    <h2>Dons d’objets</h2>
    {#if attente.entrants.length}
      <ul aria-label="Objets proposés">
        {#each attente.entrants as d (d.id)}
          <li>
            <span><strong>{d.deNom}</strong> propose <strong>{libelleObjet(d.objet)}</strong> à {d.aNom}</span>
            <span class="espace"></span>
            <button class="petit" disabled={enCours === d.id} onclick={() => geste(d.id, accepterDon, `${libelleObjet(d.objet)} rangé dans le sac de ${d.aNom}.`)}>Accepter</button>
            <button class="discret petit" disabled={enCours === d.id} onclick={() => geste(d.id, refuserDon, 'Don refusé : l’objet retourne à son propriétaire.')}>Refuser</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if attente.refuses.length}
      <ul aria-label="Dons refusés">
        {#each attente.refuses as d (d.id)}
          <li>
            <span><strong>{d.aNom}</strong> a refusé <strong>{libelleObjet(d.objet)}</strong></span>
            <span class="espace"></span>
            <button class="petit" disabled={enCours === d.id} onclick={() => geste(d.id, reprendreDon, `${libelleObjet(d.objet)} est revenu dans le sac de ${d.deNom}.`)}>Reprendre</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if attente.sortants.length}
      <ul aria-label="Dons en attente">
        {#each attente.sortants as d (d.id)}
          <li>
            <span><strong>{libelleObjet(d.objet)}</strong> proposé à {d.aNom} <span class="aide">(de {d.deNom}, en attente)</span></span>
            <span class="espace"></span>
            <button class="discret petit" disabled={enCours === d.id} onclick={() => geste(d.id, annulerDon, `Don annulé : ${libelleObjet(d.objet)} est revenu dans le sac de ${d.deNom}.`)}>Annuler</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if message}<p class="message" role="status">{message}</p>{/if}
  </section>
{/if}

<style>
  h2 {
    font-size: 17px;
  }
  ul {
    list-style: none;
    margin: 8px 0 0;
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
    padding: 6px 10px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .espace {
    flex: 1 1 auto;
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
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
  .message {
    margin-top: 8px;
    font-size: 14px;
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
