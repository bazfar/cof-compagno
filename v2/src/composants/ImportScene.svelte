<script lang="ts">
  import { importerScene, messageErreurCarte, supprimerSceneImportee } from '../lib/actions/carte';
  import { comprimerImage, lireImage } from '../lib/battlemap/compression';
  import { CASES_MAX, grilleDepuisImage, idSceneImportee, LIMITE_IMAGE, PX_PAR_CASE_DEFAUT } from '../lib/battlemap/import-image';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import type { SceneImportee } from '../lib/schemas/carte';

  /*
   * Import d'une scène depuis une simple image (MJ, lot L5.5 ; v1 :
   * chargerImage). Le MJ choisit l'image et donne la taille d'une case en
   * pixels ; l'image est recadrée à la grille, compressée sous 700 000
   * caractères et rangée dans Firestore, puis montrée à la table. Les murs
   * se tracent ensuite avec les outils de dessin (L5.4).
   */

  let {
    scenes,
    sceneMontree,
    surImportee,
  }: {
    scenes: readonly AvecId<SceneImportee>[];
    sceneMontree: string | null;
    surImportee: (id: string) => void;
  } = $props();

  let image = $state<HTMLImageElement | null>(null);
  let nom = $state('');
  let pxParCase = $state(PX_PAR_CASE_DEFAUT);
  let enCours = $state(false);
  let message = $state('');

  const grille = $derived(image ? grilleDepuisImage(image.naturalWidth, image.naturalHeight, pxParCase) : null);

  async function choisir(ev: Event) {
    message = '';
    const fichier = (ev.currentTarget as HTMLInputElement).files?.[0];
    if (!fichier) return;
    try {
      image = await lireImage(fichier);
      nom = fichier.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40);
    } catch (e) {
      image = null;
      message = e instanceof Error ? e.message : String(e);
    }
  }

  async function importer() {
    if (!image || !grille || !nom.trim()) return;
    enCours = true;
    message = 'Compression de l’image…';
    try {
      const { image: donnees, pxParCase: pxStocke } = await comprimerImage(image, grille, pxParCase);
      const id = idSceneImportee(nom);
      message = 'Envoi…';
      await importerScene(id, { nom: nom.trim(), colonnes: grille.colonnes, lignes: grille.lignes, pxParCase: pxStocke }, donnees);
      message = '';
      image = null;
      surImportee(id);
    } catch (e) {
      message = messageErreurCarte(e);
    } finally {
      enCours = false;
    }
  }

  async function supprimer(id: string, nomScene: string) {
    if (!confirm(`Supprimer la scène « ${nomScene} » ? Ses murs et jetons ne seront plus visibles.`)) return;
    try {
      await supprimerSceneImportee(id);
    } catch (e) {
      message = messageErreurCarte(e);
    }
  }
</script>

<div class="import">
  <div class="ligne">
    <label>Image <input type="file" accept="image/*" onchange={choisir} disabled={enCours} /></label>
    {#if image}
      <label>Nom <input class="nom" bind:value={nom} maxlength="40" /></label>
      <label>Une case mesure <input class="px" type="number" min="8" max="1000" bind:value={pxParCase} /> pixels</label>
      <span class="aide">
        {image.naturalWidth} × {image.naturalHeight} px
        {#if grille}→ {grille.colonnes} × {grille.lignes} cases{:else}→ grille invalide (au plus {CASES_MAX} cases de côté){/if}
      </span>
      <button onclick={importer} disabled={enCours || !grille || !nom.trim()}>Importer et montrer</button>
    {/if}
  </div>
  <p class="aide">
    Mesure sur ton image la largeur d'une case de grille, en pixels. L'image est compressée sous {Math.round(LIMITE_IMAGE / 1000)} Ko pour la base ;
    trace ensuite les murs avec les outils de dessin.
  </p>
  {#if message}<p class="message" role="status">{message}</p>{/if}
  {#if scenes.length}
    <ul>
      {#each scenes as s (s.id)}
        <li>
          {s.nom} <span class="aide">({s.colonnes} × {s.lignes})</span>
          <button class="petit" onclick={() => supprimer(s.id, s.nom)} disabled={s.id === sceneMontree} title={s.id === sceneMontree ? 'Montre une autre scène avant de la supprimer' : ''}>Supprimer</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .import {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    border-radius: var(--rayon);
    background: var(--couleur-surface);
    border: 1px solid var(--couleur-bordure);
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }
  .nom {
    width: 180px;
  }
  .px {
    width: 72px;
  }
  .aide {
    margin: 0;
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .message {
    margin: 0;
    color: var(--couleur-accent);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .petit {
    padding: 2px 10px;
    font-size: 13px;
  }
</style>
