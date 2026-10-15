<script lang="ts">
  import { placementParDefaut } from '../lib/battlemap/deplacement';
  import { GrilleExploration } from '../lib/battlemap/exploration';
  import { sceneCalcul, type Case } from '../lib/battlemap/geometrie';
  import type { Role } from '../lib/battlemap/interactions';
  import type { JetonAffiche } from '../lib/battlemap/rendu';
  import { adresseImage, catalogueScenes, chargerGeometrie } from '../lib/battlemap/scenes';
  import type { VisionJeton } from '../lib/battlemap/visibilite';
  import type { GeometrieScene } from '../lib/schemas/scene';
  import Battlemap from './Battlemap.svelte';

  /*
   * Atelier battlemap (lot L5.2) : la carte en local, dans le navigateur du
   * MJ, pour essayer le rendu et les gestes avant que les jetons passent
   * dans Firestore (L5.3). Rien n'est enregistré ni montré aux joueurs.
   * Disparaît quand la vraie battlemap arrive dans le poste MJ.
   */

  const COULEURS_PJ = ['#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085'];

  let idScene = $state(catalogueScenes[0]?.id ?? '');
  let geometrie = $state<GeometrieScene | null>(null);
  let erreur = $state('');
  let jetons = $state<JetonAffiche[]>([]);
  let portesOuvertes = $state<Record<string, boolean>>({});
  let exploration = $state<GrilleExploration | null>(null);
  let revision = $state(0);
  let role = $state<Role>('mj');
  let selection = $state<string | null>(null);
  let afficherMurs = $state(true);
  let afficherGrille = $state(false);
  let brouillard = $state(true);
  let compteur = 0;

  $effect(() => {
    const id = idScene;
    let actif = true;
    geometrie = null;
    erreur = '';
    chargerGeometrie(id)
      .then((g) => {
        if (!actif) return;
        geometrie = g;
        jetons = [];
        portesOuvertes = {};
        selection = null;
        exploration = new GrilleExploration(g.colonnes, g.lignes);
        revision++;
      })
      .catch((e: unknown) => { if (actif) erreur = String(e); });
    return () => { actif = false; };
  });

  const selectionne = $derived(jetons.find((j) => j.id === selection) ?? null);
  // En vue joueur, l'atelier fait comme si ce joueur possédait le premier PJ.
  const miens = $derived(new Set(role === 'joueur' ? jetons.filter((j) => j.genre === 'pj').slice(0, 1).map((j) => j.id) : []));

  function ajouter(genre: 'pj' | 'monstre') {
    if (!geometrie) return;
    const n = jetons.filter((j) => j.genre === genre).length + 1;
    const pos = placementParDefaut(sceneCalcul(geometrie), jetons, genre === 'pj');
    jetons = [
      ...jetons,
      {
        id: `atelier-${++compteur}`,
        genre,
        ...pos,
        nom: genre === 'pj' ? `Héros ${n}` : `Gobelin ${n}`,
        couleur: genre === 'pj' ? (COULEURS_PJ[(n - 1) % COULEURS_PJ.length] as string) : '#c0392b',
      },
    ];
  }

  function deplacerJeton(id: string, vers: Case) {
    jetons = jetons.map((j) => (j.id === id ? { ...j, ...vers } : j));
  }

  function basculerMort() {
    if (selectionne?.genre !== 'monstre') return;
    jetons = jetons.map((j) => (j.id === selectionne.id ? { ...j, mort: !j.mort } : j));
  }

  function retirer() {
    jetons = jetons.filter((j) => j.id !== selection);
    selection = null;
  }

  function basculerPorte(id: string) {
    const porte = geometrie?.portes.find((p) => p.id === id);
    portesOuvertes = { ...portesOuvertes, [id]: !(portesOuvertes[id] ?? porte?.ouverte ?? false) };
  }

  function marquer(visions: VisionJeton[]) {
    if (exploration && exploration.marquerVisions(visions) > 0) revision++;
  }

  function reinitialiserExploration() {
    if (!geometrie) return;
    exploration = new GrilleExploration(geometrie.colonnes, geometrie.lignes);
    revision++;
  }

  function toutReveler() {
    if (!geometrie) return;
    exploration = GrilleExploration.pleine(geometrie.colonnes, geometrie.lignes);
    revision++;
  }
</script>

<section class="atelier">
  <header>
    <h2>Atelier battlemap</h2>
    <p class="note">Essai local : rien n'est enregistré, les joueurs ne voient rien.</p>
  </header>

  <div class="outils">
    <label>Scène
      <select bind:value={idScene}>
        {#each catalogueScenes as s (s.id)}
          <option value={s.id}>{s.nom} ({s.colonnes} × {s.lignes})</option>
        {/each}
      </select>
    </label>
    <label>Vue
      <select bind:value={role}>
        <option value="mj">MJ (voit tout)</option>
        <option value="joueur">Joueur (premier PJ)</option>
      </select>
    </label>
    <button onclick={() => ajouter('pj')}>+ PJ</button>
    <button onclick={() => ajouter('monstre')}>+ Monstre</button>
    <button onclick={basculerMort} disabled={selectionne?.genre !== 'monstre'}>{selectionne?.mort ? 'Ranimer' : 'Tuer'}</button>
    <button onclick={retirer} disabled={!selectionne}>Retirer</button>
    <span class="separateur"></span>
    <label><input type="checkbox" bind:checked={brouillard} /> Brouillard</label>
    <label><input type="checkbox" bind:checked={afficherMurs} /> Murs</label>
    <label><input type="checkbox" bind:checked={afficherGrille} /> Grille</label>
    <button onclick={reinitialiserExploration}>Réinitialiser l'exploration</button>
    <button onclick={toutReveler}>Tout révéler</button>
  </div>

  <div class="carte">
    {#if erreur}
      <p class="erreur" role="alert">{erreur}</p>
    {:else if geometrie}
      <Battlemap
        {geometrie}
        image={adresseImage(geometrie.id)}
        etat={{ portesOuvertes }}
        {jetons}
        {role}
        {miens}
        exploration={brouillard ? exploration : null}
        revisionExploration={revision}
        {afficherMurs}
        {afficherGrille}
        {selection}
        surDeplacement={deplacerJeton}
        surPorte={basculerPorte}
        surSelection={(id) => (selection = id)}
        surVisions={marquer}
      />
    {:else}
      <p class="note">Chargement…</p>
    {/if}
  </div>
  <p class="aide">Molette : zoom · glisser dans le vide : déplacer la vue · glisser un jeton : le déplacer · clic sur une porte : l'ouvrir ou la fermer · double-clic : recadrer.</p>
</section>

<style>
  .atelier {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px 24px;
    background: var(--couleur-surface);
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--rayon-carte);
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
  }
  .note,
  .aide {
    margin: 0;
    color: var(--couleur-encre-douce);
    font-size: 13px;
  }
  .outils {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .outils label {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    margin: 0;
  }
  .separateur {
    flex: 1 1 auto;
  }
  .carte {
    height: 70vh;
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
