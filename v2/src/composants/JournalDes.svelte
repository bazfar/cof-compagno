<script lang="ts">
  import { onDestroy } from 'svelte';
  import { lancerEtNoter, messageErreurJournal } from '../lib/actions/journal';
  import { suivreJournal } from '../lib/magasins/journal.svelte';
  import { texteJet } from '../lib/regles/des';
  import { session } from '../lib/session.svelte';

  /*
   * Journal de dés commun (lot L2.5, décision 4a du 16/10) : les derniers
   * jets de toute la table, en direct, et un lanceur libre. Les jets lancés
   * depuis la fiche (tests, potions, PV de montée de niveau) y arrivent
   * aussi.
   */

  const journal = suivreJournal(session.table);
  onDestroy(journal.arreter);

  let formule = $state('1d20');
  let libelle = $state('');
  let message = $state('');
  const RAPIDES = ['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100'];

  async function lancer(f = formule) {
    message = '';
    try {
      const jet = await lancerEtNoter(libelle.trim() || 'Jet libre', f);
      if (!jet) message = `Formule illisible : « ${f} » (exemples : 1d20+3, 2d6).`;
    } catch (e) {
      message = messageErreurJournal(e);
    }
  }

  const heure = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
</script>

<section class="carte journal" aria-label="Journal de dés">
  <h2>Journal de dés</h2>
  <div class="ligne">
    <input aria-label="Formule" class="formule" bind:value={formule} onkeydown={(ev) => ev.key === 'Enter' && lancer()} />
    <input aria-label="Pour quoi" placeholder="Pour quoi ? (facultatif)" maxlength="80" bind:value={libelle} />
    <button onclick={() => lancer()}>Lancer</button>
  </div>
  <div class="ligne rapides">
    {#each RAPIDES as r (r)}<button class="discret petit" onclick={() => lancer(r)}>{r}</button>{/each}
  </div>
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  {#if journal.etat.erreur}
    <p class="erreur" role="alert">{journal.etat.erreur}</p>
  {:else if journal.etat.elements.length === 0}
    <p class="aide">Aucun jet pour l'instant.</p>
  {:else}
    <ol aria-label="Derniers jets">
      {#each journal.etat.elements as j (j.id)}
        <li class:moi={j.auteurUid === session.uid}>
          <span class="aide">{heure(j.creeLe)}</span>
          <strong>{j.perso ?? j.auteurNom}</strong>
          <span>{j.libelle}</span>
          <span class="resultat">{texteJet(j.formule, { des: j.des, faces: 0, bonus: j.bonus, total: j.total })}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .journal {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    font-size: 20px;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .formule {
    width: 120px;
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
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 320px;
    overflow-y: auto;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 6px 10px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  li.moi {
    border-color: var(--couleur-accent-clair);
  }
  .resultat {
    margin-left: auto;
    font-weight: 700;
    color: var(--couleur-accent);
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
