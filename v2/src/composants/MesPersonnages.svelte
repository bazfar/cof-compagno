<script lang="ts">
  import { onDestroy } from 'svelte';
  import { choisirPersoActif, messageErreurPerso } from '../lib/actions/persos';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { classeParId, raceParId } from '../lib/regles/donnees';
  import { session } from '../lib/session.svelte';
  import AssistantCreation from './AssistantCreation.svelte';

  /*
   * Les personnages du joueur connecté (lot L2.2b). Un joueur peut en avoir
   * plusieurs (décision 2a) et en joue un : `joueurs/{uid}.persoActif`. Le
   * premier personnage créé devient le personnage joué.
   * La fiche vivante arrive en L2.3.
   */

  const persos = suivrePersos(session.table);
  const joueurs = suivreJoueurs(session.table);
  onDestroy(() => {
    persos.arreter();
    joueurs.arreter();
  });

  const miens = $derived(
    persos.etat.elements.filter((p) => p.proprietaireUid === session.uid).sort((a, b) => a.creeLe - b.creeLe),
  );
  const actif = $derived(joueurs.etat.elements.find((j) => j.id === session.uid)?.persoActif ?? null);

  let enCreation = $state(false);
  let message = $state('');

  async function jouer(id: string) {
    message = '';
    try {
      await choisirPersoActif(id);
    } catch (e) {
      message = messageErreurPerso(e);
    }
  }

  async function cree(id: string) {
    enCreation = false;
    if (!actif) await jouer(id);
  }
</script>

{#if enCreation}
  <AssistantCreation surCree={cree} surAnnuler={() => (enCreation = false)} />
{:else}
  <section class="carte" aria-label="Mes personnages">
    <div class="tete">
      <h2>Mes personnages</h2>
      <span class="espace"></span>
      <button onclick={() => (enCreation = true)}>Créer un personnage</button>
    </div>
    {#if persos.etat.erreur}
      <p class="erreur" role="alert">{persos.etat.erreur}</p>
    {:else if !persos.etat.pret}
      <p>Chargement…</p>
    {:else if miens.length === 0}
      <p>Tu n'as pas encore de personnage à cette table.</p>
    {:else}
      <ul>
        {#each miens as p (p.id)}
          <li class:actif={p.id === actif}>
            <strong>{p.nom}</strong>
            <span>{raceParId.get(p.race ?? '')?.nom ?? '—'} · {classeParId.get(p.classe ?? '')?.nom ?? '—'} · niveau {p.niveau}</span>
            <span class="espace"></span>
            {#if p.id === actif}
              <span class="joue">joué</span>
            {:else}
              <button class="discret" onclick={() => jouer(p.id)}>Jouer ce personnage</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </section>
{/if}

<style>
  .tete,
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  h2 {
    font-size: 20px;
  }
  .espace {
    flex: 1 1 auto;
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
    padding: 8px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  li.actif {
    border-color: var(--couleur-accent-clair);
    background: var(--couleur-accent-pale);
  }
  .joue {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
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
