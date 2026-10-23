<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ajusterPvMonstre, RefusCombat } from '../lib/actions/combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { ordreCombat } from '../lib/combat/ordre';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreBestiaire } from '../lib/magasins/bestiaire.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreCombat, suivreCombattants } from '../lib/magasins/combat.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import { session } from '../lib/session.svelte';

  /*
   * Section Combat du MJ, colonne de droite (lot L6.1, maquette 2.0) : le
   * combattant qui joue, ou celui que le MJ choisit.
   *   - Un monstre : ses PV en chiffres, réglés à la main (à 0, il est à
   *     terre et son jeton marqué mort) ; sa DEF, son initiative et ses
   *     attaques, lues dans le bestiaire (le MJ seul les voit) ; attaques et
   *     états arrivent avec L6.2 et L6.3.
   *   - Un PJ : PV, PP et CA de sa fiche.
   * Dessous, les PJ du combat en un coup d'œil.
   */

  const table = suivreTable(session.table);
  const persos = suivrePersos(session.table);
  const bestiaire = suivreBestiaire(session.table);
  onDestroy(() => {
    table.arreter();
    persos.arreter();
    bestiaire.arreter();
  });
  const idCombat = $derived(table.etat.donnees?.combat ?? null);
  let suivi = $state<{ c: DocumentSuivi<Combat>; m: CollectionSuivie<Combattant> } | null>(null);
  $effect(() => {
    if (!idCombat) return;
    const x = { c: suivreCombat(session.table, idCombat), m: suivreCombattants(session.table, idCombat) };
    suivi = x;
    return () => {
      x.c.arreter();
      x.m.arreter();
      suivi = null;
    };
  });
  const combat = $derived(suivi?.c.etat.donnees ?? null);
  const combattants = $derived(ordreCombat(suivi?.m.etat.elements ?? []));
  let choisi = $state('');
  const montre = $derived(combattants.find((c) => c.id === choisi) ?? combattants.find((c) => c.id === combat?.actif) ?? combattants[0] ?? null);
  const modele = $derived(montre?.monstre ? (bestiaire.etat.elements.find((m) => m.id === montre.monstre) ?? null) : null);
  const fiche = $derived(montre?.perso ? (persos.etat.elements.find((p) => p.id === montre.perso) ?? null) : null);
  const vue = $derived(fiche ? vueFiche(fiche) : null);
  const pjs = $derived(
    combattants
      .filter((c) => c.perso)
      .map((c) => ({ c, f: persos.etat.elements.find((p) => p.id === c.perso) }))
      .filter((x) => !!x.f)
      .map(({ c, f }) => ({ c, v: vueFiche(f!) })),
  );
  const signe = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

  let montant = $state(1);
  let message = $state('');
  let occupe = $state(false);
  async function pv(sens: 1 | -1) {
    if (!montre || !combat || !idCombat) return;
    message = '';
    occupe = true;
    try {
      await ajusterPvMonstre(idCombat, combat.scene, montre, sens * Math.max(0, montant));
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
</script>

{#if combat && combat.statut === 'encours' && montre}
  <div class="colonne">
    <section class="carte panneau" class:monstre={montre.genre === 'monstre'} aria-label="Combattant choisi">
      <label class="choix"
        >Combattant
        <select value={montre.id} onchange={(e) => (choisi = e.currentTarget.value)}>
          {#each combattants as c (c.id)}<option value={c.id}>{c.nom}{c.id === combat.actif ? ' (joue)' : ''}</option>{/each}
        </select>
      </label>
      <h2>{montre.nom}</h2>
      {#if montre.genre === 'monstre' && montre.pv !== null && montre.pvMax !== null}
        <div class="jauge">
          <div class="fond"><div class="plein" style:width="{(Math.max(0, montre.pv) / montre.pvMax) * 100}%"></div></div>
          <strong data-testid="pv-monstre">{montre.pv}/{montre.pvMax} PV</strong>
        </div>
        <div class="reglage">
          <button aria-label="Retirer des PV" disabled={occupe} onclick={() => pv(-1)}>−</button>
          <input type="number" min="0" max="999" aria-label="PV à ajouter ou retirer" bind:value={montant} />
          <button aria-label="Rendre des PV" disabled={occupe} onclick={() => pv(1)}>+</button>
          {#if montre.aTerre}<span class="aide">à terre</span>{/if}
        </div>
        {#if modele}
          <div class="pastilles">
            <span>DEF {modele.def}</span>
            <span>Init {signe(modele.init)}</span>
          </div>
          <h3>Attaques · L6.2</h3>
          <div class="attaques">
            {#each modele.attaques as a, i (i)}<button disabled>{a.nom} {signe(a.bonusAttaque)}</button>{/each}
          </div>
        {:else}
          <p class="aide">Monstre posé à la main : pas de fiche de bestiaire.</p>
        {/if}
        <h3>États · L6.3</h3>
        <p class="aide">Poser un état arrive avec L6.3.</p>
      {:else if vue}
        <div class="pastilles">
          <span>PV {vue.pv.actuel}/{vue.pv.max}</span>
          {#if vue.pp}<span>PP {vue.pp.actuel}/{vue.pp.max}</span>{/if}
          <span>CA {vue.stats.ca}</span>
          <span>Init {signe(vue.stats.initiative)}</span>
        </div>
      {/if}
      {#if message}<p class="erreur" role="alert">{message}</p>{/if}
    </section>

    <section class="carte pjs" aria-label="Les PJ du combat">
      <h2>Les PJ</h2>
      <ul>
        {#each pjs as { c, v } (c.id)}
          <li><span>{c.nom}</span><span>{v.pv.actuel}/{v.pv.max} PV{v.pp ? ` · ${v.pp.actuel}/${v.pp.max} PP` : ''}{c.initiative === null ? ' · initiative à lancer' : ''}</span></li>
        {/each}
      </ul>
    </section>
  </div>
{/if}

<style>
  .colonne {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .panneau,
  .pjs {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .panneau.monstre {
    border: 2px solid var(--couleur-danger);
  }
  h2 {
    font-size: 20px;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--couleur-encre-douce);
  }
  p {
    margin: 0;
  }
  .choix {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .jauge {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .fond {
    flex: 1;
    height: 12px;
    border-radius: 999px;
    background: var(--couleur-danger-pale);
    overflow: hidden;
  }
  .plein {
    height: 100%;
    background: var(--couleur-danger);
  }
  .reglage {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .reglage button {
    min-width: 44px;
  }
  .reglage input {
    width: 64px;
    text-align: center;
  }
  .pastilles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .pastilles span {
    padding: 3px 9px;
    border-radius: 8px;
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .attaques {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
</style>
