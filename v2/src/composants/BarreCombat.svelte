<script lang="ts">
  import { lancerEtNoter, messageErreurJournal } from '../lib/actions/journal';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import { formuleTest } from '../lib/regles/des';
  import type { Fiche } from '../lib/schemas/fiche';

  /*
   * La barre du joueur en combat (lot L6.1), sous la carte, d'après la
   * maquette 2.0 (la barre horizontale de la v1) : identité et PV, CA,
   * initiative, PP ; attaques, jets de caractéristique, sorts et
   * capacités, objets, « Subir des dégâts ». En L6.1, seuls les jets de
   * caractéristique partent ; le reste arrive avec ses lots (L6.2 : attaques,
   * objets, dégâts ; L6.4 : sorts), et le dit.
   */

  let { fiche }: { fiche: AvecId<Fiche> } = $props();
  const vue = $derived(vueFiche(fiche));
  const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0');
  const part = $derived(vue.pv.max > 0 ? Math.max(0, Math.min(1, vue.pv.actuel / vue.pv.max)) : 0);
  let message = $state('');

  async function tester(carac: string, mod: number) {
    message = '';
    try {
      await lancerEtNoter(`Test de ${carac}`, formuleTest(mod), fiche.nom);
    } catch (e) {
      message = messageErreurJournal(e);
    }
  }
</script>

<section class="carte barre" aria-label="Mon personnage en combat">
  <div class="bloc identite">
    <strong class="nom">{fiche.nom}</strong>
    <div class="jauge">
      <div class="fond"><div class="plein" style:width="{part * 100}%"></div></div>
      <strong data-testid="pv-combat">{vue.pv.actuel}/{vue.pv.max}</strong>
    </div>
    <div class="pastilles">
      <span>CA {vue.stats.ca}</span>
      <span>Init {signe(vue.stats.initiative)}</span>
      {#if vue.pp}<span>PP {vue.pp.actuel}/{vue.pp.max}</span>{/if}
    </div>
  </div>

  <div class="bloc">
    <h3>Attaques · L6.2</h3>
    <div class="boutons">
      {#each [['Contact', vue.stats.attaque.contact], ['Distance', vue.stats.attaque.distance], ['Magique', vue.stats.attaque.magique]] as [nom, v] (nom)}
        {#if v !== null}<button disabled>{nom} {signe(v as number)}</button>{/if}
      {/each}
    </div>
  </div>

  <div class="bloc">
    <h3>Jets de carac</h3>
    <div class="boutons">
      {#each vue.caracs as c (c.code)}
        <button class="carac" aria-label="Test de {c.nom} {signe(c.mod)}" onclick={() => tester(c.nom, c.mod)}>{c.code}<br />{signe(c.mod)}</button>
      {/each}
    </div>
  </div>

  <div class="bloc">
    <h3>Sorts et capacités · L6.4</h3>
    <div class="boutons"><button disabled>Bientôt depuis cette barre</button></div>
  </div>

  <div class="bloc">
    <h3>Objets · L6.2</h3>
    <div class="boutons">
      <button disabled>Utiliser un objet</button>
      <button disabled class="degats">Subir des dégâts</button>
    </div>
  </div>
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</section>

<style>
  .barre {
    display: flex;
    flex-wrap: wrap;
    padding: 0;
    overflow: hidden;
  }
  .bloc {
    flex: 1 1 220px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-right: 1px solid var(--couleur-bordure-douce);
    border-bottom: 1px solid var(--couleur-bordure-douce);
  }
  .identite {
    flex-basis: 280px;
  }
  .nom {
    font-size: 17px;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--couleur-encre-douce);
  }
  .jauge {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .fond {
    flex: 1;
    height: 12px;
    border-radius: 999px;
    background: var(--couleur-danger-pale);
    overflow: hidden;
  }
  .plein {
    height: 100%;
    background: var(--couleur-succes);
  }
  .pastilles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .pastilles span {
    padding: 3px 9px;
    border-radius: 8px;
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .boutons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .carac {
    min-width: 52px;
    min-height: 48px;
    font-weight: 700;
    font-size: 13px;
  }
  .erreur {
    width: 100%;
    padding: 0 16px 12px;
  }
</style>
