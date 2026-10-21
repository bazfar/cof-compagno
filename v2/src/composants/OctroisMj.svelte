<script lang="ts">
  import { messageErreurPerso } from '../lib/actions/persos';
  import { modifierOctrois } from '../lib/actions/refonte';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import * as RF from '../lib/fiche/refonte';
  import { RefusCreation } from '../lib/regles/creation';
  import { ELEMENTS, MAITRISES, type Element, type Maitrise } from '../lib/schemas/effets';
  import type { FicheV2, Octrois } from '../lib/schemas/fiche';

  /*
   * Ce que le MJ accorde à un personnage de la refonte (lot L4.11b,
   * décisions 5a, 6a, 7a, 12a) : ouvrir la Voie du chaos, accorder les
   * éléments découverts et les verbes appris par grimoire, rouvrir la
   * conversion. Les choix se préparent ici, puis « Enregistrer » écrit le
   * champ `octrois` entier (règles Firestore : le MJ seul l'écrit).
   */

  let { fiche, surFin }: { fiche: AvecId<FicheV2>; surFin: (message: string) => void } = $props();

  // svelte-ignore state_referenced_locally -- les octrois partent de la fiche à l'ouverture
  let o = $state<Octrois>(structuredClone($state.snapshot(fiche.octrois) as Octrois));
  let refus = $state('');
  let enCours = $state(false);
  let verbe = $state('');
  let maitriseVerbe = $state<'nonMaitrise' | 'initie'>('initie');

  const verbes = RF.verbesAccordables();

  function geste(f: (x: Octrois) => Octrois) {
    try {
      o = f($state.snapshot(o) as Octrois);
      refus = '';
    } catch (e) {
      if (e instanceof RefusCreation) refus = e.message;
      else throw e;
    }
  }

  async function enregistrer() {
    refus = '';
    enCours = true;
    try {
      await modifierOctrois(fiche.id, $state.snapshot(o) as Octrois);
      surFin(`Octrois de ${fiche.nom} enregistrés.`);
    } catch (e) {
      refus = messageErreurPerso(e);
    } finally {
      enCours = false;
    }
  }
</script>

<section class="octrois" aria-label="Octrois de la refonte">
  <div class="tete">
    <h3>Ce que le MJ accorde</h3>
    <span class="espace"></span>
    <button class="discret" onclick={() => surFin('')}>Annuler</button>
  </div>
  {#if refus}<p class="refus" role="alert">{refus}</p>{/if}

  <label class="case">
    <input
      type="checkbox"
      checked={o.chaos}
      onchange={(ev) => {
        const caseChaos = ev.currentTarget;
        geste((x) => RF.ouvrirChaos({ ...fiche, octrois: x }, caseChaos.checked));
        caseChaos.checked = o.chaos; // un refus laisse la case comme avant
      }}
    />
    Voie du chaos ouverte
  </label>
  <label class="case">
    <input type="checkbox" checked={o.reconversion} onchange={(ev) => geste((x) => RF.rouvrirConversion(x, ev.currentTarget.checked))} />
    Conversion rouverte (le joueur refait ses voies une fois)
  </label>

  <h4>Éléments découverts</h4>
  <div class="grille">
    {#each ELEMENTS as e (e)}
      <label>
        {RF.nomElement(e)}
        <select aria-label={`Élément ${RF.nomElement(e)}`} value={o.elements[e] ?? ''} onchange={(ev) => geste((x) => RF.accorderElement(x, e as Element, (ev.currentTarget.value || null) as Maitrise | null))}>
          <option value="">—</option>
          {#each MAITRISES as m (m)}<option value={m}>{RF.NOMS_MAITRISES[m]}</option>{/each}
        </select>
      </label>
    {/each}
  </div>

  <h4>Verbes appris par grimoire ({o.verbes.length} / {RF.VERBES_ACCORDES_MAX})</h4>
  <ul class="liste">
    {#each o.verbes as v (v.id)}
      <li>
        {RF.nomAction(v.id)} <span class="aide">{RF.NOMS_MAITRISES[v.maitrise]}</span>
        <button class="petit discret" aria-label={`Retirer ${RF.nomAction(v.id)}`} onclick={() => geste((x) => RF.accorderVerbe(x, v.id, null))}>Retirer</button>
      </li>
    {/each}
  </ul>
  <div class="ligne">
    <select aria-label="Verbe à accorder" bind:value={verbe}>
      <option value="">Choisir un verbe…</option>
      {#each verbes as a (a.id)}<option value={a.id}>{RF.nomEcole(a.ecole ?? '')} — {a.nom} (rang {a.rang})</option>{/each}
    </select>
    <select aria-label="Maîtrise du verbe" bind:value={maitriseVerbe}>
      <option value="initie">{RF.NOMS_MAITRISES.initie}</option>
      <option value="nonMaitrise">{RF.NOMS_MAITRISES.nonMaitrise}</option>
    </select>
    <button disabled={!verbe} onclick={() => { geste((x) => RF.accorderVerbe(x, verbe, maitriseVerbe)); if (!refus) verbe = ''; }}>Accorder</button>
  </div>

  <button onclick={enregistrer} disabled={enCours}>Enregistrer</button>
</section>

<style>
  .octrois {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--couleur-or);
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
  }
  .tete,
  .ligne {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .espace {
    flex: 1;
  }
  h3 {
    font-size: 20px;
  }
  h4 {
    margin: 6px 0 0;
    font-size: 16px;
  }
  p {
    margin: 0;
  }
  .grille {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label.case {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    min-height: 40px;
  }
  .liste {
    margin: 0;
    padding-left: 18px;
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
  .refus {
    color: var(--couleur-danger);
  }
  select {
    min-height: 40px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure);
    background: var(--couleur-surface-claire);
    padding: 0 8px;
  }
</style>
