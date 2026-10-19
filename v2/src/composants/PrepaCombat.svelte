<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { creerRencontre, enregistrerRencontre, envoyerButin, lancerRencontre, RefusRencontre, supprimerRencontre, COULEUR_MONSTRE } from '../lib/actions/rencontres';
  import { correspond } from '../lib/bestiaire/bestiaire';
  import { catalogueScenes } from '../lib/battlemap/scenes';
  import type { Case } from '../lib/battlemap/geometrie';
  import type { JetonAffiche } from '../lib/battlemap/rendu';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import { suivreBestiaire, suivreEquilibrage } from '../lib/magasins/bestiaire.svelte';
  import { suivreScenesImportees, suivreTable } from '../lib/magasins/carte.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { suivreRencontres } from '../lib/magasins/rencontres.svelte';
  import { suivreSeances } from '../lib/magasins/seances.svelte';
  import { catalogueTrie } from '../lib/regles/equipement';
  import {
    ajouterMonstres,
    budgetRencontre,
    coutRencontre,
    groupe,
    LIBELLES_VERDICT,
    manquePourLancer,
    placerLesNonPlaces,
    verdict,
  } from '../lib/rencontres/rencontre';
  import type { BrouillonRencontre, Rencontre } from '../lib/schemas/rencontre';
  import type { GeometrieScene } from '../lib/schemas/scene';
  import { session } from '../lib/session.svelte';
  import ApercuScene from './ApercuScene.svelte';

  /*
   * Prépa combat du MJ (lot L3.5, décisions du 19/10/2026). Une rencontre
   * = une scène, des monstres du bestiaire placés d'avance sur la carte
   * (aperçu que le MJ seul voit), une jauge d'équilibrage (celle de la v1)
   * et le butin prévu. « Lancer » montre la scène à la table et y pose les
   * monstres ; « Envoyer le butin au vote » le met au vote (L3.4). Le
   * combat (initiative, tours, PV et états des monstres) vient en L6.
   *
   * L'édition se fait sur un brouillon local que la base n'écrase jamais
   * tant qu'il a des modifications non enregistrées.
   */

  const rencontres = suivreRencontres(session.table);
  const bestiaire = suivreBestiaire(session.table);
  const equilibrage = suivreEquilibrage(session.table);
  const table = suivreTable(session.table);
  const seances = suivreSeances(session.table);
  const joueurs = suivreJoueurs(session.table);
  const persos = suivrePersos(session.table);
  const importees = suivreScenesImportees(session.table);
  onDestroy(() => {
    for (const s of [rencontres, bestiaire, equilibrage, table, seances, joueurs, persos, importees]) s.arreter();
  });

  const liste = $derived([...rencontres.etat.elements].sort((a, b) => b.majLe - a.majLe));
  const monstresParId = $derived(new Map(bestiaire.etat.elements.map((m) => [m.id, m])));
  const monstresTries = $derived([...bestiaire.etat.elements].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
  const catalogue = catalogueTrie();
  const nomObjet = new Map(catalogue.map((c) => [c.id, c.nom]));
  const nomScene = (id: string | null) =>
    id === null ? 'sans scène' : (catalogueScenes.find((s) => s.id === id)?.nom ?? importees.etat.elements.find((s) => s.id === id)?.nom ?? id);

  // ---------- Rencontre choisie et brouillon ----------
  let choisie = $state<string | null>(null);
  let brouillon = $state<BrouillonRencontre | null>(null);
  let modifie = $state(false);
  const source = $derived(liste.find((r) => r.id === choisie) ?? null);
  // $state.snapshot : une copie ordinaire (les objets du magasin sont des proxys Svelte).
  const copie = (r: Rencontre): BrouillonRencontre => $state.snapshot({ nom: r.nom, scene: r.scene, monstres: r.monstres, butin: r.butin });

  function choisir(id: string) {
    if (modifie && !confirm('Des modifications ne sont pas enregistrées. Les abandonner ?')) return;
    choisie = id;
    modifie = false;
    brouillon = null;
    message = '';
  }
  // La base ne remplace le brouillon que s'il n'a pas de modifications en cours.
  $effect(() => {
    const r = source;
    if (!r) {
      brouillon = null;
      return;
    }
    if (!modifie) brouillon = copie(r);
  });
  function changer(f: (b: BrouillonRencontre) => BrouillonRencontre) {
    if (!brouillon) return;
    brouillon = f(brouillon);
    modifie = true;
  }

  // ---------- Placement ----------
  let geometrieChargee = $state<{ id: string; colonnes: number; lignes: number } | null>(null);
  function chargee(g: GeometrieScene) {
    geometrieChargee = { id: g.id, colonnes: g.colonnes, lignes: g.lignes };
  }
  // Les monstres non placés (ajoutés, ou après un changement de scène) le
  // sont dès que la carte est connue ; le MJ les déplace ensuite.
  $effect(() => {
    const b = brouillon;
    const g = geometrieChargee;
    if (!b || !g || g.id !== b.scene) return;
    const places = placerLesNonPlaces(b.monstres, g);
    if (places.some((m, i) => m !== b.monstres[i])) changer((x) => ({ ...x, monstres: places }));
  });
  function changerScene(scene: string) {
    changer((b) => ({ ...b, scene: scene || null, monstres: b.monstres.map((m) => ({ ...m, cx: null, cy: null })) }));
  }
  const jetonsApercu: JetonAffiche[] = $derived(
    (brouillon?.monstres ?? [])
      .filter((m) => m.cx !== null && m.cy !== null)
      .map((m) => ({ id: m.cle, genre: 'monstre' as const, nom: m.nom, couleur: COULEUR_MONSTRE, cx: m.cx as number, cy: m.cy as number })),
  );
  function deplacer(cle: string, vers: Case) {
    changer((b) => ({ ...b, monstres: b.monstres.map((m) => (m.cle === cle ? { ...m, cx: vers.cx, cy: vers.cy } : m)) }));
  }

  // ---------- Monstres ----------
  let recherche = $state('');
  let monstreChoisi = $state('');
  let combienMonstres = $state(1);
  const proposes = $derived(recherche.trim() ? monstresTries.filter((m) => correspond(m, recherche)) : monstresTries);
  function ajouterMonstre() {
    const m = monstresParId.get(monstreChoisi);
    if (!m) return;
    changer((b) => ajouterMonstres(b, m.id, m.nom, Number(combienMonstres) || 1));
    combienMonstres = 1;
  }

  // ---------- Jauge ----------
  const niveaux = $derived.by(() => {
    const ouverte = table.etat.donnees?.seanceOuverte ?? null;
    const presents = ouverte ? new Set(seances.etat.elements.find((s) => s.id === ouverte.id)?.presents ?? []) : null;
    const fiches = new Map(persos.etat.elements.map((p) => [p.id, p]));
    return joueurs.etat.elements
      .filter((j) => j.persoActif && (!presents || presents.has(j.id)))
      .map((j) => fiches.get(j.persoActif ?? '')?.niveau)
      .filter((n): n is number => typeof n === 'number');
  });
  const sourceGroupe = $derived(table.etat.donnees?.seanceOuverte ? 'présents de la séance' : 'personnages joués');
  const g = $derived(groupe(niveaux));
  const inconnus = $derived((brouillon?.monstres ?? []).filter((m) => !monstresParId.has(m.monstre)).length);
  const cout = $derived.by(() => {
    const eq = equilibrage.etat.donnees;
    if (!eq || !brouillon) return null;
    const peses = brouillon.monstres.map((m) => monstresParId.get(m.monstre)).filter((m) => !!m).map((m) => ({ dangerosite: m.dangerosite, role: m.role }));
    return coutRencontre(peses, eq);
  });
  const budget = $derived(budgetRencontre(g.nbPJ, g.niveauMoyen));
  const jugement = $derived(cout === null ? null : verdict(cout, budget));
  const partJauge = $derived(cout === null || budget <= 0 ? 0 : Math.min(100, Math.round((100 * cout) / (2 * budget))));

  // ---------- Butin prévu ----------
  let objetPrevu = $state('');
  let combienObjet = $state(1);
  function ajouterObjet() {
    const id = objetPrevu;
    if (!id) return;
    changer((b) => ({ ...b, butin: [...b.butin, { objet: id, combien: Math.max(1, Math.min(99, Math.round(Number(combienObjet) || 1))) }] }));
    objetPrevu = '';
    combienObjet = 1;
  }

  // ---------- Actions ----------
  let nomNouvelle = $state('');
  let message = $state('');
  let enCours = $state(false);
  async function faire(f: () => Promise<unknown>, apres?: string) {
    enCours = true;
    message = '';
    try {
      await f();
      if (apres) message = apres;
    } catch (e) {
      message = e instanceof RefusRencontre ? e.message : messageErreurPerso(e);
    } finally {
      enCours = false;
    }
  }
  function creer() {
    const nom = nomNouvelle.trim() || 'Nouvelle rencontre';
    void faire(async () => {
      const id = await creerRencontre(nom);
      nomNouvelle = '';
      modifie = false;
      choisie = id;
    });
  }
  async function enregistrer(): Promise<Rencontre | null> {
    if (!source || !brouillon) return null;
    const avant: Rencontre = source;
    const b = $state.snapshot(brouillon);
    await enregistrerRencontre(source.id, avant, b);
    modifie = false;
    return { ...avant, ...b };
  }
  function lancer() {
    if (!source || !brouillon) return;
    const manque = manquePourLancer(brouillon);
    if (manque) return void (message = manque);
    if (!confirm(`Montrer « ${nomScene(brouillon.scene)} » à la table et y poser ${brouillon.monstres.length} monstre(s) ?`)) return;
    const id = source.id;
    void faire(async () => {
      const r = (modifie ? await enregistrer() : source) as Rencontre;
      const n = await lancerRencontre(id, r);
      message = `Rencontre lancée : ${n} monstre(s) sur « ${nomScene(r.scene)} ». La scène est montrée à la table.`;
    });
  }
  function butin() {
    if (!source) return;
    if (modifie) return void (message = 'Enregistre d’abord la rencontre.');
    if (source.butinEnvoyeLe && !confirm('Ce butin a déjà été envoyé au vote. L’envoyer encore ?')) return;
    const r = source;
    void faire(async () => {
      const n = await envoyerButin(r.id, r);
      message = `${n} objet(s) mis au vote : la table les voit dans « Butin ».`;
    });
  }
  function supprimer() {
    if (!source || !confirm(`Supprimer la rencontre « ${source.nom} » ? Les monstres déjà posés restent sur la carte.`)) return;
    const id = source.id;
    void faire(async () => {
      await supprimerRencontre(id);
      choisie = null;
      modifie = false;
    });
  }
  const etiquette = (r: AvecId<Rencontre>) => `${r.monstres.length} monstre(s) · ${nomScene(r.scene)}${r.statut === 'lancee' ? ' · lancée' : ''}`;
</script>

<div class="prepa">
  <aside class="carte liste" aria-label="Rencontres préparées">
    <h2>Rencontres</h2>
    <div class="ligne">
      <input aria-label="Nom de la nouvelle rencontre" placeholder="Nom de la rencontre" maxlength="80" bind:value={nomNouvelle} />
      <button class="petit" disabled={enCours} onclick={creer}>Créer</button>
    </div>
    {#if rencontres.etat.erreur}
      <p class="erreur" role="alert">{rencontres.etat.erreur}</p>
    {:else if !rencontres.etat.pret}
      <p>Chargement…</p>
    {:else if liste.length === 0}
      <p class="aide">Aucune rencontre préparée.</p>
    {:else}
      <ul>
        {#each liste as r (r.id)}
          <li>
            <button class="lien" aria-pressed={r.id === choisie} onclick={() => choisir(r.id)}>
              <strong>{r.nom}</strong>
              <span class="aide">{etiquette(r)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>

  {#if source && brouillon}
    <section class="carte editeur" aria-label={`Rencontre ${source.nom}`}>
      <div class="ligne tete">
        <input class="nom" aria-label="Nom de la rencontre" maxlength="80" value={brouillon.nom} oninput={(e) => changer((b) => ({ ...b, nom: e.currentTarget.value }))} />
        <select aria-label="Scène" value={brouillon.scene ?? ''} onchange={(e) => changerScene(e.currentTarget.value)}>
          <option value="">Choisir une scène…</option>
          <optgroup label="Catalogue">
            {#each catalogueScenes as s (s.id)}<option value={s.id}>{s.nom} ({s.colonnes} × {s.lignes})</option>{/each}
          </optgroup>
          {#if importees.etat.elements.length}
            <optgroup label="Importées">
              {#each importees.etat.elements as s (s.id)}<option value={s.id}>{s.nom} ({s.colonnes} × {s.lignes})</option>{/each}
            </optgroup>
          {/if}
        </select>
        <span class="espace"></span>
        {#if modifie}<span class="pastille">modifiée</span>{/if}
        <button class="petit" disabled={!modifie || enCours} onclick={() => faire(enregistrer, 'Rencontre enregistrée.')}>Enregistrer</button>
        <button class="petit discret" disabled={!modifie || enCours} onclick={() => { modifie = false; brouillon = copie(source); }}>Annuler les modifications</button>
      </div>

      <div class="jauge" aria-label="Équilibrage">
        {#if !equilibrage.etat.donnees}
          <p class="aide">Importe le bestiaire (Données › Imports) pour la jauge d’équilibrage.</p>
        {:else if g.nbPJ === 0}
          <p class="aide">Aucun personnage joué : la jauge compare la rencontre au groupe.</p>
        {:else}
          <div class="barre" aria-hidden="true"><span class={jugement ?? 'vide'} style:width="{partJauge}%"></span><i></i></div>
          <p>
            <strong>{jugement ? LIBELLES_VERDICT[jugement] : '—'}</strong>
            · {cout} Pm pour un budget de {budget} Pm ({g.nbPJ} PJ de niveau moyen {g.niveauMoyen}, {sourceGroupe})
          </p>
          <p class="aide">Repère de la v1 : le budget correspond à une rencontre sérieuse (la moitié des ressources, un ou deux PJ à terre).</p>
        {/if}
        {#if inconnus}<p class="erreur">{inconnus} monstre(s) absent(s) du bestiaire : ils ne comptent pas dans la jauge.</p>{/if}
      </div>

      <div class="corps">
        <div class="colonne">
          <h3>Monstres ({brouillon.monstres.length})</h3>
          <div class="ligne">
            <input aria-label="Chercher un monstre" placeholder="Chercher…" bind:value={recherche} />
            <select aria-label="Monstre du bestiaire" bind:value={monstreChoisi}>
              <option value="">{bestiaire.etat.elements.length ? `Choisir (${proposes.length})…` : 'Bestiaire vide'}</option>
              {#each proposes as m (m.id)}<option value={m.id}>{m.nom} (D{m.dangerosite}, {m.role})</option>{/each}
            </select>
            <input aria-label="Nombre de monstres" class="quantite" type="number" min="1" max="60" bind:value={combienMonstres} />
            <button class="petit" disabled={!monstreChoisi || brouillon.monstres.length >= 60} aria-label="Ajouter les monstres" onclick={ajouterMonstre}>Ajouter</button>
          </div>
          <ul class="rangs" aria-label="Monstres de la rencontre">
            {#each brouillon.monstres as m (m.cle)}
              {@const fiche = monstresParId.get(m.monstre)}
              <li>
                <input aria-label={`Nom affiché de ${m.cle}`} maxlength="40" value={m.nom} oninput={(e) => { const v = e.currentTarget.value; changer((b) => ({ ...b, monstres: b.monstres.map((x) => (x.cle === m.cle ? { ...x, nom: v } : x)) })); }} />
                <span class="aide">{fiche ? `D${fiche.dangerosite} · ${fiche.role}${fiche.boss ? ' · boss' : ''}` : 'absent du bestiaire'}</span>
                <span class="aide">{m.cx === null ? 'non placé' : `case ${m.cx}, ${m.cy}`}</span>
                <span class="espace"></span>
                <button class="discret petit" aria-label={`Retirer ${m.nom}`} onclick={() => changer((b) => ({ ...b, monstres: b.monstres.filter((x) => x.cle !== m.cle) }))}>Retirer</button>
              </li>
            {/each}
          </ul>

          <h3>Butin prévu</h3>
          <div class="ligne">
            <select aria-label="Objet prévu" bind:value={objetPrevu}>
              <option value="">Choisir dans le catalogue…</option>
              {#each catalogue as c (c.id)}<option value={c.id}>{c.nom} ({c.type})</option>{/each}
            </select>
            <input aria-label="Nombre d’objets" class="quantite" type="number" min="1" max="99" bind:value={combienObjet} />
            <button class="petit" disabled={!objetPrevu || brouillon.butin.length >= 30} aria-label="Ajouter au butin prévu" onclick={ajouterObjet}>Ajouter</button>
          </div>
          <ul class="rangs" aria-label="Butin prévu">
            {#each brouillon.butin as b, i (i)}
              <li>
                <span>{nomObjet.get(b.objet) ?? b.objet}{b.combien > 1 ? ` ×${b.combien}` : ''}</span>
                <span class="espace"></span>
                <button class="discret petit" aria-label={`Retirer ${nomObjet.get(b.objet) ?? b.objet} du butin`} onclick={() => changer((x) => ({ ...x, butin: x.butin.filter((_, j) => j !== i) }))}>Retirer</button>
              </li>
            {/each}
          </ul>
          {#if source.butinEnvoyeLe}<p class="aide">Butin déjà envoyé au vote.</p>{/if}
        </div>

        <div class="colonne">
          <h3>Placement <span class="aide">(aperçu que toi seul vois ; glisse les monstres)</span></h3>
          {#if brouillon.scene}
            {#key brouillon.scene}
              <ApercuScene scene={brouillon.scene} jetons={jetonsApercu} surDeplacement={deplacer} surChargee={chargee} />
            {/key}
          {:else}
            <p class="vide">Choisis une scène pour placer les monstres.</p>
          {/if}
        </div>
      </div>

      <div class="ligne actions">
        <button disabled={enCours} onclick={lancer}>{source.statut === 'lancee' ? 'Relancer (reposer les monstres)' : 'Lancer la rencontre'}</button>
        <button class="discret" disabled={enCours || brouillon.butin.length === 0} onclick={butin}>Envoyer le butin au vote</button>
        <span class="espace"></span>
        <button class="discret" disabled={enCours} onclick={supprimer}>Supprimer</button>
      </div>
      {#if message}<p class="message" role="status">{message}</p>{/if}
    </section>
  {:else}
    <section class="carte editeur vide-editeur">
      <p class="aide">Choisis une rencontre, ou crée-en une.</p>
      {#if message}<p class="message" role="status">{message}</p>{/if}
    </section>
  {/if}
</div>

<style>
  .prepa {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .liste,
  .editeur {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    font-size: 20px;
  }
  h3 {
    font-size: 16px;
    margin: 6px 0 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lien {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-height: 0;
    padding: 6px 10px;
    background: var(--couleur-surface-claire);
    color: var(--couleur-encre);
    border: 1px solid var(--couleur-bordure-douce);
    font-weight: 400;
    text-align: left;
  }
  .lien[aria-pressed='true'] {
    border-color: var(--couleur-accent-clair);
    background: var(--couleur-accent-pale);
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }
  .tete .nom {
    font-size: 18px;
    font-weight: 600;
    min-width: 240px;
  }
  .espace {
    flex: 1 1 auto;
  }
  .corps {
    display: grid;
    grid-template-columns: minmax(320px, 1fr) minmax(0, 1.6fr);
    gap: 16px;
    align-items: start;
  }
  .colonne {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .rangs li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    padding: 4px 8px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .rangs input {
    width: 170px;
  }
  .quantite {
    width: 70px;
  }
  select {
    min-height: 36px;
    max-width: 100%;
  }
  .jauge p {
    margin: 4px 0 0;
  }
  .barre {
    position: relative;
    height: 10px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
    overflow: hidden;
  }
  .barre span {
    display: block;
    height: 100%;
    background: var(--couleur-accent);
  }
  .barre span.dure,
  .barre span.mortelle {
    background: var(--couleur-danger);
  }
  /* Repère du budget (rencontre sérieuse), au milieu de la barre. */
  .barre i {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--couleur-encre);
  }
  .pastille {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    border: 1px solid var(--couleur-accent-clair);
    background: var(--couleur-accent-pale);
  }
  .petit {
    min-height: 32px;
    padding: 0 10px;
  }
  .discret {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .vide {
    min-height: 240px;
    margin: 0;
    display: grid;
    place-items: center;
    border-radius: var(--rayon-carte);
    border: 1px dashed var(--couleur-bordure);
    color: var(--couleur-encre-douce);
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
    font-weight: 400;
  }
  .message {
    margin: 0;
    font-size: 14px;
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
