<script lang="ts">
  import { onDestroy } from 'svelte';
  import { texteBonus } from '../lib/combat/bonus';
  import { regleEtat, texteEtat } from '../lib/combat/etats';
  import { aTerreDuCombat, ordreCombat } from '../lib/combat/ordre';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreCombat, suivreCombattants } from '../lib/magasins/combat.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivrePortraitsJetons } from '../lib/magasins/portraits-jetons.svelte';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import { session } from '../lib/session.svelte';

  /*
   * Le bandeau des combattants (lot L6.3, décision C(a) de Thomas du
   * 23/10/2026, à la manière de Baldur's Gate 3) : au-dessus de la carte,
   * dans l'ordre d'initiative, un portrait par combattant (le portrait du
   * PJ, l'initiale du monstre), ses PV et ses états en pastilles (le nom,
   * les rounds qui restent ; la règle au survol). Le combattant qui joue
   * est encadré d'or ; un combattant à terre ou mort est grisé. Les jetons
   * de la carte gardent leur taille, sans marque.
   *
   * Lot L6.4a (11a, 12a) : ses PV temporaires (« +5 ») et ses bonus du
   * combat, en pastilles à part.
   */

  const table = suivreTable(session.table);
  const persos = suivrePersos(session.table);
  const portraits = suivrePortraitsJetons(session.table);
  onDestroy(() => {
    table.arreter();
    persos.arreter();
    portraits.arreter();
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
  $effect(() => portraits.suivre(combattants.flatMap((c) => (c.perso ? [c.perso] : []))));
  const fiches = $derived(new Map(persos.etat.elements.map((p) => [p.id, vueFiche(p).pv])));
  const aTerre = $derived(aTerreDuCombat(combattants));
  const pvDe = (c: Combattant) => (c.genre !== 'pj' ? (c.pv !== null && c.pvMax !== null ? { actuel: c.pv, max: c.pvMax } : null) : c.perso ? (fiches.get(c.perso) ?? null) : null);
</script>

{#if combat && combat.statut === 'encours' && combattants.length}
  <ol class="bandeau" aria-label="Combattants">
    {#each combattants as c (c.id)}
      {@const pv = pvDe(c)}
      {@const image = c.perso ? portraits.images[c.perso]?.src : undefined}
      <li class:joue={c.id === combat.actif} class:monstre={c.genre === 'monstre'} class:terre={aTerre.has(c.id) || (pv !== null && pv.actuel <= 0)} aria-current={c.id === combat.actif ? 'true' : undefined}>
        <div class="portrait">
          {#if image}<img src={image} alt="" />{:else}<span class="initiale">{c.nom.slice(0, 1)}</span>{/if}
        </div>
        <span class="nom">{c.nom}</span>
        {#if pv}
          <div class="pv" title="{pv.actuel}/{pv.max} PV">
            <div class="plein" style:width="{Math.max(0, Math.min(1, pv.actuel / pv.max)) * 100}%"></div>
          </div>
          <span class="chiffres">{pv.actuel}/{pv.max}{c.pvTemp ? ` +${c.pvTemp}` : ''}</span>
        {/if}
        {#if c.etats.length}
          <ul class="etats" aria-label="États de {c.nom}">
            {#each c.etats as e (e.id)}<li title={regleEtat(e.id)}>{texteEtat(e)}</li>{/each}
          </ul>
        {/if}
        {#if c.bonus.length}
          <ul class="etats bonus" aria-label="Bonus de {c.nom}">
            {#each c.bonus as b, i (i)}<li title={b.source ?? ''}>{texteBonus(b)}</li>{/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ol>
{/if}

<style>
  .bandeau {
    list-style: none;
    margin: 0;
    padding: 6px 2px;
    display: flex;
    gap: 8px;
    overflow-x: auto;
  }
  .bandeau > li {
    flex: 0 0 96px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 6px 4px;
    border-radius: 10px;
    border: 2px solid var(--couleur-bordure-douce);
    background: var(--couleur-surface);
  }
  .bandeau > li.monstre {
    border-color: var(--couleur-danger-pale);
  }
  .bandeau > li.joue {
    border-color: var(--couleur-or);
    box-shadow: 0 0 0 2px var(--couleur-or);
  }
  .bandeau > li.terre {
    opacity: 0.45;
  }
  .portrait {
    width: 56px;
    height: 56px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--couleur-accent);
    display: grid;
    place-items: center;
  }
  .monstre .portrait {
    background: var(--couleur-danger);
  }
  .portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .initiale {
    color: var(--couleur-sur-accent);
    font-weight: 700;
    font-size: 24px;
  }
  .nom {
    font-size: 12px;
    font-weight: 600;
    max-width: 88px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pv {
    width: 84px;
    height: 6px;
    border-radius: 999px;
    background: var(--couleur-danger-pale);
    overflow: hidden;
  }
  .pv .plein {
    height: 100%;
    background: var(--couleur-succes);
  }
  .monstre .pv .plein {
    background: var(--couleur-danger);
  }
  .chiffres {
    font-size: 11px;
    font-weight: 700;
  }
  .etats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2px;
  }
  .bonus li {
    background: var(--couleur-accent);
  }
  .etats li {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 6px;
    background: var(--couleur-encre-douce);
    color: var(--couleur-surface);
  }
</style>
