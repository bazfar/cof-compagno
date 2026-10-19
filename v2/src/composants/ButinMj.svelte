<script lang="ts">
  import { onDestroy } from 'svelte';
  import { attribuerDirectement, avancerButin, mettreAuVote, RefusButin, retirerButin } from '../lib/actions/butin';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { issueDuVote, LIBELLES_CHOIX, texteDes, votesTries } from '../lib/butin/butin';
  import { destinataires } from '../lib/dons/dons';
  import { suivreButins } from '../lib/magasins/butins.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { catalogueTrie, couleurRarete, effetsObjet, RefusEquipement } from '../lib/regles/equipement';
  import type { Butin } from '../lib/schemas/butin';
  import { session } from '../lib/session.svelte';

  /*
   * Butin côté MJ (lot L3.4, décisions des 18 et 19/10/2026).
   * - « Mettre au vote » un objet du catalogue (un consommable forme une
   *   seule pile ; les autres objets sont votés un par un).
   * - « Clore le vote » : Besoin avant Envie, puis le plus haut d100 ; à
   *   égalité, les joueurs concernés relancent. Quand tous ont relancé, ce
   *   poste départage tout seul (nouvelle relance ou attribution), sans
   *   attendre un clic.
   * - « Attribuer » directement, à tout moment, même pendant le vote.
   * L'objet entre dans le sac du personnage avec la clôture du butin, dans
   * une seule transaction (lib/actions/butin.ts).
   */

  const butins = suivreButins(session.table);
  const joueurs = suivreJoueurs(session.table);
  const persos = suivrePersos(session.table);
  onDestroy(() => {
    butins.arreter();
    joueurs.arreter();
    persos.arreter();
  });

  const catalogue = catalogueTrie();
  let objet = $state('');
  let combien = $state(1);
  let message = $state('');
  let enCours = $state<string | null>(null);
  let choixDirect = $state<Record<string, string>>({});

  const aQui = $derived(destinataires(joueurs.etat.elements, persos.etat.elements, ''));
  const ouverts = $derived(butins.etat.elements.filter((b) => b.statut !== 'attribue').sort((a, b) => a.creeLe - b.creeLe));
  const derniers = $derived(
    butins.etat.elements
      .filter((b) => b.statut === 'attribue')
      .sort((a, b) => (b.resoluLe ?? 0) - (a.resoluLe ?? 0))
      .slice(0, 5),
  );

  async function faire(id: string | null, f: () => Promise<unknown>, apres?: string) {
    enCours = id;
    message = '';
    try {
      await f();
      if (apres) message = apres;
    } catch (e) {
      message = e instanceof RefusButin || e instanceof RefusEquipement ? e.message : messageErreurPerso(e);
    } finally {
      enCours = null;
    }
  }

  async function ajouter() {
    const id = objet;
    const nom = catalogue.find((c) => c.id === id)?.nom ?? 'Objet';
    await faire(null, async () => {
      const n = await mettreAuVote(id, Number(combien) || 1);
      message = n > 1 ? `${n} × ${nom} mis au vote, un par un.` : `${nom} mis au vote.`;
    });
    objet = '';
    combien = 1;
  }

  function etatTexte(b: Butin & { id: string }): string {
    const n = Object.keys(b.votes).length;
    if (b.statut === 'vote') return n ? `Vote ouvert : ${n} vote${n > 1 ? 's' : ''}.` : 'Vote ouvert : personne n’a encore voté.';
    if (b.statut === 'clos') return 'Personne n’en a voulu : attribue-le ou retire-le.';
    const issue = issueDuVote(b.votes);
    const noms = (uids: string[]) => uids.map((u) => b.votes[u]?.nom ?? '?').join(', ');
    if (issue.etat === 'egalite') return `Égalité (${LIBELLES_CHOIX[issue.rang]}) entre ${noms(b.enLice)} : relance ${b.tour}, on attend ${noms(issue.manquants)}.`;
    return 'Départage en cours…';
  }

  // Relances : dès que tous les joueurs à égalité ont relancé, on départage
  // (attribution ou nouvelle relance). La transaction relit le butin : un
  // second appel ne fait rien de plus.
  const enAvance = new Set<string>();
  $effect(() => {
    for (const b of butins.etat.elements) {
      if (b.statut !== 'relance' || enAvance.has(b.id)) continue;
      const issue = issueDuVote(b.votes);
      if (issue.etat === 'egalite' && issue.tour === b.tour) continue;
      enAvance.add(b.id);
      void avancerButin(b.id)
        .catch((e) => (message = e instanceof RefusButin ? e.message : messageErreurPerso(e)))
        .finally(() => enAvance.delete(b.id));
    }
  });
