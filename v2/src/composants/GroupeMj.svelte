<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurPerso, modifierPV } from '../lib/actions/persos';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import { session } from '../lib/session.svelte';
  import FicheVivante from './FicheVivante.svelte';
  import Portrait from './Portrait.svelte';

  /*
   * Vue du MJ sur le groupe (lot L2.3, décision 2a du 16/10) : tous les
   * personnages de la table d'un coup d'œil (PV, CA, PP), PV modifiables
   * sur place, et la fiche complète de n'importe lequel en un clic. Le
   * personnage joué de chaque joueur est marqué.
   */

  const persos = suivrePersos(session.table);
  const joueurs = suivreJoueurs(session.table);
  onDestroy(() => {
    persos.arreter();
    joueurs.arreter();
  });

  const nomJoueur = (uid: string) => joueurs.etat.elements.find((j) => j.id === uid)?.nom ?? '—';
  const joues = $derived(new Set(joueurs.etat.elements.map((j) => j.persoActif).filter(Boolean)));
  const lignes = $derived(
    [...persos.etat.elements]
      .sort((a, b) => Number(joues.has(b.id)) - Number(joues.has(a.id)) || nomJoueur(a.proprietaireUid).localeCompare(nomJoueur(b.proprietaireUid), 'fr') || a.nom.localeCompare(b.nom, 'fr'))
      .map((p) => ({ fiche: p, vue: vueFiche(p) })),
  );

  let ouvert = $state<string | null>(null);
  const ficheOuverte = $derived(persos.etat.elements.find((p) => p.id === ouvert) ?? null);
  let message = $state('');

  async function pv(id: string, valeur: number, max: number) {
    message = '';
    try {
      await modifierPV(id, valeur, max);
    } catch (e) {
      message = messageErreurPerso(e);
    }
  }
</script>

<section class="carte" aria-label="Groupe">
  <h2>Groupe</h2>
  {#if persos.etat.erreur}
    <p class="erreur" role="alert">{persos.etat.erreur}</p>
  {:else if !persos.etat.pret}
    <p>Chargement…</p>
  {:else if lignes.length === 0}
    <p>Aucun personnage à cette table pour l'instant.</p>
  {:else}
    <table>
      <thead><tr><th></th><th>Personnage</th><th>Joueur</th><th>PV</th><th>CA</th><th>PP</th><th></th></tr></thead>
      <tbody>
        {#each lignes as { fiche, vue } (fiche.id)}
          <tr class:joue={joues.has(fiche.id)}>
            <td><Portrait idPerso={fiche.id} nom={fiche.nom} taille={32} /></td>
            <td><strong>{fiche.nom}</strong><br /><span class="aide">{vue.titre}</span></td>
            <td>{nomJoueur(fiche.proprietaireUid)}{#if joues.has(fiche.id)} <span class="badge">joué</span>{/if}</td>
            <td class="pv">
              <button class="petit" aria-label={`Retirer un PV à ${fiche.nom}`} onclick={() => pv(fiche.id, vue.pv.actuel - 1, vue.pv.max)}>−</button>
              <span data-testid={`pv-${fiche.id}`}>{vue.pv.actuel} / {vue.pv.max}</span>
              <button class="petit" aria-label={`Ajouter un PV à ${fiche.nom}`} onclick={() => pv(fiche.id, vue.pv.actuel + 1, vue.pv.max)}>+</button>
            </td>
            <td>{vue.stats.ca}</td>
            <td>{vue.pp ? `${vue.pp.actuel} / ${vue.pp.max}` : '—'}</td>
            <td><button class="discret petit" onclick={() => (ouvert = ouvert === fiche.id ? null : fiche.id)}>{ouvert === fiche.id ? 'Fermer' : 'Fiche'}</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</section>
{#if ficheOuverte}
  {#key ficheOuverte.id}
    <FicheVivante fiche={ficheOuverte} modifiable={true} />
  {/key}
{/if}

<style>
  h2 {
    font-size: 20px;
    margin-bottom: 10px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 6px 10px;
    text-align: left;
    border-bottom: 1px solid var(--couleur-bordure-douce);
    vertical-align: middle;
  }
  tr.joue {
    background: var(--couleur-accent-pale);
  }
  .pv {
    white-space: nowrap;
  }
  .petit {
    min-height: 30px;
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
  .badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
