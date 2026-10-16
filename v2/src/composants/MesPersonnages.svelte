<script lang="ts">
  import { onDestroy } from 'svelte';
  import { choisirPersoActif, messageErreurPerso } from '../lib/actions/persos';
  import { suivreMesImports } from '../lib/magasins/imports.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import type { Brouillon } from '../lib/regles/creation';
  import { classeParId, raceParId } from '../lib/regles/donnees';
  import { brouillonDepuisV1, ErreurImportV1 } from '../lib/regles/import-v1';
  import { session } from '../lib/session.svelte';
  import AssistantCreation from './AssistantCreation.svelte';
  import FicheVivante from './FicheVivante.svelte';
  import Portrait from './Portrait.svelte';

  /*
   * Les personnages du joueur connecté (lot L2.2b). Un joueur peut en avoir
   * plusieurs (décision 2a) et en joue un : `joueurs/{uid}.persoActif`. Le
   * premier personnage créé devient le personnage joué.
   * La fiche vivante arrive en L2.3.
   *
   * Fiches v1 à reprendre (L2.2c) : celles que le MJ a attribuées au joueur
   * et qu'il n'a pas encore reprises. « Reprendre » ouvre l'assistant sur
   * la fiche v1.
   *
   * Fiche vivante (L2.3) : celle du personnage choisi dans la liste, par
   * défaut le personnage joué.
   */

  const persos = suivrePersos(session.table);
  const joueurs = suivreJoueurs(session.table);
  const imports = suivreMesImports(session.table, session.uid);
  onDestroy(() => {
    persos.arreter();
    joueurs.arreter();
    imports.arreter();
  });
  const aReprendre = $derived(imports.etat.elements.filter((i) => !i.reprisPar).sort((a, b) => a.importeLe - b.importeLe));

  const miens = $derived(
    persos.etat.elements.filter((p) => p.proprietaireUid === session.uid).sort((a, b) => a.creeLe - b.creeLe),
  );
  const actif = $derived(joueurs.etat.elements.find((j) => j.id === session.uid)?.persoActif ?? null);

  let choisi = $state<string | null>(null);
  const ouverte = $derived(miens.find((p) => p.id === (choisi ?? actif)) ?? miens[0] ?? null);
  let enCreation = $state(false);
  let depart = $state<Brouillon | null>(null);
  let message = $state('');

  function creer() {
    depart = null;
    enCreation = true;
  }

  function reprendre(id: string, v1Json: string) {
    message = '';
    try {
      depart = brouillonDepuisV1(JSON.parse(v1Json), id);
      enCreation = true;
    } catch (e) {
      message = e instanceof ErreurImportV1 || e instanceof SyntaxError ? `Fiche v1 illisible : ${e.message}` : String(e);
    }
  }

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
  <AssistantCreation {depart} surCree={cree} surAnnuler={() => (enCreation = false)} />
{:else}
  <section class="carte" aria-label="Mes personnages">
    <div class="tete">
      <h2>Mes personnages</h2>
      <span class="espace"></span>
      <button onclick={creer}>Créer un personnage</button>
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
            <Portrait idPerso={p.id} nom={p.nom} taille={36} />
            <button class="lien" aria-label={`Ouvrir la fiche de ${p.nom}`} aria-pressed={ouverte?.id === p.id} onclick={() => (choisi = p.id)}><strong>{p.nom}</strong></button>
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
    {#if aReprendre.length}
      <h3>Fiches de la v1 à reprendre</h3>
      <ul aria-label="Fiches de la v1 à reprendre">
        {#each aReprendre as i (i.id)}
          <li>
            <strong>{i.nom}</strong>
            <span class="aide">déposée par le MJ : tu rechoisis voies et dons, le reste est repris</span>
            <span class="espace"></span>
            <button onclick={() => reprendre(i.id, i.v1Json)}>Reprendre</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </section>
  {#if ouverte}
    {#key ouverte.id}
      <FicheVivante fiche={ouverte} modifiable={true} />
    {/key}
  {/if}
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
  h3 {
    font-size: 17px;
    margin-top: 16px;
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .espace {
    flex: 1 1 auto;
  }
  .lien {
    min-height: 0;
    padding: 0;
    background: none;
    color: var(--couleur-encre);
    font-weight: 400;
  }
  .lien[aria-pressed='true'] {
    text-decoration: underline;
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
