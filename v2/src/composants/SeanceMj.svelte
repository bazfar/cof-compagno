<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { changerPresents, cloreSeance, ouvrirSeance, RefusSeance } from '../lib/actions/seances';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { suivreSeances } from '../lib/magasins/seances.svelte';
  import { session } from '../lib/session.svelte';

  /*
   * Séance (lot L3.1, décision du 18/10/2026 : le MJ coche les présents).
   * Fermée : un numéro (le suivant par défaut) et les présents, précochés
   * avec les joueurs qui ont un personnage joué. Ouverte : les présents se
   * cochent et se décochent à tout moment, et « Clore » la termine. Les
   * crans « aux présents » du groupe suivent ces cases (GroupeMj).
   */

  const table = suivreTable(session.table);
  const seances = suivreSeances(session.table);
  const joueurs = suivreJoueurs(session.table);
  onDestroy(() => {
    table.arreter();
    seances.arreter();
    joueurs.arreter();
  });

  const ouverte = $derived(table.etat.donnees?.seanceOuverte ?? null);
  const enCours = $derived(seances.etat.elements.find((s) => s.id === ouverte?.id) ?? null);
  const derniere = $derived([...seances.etat.elements].filter((s) => s.closeLe !== null).sort((a, b) => b.numero - a.numero)[0] ?? null);
  const tries = $derived([...joueurs.etat.elements].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));

  let numero = $state<number | null>(null);
  let coches = $state<Record<string, boolean> | null>(null);
  let message = $state('');
  let occupe = $state(false);

  // Avant ouverture : numéro suivant et joueurs ayant un personnage joué, tant que le MJ n'y a pas touché.
  const numeroPropose = $derived(Math.max(0, ...seances.etat.elements.map((s) => s.numero)) + 1);
  const cochesProposees = $derived(Object.fromEntries(joueurs.etat.elements.map((j) => [j.id, !!j.persoActif])));
  const numeroAffiche = $derived(numero ?? numeroPropose);
  const cochesAffichees = $derived(coches ?? cochesProposees);

  const heure = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  async function agir(f: () => Promise<unknown>) {
    message = '';
    occupe = true;
    try {
      await f();
    } catch (e) {
      message = e instanceof RefusSeance ? e.message : messageErreurPerso(e);
    } finally {
      occupe = false;
    }
  }

  function ouvrir() {
    const presents = Object.entries(cochesAffichees).filter(([, v]) => v).map(([uid]) => uid);
    void agir(async () => {
      await ouvrirSeance(numeroAffiche, presents);
      numero = null;
      coches = null;
    });
  }
  function basculer(uid: string, coche: boolean) {
    if (!enCours || !ouverte) return;
    const presents = coche ? [...enCours.presents, uid] : enCours.presents.filter((u) => u !== uid);
    void agir(() => changerPresents(ouverte.id, presents));
  }
  function clore() {
    if (!ouverte || !confirm(`Clore la séance ${ouverte.numero} ? Les présents ne pourront plus changer.`)) return;
    void agir(() => cloreSeance(ouverte.id));
  }
</script>

<section class="carte seance" aria-label="Séance">
  {#if ouverte}
    <h2>Séance {ouverte.numero}</h2>
    {#if enCours}<span class="aide">Ouverte le {jour(enCours.ouverteLe)} à {heure(enCours.ouverteLe)} · {enCours.presents.length} présent{enCours.presents.length > 1 ? 's' : ''}</span>{/if}
    <fieldset disabled={occupe || !enCours}>
      <legend>Présents</legend>
      {#each tries as j (j.id)}
        <label><input type="checkbox" checked={!!enCours?.presents.includes(j.id)} onchange={(ev) => basculer(j.id, ev.currentTarget.checked)} /> {j.nom}</label>
      {/each}
    </fieldset>
    <button class="discret" disabled={occupe} onclick={clore}>Clore la séance</button>
  {:else}
    <h2>Aucune séance ouverte</h2>
    {#if derniere}<span class="aide">Dernière : séance {derniere.numero}, le {jour(derniere.ouverteLe)}.</span>{/if}
    <label class="numero">Numéro <input type="number" min="1" max="9999" value={numeroAffiche} oninput={(ev) => (numero = Number.parseInt(ev.currentTarget.value, 10) || null)} /></label>
    <fieldset disabled={occupe}>
      <legend>Présents</legend>
      {#each tries as j (j.id)}
        <label><input type="checkbox" checked={!!cochesAffichees[j.id]} onchange={(ev) => (coches = { ...cochesAffichees, [j.id]: ev.currentTarget.checked })} /> {j.nom}</label>
      {/each}
      {#if tries.length === 0}<span class="aide">Aucun joueur n'a encore rejoint la table.</span>{/if}
    </fieldset>
    <button disabled={occupe || !seances.etat.pret} onclick={ouvrir}>Ouvrir la séance {numeroAffiche}</button>
  {/if}
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</section>

<style>
  .seance {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
  }
  h2 {
    font-size: 20px;
  }
  fieldset {
    border: 1px solid var(--couleur-bordure-douce);
    border-radius: var(--rayon);
    padding: 8px 10px;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  legend {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--couleur-encre-douce);
    padding: 0 4px;
  }
  fieldset label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
  }
  fieldset input {
    min-height: 0;
  }
  .numero {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .numero input {
    width: 90px;
    min-height: 36px;
  }
  .discret {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .erreur {
    color: var(--couleur-danger);
    margin: 0;
  }
</style>
