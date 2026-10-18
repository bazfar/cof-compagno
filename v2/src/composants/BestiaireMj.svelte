<script lang="ts">
  import { onDestroy } from 'svelte';
  import { enregistrerMonstre, supprimerMonstre } from '../lib/actions/bestiaire';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { depuisDocument, filtrer, ligneArmure, ligneAttaque, nouvelIdMonstre } from '../lib/bestiaire/bestiaire';
  import { suivreArmesMonstres, suivreArmuresMonstres, suivreBestiaire, suivreEquilibrage } from '../lib/magasins/bestiaire.svelte';
  import { RACES_MONSTRE, schemaMonstre, type Monstre, type MonstreEnBase } from '../lib/schemas/bestiaire';
  import { session } from '../lib/session.svelte';

  /*
   * Bestiaire du MJ (lot L3.2, décision du 18/10/2026 : en base, lisible du
   * MJ seul). Consultation (recherche, dangerosité, race, boss), fiche
   * détaillée avec attaques et armure résolues, surcharges et créatures du
   * MJ. L'édition porte sur ce que le MJ change en séance (nom,
   * statistiques, attaques, capacités, description) ; les champs propres au
   * combat et aux démons (voies, faim, paliers, passifs…) sont gardés tels
   * quels et se règleront avec le combat (L6). Le brouillon est local :
   * la base ne l'écrase jamais pendant la saisie.
   */

  const bestiaire = suivreBestiaire(session.table);
  const armesDoc = suivreArmesMonstres(session.table);
  const armuresDoc = suivreArmuresMonstres(session.table);
  const equilibrage = suivreEquilibrage(session.table);
  onDestroy(() => {
    bestiaire.arreter();
    armesDoc.arreter();
    armuresDoc.arreter();
    equilibrage.arreter();
  });

  const monstres = $derived(bestiaire.etat.elements.map((d) => ({ ...depuisDocument(d.id, d), origine: d.origine as MonstreEnBase['origine'] })));
  const armes = $derived(new Map((armesDoc.etat.donnees?.liste ?? []).map((a) => [a.id, a])));
  const armures = $derived(new Map((armuresDoc.etat.donnees?.liste ?? []).map((a) => [a.id, a])));
  const roles = $derived(Object.entries(equilibrage.etat.donnees?.roles ?? {}).map(([id, r]) => ({ id, nom: r.nom })));

  let recherche = $state('');
  let dangerosite = $state(0);
  let race = $state('');
  let bossSeulement = $state(false);
  let choisi = $state<string | null>(null);
  let message = $state('');
  let erreur = $state('');

  const liste = $derived(filtrer(monstres, { recherche, dangerosite, race, bossSeulement }));
  const ouvert = $derived(monstres.find((m) => m.id === choisi) ?? null);
  const etoiles = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

  // ---- Édition ----
  interface Brouillon {
    base: Monstre;
    origine: MonstreEnBase['origine'];
    nouveau: boolean;
    nom: string;
    emoji: string;
    faction: string;
    role: string;
    taille: Monstre['taille'];
    races: string[];
    dangerosite: number;
    boss: boolean;
    pv: number;
    def: number;
    defMentale: string | number | null;
    init: number;
    atk: number;
    armureId: string;
    attaques: { nom: string; armeId: string; bonusAttaque: number; bonusDegats: string | number | null; effetSpecial: string; reste: Record<string, unknown> }[];
    capacites: { nom: string; description: string; reste: Record<string, unknown> }[];
    lore: string;
  }
  let brouillon = $state<Brouillon | null>(null);

  function depuis(m: Monstre & { origine?: unknown }, origine: MonstreEnBase['origine'], nouveau: boolean): Brouillon {
    // L'origine de la liste n'est pas un champ du monstre (schemaMonstre la refuserait).
    const { origine: _o, ...base } = m;
    return {
      base,
      origine,
      nouveau,
      nom: m.nom,
      emoji: m.emoji,
      faction: m.faction ?? '',
      role: m.role,
      taille: m.taille,
      races: [...m.race],
      dangerosite: m.dangerosite,
      boss: m.boss,
      pv: m.pv,
      def: m.def,
      defMentale: m.defMentale === undefined ? '' : String(m.defMentale),
      init: m.init,
      atk: m.atk,
      armureId: m.armureId ?? '',
      attaques: m.attaques.map(({ nom, armeId, bonusAttaque, bonusDegats, effetSpecial, ...reste }) => ({
        nom,
        armeId,
        bonusAttaque,
        bonusDegats: bonusDegats === undefined ? '' : String(bonusDegats),
        effetSpecial: effetSpecial ?? '',
        reste,
      })),
      capacites: m.capacitesSpeciales.map(({ nom, description, ...reste }) => ({ nom, description, reste })),
      lore: m.lore,
    };
  }

  function modifier() {
    if (ouvert) brouillon = depuis(ouvert, ouvert.origine, false);
    message = erreur = '';
  }
  function dupliquer() {
    if (!ouvert) return;
    const id = nouvelIdMonstre(`${ouvert.nom} copie`, new Set(monstres.map((m) => m.id)));
    brouillon = depuis({ ...ouvert, id, nom: `${ouvert.nom} (copie)` }, 'mj', true);
    message = erreur = '';
  }
  function creer() {
    const socle = equilibrage.etat.donnees?.socleDangerosite['1'];
    const id = nouvelIdMonstre('nouvelle creature', new Set(monstres.map((m) => m.id)));
    const vierge: Monstre = {
      id,
      nom: '',
      race: ['humanoïdes'],
      pv: Math.round(socle?.pv ?? 10),
      def: Math.round(socle?.def ?? 10),
      init: Math.round(socle?.init ?? 10),
      atk: Math.round(socle?.atk ?? 2),
      dangerosite: 1,
      boss: false,
      role: roles[0]?.id ?? 'brute',
      taille: 'moyenne',
      attaques: [],
      capacitesSpeciales: [],
      lore: '',
      emoji: '❔',
    };
    brouillon = depuis(vierge, 'mj', true);
    message = erreur = '';
  }

  /** Champ numérique facultatif : un <input type="number"> rend un nombre, ou null quand il est vide. */
  const entier = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? undefined : Number.parseInt(String(v), 10));

  async function enregistrer() {
    if (!brouillon) return;
    const b = brouillon;
    const { faction: _f, defMentale: _d, armureId: _a, ...base } = b.base;
    const candidat = {
      ...base,
      nom: b.nom.trim(),
      emoji: b.emoji.trim() || '❔',
      ...(b.faction.trim() ? { faction: b.faction.trim() } : {}),
      role: b.role,
      taille: b.taille,
      race: b.races,
      dangerosite: Number(b.dangerosite),
      boss: b.boss,
      pv: Number(b.pv),
      def: Number(b.def),
      ...(entier(b.defMentale) !== undefined ? { defMentale: entier(b.defMentale) } : {}),
      init: Number(b.init),
      atk: Number(b.atk),
      ...(b.armureId ? { armureId: b.armureId } : {}),
      attaques: b.attaques.map((a) => ({
        ...a.reste,
        nom: a.nom.trim(),
        armeId: a.armeId,
        bonusAttaque: Number(a.bonusAttaque),
        ...(entier(a.bonusDegats) !== undefined ? { bonusDegats: entier(a.bonusDegats) } : {}),
        effetSpecial: a.effetSpecial.trim() || null,
      })),
      capacitesSpeciales: b.capacites.filter((c) => c.nom.trim() || c.description.trim()).map((c) => ({ ...c.reste, nom: c.nom.trim(), description: c.description.trim() })),
      lore: b.lore.trim(),
    };
    const resultat = schemaMonstre.safeParse(candidat);
    if (!resultat.success || !candidat.nom) {
      const premier = resultat.success ? null : resultat.error.issues[0];
      erreur = `Créature non enregistrée : ${premier ? `${premier.path.join(' › ') || 'créature'} — ${premier.message}` : 'nom — un nom est requis'}.`;
      return;
    }
    const inconnue = resultat.data.attaques.find((a) => !armes.has(a.armeId));
    if (inconnue) {
      erreur = `Créature non enregistrée : l'attaque « ${inconnue.nom} » n'a pas d'arme connue.`;
      return;
    }
    erreur = '';
    try {
      await enregistrerMonstre(resultat.data, b.origine);
      choisi = resultat.data.id;
      message = b.nouveau ? `« ${resultat.data.nom} » ajouté au bestiaire.` : 'Modifications enregistrées.';
      brouillon = null;
    } catch (e) {
      erreur = messageErreurPerso(e);
    }
  }

  async function supprimer() {
    if (!ouvert) return;
    const rappel = ouvert.origine === 'v1' ? ' Réimporter le fichier du bestiaire le rétablira dans sa version v1.' : '';
    if (!confirm(`Supprimer « ${ouvert.nom} » du bestiaire ?${rappel}`)) return;
    try {
      await supprimerMonstre(ouvert.id);
      message = `« ${ouvert.nom} » supprimé.`;
      choisi = null;
    } catch (e) {
      erreur = messageErreurPerso(e);
    }
  }
  const premiereArme = $derived(armes.keys().next().value ?? '');
