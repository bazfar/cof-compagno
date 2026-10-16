<script lang="ts">
  import { onDestroy } from 'svelte';
  import { deposerImportV1, nouvelIdImport, supprimerImportV1 } from '../lib/actions/imports';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { suivreImports } from '../lib/magasins/imports.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { classeParId } from '../lib/regles/donnees';
  import { ErreurImportV1, lireExportV1, type FicheV1 } from '../lib/regles/import-v1';
  import { LIMITE_V1_JSON } from '../lib/schemas/import-v1';
  import { session } from '../lib/session.svelte';

  /*
   * MJ : dépôt des fiches v1 (lot L2.2c, décision 6a). Le MJ choisit les
   * fichiers exportés de la v1, attribue chaque fiche à un joueur de la
   * table et la dépose ; le joueur la reprend ensuite dans son assistant.
   * Une fiche que la 2.0 ne peut pas reprendre est refusée ici, en la
   * nommant, avant tout dépôt.
   */

  const joueurs = suivreJoueurs(session.table);
  const imports = suivreImports(session.table);
  onDestroy(() => {
    joueurs.arreter();
    imports.arreter();
  });

  interface Lue {
    cle: string;
    fiche: FicheV1;
    texte: string;
    joueur: string;
  }
  let lues = $state<Lue[]>([]);
  let erreurs = $state<string[]>([]);
  let message = $state('');

  const nomJoueur = (uid: string) => joueurs.etat.elements.find((j) => j.id === uid)?.nom ?? uid;
  const deposes = $derived([...imports.etat.elements].sort((a, b) => b.importeLe - a.importeLe));

  async function choisir(ev: Event) {
    const fichiers = [...((ev.currentTarget as HTMLInputElement).files ?? [])];
    lues = [];
    erreurs = [];
    message = '';
    for (const f of fichiers) {
      try {
        for (const fiche of lireExportV1(await f.text())) {
          const texte = JSON.stringify(fiche);
          if (texte.length > LIMITE_V1_JSON) throw new ErreurImportV1(`${fiche.nom} : fiche trop lourde pour la base (portrait ?).`);
          lues.push({ cle: `${f.name}:${lues.length}`, fiche, texte, joueur: '' });
        }
      } catch (e) {
        erreurs.push(`${f.name} — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  async function deposer(l: Lue) {
    message = '';
    try {
      await deposerImportV1(nouvelIdImport(), { proprietaireUid: l.joueur, nom: l.fiche.nom.trim(), v1Json: l.texte });
      lues = lues.filter((x) => x.cle !== l.cle);
      message = `« ${l.fiche.nom} » déposée pour ${nomJoueur(l.joueur)}.`;
    } catch (e) {
      message = messageErreurPerso(e);
    }
  }

  async function retirer(id: string, nom: string) {
    if (!confirm(`Retirer la fiche v1 « ${nom} » ? Un personnage déjà repris n'est pas touché.`)) return;
    try {
      await supprimerImportV1(id);
    } catch (e) {
      message = messageErreurPerso(e);
    }
  }
</script>

<section class="carte import" aria-label="Fiches de la v1">
  <h2>Fiches de la v1</h2>
  <p class="aide">
    Choisis les fichiers exportés de la v1 (bouton « Exporter » de chaque fiche), attribue chaque fiche à son joueur et dépose-la. Le joueur la
    reprend dans son assistant : il rechoisit voies et dons, tout le reste est repris, les objets rafraîchis depuis le catalogue.
  </p>
  <label>Fichiers <input type="file" accept=".json,application/json" multiple onchange={choisir} /></label>
  {#if erreurs.length}
    <ul class="erreurs" aria-label="Fichiers refusés">{#each erreurs as e (e)}<li>{e}</li>{/each}</ul>
  {/if}
  {#if lues.length}
    <ul aria-label="Fiches à déposer">
      {#each lues as l (l.cle)}
        <li>
          <strong>{l.fiche.nom}</strong>
          <span class="aide">{classeParId.get(l.fiche.classe)?.nom} niveau {l.fiche.niveau}</span>
          <span class="espace"></span>
          <select aria-label={`Joueur pour ${l.fiche.nom}`} bind:value={l.joueur}>
            <option value="">Attribuer à…</option>
            {#each joueurs.etat.elements as j (j.id)}<option value={j.id}>{j.nom}</option>{/each}
          </select>
          <button disabled={!l.joueur} onclick={() => deposer(l)}>Déposer</button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if message}<p role="status">{message}</p>{/if}
  {#if deposes.length}
    <h3>Déposées</h3>
    <ul aria-label="Fiches déposées">
      {#each deposes as i (i.id)}
        <li>
          <strong>{i.nom}</strong>
          <span>pour {nomJoueur(i.proprietaireUid)}</span>
          <span class="statut" class:repris={!!i.reprisPar}>{i.reprisPar ? 'reprise' : 'en attente'}</span>
          <span class="espace"></span>
          <button class="discret" onclick={() => retirer(i.id, i.nom)}>Retirer</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .import {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    font-size: 20px;
  }
  h3 {
    font-size: 17px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 8px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .espace {
    flex: 1 1 auto;
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
    margin: 0;
  }
  .statut {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-or);
    color: #fff;
  }
  .statut.repris {
    background: var(--couleur-succes);
  }
  .erreurs li {
    color: var(--couleur-danger);
    background: var(--couleur-danger-pale);
  }
  .discret {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  select {
    min-height: 40px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure);
    background: var(--couleur-surface-claire);
    padding: 0 8px;
  }
</style>
