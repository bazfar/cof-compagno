<script lang="ts">
  import { onDestroy } from 'svelte';
  import { trierParCategorie } from '../lib/lore/fiche';
  import { ecrireVus, lireVus, normaliser, nouveautes, toutVu, type Vus } from '../lib/lore/vus';
  import { suivreLoreJoueur } from '../lib/magasins/lore.svelte';
  import { session } from '../lib/session.svelte';

  /*
   * Lore côté joueur (lot L2.7b) : les fiches que le MJ lui a partagées,
   * par catégorie, avec une recherche. Les règles Firestore ne lui laissent
   * lire que celles-là, et jamais un passage scellé : il n'y a rien à
   * filtrer ici. Ce que le MJ révèle arrive en direct, marqué « nouveau »
   * jusqu'à ce que le joueur ouvre la fiche (lib/lore/vus.ts).
   *
   * `surNouveautes` : le nombre de fiches nouvelles, pour la barre du haut.
   */

  let { surNouveautes = () => {} }: { surNouveautes?: (n: number) => void } = $props();

  const lore = suivreLoreJoueur(session.table, session.uid);
  onDestroy(lore.arreter);

  let recherche = $state('');
  let choisie = $state<string | null>(null);
  let vus = $state<Vus | null>(lireVus(session.table, session.uid));

  // Premier passage : tout ce qui est déjà partagé compte comme vu.
  $effect(() => {
    if (lore.etat.pret && vus === null) {
      vus = toutVu(lore.etat.elements, null);
      ecrireVus(session.table, session.uid, vus);
    }
  });

  const nouvelles = $derived(nouveautes(lore.etat.elements, vus));
  $effect(() => surNouveautes(nouvelles.size));

  const filtrees = $derived.by(() => {
    const q = normaliser(recherche.trim());
    if (!q) return lore.etat.elements;
    return lore.etat.elements.filter((f) =>
      normaliser([f.titre, f.sousTitre ?? '', ...f.etiquettes, ...f.passages.flatMap((p) => [p.intertitre ?? '', p.texte])].join(' ')).includes(q),
    );
  });
  const groupes = $derived(trierParCategorie(filtrees));
  const ouverte = $derived(lore.etat.elements.find((f) => f.id === choisie) ?? null);

  // Une fiche ouverte qui reçoit une révélation pendant qu'on la lit est vue.
  $effect(() => {
    if (ouverte && vus && (vus[ouverte.id] ?? -1) < ouverte.reveleLe) {
      vus = { ...vus, [ouverte.id]: ouverte.reveleLe };
      ecrireVus(session.table, session.uid, vus);
    }
  });

  function ouvrir(id: string) {
    choisie = id;
  }
</script>

<div class="lore">
  <section class="carte menu" aria-label="Fiches de lore">
    <input class="recherche" type="search" placeholder="Chercher dans le lore" aria-label="Chercher dans le lore" bind:value={recherche} />
    {#if lore.etat.erreur}
      <p class="erreur" role="alert">{lore.etat.erreur}</p>
    {:else if !lore.etat.pret}
      <p class="aide">Chargement du lore…</p>
    {:else if lore.etat.elements.length === 0}
      <p class="aide">Le MJ n'a encore rien partagé.</p>
    {:else if groupes.length === 0}
      <p class="aide">Aucune fiche ne correspond à « {recherche} ».</p>
    {:else}
      {#each groupes as g (g.categorie)}
        <h3 class="categorie">{g.categorie}</h3>
        <ul>
          {#each g.fiches as f (f.id)}
            <li>
              <button class="entree" aria-current={choisie === f.id} onclick={() => ouvrir(f.id)}>
                <span>{f.titre}</span>
                {#if nouvelles.has(f.id)}<span class="nouveau">nouveau</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
  </section>

  <section class="carte detail" aria-label="Fiche de lore">
    {#if ouverte}
      <span class="etiquette">{ouverte.categorie}</span>
      <h2>{ouverte.titre}</h2>
      {#if ouverte.sousTitre}<p class="sous-titre">{ouverte.sousTitre}</p>{/if}
      {#if ouverte.etiquettes.length}
        <div class="etiquettes">{#each ouverte.etiquettes as e (e)}<span class="badge">{e}</span>{/each}</div>
      {/if}
      <div class="texte">
        {#each ouverte.passages as p (p.id)}
          {#if p.intertitre}<h3>{p.intertitre}</h3>{/if}
          <p>{p.texte}</p>
        {/each}
      </div>
    {:else}
      <p class="aide">Choisis une fiche à gauche.</p>
    {/if}
  </section>
</div>

<style>
  .lore {
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    position: sticky;
    top: 16px;
  }
  .recherche {
    width: 100%;
    margin-bottom: 6px;
  }
  .categorie {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--couleur-encre-douce);
    font-family: var(--police-texte);
    margin-top: 10px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .entree {
    width: 100%;
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    text-align: left;
    background: transparent;
    color: var(--couleur-encre);
    font-weight: 400;
    border: 1px solid transparent;
  }
  .entree:hover {
    background: var(--couleur-surface-claire);
  }
  .entree[aria-current='true'] {
    background: var(--couleur-surface-claire);
    border-color: var(--couleur-accent-clair);
  }
  .nouveau {
    margin-left: auto;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 8px;
    border-radius: var(--rayon-pastille);
    border: 1px solid var(--couleur-or);
    color: var(--couleur-or-texte);
    background: var(--couleur-surface-claire);
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 240px;
  }
  .etiquette {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--couleur-encre-douce);
    font-weight: 600;
  }
  h2 {
    font-size: 26px;
  }
  .sous-titre {
    margin: 0;
    color: var(--couleur-encre-douce);
    font-style: italic;
  }
  .etiquettes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-accent-pale);
    color: var(--couleur-accent);
  }
  .texte {
    max-width: 72ch;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 6px;
  }
  .texte h3 {
    font-size: 17px;
    margin-top: 6px;
  }
  .texte p {
    margin: 0;
    white-space: pre-line;
    line-height: 1.6;
  }
  .aide {
    color: var(--couleur-encre-douce);
    font-size: 14px;
    margin: 0;
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
