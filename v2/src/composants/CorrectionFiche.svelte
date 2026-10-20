<script lang="ts">
  import { untrack } from 'svelte';
  import { corrigerFiche, messageErreurPerso } from '../lib/actions/persos';
  import {
    avecRang,
    avertissements,
    champsCorriges,
    correctionDepuis,
    LIBELLES_CHAMPS,
    rangDeVoie,
    rangsRace,
    refusCorrection,
    voiesCorrigeables,
    type Correction,
  } from '../lib/fiche/correction';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import { classes, dons, races } from '../lib/regles/donnees';
  import { CARACS } from '../lib/schemas/commun';
  import type { Fiche } from '../lib/schemas/fiche';

  /*
   * Correction d'une fiche par le MJ (lot L3.6, cadrage L3 « édition des
   * fiches ») : identité, caractéristiques, PV, rangs des voies, voie
   * raciale et dons. Pour réparer une fiche importée de travers ou trancher
   * une erreur, sans passer par la console Firebase.
   *
   * Le brouillon part de la fiche à l'ouverture et la base ne l'écrase
   * jamais ; à l'enregistrement, seuls les champs changés depuis
   * l'ouverture sont écrits (une modification du joueur entre-temps sur un
   * autre champ est gardée). Les choix de capacité (« choix ») et les
   * champs de combat ne sont pas corrigés ici.
   */

  let { fiche, surFin }: { fiche: AvecId<Fiche>; surFin: (message: string) => void } = $props();

  // La fiche à l'ouverture, voulue : la base ne change plus pendant la correction.
  const base = untrack(() => correctionDepuis(fiche));
  let c = $state<Correction>(JSON.parse(JSON.stringify(base)) as Correction);
  let erreur = $state('');
  let envoi = $state(false);

  const champs = $derived(champsCorriges(base, $state.snapshot(c) as Correction));
  const changes = $derived(Object.keys(champs) as (keyof Correction)[]);
  const voies = $derived(voiesCorrigeables(c, fiche.voiesHorsProfil));
  const rangsRaciaux = $derived(rangsRace(c.race));
  const alertes = $derived(avertissements(fiche, $state.snapshot(c) as Correction));
  const donsDispo = $derived(dons.filter((d) => !c.dons.includes(d.id)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
  let donAjoute = $state('');

  const entier = (v: unknown, defaut: number) => {
    const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? Math.round(n) : defaut;
  };

  async function enregistrer() {
    erreur = '';
    const refus = refusCorrection(fiche, champs);
    if (refus) return void (erreur = refus);
    if (!confirm(`Corriger la fiche de ${fiche.nom} : ${changes.map((k) => LIBELLES_CHAMPS[k]).join(', ')} ?`)) return;
    envoi = true;
    try {
      const aEcrire = { ...champs, ...(champs.nom !== undefined ? { nom: champs.nom.trim() } : {}) } as Partial<Fiche>;
      await corrigerFiche(fiche.id, fiche, aEcrire);
      surFin(`Fiche corrigée : ${changes.map((k) => LIBELLES_CHAMPS[k]).join(', ')}.`);
    } catch (e) {
      erreur = messageErreurPerso(e);
    } finally {
      envoi = false;
    }
  }
</script>

<section class="correction" aria-label="Corriger la fiche (MJ)">
  <h3>Corriger la fiche (MJ)</h3>
  <p class="aide">Pour réparer une valeur. Les choix de capacité et le combat ne se corrigent pas ici. Rien n'est écrit avant « Enregistrer ».</p>

  <fieldset>
    <legend>Identité</legend>
    <label>Nom <input maxlength="40" bind:value={c.nom} /></label>
    <label>Genre <input maxlength="40" value={c.genre ?? ''} oninput={(e) => (c.genre = e.currentTarget.value || null)} /></label>
    <label>Niveau <input class="court" type="number" min="1" max="20" value={c.niveau} oninput={(e) => (c.niveau = entier(e.currentTarget.value, c.niveau))} /></label>
    <label>Race
      <select value={c.race ?? ''} onchange={(e) => { c.race = e.currentTarget.value || null; c.capacitesRace = c.capacitesRace.filter((r) => rangsRace(c.race).some((x) => x.rang === r)); }}>
        <option value="">—</option>
        {#each races as r (r.id)}<option value={r.id}>{r.nom}</option>{/each}
      </select>
    </label>
    <label>Classe
      <select value={c.classe ?? ''} onchange={(e) => (c.classe = e.currentTarget.value || null)}>
        <option value="">—</option>
        {#each classes as k (k.id)}<option value={k.id}>{k.nom}</option>{/each}
      </select>
    </label>
  </fieldset>

  <fieldset>
    <legend>Caractéristiques et PV</legend>
    {#each CARACS as k (k)}
      <label>{k} <input class="court" type="number" min="1" max="30" value={c.caracs[k] ?? ''} oninput={(e) => (c.caracs = { ...c.caracs, [k]: entier(e.currentTarget.value, c.caracs[k] ?? 10) })} /></label>
    {/each}
    <label>PV max <input class="court" type="number" min="0" value={c.pvMax} oninput={(e) => (c.pvMax = Math.max(0, entier(e.currentTarget.value, c.pvMax)))} /></label>
    <label>PV actuels <input class="court" type="number" min="0" value={c.pvActuel ?? ''} oninput={(e) => (c.pvActuel = e.currentTarget.value === '' ? null : Math.max(0, entier(e.currentTarget.value, 0)))} /></label>
  </fieldset>

  <fieldset>
    <legend>Voies</legend>
    {#each voies as v (v.id)}
      <label>
        {v.nom}{v.horsProfil ? ' (hors profil)' : ''}
        <select aria-label={`Rang dans ${v.nom}`} value={String(rangDeVoie(c.capacites, v.id))} onchange={(e) => (c.capacites = avecRang(c.capacites, v.id, Number(e.currentTarget.value)))}>
          {#each Array.from({ length: v.max + 1 }, (_, i) => i) as r (r)}<option value={String(r)}>{r === 0 ? 'aucun rang' : `rang ${r}`}</option>{/each}
        </select>
      </label>
    {:else}
      <p class="aide">Choisis une classe pour régler ses voies.</p>
    {/each}
  </fieldset>

  {#if rangsRaciaux.length}
    <fieldset>
      <legend>Voie raciale</legend>
      {#each rangsRaciaux as r (r.rang)}
        <label class="case">
          <input
            type="checkbox"
            checked={c.capacitesRace.includes(r.rang)}
            onchange={(e) => (c.capacitesRace = e.currentTarget.checked ? [...c.capacitesRace, r.rang].sort((a, b) => a - b) : c.capacitesRace.filter((x) => x !== r.rang))}
          />
          Rang {r.rang} : {r.nom}
        </label>
      {/each}
    </fieldset>
  {/if}

  <fieldset>
    <legend>Dons</legend>
    {#each c.dons as d (d)}
      <span class="don">
        {dons.find((x) => x.id === d)?.nom ?? d}
        <button class="discret petit" aria-label={`Retirer le don ${dons.find((x) => x.id === d)?.nom ?? d}`} onclick={() => (c.dons = c.dons.filter((x) => x !== d))}>Retirer</button>
      </span>
    {/each}
    <select aria-label="Don à ajouter" bind:value={donAjoute}>
      <option value="">Ajouter un don…</option>
      {#each donsDispo as d (d.id)}<option value={d.id}>{d.nom}</option>{/each}
    </select>
    <button class="petit" disabled={!donAjoute} onclick={() => { c.dons = [...c.dons, donAjoute]; donAjoute = ''; }}>Ajouter</button>
  </fieldset>

  {#each alertes as a (a)}<p class="alerte">{a}</p>{/each}
  {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
  <div class="ligne">
    <span class="aide">{changes.length ? `Modifié : ${changes.map((k) => LIBELLES_CHAMPS[k]).join(', ')}` : 'Aucune modification.'}</span>
    <span class="espace"></span>
    <button disabled={!changes.length || envoi} onclick={enregistrer}>Enregistrer</button>
    <button class="discret" onclick={() => surFin('')}>Fermer sans enregistrer</button>
  </div>
</section>

<style>
  .correction {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--couleur-accent-clair);
    border-radius: var(--rayon);
    background: var(--couleur-accent-pale);
  }
  h3 {
    margin: 0;
    font-size: 17px;
  }
  p {
    margin: 0;
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    border: 1px solid var(--couleur-bordure-douce);
    border-radius: var(--rayon);
    padding: 8px 12px;
    background: var(--couleur-surface);
  }
  legend {
    font-weight: 600;
    padding: 0 4px;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 400;
  }
  .court {
    width: 70px;
  }
  .case input {
    min-height: auto;
  }
  .don {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
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
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .alerte {
    color: var(--couleur-avertissement, var(--couleur-danger));
    font-size: 14px;
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
