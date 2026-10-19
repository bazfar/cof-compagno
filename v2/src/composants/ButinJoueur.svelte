<script lang="ts">
  import { onDestroy } from 'svelte';
  import { RefusButin, relancer, voter } from '../lib/actions/butin';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { gesteJoueur, LIBELLES_CHOIX, texteDes, votesTries } from '../lib/butin/butin';
  import { suivreButins } from '../lib/magasins/butins.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { couleurRarete, effetsObjet } from '../lib/regles/equipement';
  import { CHOIX_BUTIN, type ChoixButin } from '../lib/schemas/butin';
  import { session } from '../lib/session.svelte';

  /*
   * Butin côté joueur (lot L3.4, décisions des 18 et 19/10/2026). Pour
   * chaque objet au vote : Besoin, Envie ou Passer ; le d100 est lancé au
   * premier choix (et noté au journal), puis gardé si l'on change d'avis.
   * À égalité, les joueurs concernés relancent. Le personnage joué au
   * moment du vote est celui qui recevra l'objet. Les derniers objets
   * attribués restent affichés. Rien quand il n'y a rien.
   */

  const butins = suivreButins(session.table);
  const joueurs = suivreJoueurs(session.table);
  const persos = suivrePersos(session.table);
  onDestroy(() => {
    butins.arreter();
    joueurs.arreter();
    persos.arreter();
  });

  const actif = $derived.by(() => {
    const id = joueurs.etat.elements.find((j) => j.id === session.uid)?.persoActif;
    const p = id ? persos.etat.elements.find((x) => x.id === id && x.proprietaireUid === session.uid) : undefined;
    return p ? { id: p.id, nom: p.nom } : null;
  });
  const ouverts = $derived(butins.etat.elements.filter((b) => b.statut === 'vote' || b.statut === 'relance').sort((a, b) => a.creeLe - b.creeLe));
  const derniers = $derived(
    butins.etat.elements
      .filter((b) => b.statut === 'attribue')
      .sort((a, b) => (b.resoluLe ?? 0) - (a.resoluLe ?? 0))
      .slice(0, 3),
  );

  let enCours = $state<string | null>(null);
  let message = $state('');

  async function choisir(id: string, choix: ChoixButin) {
    if (!actif) return;
    enCours = id;
    message = '';
    try {
      const r = await voter(id, choix, actif);
      message = r.lance ? `${LIBELLES_CHOIX[choix]} : ton d100 donne ${r.d100}.` : `Choix changé : ${LIBELLES_CHOIX[choix]} (ton d100 reste ${r.d100}).`;
    } catch (e) {
      message = e instanceof RefusButin ? e.message : messageErreurPerso(e);
    } finally {
      enCours = null;
    }
  }

  async function relance(id: string) {
    enCours = id;
    message = '';
    try {
      message = `Relance : ton d100 donne ${await relancer(id)}.`;
    } catch (e) {
      message = e instanceof RefusButin ? e.message : messageErreurPerso(e);
    } finally {
      enCours = null;
    }
  }
</script>

{#if butins.etat.erreur}
  <p class="erreur" role="alert">Butin indisponible : {butins.etat.erreur}</p>
{:else if ouverts.length || derniers.length}
  <section class="carte butin" aria-label="Butin">
    <h2>Butin</h2>
    {#if ouverts.length && !actif}<p class="aide">Choisis un personnage joué pour voter : c'est lui qui recevra l'objet.</p>{/if}
    {#each ouverts as b (b.id)}
      {@const mien = b.votes[session.uid]}
      {@const geste = gesteJoueur(b, session.uid)}
      <article aria-label={`Butin : ${b.objet.nom}`}>
        <div class="ligne">
          <strong style:color={couleurRarete(b.objet)}>{b.objet.nom}</strong>
          {#if typeof b.objet.quantite === 'number' && b.objet.quantite > 1}<span class="badge">×{b.objet.quantite}</span>{/if}
          {#each effetsObjet(b.objet) as e (e)}<span class="effet">{e}</span>{/each}
        </div>
        {#if geste === 'voter'}
          <div class="ligne" role="group" aria-label={`Ton choix pour ${b.objet.nom}`}>
            {#each CHOIX_BUTIN as c (c)}
              <button class="petit" class:discret={mien?.choix !== c} aria-pressed={mien?.choix === c} disabled={!actif || enCours === b.id} onclick={() => choisir(b.id, c)}>
                {c === 'passe' ? 'Passer' : LIBELLES_CHOIX[c]}
              </button>
            {/each}
            {#if mien}<span class="aide">ton d100 : {mien.d100}</span>{/if}
          </div>
        {:else if geste === 'relancer'}
          <p class="ligne">
            <span>Égalité ! Relance ton d100.</span>
            <button class="petit" disabled={enCours === b.id} onclick={() => relance(b.id)}>Relancer mon d100</button>
          </p>
        {:else if b.statut === 'relance'}
          <p class="aide">Égalité entre {b.enLice.map((uid) => b.votes[uid]?.nom ?? '?').join(' et ')} : {geste === 'attendre' ? 'on attend les autres relances.' : 'ils relancent.'}</p>
        {/if}
        {#if Object.keys(b.votes).length}
          <ul class="votes" aria-label={`Votes pour ${b.objet.nom}`}>
            {#each votesTries(b.votes) as [uid, v] (uid)}
              <li class:moi={uid === session.uid}><span>{v.nom}</span><span class="choix {v.choix}">{LIBELLES_CHOIX[v.choix]}</span><span class="des">{v.choix === 'passe' ? '' : texteDes(v)}</span></li>
            {/each}
          </ul>
        {/if}
      </article>
    {/each}
    {#if derniers.length}
      <ul class="derniers" aria-label="Derniers objets attribués">
        {#each derniers as b (b.id)}
          <li><strong style:color={couleurRarete(b.objet)}>{b.objet.nom}</strong> → {b.gagnant?.nom}{b.gagnant?.mode === 'direct' ? ' (par le MJ)' : ''}</li>
        {/each}
      </ul>
    {/if}
    {#if message}<p class="message" role="status">{message}</p>{/if}
  </section>
{/if}

<style>
  h2 {
    font-size: 17px;
  }
  .butin {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  article {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  p {
    margin: 0;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }
  .badge,
  .effet {
    font-size: 12px;
    padding: 1px 6px;
    border-radius: var(--rayon-pastille);
    border: 1px solid var(--couleur-bordure-douce);
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
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 14px;
  }
  .votes li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 7em;
    gap: 8px;
  }
  .votes li.moi {
    font-weight: 600;
  }
  .des {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .choix.besoin {
    color: var(--couleur-danger);
  }
  .choix.passe {
    color: var(--couleur-encre-douce);
  }
  .derniers {
    color: var(--couleur-encre-douce);
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .message {
    font-size: 14px;
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
