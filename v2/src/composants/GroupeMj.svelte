<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurPerso, modifierPV } from '../lib/actions/persos';
  import { donnerCran, RefusCran } from '../lib/actions/progression';
  import { donnerCranVecu, RefusVecu } from '../lib/actions/vecu';
  import { barreNiveau } from '../lib/regles/progression';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreSeances } from '../lib/magasins/seances.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { etatRefonte } from '../lib/fiche/refonte';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import { session } from '../lib/session.svelte';
  import FicheVivante from './FicheVivante.svelte';
  import Portrait from './Portrait.svelte';

  /*
   * Vue du MJ sur le groupe (lot L2.3, décision 2a du 16/10) : tous les
   * personnages de la table d'un coup d'œil (PV, CA, PP), PV modifiables
   * sur place, et la fiche complète de n'importe lequel en un clic. Le
   * personnage joué de chaque joueur est marqué.
   *
   * Crans de progression (L2.5) : le MJ en donne (ou en retire un, sans
   * jamais faire perdre un niveau), à un PJ ou à tous les PJ joués, avec un
   * motif facultatif. Chaque cran est une transaction (document du cran et
   * compte de la fiche ensemble).
   *
   * Mise en page (L2.6, maquette validée le 18/10) : une carte compacte par
   * personnage dans la colonne de droite du poste (PV, CA, PP, crans), et
   * la fiche complète dans un panneau latéral par-dessus la carte, au lieu
   * de s'empiler sous le tableau. Échap ou « Fermer » le referme ; Échap
   * est ignoré pendant une saisie, pour ne jamais perdre ce qu'on tape
   * (le champ n'est écrit qu'à sa sortie).
   *
   * Vécu (L4.18, décision 2a du 22/10/2026) : sous les crans de niveau, les
   * crans de Vécu du personnage (+1 ou −1, avec le même motif, et la séance
   * ouverte) ; tous les 3 crans, un palier et un point. Le Vécu avance par
   * joueur : pas de « +1 aux présents ».
   *
   * Séances (L3.1) : « +1 cran aux présents » donne un cran au personnage
   * joué de chaque présent coché par le MJ (cadrage : crans de niveau aux
   * présents seulement), et seulement pendant une séance ouverte. Chaque
   * cran, même donné à la main, porte alors la séance.
   */

  const persos = suivrePersos(session.table);
  const joueurs = suivreJoueurs(session.table);
  const table = suivreTable(session.table);
  const seances = suivreSeances(session.table);
  onDestroy(() => {
    persos.arreter();
    joueurs.arreter();
    table.arreter();
    seances.arreter();
  });
  const seanceOuverte = $derived(table.etat.donnees?.seanceOuverte ?? null);
  const presents = $derived(new Set(seances.etat.elements.find((s) => s.id === seanceOuverte?.id)?.presents ?? []));
  /** Personnages joués par les présents de la séance ouverte. */
  const desPresents = $derived(new Set(joueurs.etat.elements.filter((j) => presents.has(j.id)).map((j) => j.persoActif).filter(Boolean)));

  const nomJoueur = (uid: string) => joueurs.etat.elements.find((j) => j.id === uid)?.nom ?? '—';
  const joues = $derived(new Set(joueurs.etat.elements.map((j) => j.persoActif).filter(Boolean)));
  const lignes = $derived(
    [...persos.etat.elements]
      .sort((a, b) => Number(joues.has(b.id)) - Number(joues.has(a.id)) || nomJoueur(a.proprietaireUid).localeCompare(nomJoueur(b.proprietaireUid), 'fr') || a.nom.localeCompare(b.nom, 'fr'))
      .map((p) => ({ fiche: p, vue: vueFiche(p), barre: barreNiveau(p) })),
  );

  let ouvert = $state<string | null>(null);
  let boutonFermer = $state<HTMLButtonElement | null>(null);
  let declencheur: HTMLElement | null = null;
  function ouvrir(id: string, ev: Event) {
    declencheur = ev.currentTarget as HTMLElement;
    ouvert = id;
  }
  function fermer() {
    ouvert = null;
    declencheur?.focus();
  }
  $effect(() => {
    if (ouvert) boutonFermer?.focus();
  });
  function touche(ev: KeyboardEvent) {
    if (ev.key !== 'Escape' || !ouvert) return;
    const cible = ev.target as HTMLElement | null;
    if (cible && ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName)) return;
    fermer();
  }
  const ficheOuverte = $derived(persos.etat.elements.find((p) => p.id === ouvert) ?? null);
  let message = $state('');
  let info = $state('');

  let motif = $state('');
  /** Rend le refus ou l'erreur, ou null si le cran est écrit. */
  async function unCran(id: string, delta: 1 | -1): Promise<string | null> {
    try {
      await donnerCran(id, delta, motif, seanceOuverte?.id);
      return null;
    } catch (e) {
      return e instanceof RefusCran ? e.message : messageErreurPerso(e);
    }
  }
  async function cran(id: string, delta: 1 | -1) {
    info = '';
    message = (await unCran(id, delta)) ?? '';
  }
  async function cranVecu(id: string, delta: 1 | -1) {
    info = '';
    message = '';
    try {
      await donnerCranVecu(id, delta, motif, seanceOuverte?.id);
    } catch (e) {
      message = e instanceof RefusVecu ? e.message : messageErreurPerso(e);
    }
  }
  async function cranATous() {
    info = '';
    const cibles = lignes.filter((l) => desPresents.has(l.fiche.id)).map((l) => l.fiche);
    const echecs: string[] = [];
    for (const f of cibles) {
      const refus = await unCran(f.id, 1);
      if (refus) echecs.push(`${f.nom} : ${refus}`);
    }
    const reussis = cibles.length - echecs.length;
    info = `Un cran donné à ${reussis} PJ présent${reussis > 1 ? 's' : ''}.`;
    message = echecs.join(' ');
  }

  async function pv(id: string, valeur: number, max: number) {
    message = '';
    try {
      await modifierPV(id, valeur, max);
    } catch (e) {
      message = messageErreurPerso(e);
    }
  }