</script>

<section class="carte" aria-label="Butin du MJ">
  <h2>Butin</h2>
  <div class="ligne">
    <select aria-label="Objet à mettre au vote" bind:value={objet}>
      <option value="">Choisir dans le catalogue…</option>
      {#each catalogue as c (c.id)}<option value={c.id}>{c.nom} ({c.type})</option>{/each}
    </select>
    <input aria-label="Combien" class="quantite" type="number" min="1" max="99" bind:value={combien} />
    <button class="petit" disabled={!objet || enCours !== null} onclick={ajouter}>Mettre au vote</button>
  </div>

  {#if butins.etat.erreur}
    <p class="erreur" role="alert">{butins.etat.erreur}</p>
  {/if}

  {#each ouverts as b (b.id)}
    <article aria-label={`Butin : ${b.objet.nom}`}>
      <div class="ligne">
        <strong style:color={couleurRarete(b.objet)}>{b.objet.nom}</strong>
        {#if typeof b.objet.quantite === 'number' && b.objet.quantite > 1}<span class="badge">×{b.objet.quantite}</span>{/if}
        {#each effetsObjet(b.objet) as e (e)}<span class="effet">{e}</span>{/each}
      </div>
      <p class="aide">{etatTexte(b)}</p>
      {#if Object.keys(b.votes).length}
        <ul class="votes" aria-label={`Votes pour ${b.objet.nom}`}>
          {#each votesTries(b.votes) as [uid, v] (uid)}
            <li class:lice={b.enLice.includes(uid)}><span>{v.nom}</span><span class="choix {v.choix}">{LIBELLES_CHOIX[v.choix]}</span><span class="des">{v.choix === 'passe' ? '' : texteDes(v)}</span></li>
          {/each}
        </ul>
      {/if}
      <div class="ligne">
        {#if b.statut === 'vote'}
          <button class="petit" disabled={enCours === b.id} onclick={() => faire(b.id, () => avancerButin(b.id))}>Clore le vote</button>
        {/if}
        <select aria-label={`Attribuer ${b.objet.nom} à`} value={choixDirect[b.id] ?? ''} onchange={(ev) => (choixDirect[b.id] = ev.currentTarget.value)}>
          <option value="">Attribuer à…</option>
          {#each aQui as d (d.perso)}<option value={d.perso}>{d.nom} ({d.joueur})</option>{/each}
        </select>
        <button
          class="petit discret"
          disabled={!choixDirect[b.id] || enCours === b.id}
          onclick={() => {
            const d = aQui.find((x) => x.perso === choixDirect[b.id]);
            if (d) void faire(b.id, () => attribuerDirectement(b.id, d), `${b.objet.nom} donné à ${d.nom}.`);
          }}>Attribuer</button>
        <button
          class="petit discret"
          disabled={enCours === b.id}
          onclick={() => {
            if (confirm(`Retirer « ${b.objet.nom} » du butin ?`)) void faire(b.id, () => retirerButin(b.id));
          }}>Retirer</button>
      </div>
    </article>
  {/each}

  {#if derniers.length}
    <h3>Derniers attribués</h3>
    <ul class="derniers" aria-label="Derniers objets attribués">
      {#each derniers as b (b.id)}
        {@const v = b.gagnant ? b.votes[b.gagnant.uid] : undefined}
        <li>
          <strong style:color={couleurRarete(b.objet)}>{b.objet.nom}</strong> → {b.gagnant?.nom}
          <span class="aide">{b.gagnant?.mode === 'direct' ? '(attribué par toi)' : v ? `(${LIBELLES_CHOIX[v.choix]}, ${texteDes(v)})` : ''}</span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if message}<p class="message" role="status">{message}</p>{/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    font-size: 18px;
  }
  h3 {
    font-size: 15px;
    margin: 4px 0 0;
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
  select {
    min-height: 32px;
    max-width: 100%;
  }
  .quantite {
    width: 70px;
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
  .votes li.lice {
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
