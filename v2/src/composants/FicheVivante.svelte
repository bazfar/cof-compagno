<script lang="ts">
  import { appliquerChangement, enregistrerPortrait, messageErreurPerso, modifierNotes, modifierPieces, modifierPP, modifierPV, retirerPortrait } from '../lib/actions/persos';
  import { lireImage } from '../lib/battlemap/compression';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import { comprimerPortrait } from '../lib/fiche/portrait';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import * as E from '../lib/regles/equipement';
  import { SLOTS_EQUIPEMENT, type Slot } from '../lib/regles/fiche-calcul';
  import { LIMITE_NOTES, type Fiche } from '../lib/schemas/fiche';
  import Portrait from './Portrait.svelte';

  /*
   * Fiche vivante d'un personnage (lot L2.3). Tout ce qu'elle montre vient
   * de lib/fiche/vue-fiche.ts (pur, testé) ; chaque bloc se redessine seul
   * quand la fiche change dans Firestore, sans rafraîchir.
   *
   * Bug v1 corrigé : la fiche entière était redessinée à chaque événement,
   * ce qui effaçait la saisie en cours (notes, PV, bourse). Ici, un champ
   * en cours de saisie garde ce que l'on tape ; il n'est écrit qu'à la
   * validation, et ne reprend la valeur de la base que hors saisie.
   *
   * Écritures champ par champ (lib/actions/persos.ts). `modifiable` : le
   * propriétaire et le MJ (les règles Firestore le vérifient aussi).
   *
   * Onglet Équipement (L2.4) : chaque geste passe par regles/equipement.ts
   * (pur, testé) et s'écrit en une seule mise à jour des seuls champs
   * touchés. `mj` : le MJ seul ajoute des objets (décision 1a du 16/10).
   */

  let { fiche, modifiable, mj = false }: { fiche: AvecId<Fiche>; modifiable: boolean; mj?: boolean } = $props();

  const ONGLETS = ['Combat', 'Équipement', 'Caractéristiques', 'Capacités', 'Suivi', 'Notes'] as const;
  let onglet = $state<(typeof ONGLETS)[number]>('Combat');
  let message = $state('');

  const vue = $derived(vueFiche(fiche));
  const signe = (n: number | null) => (n === null ? '—' : n >= 0 ? `+${n}` : String(n));

  async function ecrire(p: Promise<unknown>) {
    message = '';
    try {
      await p;
    } catch (e) {
      message = messageErreurPerso(e);
    }
  }

  // ---- Champs en saisie : la base ne les écrase pas pendant qu'on tape ----
  let saisie = $state<string | null>(null);
  let valeurs = $state({ pv: '', pp: '', notes: '', or: '', argent: '', bronze: '' });
  $effect(() => {
    const v = {
      pv: String(vue.pv.actuel),
      pp: vue.pp ? String(vue.pp.actuel) : '',
      notes: fiche.notes ?? '',
      or: String(fiche.piecesOr),
      argent: String(fiche.piecesArgent),
      bronze: String(fiche.piecesBronze),
    };
    for (const k of Object.keys(v) as (keyof typeof v)[]) if (saisie !== k) valeurs[k] = v[k];
  });

  const pv = (n: number) => ecrire(modifierPV(fiche.id, n, vue.pv.max));
  const pp = (n: number) => vue.pp && ecrire(modifierPP(fiche.id, n, vue.pp.max));
  function bourse() {
    const n = (s: string) => Number.parseInt(s, 10) || 0;
    ecrire(modifierPieces(fiche.id, { piecesOr: n(valeurs.or), piecesArgent: n(valeurs.argent), piecesBronze: n(valeurs.bronze) }));
  }
  const valider = (ev: KeyboardEvent) => {
    if (ev.key === 'Enter') (ev.currentTarget as HTMLInputElement).blur();
  };

  async function changerPortrait(ev: Event) {
    const fichier = (ev.currentTarget as HTMLInputElement).files?.[0];
    if (!fichier) return;
    message = 'Compression du portrait…';
    try {
      await enregistrerPortrait(fiche.id, await comprimerPortrait(await lireImage(fichier)));
      message = '';
    } catch (e) {
      message = messageErreurPerso(e);
    }
  }

  // ---- Équipement et sac (L2.4) ----
  const sac = $derived(Object.entries(fiche.inventaire).sort(([, a], [, b]) => String(a.nom ?? '').localeCompare(String(b.nom ?? ''), 'fr')));
  const alertes = $derived(E.alertesMaitrise(fiche));
  let slotChoisi = $state<Record<string, string>>({});
  let objetAjoute = $state('');
  let quantiteAjoutee = $state(1);
  const catalogue = E.catalogueTrie();

  function geste(f: () => E.Changement, apres?: string) {
    message = '';
    try {
      const ch = f();
      ecrire(appliquerChangement(fiche.id, ch)).then(() => {
        if (apres && !message) message = apres;
      });
    } catch (e) {
      if (e instanceof E.RefusEquipement) message = e.message;
      else throw e;
    }
  }
  function utiliser(cle: string) {
    message = '';
    try {
      const u = E.utiliser(fiche, cle);
      ecrire(appliquerChangement(fiche.id, u.changement)).then(() => {
        if (!message) message = `${fiche.inventaire[cle]?.nom ?? 'Potion'} : ${u.formule} → ${u.jet.des.join(' + ')}${u.jet.bonus ? ` + ${u.jet.bonus}` : ''} = ${u.jet.total}, ${u.soin} PV rendus.`;
      });
    } catch (e) {
      if (e instanceof E.RefusEquipement) message = e.message;
      else throw e;
    }
  }
  function jeterTout(cle: string) {
    const o = fiche.inventaire[cle];
    if (o && confirm(`Jeter toute la pile de « ${o.nom} » ?`)) geste(() => E.jeter(fiche, cle, 'tout'));
  }
  const qte = (o: Record<string, unknown>) => (typeof o.quantite === 'number' ? o.quantite : 1);
  const estMainGaucheDeuxMains = (s: Slot) => s === 'main_gauche' && !!fiche.equipement.main_gauche?.deuxMains;

  const PIECES = [['or', 'Or'], ['argent', 'Argent'], ['bronze', 'Bronze']] as const;
  const pourcentPV = $derived(Math.max(0, Math.min(100, Math.round((100 * vue.pv.actuel) / Math.max(1, vue.pv.max)))));