</script>

<div class="bestiaire">
  <section class="carte menu" aria-label="Créatures">
    <button onclick={creer} disabled={!!brouillon || !bestiaire.etat.pret}>Nouvelle créature</button>
    <input type="search" placeholder="Nom, faction, famille, rôle" aria-label="Chercher une créature" bind:value={recherche} />
    <div class="filtres">
      <select aria-label="Dangerosité" bind:value={dangerosite}>
        <option value={0}>Toute dangerosité</option>
        {#each [1, 2, 3, 4, 5] as d (d)}<option value={d}>{etoiles(d)}</option>{/each}
      </select>
      <select aria-label="Race" bind:value={race}>
        <option value="">Toutes races</option>
        {#each RACES_MONSTRE as r (r)}<option value={r}>{r}</option>{/each}
      </select>
      <label class="coche"><input type="checkbox" bind:checked={bossSeulement} /> Boss</label>
    </div>
    {#if bestiaire.etat.erreur}
      <p class="erreur" role="alert">{bestiaire.etat.erreur}</p>
    {:else if !bestiaire.etat.pret}
      <p class="aide">Chargement du bestiaire…</p>
    {:else if monstres.length === 0}
      <p class="aide">Bestiaire vide. Importe-le dans Données › Imports.</p>
    {:else}
      <span class="aide">{liste.length} créature{liste.length > 1 ? 's' : ''}</span>
      <ul>
        {#each liste as m (m.id)}
          <li>
            <button class="entree" aria-current={choisi === m.id} onclick={() => { if (!brouillon) choisi = m.id; }}>
              <span class="emoji" aria-hidden="true">{m.emoji}</span>
              <span class="nom">{m.nom}</span>
              {#if m.boss}<span class="badge boss">boss</span>{/if}
              <span class="niveau" title={`Dangerosité ${m.dangerosite}`}>{m.dangerosite}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="carte detail" aria-label="Fiche de créature">
    {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
    {#if message}<p class="succes" role="status">{message}</p>{/if}

    {#if brouillon}
      <h2>{brouillon.nouveau ? 'Nouvelle créature' : `Modifier ${brouillon.base.nom}`}</h2>
      <div class="champs">
        <label class="large">Nom <input bind:value={brouillon.nom} maxlength="80" /></label>
        <label>Emoji <input bind:value={brouillon.emoji} maxlength="8" /></label>
        <label>Faction <input bind:value={brouillon.faction} maxlength="80" /></label>
        <label>Rôle
          <select bind:value={brouillon.role}>{#each roles as r (r.id)}<option value={r.id}>{r.nom}</option>{/each}</select>
        </label>
        <label>Taille
          <select bind:value={brouillon.taille}>{#each ['petite', 'moyenne', 'grande', 'très grande'] as t (t)}<option value={t}>{t}</option>{/each}</select>
        </label>
        <label>Dangerosité <input type="number" min="1" max="5" bind:value={brouillon.dangerosite} /></label>
        <label class="coche"><input type="checkbox" bind:checked={brouillon.boss} /> Boss</label>
      </div>
      <fieldset class="races">
        <legend>Races</legend>
        {#each RACES_MONSTRE as r (r)}
          <label class="coche"><input type="checkbox" checked={brouillon.races.includes(r)} onchange={(ev) => brouillon && (brouillon.races = ev.currentTarget.checked ? [...brouillon.races, r] : brouillon.races.filter((x) => x !== r))} /> {r}</label>
        {/each}
      </fieldset>
      <div class="champs stats-edition">
        <label>PV <input type="number" min="1" bind:value={brouillon.pv} /></label>
        <label>DEF <input type="number" bind:value={brouillon.def} /></label>
        <label>DEF mentale <input type="number" bind:value={brouillon.defMentale} placeholder="—" /></label>
        <label>Initiative <input type="number" bind:value={brouillon.init} /></label>
        <label>Attaque <input type="number" bind:value={brouillon.atk} /></label>
        <label>Armure
          <select bind:value={brouillon.armureId}>
            <option value="">Aucune</option>
            {#each [...armures.values()] as a (a.id)}<option value={a.id}>{a.nom}</option>{/each}
          </select>
        </label>
      </div>

      <h3>Attaques</h3>
      <ol class="sous-liste">
        {#each brouillon.attaques as a, i (i)}
          <li>
            <input aria-label={`Nom de l'attaque ${i + 1}`} bind:value={a.nom} />
            <select aria-label={`Arme de l'attaque ${i + 1}`} bind:value={a.armeId}>
              {#if !armes.has(a.armeId)}<option value={a.armeId}>arme inconnue ({a.armeId})</option>{/if}
              {#each [...armes.values()] as arme (arme.id)}<option value={arme.id}>{arme.nom} ({arme.degats})</option>{/each}
            </select>
            <label>Bonus <input type="number" aria-label={`Bonus d'attaque ${i + 1}`} bind:value={a.bonusAttaque} /></label>
            <label>Dégâts + <input type="number" aria-label={`Bonus de dégâts ${i + 1}`} bind:value={a.bonusDegats} placeholder="—" /></label>
            <input class="large" aria-label={`Effet spécial de l'attaque ${i + 1}`} placeholder="Effet spécial (facultatif)" bind:value={a.effetSpecial} />
            <button class="discret petit" onclick={() => brouillon && (brouillon.attaques = brouillon.attaques.filter((_, j) => j !== i))}>Retirer</button>
          </li>
        {/each}
      </ol>
      <button class="discret petit" disabled={!premiereArme} onclick={() => brouillon && (brouillon.attaques = [...brouillon.attaques, { nom: 'Attaque', armeId: premiereArme, bonusAttaque: brouillon.atk, bonusDegats: '', effetSpecial: '', reste: {} }])}>Ajouter une attaque</button>

      <h3>Capacités spéciales</h3>
      <ol class="sous-liste">
        {#each brouillon.capacites as c, i (i)}
          <li>
            <input aria-label={`Nom de la capacité ${i + 1}`} bind:value={c.nom} />
            <textarea class="large" aria-label={`Description de la capacité ${i + 1}`} rows="2" bind:value={c.description}></textarea>
            <button class="discret petit" onclick={() => brouillon && (brouillon.capacites = brouillon.capacites.filter((_, j) => j !== i))}>Retirer</button>
          </li>
        {/each}
      </ol>
      <button class="discret petit" onclick={() => brouillon && (brouillon.capacites = [...brouillon.capacites, { nom: '', description: '', reste: {} }])}>Ajouter une capacité</button>

      <label class="bloc">Description <textarea rows="4" bind:value={brouillon.lore}></textarea></label>
      <div class="ligne">
        <span class="espace"></span>
        <button class="discret" onclick={() => { brouillon = null; erreur = ''; }}>Annuler</button>
        <button onclick={enregistrer}>Enregistrer</button>
      </div>
    {:else if ouvert}
      <div class="ligne">
        <span class="badge {ouvert.origine}">{ouvert.origine === 'v1' ? 'bestiaire v1' : 'créée par toi'}</span>
        <span class="espace"></span>
        <button class="discret petit" onclick={modifier}>Modifier</button>
        <button class="discret petit" onclick={dupliquer}>Dupliquer</button>
        <button class="discret petit danger" onclick={supprimer}>Supprimer</button>
      </div>
      <h2><span aria-hidden="true">{ouvert.emoji}</span> {ouvert.nom}</h2>
      <p class="sous-titre">
        {ouvert.race.join(', ')} · {ouvert.taille} · {roles.find((r) => r.id === ouvert.role)?.nom ?? ouvert.role}{#if ouvert.tier} · {ouvert.tier}{/if}{#if ouvert.faction} · {ouvert.faction}{/if}
      </p>
      <p class="danger-ligne">{etoiles(ouvert.dangerosite)}{#if ouvert.boss} <span class="badge boss">boss</span>{/if}</p>
      <dl class="stats">
        <div><dt>PV</dt><dd>{ouvert.pv}</dd></div>
        <div><dt>DEF</dt><dd>{ouvert.def}</dd></div>
        {#if ouvert.defMentale !== undefined}<div><dt>DEF mentale</dt><dd>{ouvert.defMentale}</dd></div>{/if}
        <div><dt>Initiative</dt><dd>{ouvert.init}</dd></div>
        <div><dt>Attaque</dt><dd>{ouvert.atk >= 0 ? `+${ouvert.atk}` : ouvert.atk}</dd></div>
      </dl>
      {#if ligneArmure(ouvert.armureId, armures)}<p><strong>Armure :</strong> {ligneArmure(ouvert.armureId, armures)}</p>{/if}
      {#if ouvert.attaques.length}
        <h3>Attaques</h3>
        <ul class="lignes">
          {#each ouvert.attaques as a, i (i)}<li>{ligneAttaque(a, armes)}{#if a.effetSpecial}<span class="aide"> — {a.effetSpecial}</span>{/if}</li>{/each}
        </ul>
      {/if}
      {#if ouvert.capacitesSpeciales.length}
        <h3>Capacités spéciales</h3>
        <ul class="lignes">
          {#each ouvert.capacitesSpeciales as c, i (i)}<li><strong>{c.nom}.</strong> {c.description}</li>{/each}
        </ul>
      {/if}
      {#if ouvert.immunites?.length}<p><strong>Immunités :</strong> {ouvert.immunites.join(', ')}</p>{/if}
      {#if ouvert.resistances}<p><strong>Résistances :</strong> {Object.entries(ouvert.resistances).map(([k, v]) => `${k} ×${v}`).join(', ')}</p>{/if}
      {#if ouvert.lore}<p class="lore">{ouvert.lore}</p>{/if}
    {:else}
      <p class="aide">Choisis une créature à gauche, ou crées-en une.</p>
    {/if}
  </section>
</div>

<style>
  .bestiaire {
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
  .filtres {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  select {
    min-height: 36px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure);
    background: var(--couleur-surface-claire);
    padding: 0 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .menu ul {
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
  .nom {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .niveau {
    font-size: 12px;
    font-weight: 700;
    color: var(--couleur-or-texte);
    font-variant-numeric: tabular-nums;
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 240px;
  }
  h2 {
    font-size: 24px;
  }
  h3 {
    font-size: 16px;
    margin-top: 6px;
  }
  .sous-titre {
    margin: 0;
    color: var(--couleur-encre-douce);
    font-style: italic;
  }
  .danger-ligne {
    margin: 0;
    color: var(--couleur-or-texte);
    letter-spacing: 0.1em;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
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
  .lignes {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lignes li {
    padding: 6px 10px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .lore {
    white-space: pre-line;
    line-height: 1.55;
    max-width: 75ch;
  }
  .badge {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-accent-pale);
    color: var(--couleur-accent);
    font-weight: 600;
  }
  .badge.boss {
    background: var(--couleur-danger-pale);
    color: var(--couleur-danger);
  }
  .badge.mj {
    background: var(--couleur-succes-pale);
    color: var(--couleur-succes);
  }
  .champs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px 12px;
    align-items: end;
  }
  .champs label,
  .bloc {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
  }
  .champs .large {
    grid-column: span 2;
  }
  .coche {
    display: inline-flex !important;
    flex-direction: row !important;
    align-items: center;
    gap: 6px;
    font-size: 14px;
  }
  .coche input {
    min-height: 0;
  }
  .races {
    border: 1px solid var(--couleur-bordure-douce);
    border-radius: var(--rayon);
    padding: 6px 10px;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  .sous-liste {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sous-liste li {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding: 8px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure-douce);
    background: var(--couleur-surface-claire);
  }
  .sous-liste label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
  }
  .sous-liste input[type='number'] {
    width: 64px;
  }
  .sous-liste .large {
    flex: 1 1 100%;
  }
  textarea {
    font: inherit;
    padding: 8px 10px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure);
    background: var(--couleur-surface);
    resize: vertical;
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
    font-size: 13px;
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
  p {
    margin: 0;
  }
</style>
