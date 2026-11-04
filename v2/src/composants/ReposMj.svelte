<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { prendreRepos, RefusRepos, retirerJetRepos } from '../lib/actions/repos';
  import type { DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreRemous } from '../lib/magasins/combat.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { suivreEtatRepos, suivreReposEnAttente } from '../lib/magasins/repos.svelte';
  import { suivreSeances } from '../lib/magasins/seances.svelte';
  import { COUCHAGES, REPOS_COURTS_MAX, type Couchage } from '../lib/repos/repos';
  import type { Remous } from '../lib/schemas/remous';
  import { session } from '../lib/session.svelte';

  /*
   * Le repos, au poste du MJ (lot L7.1a, décisions de Thomas du 29/10/2026).
   * Séance ouverte : le MJ lance un repos court ou un repos long (couchage
   * au choix) pour les personnages joués des présents ; chacun voit ses
   * repos courts depuis le dernier repos long (5b) et le jet qui attend
   * (4b), que le MJ peut retirer.
   */

  const table = suivreTable(session.table);
  const seances = suivreSeances(session.table);
  const joueurs = suivreJoueurs(session.table);
  const persos = suivrePersos(session.table);
  const attentes = suivreReposEnAttente(session.table);
  const etat = suivreEtatRepos(session.table);
  onDestroy(() => {
    table.arreter();
    seances.arreter();
    joueurs.arreter();
    persos.arreter();
    attentes.arreter();
    etat.arreter();
  });
  const scene = $derived(table.etat.donnees?.sceneActive ?? null);
  let remousSuivi = $state<DocumentSuivi<Remous> | null>(null);
  $effect(() => {
    if (!scene) return;
    const s = suivreRemous(session.table, scene);
    remousSuivi = s;
    return () => {
      s.arreter();
      remousSuivi = null;
    };
  });

  const ouverte = $derived(table.etat.donnees?.seanceOuverte ?? null);
  const presents = $derived(new Set(seances.etat.elements.find((s) => s.id === ouverte?.id)?.presents ?? []));
  const fiches = $derived.by(() => {
    const ids = new Set(joueurs.etat.elements.filter((j) => presents.has(j.id)).map((j) => j.persoActif));
    return persos.etat.elements.filter((p) => ids.has(p.id)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  });
  const enAttente = $derived(new Set(attentes.etat.elements.map((a) => a.id)));
  const courts = $derived(etat.etat.donnees?.courts ?? {});

  let couchage = $state<Couchage>('camp');
  let message = $state('');
  let occupe = $state(false);
  async function repos(quoi: 'court' | 'long') {
    message = '';
    occupe = true;
    try {
      const p = await prendreRepos(quoi, fiches, etat.etat.donnees ?? null, enAttente, {
        couchage,
        combatEnCours: !!table.etat.donnees?.combat,
        scene,
        remous: remousSuivi?.etat.donnees ?? null,
      });
      message = `${quoi === 'court' ? 'Repos court' : 'Repos long'} : ${p.servis.join(', ')}.${p.enAttente.length || p.auPlafond.length ? ` Écartés : ${[...p.enAttente, ...p.auPlafond].join(', ')}.` : ''}`;
    } catch (e) {
      message = e instanceof RefusRepos ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
  async function retirer(id: string) {
    message = '';
    try {
      await retirerJetRepos(id);
    } catch (e) {
      message = messageErreurJournal(e);
    }
  }
</script>

{#if ouverte}
  <section class="carte repos" aria-label="Repos">
    <h2>Repos</h2>
    {#if fiches.length}
      <ul aria-label="Personnages des présents">
        {#each fiches as f (f.id)}
          {@const a = attentes.etat.elements.find((x) => x.id === f.id)}
          <li>
            <span>{f.nom}</span>
            <span class="aide" data-testid="courts">{courts[f.id] ?? 0}/{REPOS_COURTS_MAX} repos courts</span>
            {#if a}
              <span class="aide">jet {a.formule} à lancer</span>
              <button class="petit discret" onclick={() => retirer(f.id)} aria-label={`Retirer le jet de repos de ${f.nom}`}>Retirer</button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="aide">Aucun personnage joué parmi les présents.</p>
    {/if}
    <div class="ligne">
      <button class="petit" disabled={occupe || !fiches.length} onclick={() => repos('court')}>Repos court</button>
      <label>
        Couchage
        <select bind:value={couchage} disabled={occupe}>
          {#each COUCHAGES as c (c.id)}<option value={c.id}>{c.nom}{c.de ? ` (+${c.de})` : ''}</option>{/each}
        </select>
      </label>
      <button class="petit" disabled={occupe || !fiches.length} onclick={() => repos('long')}>Repos long</button>
    </div>
    {#if message}<p class="aide" role="status">{message}</p>{/if}
  </section>
{/if}

<style>
  .repos {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
  }
  h2 {
    font-size: 20px;
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  li,
  .ligne {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
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
</style>