</script>

<svelte:window onkeydown={touche} />

<section class="carte groupe" aria-label="Groupe">
  <h2>Groupe</h2>
  <div class="ligne">
    <input aria-label="Motif du cran" placeholder="Motif du cran (facultatif)" maxlength="80" bind:value={motif} />
    <button class="petit" onclick={cranATous} disabled={!lignes.some((l) => desPresents.has(l.fiche.id))}>+1 cran aux présents</button>
  </div>
  {#if !seanceOuverte}<p class="aide">Ouvre une séance pour donner un cran aux présents.</p>{/if}
  {#if persos.etat.erreur}
    <p class="erreur" role="alert">{persos.etat.erreur}</p>
  {:else if !persos.etat.pret}
    <p>Chargement…</p>
  {:else if lignes.length === 0}
    <p>Aucun personnage à cette table pour l'instant.</p>
  {:else}
    <ul aria-label="Personnages de la table">
      {#snippet badgeRefonte(etat: ReturnType<typeof etatRefonte>)}
        <!-- L4.11b : où en est chaque personnage avec la refonte, vu du MJ. -->
        {#if etat === 'refonte'} <span class="badge refonte">refonte</span>
        {:else if etat === 'reconversion'} <span class="badge refonte">conversion rouverte</span>
        {:else if etat === 'aConvertir'} <span class="badge a-convertir">à convertir</span>{/if}
      {/snippet}
      {#each lignes as { fiche, vue, barre } (fiche.id)}
        {@const pourcent = Math.max(0, Math.min(100, Math.round((100 * vue.pv.actuel) / Math.max(1, vue.pv.max))))}
        <li class="pj" class:joue={joues.has(fiche.id)} class:ouvert={ouvert === fiche.id}>
          <button class="ouvrir" aria-label={`Ouvrir la fiche de ${fiche.nom}`} aria-expanded={ouvert === fiche.id} onclick={(ev) => ouvrir(fiche.id, ev)}>
            <Portrait idPerso={fiche.id} nom={fiche.nom} taille={36} />
            <span class="nom">
              <strong>{fiche.nom}</strong>
              <span class="aide">{nomJoueur(fiche.proprietaireUid)}{#if joues.has(fiche.id)} <span class="badge">joué</span>{/if}{#if desPresents.has(fiche.id)} <span class="badge present">présent</span>{/if}{@render badgeRefonte(etatRefonte(fiche))}</span>
            </span>
          </button>
          <div class="ligne-pv">
            <button class="mini" aria-label={`Retirer un PV à ${fiche.nom}`} onclick={() => pv(fiche.id, vue.pv.actuel - 1, vue.pv.max)}>−</button>
            <span class="barre" aria-hidden="true"><span style:width="{pourcent}%" class:bas={pourcent <= 25}></span></span>
            <button class="mini" aria-label={`Ajouter un PV à ${fiche.nom}`} onclick={() => pv(fiche.id, vue.pv.actuel + 1, vue.pv.max)}>+</button>
            <span class="valeur" data-testid={`pv-${fiche.id}`}>{vue.pv.actuel} / {vue.pv.max}</span>
          </div>
          <div class="ligne-infos">
            <span>CA {vue.stats.ca}</span>
            <span>PP {vue.pp ? `${vue.pp.actuel} / ${vue.pp.max}` : '—'}</span>
            <span class="crans">
              {#if barre.requis === null}
                <span class="aide">plafond</span>
              {:else}
                <button class="mini" aria-label={`Retirer un cran à ${fiche.nom}`} onclick={() => cran(fiche.id, -1)}>−</button>
                <span data-testid={`crans-${fiche.id}`} class:pleine={barre.pleine}>{barre.crans} / {barre.requis}</span>
                <button class="mini" aria-label={`Donner un cran à ${fiche.nom}`} onclick={() => cran(fiche.id, 1)}>+</button>
              {/if}
            </span>
          </div>
          <div class="ligne-infos">
            <span class="aide">Vécu : palier {fiche.vecu.paliers}, {fiche.vecu.points} pt</span>
            <span class="crans">
              <button class="mini" aria-label={`Retirer un cran de Vécu à ${fiche.nom}`} onclick={() => cranVecu(fiche.id, -1)}>−</button>
              <span data-testid={`vecu-${fiche.id}`}>{fiche.vecu.crans} / 3</span>
              <button class="mini" aria-label={`Donner un cran de Vécu à ${fiche.nom}`} onclick={() => cranVecu(fiche.id, 1)}>+</button>
            </span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  {#if info}<p class="aide" role="status">{info}</p>{/if}
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</section>

{#if ficheOuverte}
  <button class="voile" aria-label="Fermer la fiche" tabindex="-1" onclick={fermer}></button>
  <div class="tiroir" role="dialog" aria-label="Fiche complète">
    <button class="discret petit fermer" bind:this={boutonFermer} onclick={fermer}>Fermer</button>
    {#key ficheOuverte.id}
      <FicheVivante fiche={ficheOuverte} modifiable={true} mj={true} />
    {/key}
  </div>
{/if}

<style>
  .groupe {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
  }
  h2 {
    font-size: 20px;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ligne input {
    flex: 1 1 140px;
    min-height: 36px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pj {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .pj.joue {
    border-color: var(--couleur-bordure);
  }
  .pj.ouvert {
    border-color: var(--couleur-accent-clair);
    background: var(--couleur-accent-pale);
  }
  .ouvrir {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 0;
    padding: 0;
    background: none;
    color: var(--couleur-encre);
    font-weight: 400;
    text-align: left;
  }
  .ouvrir:hover strong {
    text-decoration: underline;
  }
  .nom {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .nom strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ligne-pv,
  .ligne-infos,
  .crans {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ligne-infos {
    font-size: 13px;
    gap: 12px;
  }
  .crans {
    margin-left: auto;
  }
  .barre {
    flex: 1;
    height: 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-danger-pale);
    overflow: hidden;
  }
  .barre span {
    display: block;
    height: 100%;
    background: var(--couleur-succes);
  }
  .barre span.bas {
    background: var(--couleur-danger);
  }
  .valeur {
    font-size: 13px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .mini {
    min-height: 26px;
    width: 26px;
    padding: 0;
    border-radius: 8px;
    background: var(--couleur-surface);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .petit {
    min-height: 36px;
    padding: 0 12px;
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
  .badge {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .erreur {
    color: var(--couleur-danger);
  }
  .badge.present {
    background: var(--couleur-succes);
  }
  .badge.refonte {
    background: var(--couleur-or);
  }
  .badge.a-convertir {
    background: var(--couleur-surface-claire);
    color: var(--couleur-or-texte);
    border: 1px solid var(--couleur-or);
  }
  .groupe > .aide {
    margin: 0;
  }
  .pleine {
    color: var(--couleur-succes);
    font-weight: 700;
  }
  /* Panneau latéral de la fiche (L2.6) : par-dessus la carte, il défile seul. */
  .voile {
    position: fixed;
    inset: 0;
    z-index: 20;
    min-height: 0;
    padding: 0;
    border-radius: 0;
    background: var(--couleur-voile);
    cursor: default;
  }
  .tiroir {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 21;
    width: min(760px, 94vw);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px 24px;
    background: var(--couleur-fond);
    border-left: 1px solid var(--couleur-bordure);
    box-shadow: -8px 0 24px var(--couleur-ombre);
  }
  .fermer {
    align-self: flex-end;
  }
</style>