</script>

<section class="carte fiche" aria-label={`Fiche de ${fiche.nom}`}>
  <header>
    <Portrait idPerso={fiche.id} nom={fiche.nom} taille={76} />
    <div class="identite">
      <h2>{fiche.nom}</h2>
      <p>{vue.titre} · dé de vie d{vue.deVie}</p>
      {#if modifiable}
        <div class="ligne">
          <label class="bouton-fichier">Changer le portrait <input type="file" accept="image/*" onchange={changerPortrait} /></label>
          <button class="discret petit" onclick={() => ecrire(retirerPortrait(fiche.id))}>Retirer</button>
        </div>
      {/if}
    </div>
  </header>

  <nav aria-label="Sections de la fiche">
    {#each ONGLETS as o (o)}
      <button class="onglet" class:actif={onglet === o} aria-current={onglet === o ? 'page' : undefined} onclick={() => (onglet = o)}>{o}</button>
    {/each}
  </nav>

  {#if message}<p class="message" role="status">{message}</p>{/if}

  {#if onglet === 'Combat'}
    <div class="ressources">
      <div class="ressource">
        <span class="etiquette">PV</span>
        <div class="barre" aria-hidden="true"><span style:width="{pourcentPV}%" class:bas={pourcentPV <= 25}></span></div>
        {#if modifiable}
          <div class="ligne">
            <button class="petit" aria-label="Retirer un PV" onclick={() => pv(vue.pv.actuel - 1)}>−</button>
            <input
              aria-label="PV actuels"
              inputmode="numeric"
              bind:value={valeurs.pv}
              onfocus={() => (saisie = 'pv')}
              onblur={() => {
                saisie = null;
                pv(Number.parseInt(valeurs.pv, 10) || 0);
              }}
              onkeydown={valider}
            />
            <span>/ {vue.pv.max}</span>
            <button class="petit" aria-label="Ajouter un PV" onclick={() => pv(vue.pv.actuel + 1)}>+</button>
          </div>
        {:else}
          <strong>{vue.pv.actuel} / {vue.pv.max}</strong>
        {/if}
      </div>
      {#if vue.pp}
        <div class="ressource">
          <span class="etiquette">PP</span>
          {#if modifiable}
            <div class="ligne">
              <button class="petit" aria-label="Retirer un PP" onclick={() => pp(vue.pp!.actuel - 1)}>−</button>
              <input
                aria-label="PP actuels"
                inputmode="numeric"
                bind:value={valeurs.pp}
                onfocus={() => (saisie = 'pp')}
                onblur={() => {
                  saisie = null;
                  pp(Number.parseInt(valeurs.pp, 10) || 0);
                }}
                onkeydown={valider}
              />
              <span>/ {vue.pp.max}</span>
              <button class="petit" aria-label="Ajouter un PP" onclick={() => pp(vue.pp!.actuel + 1)}>+</button>
            </div>
          {:else}
            <strong>{vue.pp.actuel} / {vue.pp.max}</strong>
          {/if}
        </div>
      {/if}
    </div>
    <dl class="stats">
      <div><dt>CA</dt><dd data-testid="ca">{vue.stats.ca}</dd></div>
      <div><dt>Initiative</dt><dd>{vue.stats.initiative}</dd></div>
      <div><dt>Contact</dt><dd>{signe(vue.stats.attaque.contact)}</dd></div>
      <div><dt>Distance</dt><dd>{signe(vue.stats.attaque.distance)}</dd></div>
      {#if vue.stats.attaque.magique !== null}<div><dt>Magique</dt><dd>{signe(vue.stats.attaque.magique)}</dd></div>{/if}
      {#if vue.stats.reductionDegats}<div><dt>Réduction</dt><dd>{vue.stats.reductionDegats}</dd></div>{/if}
      {#each Object.entries(vue.stats.sauvegardes) as [n, v] (n)}<div><dt>{n}</dt><dd>{signe(v)}</dd></div>{/each}
    </dl>
    {#if vue.pointsCercle.length}
      <p>Points de Cercle : {vue.pointsCercle.map((c) => `${c.nom} ${c.actuel}/${c.max}`).join(' · ')}</p>
    {/if}
  {:else if onglet === 'Équipement'}
    {#if alertes.length}<ul class="alertes">{#each alertes as a (a)}<li>⚠ {a}</li>{/each}</ul>{/if}
    <div class="emplacements">
      {#each SLOTS_EQUIPEMENT as s (s)}
        {@const o = fiche.equipement[s]}
        <div class="emplacement" class:vide={!o}>
          <span class="aide">{E.LIBELLES_SLOT[s]}</span>
          {#if o && estMainGaucheDeuxMains(s)}
            <span class="aide">(arme à deux mains)</span>
          {:else if o}
            <strong style:color={E.couleurRarete(o)}>{o.nom}</strong>
            {#each E.effetsObjet(o) as e (e)}<span class="effet">{e}</span>{/each}
            {#if modifiable}<button class="discret petit" aria-label={`Retirer ${o.nom}`} onclick={() => geste(() => E.desequiper(fiche, s))}>Retirer</button>{/if}
          {:else}
            <span class="aide">—</span>
          {/if}
        </div>
      {/each}
    </div>

    <h3>Sac</h3>
    {#if sac.length === 0}<p class="aide">Le sac est vide.</p>{/if}
    <ul class="rangs" aria-label="Sac">
      {#each sac as [cle, o] (cle)}
        {@const slots = E.slotsPourObjet(o)}
        <li>
          <strong style:color={E.couleurRarete(o)}>{o.nom}</strong>
          {#if qte(o) > 1}<span class="badge">×{qte(o)}</span>{/if}
          {#if o.rareteNom}<span class="aide">{o.rareteNom}</span>{/if}
          {#each E.effetsObjet(o) as e (e)}<span class="effet">{e}</span>{/each}
          {#if modifiable}
            <span class="ligne actions-objet">
              {#if slots.length > 1 && !o.deuxMains}
                <select aria-label={`Emplacement pour ${o.nom}`} value={slotChoisi[cle] ?? ''} onchange={(ev) => (slotChoisi[cle] = ev.currentTarget.value)}>
                  <option value="">Emplacement libre</option>
                  {#each slots as s (s)}<option value={s}>{E.LIBELLES_SLOT[s]}</option>{/each}
                </select>
              {/if}
              {#if slots.length}
                <button class="petit" aria-label={`Équiper ${o.nom}`} onclick={() => geste(() => E.equiper(fiche, cle, (slotChoisi[cle] || undefined) as Slot | undefined))}>Équiper</button>
              {/if}
              {#if E.formuleSoin(o)}
                <button class="petit" aria-label={`Utiliser ${o.nom}`} onclick={() => utiliser(cle)}>Utiliser</button>
              {/if}
              <button class="discret petit" aria-label={`Jeter un ${o.nom}`} onclick={() => geste(() => E.jeter(fiche, cle, 'un'))}>{qte(o) > 1 ? 'Jeter 1' : 'Jeter'}</button>
              {#if qte(o) > 1}<button class="discret petit" aria-label={`Jeter toute la pile de ${o.nom}`} onclick={() => jeterTout(cle)}>Jeter tout</button>{/if}
            </span>
          {/if}
        </li>
      {/each}
    </ul>

    {#if mj}
      <h3>Ajouter un objet (MJ)</h3>
      <div class="ligne">
        <select aria-label="Objet du catalogue" bind:value={objetAjoute}>
          <option value="">Choisir dans le catalogue…</option>
          {#each catalogue as c (c.id)}<option value={c.id}>{c.nom} ({c.type})</option>{/each}
        </select>
        <input aria-label="Quantité" class="quantite" type="number" min="1" max="99" bind:value={quantiteAjoutee} />
        <button
          disabled={!objetAjoute}
          onclick={() => {
            const id = objetAjoute;
            geste(() => E.ajouterDuCatalogue(fiche, id, quantiteAjoutee), 'Objet ajouté au sac.');
            objetAjoute = '';
            quantiteAjoutee = 1;
          }}>Ajouter</button>
      </div>
    {/if}
  {:else if onglet === 'Caractéristiques'}
    <div class="caracs">
      {#each vue.caracs as c (c.code)}
        <div class="carac">
          <span class="code">{c.code}</span>
          <strong>{signe(c.mod)}</strong>
          <span class="aide">valeur {c.valeur}</span>
          <ul>
            {#each vue.competences.filter((k) => k.carac === c.code) as k (k.nom)}<li>{k.nom} <strong>{signe(k.mod)}</strong></li>{/each}
          </ul>
        </div>
      {/each}
    </div>
  {:else if onglet === 'Capacités'}
    {#each vue.voies as v (v.id)}
      <h3>{v.nom} {#if v.horsProfil}<span class="badge">hors profil</span>{/if}{#if v.chaos}<span class="badge">chaos</span>{/if}</h3>
      <ol class="rangs">
        {#each v.rangs as r (r.rang)}
          <li><strong>{r.rang}. {r.nom}</strong>{#if r.choix}<span class="badge">{r.choix}</span>{/if}{#if r.offert}<span class="badge">offert</span>{/if}<span class="effet">{r.effet}</span></li>
        {/each}
      </ol>
    {/each}
    {#if vue.race}
      <h3>{vue.race.nom}</h3>
      {#if vue.race.traitPassif}<p class="aide">{vue.race.traitPassif}</p>{/if}
      <ol class="rangs">
        {#each vue.race.rangs as r (r.rang)}
          <li><strong>{r.rang}. {r.nom}</strong>{#if r.choix}<span class="badge">{r.choix}</span>{/if}<span class="effet">{r.effet}</span></li>
        {/each}
      </ol>
    {/if}
    {#if vue.dons.length || vue.donsManquants}
      <h3>Dons</h3>
      <ul class="rangs">
        {#each vue.dons as d (d.id)}<li><strong>{d.nom}</strong>{#if d.choix}<span class="badge">{d.choix}</span>{/if}<span class="effet">{d.effet}</span></li>{/each}
      </ul>
      {#if vue.donsManquants}<p class="alerte">{vue.donsManquants} don(s) à choisir (montée de niveau, L2.5).</p>{/if}
    {/if}
  {:else if onglet === 'Suivi'}
    <h3>Bourse</h3>
    <div class="ligne bourse">
      {#each PIECES as [cle, nom] (cle)}
        <label>
          {nom}
          <input
            aria-label={`Pièces d'${nom.toLowerCase()}`}
            inputmode="numeric"
            disabled={!modifiable}
            bind:value={valeurs[cle]}
            onfocus={() => (saisie = cle)}
            onblur={() => {
              saisie = null;
              bourse();
            }}
            onkeydown={valider}
          />
        </label>
      {/each}
    </div>
    <dl class="stats">
      <div><dt>Corruption majeure</dt><dd>{vue.corruptionMajeure}</dd></div>
      <div><dt>Âmes stockées</dt><dd>{vue.amesStockees}</dd></div>
    </dl>
    {#if vue.mutations.length}
      <h3>Mutations</h3>
      <ul class="rangs">{#each vue.mutations as m, i (i)}<li><strong>{m.nom}</strong> <span class="aide">palier {m.palier}</span><span class="effet">{m.effet}</span></li>{/each}</ul>
    {/if}
  {:else}
    <label class="notes">
      Notes
      <textarea
        aria-label="Notes"
        rows="10"
        maxlength={LIMITE_NOTES}
        disabled={!modifiable}
        bind:value={valeurs.notes}
        onfocus={() => (saisie = 'notes')}
        onblur={() => {
          saisie = null;
          if (valeurs.notes !== (fiche.notes ?? '')) ecrire(modifierNotes(fiche.id, valeurs.notes));
        }}
      ></textarea>
    </label>
  {/if}
</section>

<style>
  .fiche {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  header {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  header p {
    margin: 4px 0;
    color: var(--couleur-encre-douce);
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .onglet,
  .discret {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .onglet.actif {
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .petit {
    min-height: 32px;
    padding: 0 10px;
  }
  .bouton-fichier {
    font-size: 13px;
    color: var(--couleur-accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .bouton-fichier input {
    display: none;
  }
  .ressources {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }
  .ressource {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 14px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .etiquette {
    font-weight: 700;
    color: var(--couleur-accent);
  }
  .barre {
    height: 10px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-danger-pale);
    overflow: hidden;
  }
  .barre span {
    display: block;
    height: 100%;
    background: var(--couleur-succes);
  }
  .barre span.bas {
    background: var(--couleur-danger);
  }
  .ressource input {
    width: 72px;
    text-align: center;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
    margin: 0;
  }
  .stats div {
    padding: 8px 10px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .stats dt {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .stats dd {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }
  .caracs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
  }
  .carac {
    padding: 10px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .carac .code {
    font-weight: 700;
    color: var(--couleur-accent);
    margin-right: 8px;
  }
  .carac ul {
    margin: 6px 0 0;
    padding-left: 18px;
    font-size: 14px;
  }
  h3 {
    font-size: 17px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .rangs {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rangs li {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 8px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .effet {
    flex-basis: 100%;
    font-size: 14px;
    color: var(--couleur-encre-douce);
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-or);
    color: #fff;
  }
  .alerte,
  .message {
    color: var(--couleur-or-texte);
    margin: 0;
  }
  .alertes {
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--couleur-or-texte);
  }
  .emplacements {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 8px;
  }
  .emplacement {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .emplacement.vide {
    opacity: 0.7;
  }
  .emplacement .effet {
    flex-basis: auto;
  }
  .actions-objet {
    flex-basis: 100%;
  }
  .quantite {
    width: 80px;
  }
  select {
    min-height: 36px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure);
    background: var(--couleur-surface-claire);
    padding: 0 8px;
  }
  .bourse label,
  .notes {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bourse input {
    width: 100px;
  }
  textarea {
    font: inherit;
    padding: 10px 12px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure);
    background: var(--couleur-surface-claire);
    resize: vertical;
  }
</style>
