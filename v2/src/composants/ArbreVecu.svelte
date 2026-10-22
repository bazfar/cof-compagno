<script lang="ts">
  import { messageErreurPerso } from '../lib/actions/persos';
  import { accorderVecuV1, poserNoeudOffert, prendreNoeudVecu, RefusVecu, retirerNoeudVecu } from '../lib/actions/vecu';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import { classeRefonteDe } from '../lib/fiche/refonte';
  import { barreVecu, dispositionVecu, NOMS_BRANCHES, NOMS_EFFETS, noeudOffertDe, nomNoeud, type NoeudAffiche } from '../lib/fiche/vecu';
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
   *
   * Dessin en arbre (lot L4.18b, décisions 1a à 4a du 22/10/2026) : une
   * colonne par branche, trois étages (tier 1 à 3) qui montrent leur seuil
   * et s'allument quand il est atteint ; les croisements sous l'arbre,
   * entre leurs deux branches, avec leurs deux prérequis écrits dessous ;
   * dans une branche, un trait SVG courbe par prérequis, plein quand les
   * deux nœuds sont pris (les croisements n'ont pas de trait : il
   * traverserait tout l'arbre). Les nœuds sont des pastilles (pris, offert,
   * prenable, verrouillé) ; un clic ouvre le détail à côté (dessous quand
   * la fiche est étroite) : effets, prérequis, « Prendre » ou la raison
   * d'un refus, « Retirer » pour le MJ. Pas de bibliothèque : du SVG, aux
   * couleurs du thème.
   */

  let { fiche, modifiable, mj = false }: { fiche: AvecId<Fiche>; modifiable: boolean; mj?: boolean } = $props();

  const barre = $derived(barreVecu(fiche.vecu));
  const disposition = $derived(dispositionVecu(fiche.vecu));
  const classe = $derived(fiche.schemaVersion === 2 ? fiche.refonte.classe : (classeRefonteDe(fiche.classe)?.id ?? null));
  const aAccorder = $derived(fiche.schemaVersion === 2 ? (fiche.octrois.vecuV1 ?? []) : []);
  /** Le propriétaire choisit ses nœuds ; le MJ retire et accorde. */
  const joueur = $derived(modifiable && !mj);
  let message = $state('');
  let ouvert = $state<string | null>(null);
  const tous = $derived([...disposition.branches.flatMap((b) => b.etages.flatMap((e) => e.noeuds)), ...disposition.croisements]);
  const choisi = $derived(tous.find((n) => n.noeud.id === ouvert) ?? null);
  const etat = (n: NoeudAffiche) => (n.offert ? 'offert' : n.possede ? 'pris' : n.refus === null ? 'prenable' : 'verrouille');
  const NOMS_ETATS = { offert: 'offert', pris: 'pris', prenable: 'à prendre', verrouille: 'verrouillé' } as const;

  // ---- Traits des prérequis : mesurés sur les pastilles une fois posées ----
  let zone = $state<HTMLDivElement | null>(null);
  let traits = $state<{ d: string; acquis: boolean; cle: string }[]>([]);
  const croisement = (id: string) => disposition.croisements.some((c) => c.noeud.id === id);
  function tracer() {
    if (!zone) return;
    const base = zone.getBoundingClientRect();
    const pos = (id: string) => zone!.querySelector<HTMLElement>(`[data-noeud="${id}"]`)?.getBoundingClientRect() ?? null;
    traits = disposition.liens.flatMap((l) => {
      if (croisement(l.vers)) return [];
      const a = pos(l.de);
      const b = pos(l.vers);
      if (!a || !b || (!a.width && !b.width)) return [];
      const [x1, y1, x2, y2] = [a.left + a.width / 2 - base.left, a.bottom - base.top, b.left + b.width / 2 - base.left, b.top - base.top];
      const dy = Math.max(12, (y2 - y1) / 2);
      return [{ d: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`, acquis: l.acquis, cle: `${l.de}>${l.vers}` }];
    });
  }
  $effect(() => {
    void disposition;
    const z = zone;
    if (!z) return;
    const id = requestAnimationFrame(tracer);
    if (typeof ResizeObserver === 'undefined') return () => cancelAnimationFrame(id);
    const ro = new ResizeObserver(() => tracer());
    ro.observe(z);
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  });

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

  {#snippet pastille(n: NoeudAffiche)}
    <button
      class="pastille {etat(n)}"
      class:choisi={ouvert === n.noeud.id}
      data-noeud={n.noeud.id}
      aria-pressed={ouvert === n.noeud.id}
      title={NOMS_ETATS[etat(n)]}
      onclick={() => (ouvert = ouvert === n.noeud.id ? null : n.noeud.id)}>{n.noeud.nom}{#if n.offert}<span class="marque" aria-hidden="true"> ★</span>{/if}</button
    >
  {/snippet}

  <div class="corps">
    <div class="arbre" bind:this={zone}>
      <svg class="traits" aria-hidden="true">
        {#each traits as t (t.cle)}
          <path d={t.d} class:acquis={t.acquis} />
        {/each}
      </svg>
      <div class="colonnes">
        {#each disposition.branches as b (b.branche)}
          <div class="colonne" aria-label={`Branche ${b.nom}`}>
            <h4>{b.nom} <span class="aide">({b.points} pt)</span></h4>
            {#each b.etages as e (e.tier)}
              <div class="etage" class:atteint={e.atteint}>
                <span class="seuil">Tier {e.tier}{e.seuil ? ` · ${e.seuil} points` : ''}</span>
                <div class="pastilles">
                  {#each e.noeuds as n (n.noeud.id)}{@render pastille(n)}{/each}
                </div>
              </div>
            {/each}
          </div>
        {/each}
      </div>
      <div class="croisements" aria-label={`Branche ${NOMS_BRANCHES.croisement}`}>
        <span class="seuil">Croisements</span>
        {#each disposition.croisements as n (n.noeud.id)}
          <div class="croisement" style:grid-column={`${n.entre[0] + 1} / ${n.entre[1] + 2}`}>
            {@render pastille(n)}
            <span class="requis">{n.noeud.prerequis.map(nomNoeud).join(' + ')}</span>
          </div>
        {/each}
      </div>
    </div>

    <aside class="detail" aria-label="Détail du nœud">
      {#if choisi}
        {@const n = choisi}
        <h4>{n.noeud.nom}</h4>
        <p class="aide">{NOMS_BRANCHES[n.noeud.branche]}{n.noeud.branche !== 'croisement' ? ` · tier ${n.noeud.tier}` : ''} · {NOMS_ETATS[etat(n)]}</p>
        <ul class="effets">
          {#each n.noeud.effets as e, i (i)}
            <li><span class="type">{NOMS_EFFETS[e.effet]}</span> — {e.cible} : {e.valeur}{e.condition ? ` (${e.condition})` : ''} ; {e.usage}.</li>
          {/each}
        </ul>
        {#if n.noeud.prerequis.length}<p class="aide">Prérequis : {n.noeud.prerequis.map(nomNoeud).join(', ')}.</p>{/if}
        {#if n.noeud.note}<p class="aide">{n.noeud.note}</p>{/if}
        {#if joueur && !n.possede}
          {#if n.refus === null}
            <button class="petit" onclick={() => ecrire(prendreNoeudVecu(fiche.id, n.noeud.id))}>Prendre {n.noeud.nom}</button>
          {:else}
            <p class="aide refus">{n.refus}</p>
          {/if}
        {/if}
        {#if mj && n.possede && !n.offert}
          <button class="discret petit" onclick={() => ecrire(retirerNoeudVecu(fiche.id, n.noeud.id))}>Retirer {n.noeud.nom}</button>
        {/if}
      {:else}
        <p class="aide">Choisis un nœud pour voir ce qu'il fait.</p>
      {/if}
    </aside>
  </div>
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</section>

<style>
  .vecu {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .barre-vecu {
    display: flex;
    gap: 14px;
    align-items: baseline;
    margin: 0;
  }
  h4 {
    margin: 0 0 4px;
  }
  .corps {
    display: grid;
    gap: 12px;
  }
  @container (min-width: 760px) {
    .corps {
      grid-template-columns: 1fr 260px;
      align-items: start;
    }
    .detail {
      position: sticky;
      top: 8px;
    }
  }
  .arbre {
    position: relative;
  }
  .traits {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .traits path {
    fill: none;
    stroke: var(--couleur-bordure);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  .traits path.acquis {
    stroke: var(--couleur-accent-clair);
    stroke-width: 2;
    stroke-dasharray: none;
  }
  .colonnes,
  .croisements {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .colonne {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .etage {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    border-radius: var(--rayon);
    border: 1px dashed var(--couleur-bordure-douce);
    opacity: 0.75;
  }
  .etage.atteint {
    border-style: solid;
    border-color: var(--couleur-accent-pale);
    background: color-mix(in srgb, var(--couleur-accent-pale) 35%, transparent);
    opacity: 1;
  }
  .seuil {
    font-size: 12px;
    color: var(--couleur-encre-douce);
  }
  .pastilles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
  }
  .croisements {
    margin-top: 16px;
    row-gap: 8px;
  }
  .croisements > .seuil {
    grid-column: 1 / -1;
  }
  .croisement {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .requis {
    font-size: 11px;
    color: var(--couleur-encre-douce);
  }
  .pastille {
    position: relative;
    z-index: 1;
    min-height: 0;
    padding: 4px 10px;
    border-radius: var(--rayon-pastille);
    font-size: 13px;
    line-height: 1.25;
    border: 1.5px solid var(--couleur-bordure);
    background: var(--couleur-surface-claire);
    color: var(--couleur-encre-douce);
  }
  .pastille.prenable {
    border-color: var(--couleur-accent-clair);
    color: var(--couleur-accent);
    font-weight: 600;
  }
  .pastille.pris,
  .pastille.offert {
    background: var(--couleur-accent);
    border-color: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .pastille.verrouille {
    border-style: dashed;
  }
  .pastille.choisi {
    outline: 3px solid var(--couleur-or);
    outline-offset: 1px;
  }
  .marque {
    color: var(--couleur-or);
  }
  .detail {
    padding: 10px 12px;
    border: 1px solid var(--couleur-bordure-douce);
    border-radius: var(--rayon-carte);
    background: var(--couleur-surface-claire);
  }
  .effets {
    margin: 4px 0;
    padding-left: 18px;
  }
  .type {
    font-style: italic;
  }
  .refus {
    margin: 4px 0 0;
  }
  .v1 ul {
    margin: 0;
    padding-left: 18px;
  }
</style>
