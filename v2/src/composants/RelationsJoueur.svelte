<script lang="ts">
  import { onDestroy } from 'svelte';
  import { suivrePnjJoueur, suivreReputation } from '../lib/magasins/pnj.svelte';
  import { effetPrix, FACTIONS_REPUTATION, factionParId, palierDe, repere, scoreDe } from '../lib/pnj/attitude';
  import { session } from '../lib/session.svelte';

  /*
   * Relations côté joueur (lot S1, décisions de Thomas du 22/10/2026) :
   *   - la réputation du groupe auprès des cinq blocs de Libris, avec son
   *     palier et l'effet sur les prix (12a) ;
   *   - les PNJ rencontrés (7a) : leur cran, le sens du dernier changement,
   *     et à Favorable, qu'un service rendu pourrait en faire un allié
   *     (14b, 18a). Jamais le DD (6a) : il reste au MJ.
   * Les PNJ pas encore rencontrés ne quittent pas la base : les règles
   * Firestore ne les laissent pas lire.
   */

  const pnj = suivrePnjJoueur(session.table);
  const reputation = suivreReputation(session.table);
  onDestroy(() => {
    pnj.arreter();
    reputation.arreter();
  });

  const rep = $derived(reputation.etat.donnees);
  const rencontres = $derived([...pnj.etat.elements].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
  const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
</script>

<div class="relations">
  <section class="carte" aria-label="Réputation du groupe">
    <h2>Réputation du groupe</h2>
    <ul class="factions">
      {#each FACTIONS_REPUTATION as f (f.id)}
        {@const score = scoreDe(rep, f.id)}
        {@const palier = palierDe(score)}
        <li>
          <div class="ligne"><strong>{f.nom}</strong> <span class="palier">{palier.label} ({signe(score)})</span></div>
          <div class="aide">{palier.description} · {effetPrix(palier)}</div>
        </li>
      {/each}
    </ul>
  </section>

  <section class="carte" aria-label="PNJ rencontrés">
    <h2>PNJ rencontrés</h2>
    {#if pnj.etat.erreur}<p class="erreur" role="alert">PNJ indisponibles : {pnj.etat.erreur}</p>{/if}
    <ul class="pnj">
      {#each rencontres as p (p.id)}
        {@const r = repere(p)}
        <li>
          <div class="ligne">
            <strong>{p.nom}</strong>
            {#if r}<span class="cran" data-testid="cran-{p.id}">{r.cran}{#if r.fleche}{' '}<span aria-label={r.fleche === '↑' ? 'en hausse' : 'en baisse'}>{r.fleche}</span>{/if}</span>{/if}
          </div>
          {#if p.faction}<div class="aide">{factionParId.get(p.faction)?.nom}</div>{/if}
          {#if r?.conseil}<div class="conseil">{r.conseil}</div>{/if}
        </li>
      {:else}
        <li class="aide">Le groupe n'a encore rencontré personne.</li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .relations {
    max-width: 1100px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
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
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ligne {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .palier,
  .cran {
    color: var(--couleur-accent);
    font-weight: 600;
  }
  .conseil {
    font-size: 13px;
    color: var(--couleur-or-texte);
  }
  @media (max-width: 1100px) {
    .relations {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
