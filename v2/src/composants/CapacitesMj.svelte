<script lang="ts">
  import { RefusCombat } from '../lib/actions/combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { cleCapacite, corrigerLegendaire, jouerCapaciteMonstre } from '../lib/actions/monstres';
  import type { CarteDuCombat } from '../lib/combat/attaque';
  import { etatDuCatalogue } from '../lib/combat/etats';
  import { capacitesDuMonstre, immunitesAuMj, legendairesRestantes, refusDeLimite, type CapaciteMonstre } from '../lib/combat/monstres';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import type { MonstreEnBase } from '../lib/schemas/bestiaire';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import type { Fiche } from '../lib/schemas/fiche';

  /*
   * Le monstre avancé, dans le panneau du MJ (lot L6.6a, décisions de
   * Thomas du 28/10/2026) :
   *   - ses immunités (8a), et celles que le MJ applique lui-même ;
   *   - ses résistances légendaires (7a), que le MJ corrige ;
   *   - ses capacités actives (2a, 3a, 10a) : leur limite, leurs cibles à
   *     cocher, « Jouer » ; celles que l'app ne lit pas, en texte ;
   *   - ses capacités spéciales, en texte.
   */

  let {
    idCombat,
    combat,
    monstre,
    modele,
    combattants,
    fiches,
    carte,
  }: {
    idCombat: string;
    combat: Combat;
    monstre: AvecId<Combattant>;
    modele: AvecId<MonstreEnBase>;
    combattants: readonly AvecId<Combattant>[];
    /** Par personnage. */
    fiches: ReadonlyMap<string, AvecId<Fiche>>;
    carte: CarteDuCombat | null;
  } = $props();

  const lues = $derived(capacitesDuMonstre(modele));
  const auMj = $derived(immunitesAuMj(modele));
  const restantes = $derived(legendairesRestantes(monstre));
  const ciblesPossibles = (cap: CapaciteMonstre) =>
    combattants.filter((c) => !c.mort && !(c.genre !== 'pj' && c.aTerre) && (cap.cible === 'zone' || (cap.cible === 'ennemi' ? c.genre !== 'monstre' : c.genre === 'monstre')));
  let cochees = $state<Record<string, string[]>>({});
  const coche = (cap: string, id: string, oui: boolean) => (cochees = { ...cochees, [cap]: oui ? [...(cochees[cap] ?? []), id] : (cochees[cap] ?? []).filter((x) => x !== id) });
  const LIBELLE_PREND = { principale: 'action', secondaire: 'action bonus', reaction: 'réaction' } as const;
  const texteLimite = (cap: CapaciteMonstre) =>
    cap.limite.parCombat ? `${cap.limite.parCombat}×/combat` : cap.limite.parRound ? `${cap.limite.parRound}×/round` : cap.limite.recharge ? `recharge ${cap.limite.recharge} round${cap.limite.recharge > 1 ? 's' : ''}` : 'à volonté';

  let message = $state('');
  let resultat = $state('');
  let occupe = $state(false);
  async function agir(f: () => Promise<string | void>) {
    message = '';
    resultat = '';
    occupe = true;
    try {
      resultat = (await f()) ?? '';
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
  const jouer = (cap: CapaciteMonstre) =>
    agir(async () => {
      const t = await jouerCapaciteMonstre(idCombat, combat, monstre, cap, cochees[cap.nom] ?? [], { combattants, fiches, carte });
      cochees = { ...cochees, [cap.nom]: [] };
      return t;
    });
</script>

{#if monstre.immunites?.length || auMj.length}
  <p class="aide" data-testid="immunites">
    {#if monstre.immunites?.length}Immunisé : {monstre.immunites.map((id) => etatDuCatalogue(id)?.nom ?? id).join(', ')}.{/if}
    {#each auMj as x (x)}<span class="aumj">Au MJ : {x}.</span>{/each}
  </p>
{/if}
{#if monstre.legendaire}
  <div class="legendaire">
    <span data-testid="legendaire">Résistance légendaire : {restantes}/{monstre.legendaire}</span>
    <button class="petit discret" aria-label="Une résistance légendaire de moins" disabled={occupe || restantes === 0} onclick={() => agir(() => corrigerLegendaire(idCombat, monstre, 1))}>−</button>
    <button class="petit discret" aria-label="Une résistance légendaire de plus" disabled={occupe || restantes === monstre.legendaire} onclick={() => agir(() => corrigerLegendaire(idCombat, monstre, -1))}>+</button>
  </div>
{/if}
{#if lues.capacites.length || lues.illisibles.length}
  <h3>Capacités</h3>
  <ul class="capacites" aria-label="Capacités de {monstre.nom}">
    {#each lues.capacites as cap (cap.nom)}
      {@const refus = refusDeLimite(monstre, cleCapacite(cap.nom), cap.limite, combat.round)}
      <li>
        <strong>{cap.nom}</strong>
        <span class="aide">{LIBELLE_PREND[cap.prend]} · {texteLimite(cap)}{cap.portee !== null ? ` · ${cap.portee} cases` : ''}{cap.zone ? ` · zone ${cap.zone} m` : ''}{cap.sauvegarde ? ` · ${cap.sauvegarde.type} ${cap.sauvegarde.dd}` : ''}{cap.jetAttaque !== null ? ` · attaque +${cap.jetAttaque}` : ''}</span>
        <span class="aide">{cap.description}</span>
        {#if cap.cible === 'ennemi' || cap.cible === 'allie' || cap.cible === 'zone'}
          <fieldset>
            <legend>Cibles de {cap.nom}</legend>
            {#each ciblesPossibles(cap) as c (c.id)}
              <label><input type="checkbox" checked={(cochees[cap.nom] ?? []).includes(c.id)} onchange={(e) => coche(cap.nom, c.id, e.currentTarget.checked)} /> {c.nom}</label>
            {/each}
          </fieldset>
        {/if}
        <button class="petit" disabled={occupe || !!refus} onclick={() => jouer(cap)}>Jouer {cap.nom}</button>
        {#if refus}<span class="aide">{cap.nom} : {refus}.</span>{/if}
      </li>
    {/each}
    {#each lues.illisibles as cap (cap.nom)}
      <li><strong>{cap.nom}</strong> <span class="aide">au MJ : {cap.description}</span></li>
    {/each}
  </ul>
{/if}
{#if modele.capacitesSpeciales.length}
  <details>
    <summary>Capacités spéciales</summary>
    <ul class="capacites">
      {#each modele.capacitesSpeciales as c (c.nom)}<li><strong>{c.nom}</strong> <span class="aide">{c.description}</span></li>{/each}
    </ul>
  </details>
{/if}
{#if resultat}<p role="status">{resultat}</p>{/if}
{#if message}<p class="erreur" role="alert">{message}</p>{/if}

<style>
  h3 {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--couleur-encre-douce);
  }
  p {
    margin: 0;
  }
  .aumj {
    display: block;
  }
  .legendaire {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .capacites {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
  }
  .capacites li {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    border: 1px solid var(--couleur-bordure-douce);
    border-radius: 8px;
    padding: 4px 8px;
  }
  legend {
    font-size: 12px;
  }
  details summary {
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }
</style>
