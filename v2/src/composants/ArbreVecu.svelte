<script lang="ts">
  import { messageErreurPerso } from '../lib/actions/persos';
  import { accorderVecuV1, poserNoeudOffert, prendreNoeudVecu, RefusVecu, retirerNoeudVecu } from '../lib/actions/vecu';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import { classeRefonteDe } from '../lib/fiche/refonte';
  import { arbreVecu, barreVecu, NOMS_EFFETS, noeudOffertDe, nomNoeud } from '../lib/fiche/vecu';
  import type { Fiche } from '../lib/schemas/fiche';

  /*
   * L'arbre du Vécu sur la fiche (lot L4.18, décisions 1a à 8a du
   * 22/10/2026), dans l'onglet Capacités, partie hors combat. Toutes les
   * fiches l'ont, v1 comprises : le Vécu ne dépend pas de la refonte.
   *   - la barre : crans du palier en cours, paliers, points à dépenser ;
   *   - trois branches et les croisements : nœuds pris, ceux qu'on peut
   *     prendre, et la raison d'un refus ;
   *   - le propriétaire prend un nœud (un point) ; il reçoit à l'ouverture
   *     le nœud offert par sa classe s'il ne l'a pas encore (4a) ;
   *   - le MJ retire un nœud choisi (3a) et accorde les nœuds de la v1
   *     notés à la conversion (5a).
   * Aucune règle ici : lib/fiche/vecu.ts ; écritures en transaction,
   * lib/actions/vecu.ts.
   */

  let { fiche, modifiable, mj = false }: { fiche: AvecId<Fiche>; modifiable: boolean; mj?: boolean } = $props();

  const barre = $derived(barreVecu(fiche.vecu));
  const arbre = $derived(arbreVecu(fiche.vecu));
  const classe = $derived(fiche.schemaVersion === 2 ? fiche.refonte.classe : (classeRefonteDe(fiche.classe)?.id ?? null));
  const aAccorder = $derived(fiche.schemaVersion === 2 ? (fiche.octrois.vecuV1 ?? []) : []);
  /** Le propriétaire choisit ses nœuds ; le MJ retire et accorde. */
  const joueur = $derived(modifiable && !mj);
  let message = $state('');
  let ouvert = $state<string | null>(null);

  async function ecrire(p: Promise<unknown>) {
    message = '';
    try {
      await p;
    } catch (e) {
      message = e instanceof RefusVecu ? e.message : messageErreurPerso(e);
    }
  }

  // Nœud offert (4a) : une fiche qui ne l'a pas encore le reçoit quand son joueur l'ouvre.
  let offertDemande = false;
  $effect(() => {
    const offert = noeudOffertDe(classe);
    if (joueur && !offertDemande && fiche.vecu.noeudOffert === null && offert) {
      offertDemande = true;
      ecrire(poserNoeudOffert(fiche.id, offert));
    }
  });
</script>

<section class="vecu" aria-label="Arbre du Vécu">
  <h3>Vécu</h3>
  <p class="barre-vecu">
    <span data-testid="vecu-crans">{barre.crans} / {barre.requis} crans</span>
    <span>palier {barre.paliers}</span>
    <strong data-testid="vecu-points">{barre.points} point{barre.points > 1 ? 's' : ''} à dépenser</strong>
  </p>
  {#if mj && aAccorder.length}
    <div class="v1" aria-label="Vécu de la v1 à accorder">
      <p class="aide">Capacités hors combat de la v1 : chacune vaut un palier et son nœud.</p>
      <ul>
        {#each aAccorder as id (id)}
          <li>{nomNoeud(id)} <button class="petit" onclick={() => ecrire(accorderVecuV1(fiche.id, id))}>Accorder {nomNoeud(id)}</button></li>
        {/each}
      </ul>
    </div>
  {:else if aAccorder.length}
    <p class="aide">Le MJ doit encore t'accorder le Vécu de ta fiche v1 : {aAccorder.map(nomNoeud).join(', ')}.</p>
  {/if}
  {#each arbre as b (b.branche)}
    <h4>{b.nom} <span class="aide">({b.points} point{b.points > 1 ? 's' : ''})</span></h4>
    <ul class="noeuds">
      {#each b.noeuds as n (n.noeud.id)}
        <li class:pris={n.possede} class:prenable={!n.possede && n.refus === null}>
          <button class="titre" aria-expanded={ouvert === n.noeud.id} onclick={() => (ouvert = ouvert === n.noeud.id ? null : n.noeud.id)}>
            <strong>{n.noeud.nom}</strong>
            {#if b.branche !== 'croisement'}<span class="badge">tier {n.noeud.tier}</span>{/if}
            {#if n.offert}<span class="badge">offert</span>{:else if n.possede}<span class="badge">pris</span>{/if}
          </button>
          {#if ouvert === n.noeud.id || n.possede}
            <ul class="effets">
              {#each n.noeud.effets as e, i (i)}
                <li>
                  <span class="type">{NOMS_EFFETS[e.effet]}</span> — {e.cible} : {e.valeur}{e.condition ? ` (${e.condition})` : ''} ; {e.usage}.
                </li>
              {/each}
            </ul>
            {#if n.noeud.prerequis.length}<p class="aide">Prérequis : {n.noeud.prerequis.map(nomNoeud).join(', ')}.</p>{/if}
            {#if n.noeud.note && ouvert === n.noeud.id}<p class="aide">{n.noeud.note}</p>{/if}
          {/if}
          {#if joueur && !n.possede}
            {#if n.refus === null}
              <button class="petit" onclick={() => ecrire(prendreNoeudVecu(fiche.id, n.noeud.id))}>Prendre {n.noeud.nom}</button>
            {:else if ouvert === n.noeud.id}
              <p class="aide refus">{n.refus}</p>
            {/if}
          {/if}
          {#if mj && n.possede && !n.offert}
            <button class="discret petit" onclick={() => ecrire(retirerNoeudVecu(fiche.id, n.noeud.id))}>Retirer {n.noeud.nom}</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/each}
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</section>

<style>
  .vecu {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .barre-vecu {
    display: flex;
    gap: 14px;
    align-items: baseline;
    margin: 0;
  }
  h4 {
    margin: 8px 0 2px;
  }
  .noeuds {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .noeuds > li {
    padding: 4px 8px;
    border-left: 3px solid transparent;
    border-radius: var(--rayon);
    opacity: 0.7;
  }
  .noeuds > li.prenable {
    opacity: 1;
    border-left-color: var(--couleur-accent-clair);
  }
  .noeuds > li.pris {
    opacity: 1;
    border-left-color: var(--couleur-accent);
    background: var(--couleur-surface-claire);
  }
  .titre {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    gap: 6px;
    align-items: baseline;
  }
  .effets {
    margin: 2px 0;
    padding-left: 18px;
  }
  .type {
    font-style: italic;
  }
  .refus {
    margin: 0;
  }
  .v1 ul {
    margin: 0;
    padding-left: 18px;
  }
</style>
