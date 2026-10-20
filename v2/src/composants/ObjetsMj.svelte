<script lang="ts">
  import { onDestroy } from 'svelte';
  import { mettreAuVote, RefusButin } from '../lib/actions/butin';
  import { appliquerChangement, messageErreurPerso } from '../lib/actions/persos';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { objets } from '../lib/regles/donnees';
  import { ajouterDuCatalogue, couleurRarete, effetsObjet, RefusEquipement } from '../lib/regles/equipement';
  import type { ObjetFiche } from '../lib/schemas/fiche';
  import { session } from '../lib/session.svelte';

  /*
   * Catalogue d'objets côté MJ (lot L3.6, Données › Objets) : chercher,
   * filtrer par type, lire la fiche d'un objet, puis l'ajouter au sac d'un
   * personnage ou le mettre au vote du butin (L3.4). Les objets créés par le
   * MJ (Forge de la v1) viendront plus tard.
   */

  const persos = suivrePersos(session.table);
  onDestroy(() => persos.arreter());

  const TYPES = [...new Set(objets.map((o) => o.type))].sort((a, b) => a.localeCompare(b, 'fr'));
  const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let recherche = $state('');
  let type = $state('');
  let choisi = $state<string | null>(null);
  let combien = $state(1);
  let destinataire = $state('');
  let message = $state('');
  let enCours = $state(false);

  const trouves = $derived.by(() => {
    const r = sansAccents(recherche.trim());
    return objets
      .filter((o) => (!type || o.type === type) && (!r || sansAccents(o.nom).includes(r) || sansAccents(o.description ?? '').includes(r)))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  });
  const LIMITE = 200;
  const objet = $derived(objets.find((o) => o.id === choisi) ?? null);
  const fiches = $derived([...persos.etat.elements].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));

  async function faire(f: () => Promise<string>) {
    enCours = true;
    message = '';
    try {
      message = await f();
    } catch (e) {
      message = e instanceof RefusEquipement || e instanceof RefusButin ? e.message : messageErreurPerso(e);
    } finally {
      enCours = false;
    }
  }
  const n = () => Math.max(1, Math.min(99, Math.round(Number(combien) || 1)));

  function donner() {
    const f = fiches.find((p) => p.id === destinataire);
    const o = objet;
    if (!f || !o) return;
    const q = n();
    void faire(async () => {
      await appliquerChangement(f.id, ajouterDuCatalogue(f, o.id, q));
      return `${o.nom}${q > 1 ? ` ×${q}` : ''} ajouté au sac de ${f.nom}.`;
    });
  }
  function voter() {
    const o = objet;
    if (!o) return;
    const q = n();
    void faire(async () => {
      const k = await mettreAuVote(o.id, q);
      return k > 1 ? `${k} × ${o.nom} mis au vote, un par un.` : `${o.nom}${q > 1 ? ` ×${q}` : ''} mis au vote.`;
    });
  }
</script>

<div class="objets">
  <section class="carte" aria-label="Catalogue d'objets">
    <h2>Objets</h2>
    <div class="ligne">
      <input aria-label="Chercher un objet" placeholder="Chercher (nom, description)…" bind:value={recherche} />
      <select aria-label="Type d'objet" bind:value={type}>
        <option value="">Tous les types</option>
        {#each TYPES as t (t)}<option value={t}>{t}</option>{/each}
      </select>
    </div>
    <p class="aide">{trouves.length} objet(s){trouves.length > LIMITE ? ` : les ${LIMITE} premiers, précise la recherche` : ''}.</p>
    <ul aria-label="Objets trouvés">
      {#each trouves.slice(0, LIMITE) as o (o.id)}
        <li>
          <button class="lien" aria-pressed={o.id === choisi} onclick={() => { choisi = o.id; message = ''; }}>
            <strong style:color={couleurRarete(o as ObjetFiche)}>{o.nom}</strong>
            <span class="aide">{o.type}{o.prixPo ? ` · ${o.prixPo} po` : ''}</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>

  <section class="carte detail" aria-label="Fiche de l'objet">
    {#if objet}
      <h2 style:color={couleurRarete(objet as ObjetFiche)}>{objet.nom}</h2>
      <p class="aide">{objet.type}{typeof objet.rarete === 'string' ? ` · ${objet.rarete}` : ''}{objet.prixPo ? ` · ${objet.prixPo} po` : ''}</p>
      {#if effetsObjet(objet as ObjetFiche).length}
        <p class="ligne">{#each effetsObjet(objet as ObjetFiche) as e (e)}<span class="effet">{e}</span>{/each}</p>
      {/if}
      {#if objet.description}<p>{objet.description}</p>{/if}
      <div class="ligne">
        <label>Quantité <input class="quantite" type="number" min="1" max="99" bind:value={combien} /></label>
      </div>
      <div class="ligne">
        <select aria-label="Personnage qui reçoit l'objet" bind:value={destinataire}>
          <option value="">Ajouter au sac de…</option>
          {#each fiches as p (p.id)}<option value={p.id}>{p.nom}</option>{/each}
        </select>
        <button class="petit" disabled={!destinataire || enCours} onclick={donner}>Ajouter au sac</button>
        <button class="petit discret" disabled={enCours} onclick={voter}>Mettre au vote</button>
      </div>
      {#if message}<p role="status">{message}</p>{/if}
    {:else}
      <p class="aide">Choisis un objet pour voir sa fiche, l'ajouter au sac d'un personnage ou le mettre au vote.</p>
    {/if}
  </section>
</div>

<style>
  .objets {
    display: grid;
    grid-template-columns: minmax(320px, 1fr) minmax(0, 1.2fr);
    gap: 20px;
    align-items: start;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h2 {
    font-size: 20px;
    margin: 0;
  }
  p {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 60vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .lien {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    min-height: 0;
    padding: 4px 8px;
    background: none;
    color: var(--couleur-encre);
    font-weight: 400;
    text-align: left;
  }
  .lien[aria-pressed='true'] {
    background: var(--couleur-accent-pale);
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }
  .effet {
    font-size: 12px;
    padding: 1px 6px;
    border-radius: var(--rayon-pastille);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .quantite {
    width: 70px;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
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
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
</style>
