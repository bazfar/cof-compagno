<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { annoncerPalier, corrigerRemous, reglerMembrane, viderRemous } from '../lib/actions/remous';
  import { MEMBRANES, ORDRE_MEMBRANES, palierDe, prochainSeuil, remueur, type Membrane } from '../lib/combat/remous';
  import type { DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreRemous } from '../lib/magasins/combat.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import type { Remous } from '../lib/schemas/remous';
  import { session } from '../lib/session.svelte';

  /*
   * La jauge du Remous de la scène active (lot L6.7b, décisions de Thomas
   * du 29/10/2026).
   *   - 5a : toute la table la voit : son palier, son total, le prochain
   *     seuil, la membrane ;
   *   - 8a : chez le MJ, un palier franchi part au journal ; le palier 4
   *     déchire la membrane ;
   *   - 9a : le MJ la vide (repos long, heure de marche), règle la membrane,
   *     la corrige au −/+ ;
   *   - 10a : le MJ voit qui le Remous traque.
   */

  let { role }: { role: 'mj' | 'joueur' } = $props();

  const table = suivreTable(session.table);
  const persos = suivrePersos(session.table);
  onDestroy(() => {
    table.arreter();
    persos.arreter();
  });
  const scene = $derived(table.etat.donnees?.sceneActive ?? null);
  let suivi = $state<DocumentSuivi<Remous> | null>(null);
  $effect(() => {
    if (!scene) return;
    const s = suivreRemous(session.table, scene);
    suivi = s;
    return () => {
      s.arreter();
      suivi = null;
    };
  });
  const r = $derived(suivi?.etat.donnees ?? null);
  const p = $derived(palierDe(r));
  const membrane = $derived<Membrane>(r?.membrane ?? 'epaisse');
  const seuil = $derived(prochainSeuil(r ?? { total: 0, membrane: 'epaisse' }));
  const effets = $derived(
    `Membrane ${MEMBRANES[membrane].nom.toLowerCase()}${p.palier ? `. Sorts −${p.coutSorts} PP, +${p.degatsSorts} dégâts${p.ppMax ? `, PP max +${p.ppMax}` : ''}${p.dechirure ? ` ; Déchirure ${p.dechirure} par round` : ''}` : ''}.`,
  );
  const traque = $derived.by(() => {
    const id = remueur(r);
    return id ? (persos.etat.elements.find((x) => x.id === id)?.nom ?? null) : null;
  });

  // 8a : chez le MJ, un palier qui monte part au journal ; le palier 4 déchire la membrane. Le premier palier lu ne s'annonce pas.
  let vu: { scene: string; palier: number } | null = null;
  $effect(() => {
    if (role !== 'mj' || !scene || !suivi?.etat.pret) return;
    const ici = scene;
    const n = p.palier;
    if (!vu || vu.scene !== ici) {
      vu = { scene: ici, palier: n };
      return;
    }
    if (n <= vu.palier) {
      if (n < vu.palier) vu = { scene: ici, palier: n };
      return;
    }
    vu = { scene: ici, palier: n };
    // Un palier qui monte vient d'une jauge lue.
    const lu = r!;
    agir(async () => {
      await annoncerPalier(lu);
      if (n === 4 && lu.membrane !== 'dechiree') await reglerMembrane(ici, lu, 'dechiree');
    });
  });

  let montant = $state(1);
  let message = $state('');
  let occupe = $state(false);
  async function agir(f: () => Promise<unknown>) {
    message = '';
    occupe = true;
    try {
      await f();
    } catch (e) {
      message = messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
</script>

{#if scene}
  <section class="carte remous" aria-label="Remous du lieu" data-palier={p.palier}>
    <div class="tete">
      <h2>Remous</h2>
      <span class="palier">Palier {p.palier} — {p.nom}</span>
    </div>
    <p class="total">
      <strong>{r?.total ?? 0}</strong>
      {#if seuil !== null}<span class="aide">/ {seuil} pour le palier suivant</span>{:else}<span class="aide">la Plaie est ouverte</span>{/if}
    </p>
    <p class="aide" data-testid="effets-remous">{effets}</p>
    {#if role === 'mj'}
      {#if p.demon}<p class="demon">{p.demon}</p>{/if}
      {#if traque}<p class="aide">Le Remous traque {traque}.</p>{/if}
      <div class="ligne" role="group" aria-label="Corriger le Remous">
        <button class="petit discret" disabled={occupe} onclick={() => agir(() => corrigerRemous(scene, r, -Math.max(0, montant)))} aria-label="Retirer du Remous">−</button>
        <input type="number" min="0" max="999" bind:value={montant} aria-label="Montant" />
        <button class="petit discret" disabled={occupe} onclick={() => agir(() => corrigerRemous(scene, r, Math.max(0, montant)))} aria-label="Ajouter au Remous">+</button>
        <label>
          Membrane
          <select value={membrane} disabled={occupe} onchange={(e) => agir(() => reglerMembrane(scene, r, e.currentTarget.value as Membrane))}>
            {#each ORDRE_MEMBRANES as m (m)}<option value={m}>{MEMBRANES[m].nom}</option>{/each}
          </select>
        </label>
      </div>
      <div class="ligne">
        <button class="petit" disabled={occupe || !r?.total} onclick={() => agir(() => viderRemous(scene, r, 'repos'))}>Vider : repos long</button>
        <button class="petit" disabled={occupe || !r?.total} onclick={() => agir(() => viderRemous(scene, r, 'marche'))}>Vider : heure de marche</button>
      </div>
    {/if}
    {#if suivi?.etat.erreur}<p class="erreur" role="alert">Remous indisponible : {suivi.etat.erreur}</p>{/if}
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </section>
{/if}

<style>
  .remous {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tete {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tete h2 {
    margin: 0;
  }
  .palier {
    font-weight: 600;
    color: var(--couleur-accent);
  }
  [data-palier='2'] .palier,
  [data-palier='3'] .palier,
  [data-palier='4'] .palier {
    color: var(--couleur-danger);
  }
  .total {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .total strong {
    font-size: 1.4rem;
  }
  .demon {
    margin: 0;
    color: var(--couleur-danger);
  }
  .ligne {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .ligne input {
    width: 4.5rem;
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
    margin: 0;
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .erreur {
    margin: 0;
    color: var(--couleur-danger);
  }
</style>
