<script lang="ts">
  import { onDestroy } from 'svelte';
  import { enregistrerFicheLore, supprimerFicheLore } from '../lib/actions/lore';
  import { messageErreurPerso } from '../lib/actions/persos';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import { nouvelIdFiche, nouvelIdPassage, trierParCategorie } from '../lib/lore/fiche';
  import { normaliser } from '../lib/lore/vus';
  import { suivreLoreMj } from '../lib/magasins/lore.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { schemaFicheLoreMj, type FicheLoreMj, type Visibilite } from '../lib/schemas/lore';
  import { session } from '../lib/session.svelte';

  /*
   * Lore côté MJ (lot L2.7b, maquette validée le 18/10/2026) : toutes les
   * fiches, passages scellés compris. Le MJ décide qui voit chaque fiche
   * (personne, certains joueurs, tous) et scelle ou descelle chaque
   * passage d'un clic : la version joueurs est réécrite aussitôt
   * (lib/actions/lore.ts), et les joueurs la voient sans rafraîchir.
   *
   * Édition : un brouillon local, enregistré d'un coup. Une mise à jour
   * venue de la base ne l'écrase jamais pendant qu'on tape. À
   * l'enregistrement, visibilité et lecteurs sont repris de la fiche telle
   * qu'elle est en base (ils se règlent hors édition, d'un clic).
   * Une nouvelle fiche naît visible du MJ seul : on la partage ensuite.
   */

  const lore = suivreLoreMj(session.table);
  const joueurs = suivreJoueurs(session.table);
  onDestroy(() => {
    lore.arreter();
    joueurs.arreter();
  });

  let recherche = $state('');
  let choisie = $state<string | null>(null);
  let message = $state('');
  let erreur = $state('');

  const filtrees = $derived.by(() => {
    const q = normaliser(recherche.trim());
    if (!q) return lore.etat.elements;
    return lore.etat.elements.filter((f) =>
      normaliser([f.titre, f.sousTitre ?? '', f.categorie, ...f.etiquettes, ...f.passages.flatMap((p) => [p.intertitre ?? '', p.texte])].join(' ')).includes(q),
    );
  });
  const groupes = $derived(trierParCategorie(filtrees));
  const categories = $derived([...new Set(lore.etat.elements.map((f) => f.categorie))].sort((a, b) => a.localeCompare(b, 'fr')));
  const ouverte = $derived(lore.etat.elements.find((f) => f.id === choisie) ?? null);
  const triesJoueurs = $derived([...joueurs.etat.elements].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
  const nomJoueur = (uid: string) => joueurs.etat.elements.find((j) => j.id === uid)?.nom ?? 'joueur parti';
  const partage = (f: FicheLoreMj) =>
    f.visibilite === 'tous' ? 'tous' : f.visibilite === 'certains' && f.lecteurs.length ? f.lecteurs.map(nomJoueur).join(', ') : 'MJ seul';

  async function ecrire(id: string, avant: FicheLoreMj | null, apres: FicheLoreMj, succes = '') {
    erreur = '';
    message = '';
    try {
      await enregistrerFicheLore(id, avant, apres);
      message = succes;
      return true;
    } catch (e) {
      erreur = messageErreurPerso(e);
      return false;
    }
  }
  const sansId = (f: AvecId<FicheLoreMj>): FicheLoreMj => {
    const { id: _id, ...reste } = f;
    return reste;
  };

  // ---- Partage et sceaux, d'un clic ----
  function visibilite(f: AvecId<FicheLoreMj>, v: Visibilite) {
    if (f.visibilite === v) return;
    void ecrire(f.id, sansId(f), { ...sansId(f), visibilite: v });
  }
  function lecteur(f: AvecId<FicheLoreMj>, uid: string, coche: boolean) {
    const lecteurs = coche ? [...new Set([...f.lecteurs, uid])] : f.lecteurs.filter((u) => u !== uid);
    void ecrire(f.id, sansId(f), { ...sansId(f), lecteurs });
  }
  function sceau(f: AvecId<FicheLoreMj>, idPassage: string) {
    const passages = f.passages.map((p) => (p.id === idPassage ? { ...p, scelle: !p.scelle } : p));
    void ecrire(f.id, sansId(f), { ...sansId(f), passages });
  }

  // ---- Édition (brouillon local) ----
  interface Brouillon {
    id: string;
    nouvelle: boolean;
    titre: string;
    sousTitre: string;
    categorie: string;
    etiquettes: string;
    passages: { id: string; intertitre: string; texte: string; scelle: boolean }[];
  }
  let brouillon = $state<Brouillon | null>(null);

  function editer(f: AvecId<FicheLoreMj>) {
    message = '';
    erreur = '';
    brouillon = {
      id: f.id,
      nouvelle: false,
      titre: f.titre,
      sousTitre: f.sousTitre ?? '',
      categorie: f.categorie,
      etiquettes: f.etiquettes.join(', '),
      passages: f.passages.map((p) => ({ id: p.id, intertitre: p.intertitre ?? '', texte: p.texte, scelle: p.scelle })),
    };
  }
  function creer() {
    message = '';
    erreur = '';
    brouillon = {
      id: nouvelIdFiche(),
      nouvelle: true,
      titre: '',
      sousTitre: '',
      categorie: ouverte?.categorie ?? 'Divers',
      etiquettes: '',
      passages: [{ id: nouvelIdPassage(), intertitre: '', texte: '', scelle: false }],
    };
  }
  function deplacer(i: number, sens: -1 | 1) {
    if (!brouillon) return;
    const j = i + sens;
    if (j < 0 || j >= brouillon.passages.length) return;
    const p = [...brouillon.passages];
    [p[i], p[j]] = [p[j]!, p[i]!];
    brouillon.passages = p;
  }

  async function enregistrer() {
    if (!brouillon) return;
    const b = brouillon;
    const enBase = lore.etat.elements.find((f) => f.id === b.id) ?? null;
    const ordreMax = Math.max(0, ...lore.etat.elements.filter((f) => f.categorie === b.categorie.trim()).map((f) => f.ordre));
    const candidat = {
      titre: b.titre,
      ...(b.sousTitre.trim() ? { sousTitre: b.sousTitre } : {}),
      categorie: b.categorie,
      ordre: enBase?.ordre ?? ordreMax + 10,
      etiquettes: b.etiquettes.split(',').map((e) => e.trim()).filter(Boolean),
      visibilite: enBase?.visibilite ?? 'mj',
      lecteurs: enBase?.lecteurs ?? [],
      passages: b.passages
        .filter((p) => p.texte.trim())
        .map((p) => ({ id: p.id, ...(p.intertitre.trim() ? { intertitre: p.intertitre } : {}), texte: p.texte, scelle: p.scelle })),
      majLe: enBase?.majLe ?? 0,
      reveleLe: enBase?.reveleLe ?? 0,
      ...(enBase?.source ? { source: enBase.source } : {}),
    };
    const resultat = schemaFicheLoreMj.safeParse(candidat);
    if (!resultat.success) {
      const premier = resultat.error.issues[0];
      erreur = `Fiche non enregistrée : ${premier?.path.join(' › ') || 'fiche'} — ${premier?.message ?? 'invalide'}.`;
      return;
    }
    if (await ecrire(b.id, enBase ? sansId(enBase) : null, resultat.data, b.nouvelle ? 'Fiche créée, visible de toi seul.' : 'Fiche enregistrée.')) {
      choisie = b.id;
      brouillon = null;
    }
  }

  async function supprimer(f: AvecId<FicheLoreMj>) {
    if (!confirm(`Supprimer la fiche « ${f.titre} » ? Les joueurs ne la verront plus, et elle ne pourra pas être récupérée.`)) return;
    erreur = '';
    try {
      await supprimerFicheLore(f.id);
      choisie = null;
      message = `Fiche « ${f.titre} » supprimée.`;
    } catch (e) {
      erreur = messageErreurPerso(e);
    }
  }
</script>

<div class="lore">
  <section class="carte menu" aria-label="Fiches de lore">
    <button onclick={creer} disabled={!!brouillon}>Nouvelle fiche</button>
    <input class="recherche" type="search" placeholder="Chercher dans le lore" aria-label="Chercher dans le lore" bind:value={recherche} />
    {#if lore.etat.erreur}
      <p class="erreur" role="alert">{lore.etat.erreur}</p>
    {:else if !lore.etat.pret}
      <p class="aide">Chargement du lore…</p>
    {:else if lore.etat.elements.length === 0}
      <p class="aide">Aucune fiche. Importe le lore de la v1 (Données) ou crée la première.</p>
    {:else}
      {#each groupes as g (g.categorie)}
        <h3 class="categorie">{g.categorie}</h3>
        <ul>
          {#each g.fiches as f (f.id)}
            <li>
              <button class="entree" class:cachee={f.visibilite === 'mj' || (f.visibilite === 'certains' && !f.lecteurs.length)} aria-current={choisie === f.id} onclick={() => { if (!brouillon) choisie = f.id; }}>
                <span class="point {f.visibilite}" aria-hidden="true"></span>
                <span>{f.titre}</span>
                <span class="partage">{partage(f)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
  </section>

  <section class="carte detail" aria-label="Fiche de lore">
    {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
    {#if message}<p class="succes" role="status">{message}</p>{/if}

    {#if brouillon}
      <h2>{brouillon.nouvelle ? 'Nouvelle fiche' : 'Modifier la fiche'}</h2>
      <div class="champs">
        <label>Titre <input bind:value={brouillon.titre} maxlength="120" /></label>
        <label>Catégorie <input bind:value={brouillon.categorie} maxlength="60" list="categories-lore" /></label>
        <label class="large">Sous-titre <input bind:value={brouillon.sousTitre} maxlength="200" /></label>
        <label class="large">Étiquettes (séparées par des virgules) <input bind:value={brouillon.etiquettes} /></label>
      </div>
      <datalist id="categories-lore">{#each categories as c (c)}<option value={c}></option>{/each}</datalist>
      <ol class="passages-edition" aria-label="Passages">
        {#each brouillon.passages as p, i (p.id)}
          <li class:scelle={p.scelle}>
            <div class="ligne">
              <input class="intertitre" placeholder="Intertitre (facultatif)" aria-label={`Intertitre du passage ${i + 1}`} bind:value={p.intertitre} maxlength="80" />
              <label class="coche"><input type="checkbox" bind:checked={p.scelle} /> Scellé</label>
              <button class="discret petit" aria-label={`Monter le passage ${i + 1}`} disabled={i === 0} onclick={() => deplacer(i, -1)}>↑</button>
              <button class="discret petit" aria-label={`Descendre le passage ${i + 1}`} disabled={i === brouillon.passages.length - 1} onclick={() => deplacer(i, 1)}>↓</button>
              <button class="discret petit" aria-label={`Retirer le passage ${i + 1}`} onclick={() => brouillon && (brouillon.passages = brouillon.passages.filter((x) => x.id !== p.id))}>Retirer</button>
            </div>
            <textarea aria-label={`Texte du passage ${i + 1}`} rows="4" bind:value={p.texte}></textarea>
          </li>
        {/each}
      </ol>
      <div class="ligne">
        <button class="discret" onclick={() => brouillon && (brouillon.passages = [...brouillon.passages, { id: nouvelIdPassage(), intertitre: '', texte: '', scelle: false }])}>Ajouter un passage</button>
        <span class="espace"></span>
        <button class="discret" onclick={() => { brouillon = null; erreur = ''; }}>Annuler</button>
        <button onclick={enregistrer}>Enregistrer</button>
      </div>
      <p class="aide">Un passage vide n'est pas gardé. Le partage se règle après l'enregistrement.</p>
    {:else if ouverte}
      <div class="ligne">
        <span class="etiquette">{ouverte.categorie}</span>
        <span class="espace"></span>
        <button class="discret petit" onclick={() => editer(ouverte)}>Modifier</button>
        <button class="discret petit danger" onclick={() => supprimer(ouverte)}>Supprimer</button>
      </div>
      <h2>{ouverte.titre}</h2>
      {#if ouverte.sousTitre}<p class="sous-titre">{ouverte.sousTitre}</p>{/if}
      {#if ouverte.etiquettes.length}
        <div class="etiquettes">{#each ouverte.etiquettes as e (e)}<span class="badge">{e}</span>{/each}</div>
      {/if}

      <div class="partage-bloc" role="group" aria-label="Partage de la fiche">
        <span class="etiquette">Partagée avec</span>
        <div class="bascule">
          {#each [['mj', 'Personne'], ['certains', 'Certains'], ['tous', 'Tous']] as [v, libelle] (v)}
            <button aria-pressed={ouverte.visibilite === v} onclick={() => visibilite(ouverte, v as Visibilite)}>{libelle}</button>
          {/each}
        </div>
        {#if ouverte.visibilite === 'certains'}
          {#each triesJoueurs as j (j.id)}
            <label class="coche"><input type="checkbox" checked={ouverte.lecteurs.includes(j.id)} onchange={(ev) => lecteur(ouverte, j.id, ev.currentTarget.checked)} /> {j.nom}</label>
          {/each}
          {#if ouverte.lecteurs.length === 0}<span class="aide">Coche les joueurs qui la verront.</span>{/if}
        {/if}
      </div>

      <div class="texte">
        {#each ouverte.passages as p (p.id)}
          <div class="passage" class:scelle={p.scelle}>
            {#if p.intertitre}<h3>{p.intertitre}</h3>{/if}
            <p>{p.texte}</p>
            <button class="sceau" aria-pressed={p.scelle} aria-label={`${p.scelle ? 'Desceller' : 'Sceller'} : ${p.texte.slice(0, 40)}`} onclick={() => sceau(ouverte, p.id)}>{p.scelle ? 'Scellé' : 'Visible'}</button>
          </div>
        {/each}
        {#if ouverte.passages.length === 0}<p class="aide">Cette fiche n'a pas encore de texte.</p>{/if}
      </div>
      <p class="aide">Un passage scellé n'est jamais envoyé aux joueurs, même quand la fiche est partagée.</p>
    {:else}
      <p class="aide">Choisis une fiche à gauche, ou crée-en une.</p>
    {/if}
  </section>
</div>

<style>
  .lore {
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
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
  .entree.cachee {
    color: var(--couleur-encre-douce);
  }
  .partage {
    margin-left: auto;
    font-size: 12px;
    color: var(--couleur-encre-douce);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 110px;
  }
  .point {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: var(--couleur-encre-douce);
  }
  .point.tous {
    background: var(--couleur-succes);
  }
  .point.certains {
    background: var(--couleur-or);
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
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
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .espace {
    flex: 1 1 auto;
  }
  .partage-bloc {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    padding: 10px 12px;
    border: 1px dashed var(--couleur-or);
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
  }
  .bascule {
    display: inline-flex;
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--rayon-pastille);
    overflow: hidden;
  }
  .bascule button {
    min-height: 34px;
    border-radius: 0;
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
  }
  .bascule button[aria-pressed='true'] {
    background: var(--couleur-accent-clair);
    color: #fff;
  }
  .coche {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
  }
  .coche input {
    min-height: 0;
  }
  .texte {
    max-width: 80ch;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .passage {
    position: relative;
    padding: 8px 110px 8px 12px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure-douce);
    background: var(--couleur-surface-claire);
  }
  .passage.scelle {
    border-style: dashed;
    background: transparent;
    color: var(--couleur-encre-douce);
  }
  .passage h3 {
    font-size: 16px;
    margin-bottom: 4px;
  }
  .passage p {
    margin: 0;
    white-space: pre-line;
    line-height: 1.55;
  }
  .sceau {
    position: absolute;
    top: 6px;
    right: 6px;
    min-height: 28px;
    padding: 0 12px;
    font-size: 12px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-surface);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .sceau[aria-pressed='true'] {
    background: var(--couleur-encre);
    color: var(--couleur-sur-accent);
    border-color: transparent;
  }
  .champs {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 10px 14px;
  }
  .champs label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
  }
  .champs .large {
    grid-column: 1 / -1;
  }
  .passages-edition {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .passages-edition li {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure-douce);
    background: var(--couleur-surface-claire);
  }
  .passages-edition li.scelle {
    border-style: dashed;
  }
  .intertitre {
    flex: 1 1 200px;
  }
  textarea {
    font: inherit;
    padding: 10px 12px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure);
    background: var(--couleur-surface);
    resize: vertical;
  }
  .discret {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .petit {
    min-height: 32px;
    padding: 0 10px;
  }
  .danger {
    color: var(--couleur-danger);
  }
  .aide {
    color: var(--couleur-encre-douce);
    font-size: 14px;
    margin: 0;
  }
  .erreur {
    color: var(--couleur-danger);
    margin: 0;
  }
  .succes {
    color: var(--couleur-succes);
    margin: 0;
  }
</style>
