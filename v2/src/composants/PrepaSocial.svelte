<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurPerso } from '../lib/actions/persos';
  import {
    ajusterReputation,
    corrigerAttitudePnj,
    creerPnj,
    importerPnjDuLore,
    marquerPeuplePnj,
    mensongeDecouvertPnj,
    RefusAttitude,
    rencontrerPnj,
    rendreServicePnj,
    retirerPnj,
  } from '../lib/actions/pnj';
  import type { CollectionSuivie } from '../lib/firebase/suivre.svelte';
  import { normaliser } from '../lib/lore/vus';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreLoreMj } from '../lib/magasins/lore.svelte';
  import { suivreHistoriquePnj, suivrePnjMj, suivreReputation } from '../lib/magasins/pnj.svelte';
  import {
    cranDeDepart,
    effetPrix,
    FACTIONS_REPUTATION,
    factionParId,
    MOD_DD_ATTITUDE,
    NOMS_CRANS,
    palierDe,
    pnjDepuisLore,
    repere,
    scoreDe,
  } from '../lib/pnj/attitude';
  import type { GesteAttitudeEnregistre } from '../lib/schemas/pnj';
  import DemandesSortsMj from './DemandesSortsMj.svelte';
  import QuestionsMj from './QuestionsMj.svelte';
  import SceneMj from './SceneMj.svelte';
  import { session } from '../lib/session.svelte';

  /*
   * Prépa social (lot S1, décisions de Thomas du 22/10/2026) : la
   * réputation du groupe auprès des cinq blocs de Libris, et les PNJ avec
   * leur attitude.
   *   - Réputation : le MJ l'ajuste d'un cran ; palier et effet sur les
   *     prix s'affichent (12a ; la boutique appliquera l'effet).
   *   - PNJ : créés depuis le lore importé (3a) ou à la main. « Rencontré »
   *     les montre aux joueurs, au cran que fixe la réputation de leur
   *     faction (16a) ou Neutre (4a). Ensuite : service rendu (17a, seul
   *     chemin vers Allié) et corrections d'un cran, chacun avec son motif,
   *     gardé dans l'historique du PNJ.
   * Scène (lot S2) : en tête, la scène en cours ou à ouvrir (SceneMj),
   * lançable depuis la fiche d'un PNJ rencontré (3a). Les scènes font
   * bouger l'attitude d'elles-mêmes ; un mensonge réussi peut être
   * découvert plus tard, depuis la fiche du PNJ (9a).
   * Vécu en scène (lot S3) : les questions des joueurs (QuestionsMj) ;
   * sur la fiche du PNJ, « du peuple » (Homme du peuple, 2a) et les secrets
   * déjà utilisés par Levier (6a).
   * Sorts hors combat (lot G2a, 16a) : les demandes des joueurs, sous les
   * questions (DemandesSortsMj).
   */

  const pnj = suivrePnjMj(session.table);
  const reputation = suivreReputation(session.table);
  const lore = suivreLoreMj(session.table);
  const table = suivreTable(session.table);
  onDestroy(() => {
    pnj.arreter();
    reputation.arreter();
    lore.arreter();
    table.arreter();
  });

  const rep = $derived(reputation.etat.donnees);
  const seance = $derived(table.etat.donnees?.seanceOuverte?.id);
  const existants = $derived(new Set(pnj.etat.elements.map((p) => p.id)));
  const aCreer = $derived(pnjDepuisLore(lore.etat.elements, existants, 0).length);

  let recherche = $state('');
  let filtre = $state<'tous' | 'rencontres' | 'inconnus'>('tous');
  let choisi = $state<string | null>(null);
  let motif = $state('');
  let nouveauNom = $state('');
  let nouvelleFaction = $state('');
  let message = $state('');
  let occupe = $state(false);

  const nomFaction = (id: string | null) => (id ? (factionParId.get(id)?.nom ?? id) : 'Sans faction de réputation');
  const visibles = $derived.by(() => {
    const q = normaliser(recherche.trim());
    return [...pnj.etat.elements]
      .filter((p) => (filtre === 'rencontres' ? p.rencontre : filtre === 'inconnus' ? !p.rencontre : true))
      .filter((p) => !q || normaliser(`${p.nom} ${nomFaction(p.faction)}`).includes(q))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  });
  const ouvert = $derived(pnj.etat.elements.find((p) => p.id === choisi) ?? null);

  // L'historique du PNJ ouvert, suivi tant qu'il est ouvert.
  let suiviHistorique = $state<CollectionSuivie<GesteAttitudeEnregistre> | null>(null);
  $effect(() => {
    if (!choisi) return;
    const h = suivreHistoriquePnj(session.table, choisi);
    suiviHistorique = h;
    return () => {
      h.arreter();
      suiviHistorique = null;
    };
  });
  const historique = $derived(suiviHistorique?.etat.elements ?? []);

  const NOMS_GESTES = { rencontre: 'Rencontre', service: 'Service rendu', correction: 'Correction', scene: 'Scène', mensonge: 'Mensonge découvert' } as const;
  const date = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

  async function agir(f: () => Promise<unknown>, succes = '') {
    message = '';
    occupe = true;
    try {
      await f();
      message = succes;
      return true;
    } catch (e) {
      message = e instanceof RefusAttitude ? e.message : messageErreurPerso(e);
      return false;
    } finally {
      occupe = false;
    }
  }

  async function creer() {
    const nom = nouveauNom.trim();
    if (!nom) return;
    if (await agir(async () => (choisi = await creerPnj(nom, nouvelleFaction || null)))) {
      nouveauNom = '';
      nouvelleFaction = '';
    }
  }
  async function retirer(id: string) {
    const p = pnj.etat.elements.find((x) => x.id === id);
    if (!p || !confirm(`Retirer ${p.nom} ?`)) return;
    if (await agir(() => retirerPnj(id, p), 'PNJ retiré.')) choisi = null;
  }
  let pnjPourScene = $state<string | null>(null);
  async function avecMotif(f: (m: string) => Promise<unknown>) {
    if (await agir(() => f(motif))) motif = '';
  }
