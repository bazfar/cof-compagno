<script lang="ts">
  import { onDestroy } from 'svelte';
  import { importerBestiaire } from '../lib/actions/bestiaire';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { suivreBestiaire } from '../lib/magasins/bestiaire.svelte';
  import { schemaExportBestiaire, type ExportBestiaire } from '../lib/schemas/bestiaire';
  import { session } from '../lib/session.svelte';

  /*
   * MJ : import du bestiaire (lot L3.2). Le fichier vient de
   * `npm run bestiaire:exporter` : le bestiaire n'est jamais livré avec
   * l'app (correctif du 18/10/2026). Un monstre déjà en base est gardé tel
   * quel, surcharges comprises.
   */

  const bestiaire = suivreBestiaire(session.table);
  onDestroy(bestiaire.arreter);

  let lu = $state<ExportBestiaire | null>(null);
  let erreur = $state('');
  let message = $state('');
  let enCours = $state(false);

  const presents = $derived(new Set(bestiaire.etat.elements.map((m) => m.id)));
  const nouveaux = $derived(lu ? lu.monstres.filter((m) => !presents.has(m.id)).length : 0);

  async function choisir(ev: Event) {
    const fichier = (ev.currentTarget as HTMLInputElement).files?.[0];
    lu = null;
    erreur = '';
    message = '';
    if (!fichier) return;
    try {
      const resultat = schemaExportBestiaire.safeParse(JSON.parse(await fichier.text()));
      if (resultat.success) lu = resultat.data;
      else erreur = `${fichier.name} n'est pas un export du bestiaire (attendu : bestiaire-v1.json, produit par « npm run bestiaire:exporter »).`;
    } catch (e) {
      erreur = `${fichier.name} — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function importer() {
    if (!lu) return;
    enCours = true;
    erreur = '';
    try {
      const { importes, gardes } = await importerBestiaire(lu, presents);
      message = `${importes} monstre${importes > 1 ? 's' : ''} importé${importes > 1 ? 's' : ''}${gardes ? `, ${gardes} déjà en base gardé${gardes > 1 ? 's' : ''} tel${gardes > 1 ? 's' : ''} quel${gardes > 1 ? 's' : ''}` : ''} ; armes, armures et équilibrage à jour.`;
      lu = null;
    } catch (e) {
      erreur = messageErreurPerso(e);
    } finally {
      enCours = false;
    }
  }
</script>

<section class="carte import" aria-label="Bestiaire de la v1">
  <h2>Bestiaire</h2>
  <p class="aide">
    Produis le fichier avec <code>npm run bestiaire:exporter</code> (dans <code>v2/</code>), puis dépose <code>bestiaire-v1.json</code> ici. Il contient tes
    secrets : ne le partage pas. {#if bestiaire.etat.pret}La table compte {bestiaire.etat.elements.length} monstre{bestiaire.etat.elements.length > 1 ? 's' : ''}.{/if}
  </p>
  <label class="bouton-fichier">Choisir bestiaire-v1.json <input type="file" accept=".json,application/json" onchange={choisir} /></label>
  {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
  {#if lu}
    <p role="status" data-testid="resume-bestiaire">
      {lu.monstres.length} monstres dans le fichier : {nouveaux} à importer, {lu.monstres.length - nouveaux} déjà en base, gardés. {lu.armes.length} armes et {lu.armures.length} armures.
    </p>
    <button disabled={enCours} onclick={importer}>{enCours ? 'Import en cours…' : nouveaux ? `Importer ${nouveaux} monstre${nouveaux > 1 ? 's' : ''}` : 'Mettre à jour armes et armures'}</button>
  {/if}
  {#if message}<p class="succes" role="status">{message}</p>{/if}
</section>

<style>
  .import {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  h2 {
    font-size: 20px;
  }
  p {
    margin: 0;
  }
  .aide {
    font-size: 14px;
    color: var(--couleur-encre-douce);
  }
  .bouton-fichier {
    font-weight: 600;
    color: var(--couleur-accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .bouton-fichier input {
    display: none;
  }
  .erreur {
    color: var(--couleur-danger);
  }
  .succes {
    color: var(--couleur-succes);
  }
</style>
