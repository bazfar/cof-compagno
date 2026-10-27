<script lang="ts">
  import { RefusCombat } from '../lib/actions/combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { jouerReaction, opportuniteDeMonstre } from '../lib/actions/reactions';
  import type { CarteDuCombat } from '../lib/combat/attaque';
  import type { AvecId, CollectionSuivie } from '../lib/firebase/suivre.svelte';
  import { suivreOpportunites, suivreReactions } from '../lib/magasins/combat.svelte';
  import type { MonstreEnBase } from '../lib/schemas/bestiaire';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import type { Fiche } from '../lib/schemas/fiche';
  import type { DemandeReaction, Opportunite } from '../lib/schemas/reactions';
  import { session } from '../lib/session.svelte';

  /*
   * Les réactions, côté MJ (lot L6.5b, décisions de Thomas du 26/10/2026) :
   *   - 1a : son client joue d'office chaque demande d'un joueur, une fois,
   *     avec le moteur ; la liste dit ce qui a été joué ou refusé ;
   *   - 5a, 11a : le monstre dont un PJ (ou une invocation) a quitté le
   *     contact frappe d'opportunité, d'un bouton, de sa première attaque au
   *     contact ; elle prend sa réaction du round.
   */

  let {
    idCombat,
    combat,
    combattants,
    fiches,
    bestiaire,
    armes,
    carte,
  }: {
    idCombat: string;
    combat: Combat;
    combattants: readonly AvecId<Combattant>[];
    /** Par personnage. */
    fiches: ReadonlyMap<string, AvecId<Fiche>>;
    bestiaire: readonly AvecId<MonstreEnBase>[];
    armes: Parameters<typeof opportuniteDeMonstre>[6];
    carte: CarteDuCombat | null;
  } = $props();

  let suivi = $state<{ r: CollectionSuivie<DemandeReaction>; o: CollectionSuivie<Opportunite> } | null>(null);
  $effect(() => {
    const x = { r: suivreReactions(session.table, idCombat), o: suivreOpportunites(session.table, idCombat) };
    suivi = x;
    return () => {
      x.r.arreter();
      x.o.arreter();
      suivi = null;
    };
  });
  const nomDe = (id: string | null) => (id ? (combattants.find((c) => c.id === id)?.nom ?? id) : '');
  const opportunites = $derived((suivi?.o.etat.elements ?? []).filter((o) => o.tour === combat.tour));

  // 1a : chaque demande en attente, jouée une fois par ce client (la transaction la prend une fois en tout).
  const enCours = new Set<string>();
  $effect(() => {
    const attente = (suivi?.r.etat.elements ?? []).filter((d) => d.statut === 'attente' && !enCours.has(d.id));
    if (!attente.length) return;
    const ctx = { combattants, fiches, carte, opportunites };
    const c = combat;
    for (const d of attente) {
      enCours.add(d.id);
      jouerReaction(idCombat, c, d, ctx).catch((e) => (message = e instanceof RefusCombat ? e.message : messageErreurJournal(e)));
    }
  });
  const recentes = $derived(
    (suivi?.r.etat.elements ?? [])
      .filter((d) => d.tour === combat.tour)
      .sort((a, b) => b.creeLe - a.creeLe)
      .slice(0, 5),
  );

  let message = $state('');
  let resultat = $state('');
  let occupe = $state(false);
  async function frapper(o: AvecId<Opportunite>) {
    const m = combattants.find((c) => c.id === o.attaquant);
    const cible = combattants.find((c) => c.id === o.cible);
    const modele = m?.monstre ? bestiaire.find((b) => b.id === m.monstre) : undefined;
    if (!m || !cible) return;
    message = '';
    resultat = '';
    occupe = true;
    try {
      if (!modele) throw new RefusCombat(`${m.nom} : pas de fiche de bestiaire, son attaque se joue au journal.`);
      resultat = await opportuniteDeMonstre(idCombat, combat, o, m, cible, modele.attaques, armes, fiches.get(cible.perso ?? '') ?? null, combattants);
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
  const deMonstre = $derived(opportunites.filter((o) => combattants.find((c) => c.id === o.attaquant)?.genre === 'monstre'));
  const deJoueur = $derived(opportunites.filter((o) => combattants.find((c) => c.id === o.attaquant)?.genre === 'pj'));
</script>

{#if opportunites.length || recentes.length}
  <section class="carte reactions" aria-label="Réactions du round">
    <h2>Réactions</h2>
    {#each deMonstre as o (o.id)}
      <button disabled={occupe} onclick={() => frapper(o)}>Opportunité : {nomDe(o.attaquant)} sur {nomDe(o.cible)}</button>
    {/each}
    {#each deJoueur as o (o.id)}
      <p class="aide">{nomDe(o.attaquant)} peut frapper {nomDe(o.cible)} d’opportunité.</p>
    {/each}
    {#if resultat}<p role="status">{resultat}</p>{/if}
    {#if recentes.length}
      <ul aria-label="Demandes de réaction">
        {#each recentes as d (d.id)}
          <li class:refusee={d.statut === 'refusee'}>
            <strong>{nomDe(d.qui)}</strong>
            <span>{d.statut === 'attente' ? 'en cours…' : d.statut === 'refusee' ? `refusée : ${d.texte}` : (d.texte ?? 'jouée')}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </section>
{/if}

<style>
  .reactions {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h2 {
    font-size: 20px;
  }
  p {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  li {
    display: flex;
    flex-direction: column;
  }
  .refusee span {
    color: var(--couleur-danger);
  }
</style>