</script>

<div class="social">
  <SceneMj pnjs={pnj.etat.elements} pnjPropose={pnjPourScene} surPnjPris={() => (pnjPourScene = null)} />
  <QuestionsMj />
  <DemandesSortsMj />
  <section class="carte" aria-label="Réputation du groupe">
    <h2>Réputation du groupe</h2>
    <table>
      <thead><tr><th>Faction</th><th>Score</th><th>Palier</th><th>Prix</th><th><span class="sr">Ajuster</span></th></tr></thead>
      <tbody>
        {#each FACTIONS_REPUTATION as f (f.id)}
          {@const score = scoreDe(rep, f.id)}
          {@const palier = palierDe(score)}
          <tr>
            <th scope="row" title={f.accroche}>{f.nom}</th>
            <td data-testid="score-{f.id}">{signe(score)}</td>
            <td>{palier.label}</td>
            <td>{effetPrix(palier)}</td>
            <td class="boutons">
              <button class="petit" aria-label="Baisser la réputation auprès de {f.nom}" disabled={occupe || score <= -10} onclick={() => agir(() => ajusterReputation(f.id, -1))}>−</button>
              <button class="petit" aria-label="Monter la réputation auprès de {f.nom}" disabled={occupe || score >= f.plafond} onclick={() => agir(() => ajusterReputation(f.id, 1))}>+</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="aide">Toute la table voit les paliers. Les prix s'appliqueront avec la boutique.</p>
  </section>

  <section class="carte pnj" aria-label="PNJ">
    <div class="tete">
      <h2>PNJ</h2>
      <span class="aide">{pnj.etat.elements.filter((p) => p.rencontre).length} rencontrés sur {pnj.etat.elements.length}</span>
      {#if aCreer}
        <button disabled={occupe} onclick={() => agir(() => importerPnjDuLore(lore.etat.elements, existants), `${aCreer} PNJ créés depuis le lore.`)}>Créer les PNJ du lore ({aCreer})</button>
      {/if}
    </div>
    <form class="nouveau" onsubmit={(e) => (e.preventDefault(), creer())}>
      <label>Nouveau PNJ <input maxlength="80" bind:value={nouveauNom} /></label>
      <label
        >Faction
        <select bind:value={nouvelleFaction}>
          <option value="">Sans faction de réputation</option>
          {#each FACTIONS_REPUTATION as f (f.id)}<option value={f.id}>{f.nom}</option>{/each}
        </select>
      </label>
      <button disabled={occupe || !nouveauNom.trim()}>Créer</button>
    </form>

    <div class="corps">
      <div class="liste">
        <div class="filtres">
          <input type="search" placeholder="Chercher un PNJ" aria-label="Chercher un PNJ" bind:value={recherche} />
          <select aria-label="Montrer" bind:value={filtre}>
            <option value="tous">Tous</option>
            <option value="rencontres">Rencontrés</option>
            <option value="inconnus">Pas encore rencontrés</option>
          </select>
        </div>
        <ul>
          {#each visibles as p (p.id)}
            <li>
              <button class="ligne" class:choisi={choisi === p.id} aria-pressed={choisi === p.id} onclick={() => ((choisi = p.id), (motif = ''))}>
                <span class="nom">{p.nom}</span>
                <span class="etat" class:inconnu={!p.rencontre}>{p.cran ? NOMS_CRANS[p.cran] : 'pas encore rencontré'}</span>
              </button>
            </li>
          {:else}
            <li class="aide">{pnj.etat.elements.length ? 'Aucun PNJ ne correspond.' : 'Aucun PNJ : crée-les depuis le lore ou à la main.'}</li>
          {/each}
        </ul>
      </div>

      <aside class="detail" aria-label="Fiche du PNJ">
        {#if ouvert}
          {@const r = repere(ouvert)}
          <h3>{ouvert.nom}</h3>
          <p class="aide">{nomFaction(ouvert.faction)}{ouvert.lore ? ' · fiche de lore liée' : ''}</p>
          <label class="case"><input type="checkbox" checked={ouvert.peuple} disabled={occupe} onchange={(e) => agir(() => marquerPeuplePnj(ouvert.id, e.currentTarget.checked))} /> PNJ du peuple (Homme du peuple)</label>
          {#if ouvert.secrets.length}<p class="aide">Secrets déjà utilisés (Levier) : {ouvert.secrets.join(' ; ')}</p>{/if}
          {#if !ouvert.rencontre || !ouvert.cran}
            <p>Pas encore rencontré : les joueurs ne le voient pas.</p>
            <p class="aide">À la rencontre : {NOMS_CRANS[cranDeDepart(ouvert.faction, rep)]}{ouvert.faction ? ' (réputation de sa faction)' : ''}.</p>
            <div class="actions">
              <button disabled={occupe} onclick={() => agir(() => rencontrerPnj(ouvert.id, seance))}>Rencontré</button>
              <button class="discret" disabled={occupe} onclick={() => retirer(ouvert.id)}>Retirer</button>
            </div>
          {:else}
            <p class="cran"><strong data-testid="cran-mj">{NOMS_CRANS[ouvert.cran]}</strong> <span class="aide">DD social {signe(MOD_DD_ATTITUDE[ouvert.cran])}</span></p>
            {#if r}<p class="aide">Les joueurs voient : {r.cran}{r.fleche ? ` ${r.fleche}` : ''}{r.conseil ? ` · ${r.conseil}` : ''}</p>{/if}
            <label class="motif">Motif <input maxlength="120" placeholder="Ce qui s'est passé" bind:value={motif} /></label>
            <div class="actions">
              <button disabled={occupe || !motif.trim() || ouvert.cran === 'allie'} onclick={() => avecMotif((m) => rendreServicePnj(ouvert.id, m, seance))}>Service rendu</button>
              <button class="discret" disabled={occupe || !motif.trim() || ouvert.cran === 'hostile'} onclick={() => avecMotif((m) => corrigerAttitudePnj(ouvert.id, -1, m, seance))}>Un cran de moins</button>
              <button class="discret" disabled={occupe || !motif.trim() || ouvert.cran === 'favorable' || ouvert.cran === 'allie'} onclick={() => avecMotif((m) => corrigerAttitudePnj(ouvert.id, 1, m, seance))}>Un cran de plus</button>
            </div>
            <p class="aide">Allié ne s'obtient que par un service rendu.</p>
            {#if ouvert.mensonges > 0}
              <button class="discret" disabled={occupe || !motif.trim()} onclick={() => avecMotif((m) => mensongeDecouvertPnj(ouvert.id, m, seance))}>Mensonge découvert ({ouvert.mensonges} en cours)</button>
            {/if}
            <button onclick={() => (pnjPourScene = ouvert.id)}>Ouvrir une scène avec {ouvert.nom}</button>
          {/if}
          {#if historique.length}
            <h4>Historique</h4>
            <ul class="historique">
              {#each historique as g (g.creeLe + g.geste)}
                <li>{date(g.creeLe)} · {NOMS_GESTES[g.geste]} : {g.avant ? `${NOMS_CRANS[g.avant]} → ` : ''}{NOMS_CRANS[g.apres]} — {g.motif}</li>
              {/each}
            </ul>
          {/if}
        {:else}
          <p class="aide">Choisis un PNJ pour voir son attitude.</p>
        {/if}
      </aside>
    </div>
  </section>
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</div>

<style>
  .social {
    max-width: 1200px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .carte {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    font-size: 20px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--couleur-bordure-douce);
  }
  thead th {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .boutons {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .tete,
  .nouveau,
  .filtres,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .tete h2 {
    margin-right: auto;
  }
  .corps {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 16px;
    align-items: start;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .liste ul {
    max-height: 520px;
    overflow-y: auto;
    margin-top: 8px;
  }
  .ligne {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    background: transparent;
    color: var(--couleur-encre);
    border-radius: var(--rayon);
    min-height: 34px;
  }
  .ligne:hover,
  .ligne.choisi {
    background: var(--couleur-accent-pale);
  }
  .etat {
    color: var(--couleur-accent);
    font-weight: 600;
  }
  .etat.inconnu {
    color: var(--couleur-encre-douce);
    font-weight: 400;
    font-style: italic;
  }
  .detail {
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
    border-radius: var(--rayon);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: sticky;
    top: 12px;
  }
  .detail h3 {
    font-size: 18px;
  }
  .detail p,
  .detail h4 {
    margin: 0;
  }
  .cran strong {
    font-size: 18px;
    color: var(--couleur-accent);
  }
  .case {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .motif {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .historique li {
    font-size: 13px;
    padding: 2px 0;
  }
  @media (max-width: 1000px) {
    .corps {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
