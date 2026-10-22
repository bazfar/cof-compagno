<script lang="ts">
  import { proposerDon, RefusDon } from '../lib/actions/dons';
  import { lancerEtNoter, noterJet } from '../lib/actions/journal';
  import { appliquerChangement, enregistrerPortrait, messageErreurPerso, modifierNotes, modifierPieces, modifierPP, modifierPV, retirerPortrait } from '../lib/actions/persos';
  import { lireImage } from '../lib/battlemap/compression';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import type { Destinataire } from '../lib/dons/dons';
  import { comprimerPortrait } from '../lib/fiche/portrait';
  import { modifierJauges } from '../lib/actions/refonte';
  import { changerJauge, finDuCombat, type CleJauge } from '../lib/fiche/actions-fiche';
  import { classeDeLaRefonte, etatRefonte } from '../lib/fiche/refonte';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import { formuleTest, texteJet } from '../lib/regles/des';
  import * as E from '../lib/regles/equipement';
  import { barreNiveau } from '../lib/regles/progression';
  import { SLOTS_EQUIPEMENT, type Slot } from '../lib/regles/fiche-calcul';
  import { LIMITE_NOTES, type Fiche } from '../lib/schemas/fiche';
  import { session } from '../lib/session.svelte';
  import ActionsRefonte from './ActionsRefonte.svelte';
  import ArbreVecu from './ArbreVecu.svelte';
  import RumeursVecu from './RumeursVecu.svelte';
  import ConversionRefonte from './ConversionRefonte.svelte';
  import CorrectionFiche from './CorrectionFiche.svelte';
  import MonteeNiveau from './MonteeNiveau.svelte';
  import MonteeRefonte from './MonteeRefonte.svelte';
  import OctroisMj from './OctroisMj.svelte';
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
   *
   * Jets (L2.5) : caractéristiques, compétences, sauvegardes et attaques se
   * lancent d'un clic (d20 + modificateur), et vont au journal de dés commun
   * avec les potions. La barre de progression montre les crans donnés par
   * le MJ.
   *
   * Montée de niveau (L2.5b) : barre pleine, « Passer au niveau N » ouvre
   * l'assistant (MonteeNiveau), pour le propriétaire comme pour le MJ.
   *
   * Mise en page (L2.6, maquette validée le 18/10) : un en-tête collant
   * (portrait, identité, crans, PV, PP, Points de Cercle) reste visible
   * quand on fait défiler la fiche ; la montée de niveau s'ouvre sous lui.
   * Quatre onglets au lieu de six : Combat absorbe les caractéristiques
   * (c'est là qu'on lance les jets), Suivi et Notes sont réunis, et
   * Capacités sépare l'usage en combat et hors combat. Le changement de
   * portrait passe dans « Suivi et notes » pour garder l'en-tête court.
   * Ce découpage est voulu : ne pas revenir à six onglets.
   *
   * Correction (L3.6, MJ seul) : « Corriger la fiche » ouvre, sous
   * l'en-tête, un brouillon de l'identité, des caractéristiques, des PV,
   * des voies et des dons (CorrectionFiche).
   *
   * Refonte (L4.11b) : « Passer à la refonte » (fiche v1 d'une classe
   * refondue) ou « Refaire mes voies » (conversion rouverte par le MJ)
   * ouvre ConversionRefonte ; la montée d'une fiche de la refonte passe par
   * MonteeRefonte ; le MJ ouvre « Octrois » (OctroisMj) sur une fiche de la
   * refonte.
   *
   * Refonte, lot L4.12 (décisions 1b, 7a, 8b, 9a, 10a, 15b du 21/10/2026) :
   * une fiche de la refonte a un cinquième onglet, Actions
   * (ActionsRefonte), et ses jauges dans l'en-tête (− et + pour qui peut
   * modifier la fiche, « Fin du combat » remet la Plongée à 0) ; les
   * annonces de Corruption d'Âme et de paliers de mutation s'affichent dans
   * le message de la fiche.
   *
   * Vécu (L4.18) : l'onglet Capacités, partie hors combat, porte l'arbre
   * du Vécu (ArbreVecu), pour toutes les fiches.
   *
   * Dons (L3.3) : `destinataires` (les personnages joués des autres
   * joueurs, fournis par MesPersonnages) ajoute « Donner… » sous chaque
   * objet du sac. Absent dans la vue du MJ, qui ajoute du catalogue.
   */

  let {
    fiche,
    modifiable,
    mj = false,
    destinataires = [],
  }: { fiche: AvecId<Fiche>; modifiable: boolean; mj?: boolean; destinataires?: Destinataire[] } = $props();

  const ONGLETS = ['Combat', 'Capacités', 'Actions', 'Équipement', 'Suivi et notes'] as const;
  let onglet = $state<(typeof ONGLETS)[number]>('Combat');
  /** L'onglet Actions n'existe que pour une fiche de la refonte (L4.12, 1b). */
  const onglets = $derived(ONGLETS.filter((o) => o !== 'Actions' || fiche.schemaVersion === 2));
  /** Capacités : usage en combat ou hors combat (L2.6). Hors combat = voies de VOIES_HORS_COMBAT. */
  let usage = $state<'combat' | 'hors'>('combat');
  let message = $state('');
  let montee = $state(false);
  let correction = $state(false);
  let conversion = $state(false);
  let octrois = $state(false);
  const refonte = $derived(etatRefonte(fiche));

  const vue = $derived(vueFiche(fiche));
  const voiesMontrees = $derived(vue.voies.filter((v) => v.horsCombat === (usage === 'hors')));
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
  /** Jauges de la refonte (L4.12) : bornées et Plongée → Corruption d'Âme par lib/fiche/actions-fiche.ts. */
  async function jauge(cle: CleJauge, valeur: number) {
    if (fiche.schemaVersion !== 2) return;
    const { jauges, annonces } = changerJauge(fiche, cle, valeur);
    await ecrire(modifierJauges(fiche.id, jauges));
    if (!message && annonces.length) message = annonces.join(' ');
  }
  function finCombat() {
    if (fiche.schemaVersion === 2) ecrire(modifierJauges(fiche.id, finDuCombat(fiche)));
  }
  /** Jet d'une action (15b) : attaque ou dégâts, au journal commun. */
  async function lancer(libelle: string, formule: string) {
    message = '';
    try {
      const jet = await lancerEtNoter(libelle, formule, fiche.nom);
      if (jet) message = `${libelle} : ${texteJet(formule, jet)}`;
    } catch (e) {
      message = messageErreurPerso(e);
    }
  }
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
  /** Potion : la fiche d'abord ; le jet n'est noté au journal que si elle a été écrite. */
  async function utiliser(cle: string) {
    message = '';
    let u: ReturnType<typeof E.utiliser>;
    try {
      u = E.utiliser(fiche, cle);
    } catch (e) {
      if (e instanceof E.RefusEquipement) return void (message = e.message);
      throw e;
    }
    const nom = fiche.inventaire[cle]?.nom ?? 'Potion';
    await ecrire(appliquerChangement(fiche.id, u.changement));
    if (message) return;
    message = `${nom} : ${texteJet(u.formule, u.jet)}, ${u.soin} PV rendus.`;
    try {
      await noterJet(nom, u.formule, u.jet, fiche.nom);
    } catch (e) {
      message += ` (Jet non noté au journal : ${messageErreurPerso(e)})`;
    }
  }
  /** Test d20 + modificateur, noté au journal commun (L2.5). */
  async function tester(libelle: string, mod: number | null) {
    if (mod === null) return;
    message = '';
    const formule = formuleTest(mod);
    try {
      const jet = await lancerEtNoter(libelle, formule, fiche.nom);
      if (jet) message = `${libelle} : ${texteJet(formule, jet)}`;
    } catch (e) {
      message = messageErreurPerso(e);
    }
  }
  const barre = $derived(barreNiveau(fiche));

  function jeterTout(cle: string) {
    const o = fiche.inventaire[cle];
    if (o && confirm(`Jeter toute la pile de « ${o.nom} » ?`)) geste(() => E.jeter(fiche, cle, 'tout'));
  }
  const qte = (o: Record<string, unknown>) => (typeof o.quantite === 'number' ? o.quantite : 1);

  // ---- Dons (L3.3) : l'objet est mis de côté dès la proposition ----
  let don = $state<{ cle: string; a: string; combien: number } | null>(null);
  function ouvrirDon(cle: string) {
    message = '';
    don = { cle, a: destinataires.length === 1 ? (destinataires[0]?.perso ?? '') : '', combien: 1 };
  }
  async function proposer() {
    if (!don) return;
    const d = don;
    const a = destinataires.find((x) => x.perso === d.a);
    const nom = fiche.inventaire[d.cle]?.nom ?? 'Objet';
    if (!a) return void (message = 'Choisis à qui donner.');
    message = '';
    try {
      await proposerDon(fiche.id, d.cle, Number(d.combien) || 1, a);
      don = null;
      message = `${nom} proposé à ${a.nom} : en attente de sa réponse.`;
    } catch (e) {
      message = e instanceof RefusDon || e instanceof E.RefusEquipement ? e.message : messageErreurPerso(e);
    }
  }
  const estMainGaucheDeuxMains = (s: Slot) => s === 'main_gauche' && !!fiche.equipement.main_gauche?.deuxMains;

  const PIECES = [['or', 'Or'], ['argent', 'Argent'], ['bronze', 'Bronze']] as const;
  const pourcentPV = $derived(Math.max(0, Math.min(100, Math.round((100 * vue.pv.actuel) / Math.max(1, vue.pv.max)))));
</script>

<section class="carte fiche" aria-label={`Fiche de ${fiche.nom}`}>
  <header class="tete">
    <div class="identite">
      <Portrait idPerso={fiche.id} nom={fiche.nom} taille={64} />
      <div>
        <h2>{fiche.nom}</h2>
        <p>{vue.titre} · dé de vie d{vue.deVie}</p>
        {#if mj && !correction}<button class="petit discret" onclick={() => { message = ''; correction = true; }}>Corriger la fiche</button>{/if}
        {#if mj && fiche.schemaVersion === 2 && !octrois}<button class="petit discret" onclick={() => { message = ''; octrois = true; }}>Octrois de la refonte</button>{/if}
        {#if modifiable && !conversion && (refonte === 'aConvertir' || refonte === 'reconversion')}
          <button class="petit" onclick={() => { message = ''; montee = false; conversion = true; }}>{refonte === 'aConvertir' ? 'Passer à la refonte' : 'Refaire mes voies'}</button>
        {/if}
      </div>
    </div>

    <div class="jauges">
      <div class="progression" aria-label="Progression">
        <span class="etiquette">Niveau</span>
        {#if barre.requis === null}
          <span class="aide">Niveau maximal atteint.</span>
        {:else}
          <div class="barre crans" aria-hidden="true"><span style:width="{Math.round(barre.part * 100)}%"></span></div>
          <span class="aide" data-testid="crans">{barre.crans} / {barre.requis} crans vers le niveau {fiche.niveau + 1}</span>
          {#if barre.pleine}
            <strong class="pleine">Barre pleine</strong>
            {#if modifiable && !montee && !conversion}<button class="petit" onclick={() => { message = ''; montee = true; }}>Passer au niveau {fiche.niveau + 1}</button>{/if}
          {/if}
        {/if}
      </div>

      <div class="ressource">
        <span class="etiquette">PV</span>
        <div class="barre" aria-hidden="true"><span style:width="{pourcentPV}%" class:bas={pourcentPV <= 25}></span></div>
        {#if modifiable}
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
          <span class="sur">/ {vue.pv.max}</span>
          <button class="petit" aria-label="Ajouter un PV" onclick={() => pv(vue.pv.actuel + 1)}>+</button>
        {:else}
          <strong>{vue.pv.actuel} / {vue.pv.max}</strong>
        {/if}
      </div>
      {#if vue.pp}
        <div class="ressource">
          <span class="etiquette">PP</span>
          <div class="barre pp" aria-hidden="true"><span style:width="{Math.round((100 * vue.pp.actuel) / Math.max(1, vue.pp.max))}%"></span></div>
          {#if modifiable}
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
            <span class="sur">/ {vue.pp.max}</span>
            <button class="petit" aria-label="Ajouter un PP" onclick={() => pp(vue.pp!.actuel + 1)}>+</button>
          {:else}
            <strong>{vue.pp.actuel} / {vue.pp.max}</strong>
          {/if}
        </div>
      {/if}
      {#each vue.refonte?.jauges ?? [] as j (j.cle)}
        <div class="ressource" aria-label={j.nom}>
          <span class="etiquette nom-jauge">{j.nom}</span>
          {#if j.max !== null}<div class="barre jauge" aria-hidden="true"><span style:width="{Math.round((100 * j.actuel) / Math.max(1, j.max))}%"></span></div>{:else}<span class="sans-barre"></span>{/if}
          {#if modifiable}
            <button class="petit" aria-label={`Retirer 1 ${j.nom}`} onclick={() => jauge(j.cle, j.actuel - 1)}>−</button>
            <strong data-testid={`jauge-${j.cle}`}>{j.actuel}</strong>{#if j.max !== null}<span class="sur">/ {j.max}</span>{/if}
            <button class="petit" aria-label={`Ajouter 1 ${j.nom}`} onclick={() => jauge(j.cle, j.actuel + 1)}>+</button>
            {#if j.cle === 'plongee' && j.actuel > 0}<button class="petit discret" onclick={finCombat}>Fin du combat</button>{/if}
          {:else}
            <strong data-testid={`jauge-${j.cle}`}>{j.actuel}{j.max !== null ? ` / ${j.max}` : ''}</strong>
          {/if}
        </div>
      {/each}
      {#if vue.pointsCercle.length}
        <p class="aide">Points de Cercle : {vue.pointsCercle.map((c) => `${c.nom} ${c.actuel}/${c.max}`).join(' · ')}</p>
      {/if}
    </div>
  </header>

  {#if correction}
    <CorrectionFiche {fiche} surFin={(m) => { correction = false; message = m; }} />
  {/if}
  {#if octrois && fiche.schemaVersion === 2}
    <OctroisMj {fiche} surFin={(m) => { octrois = false; message = m; }} />
  {/if}
  {#if conversion}
    <ConversionRefonte {fiche} surFin={(m) => { conversion = false; message = m; }} />
  {/if}
  {#if montee}
    {#if fiche.schemaVersion === 2}
      <MonteeRefonte {fiche} surFin={(m) => { montee = false; message = m; }} />
    {:else}
      <MonteeNiveau {fiche} surFin={(m) => { montee = false; message = m; }} />
    {/if}
  {/if}

  <div class="onglets" role="tablist" aria-label="Sections de la fiche">
    {#each onglets as o (o)}
      <button class="onglet" role="tab" aria-selected={onglet === o} onclick={() => (onglet = o)}>{o}</button>
    {/each}
  </div>

  {#if message}<p class="message" role="status">{message}</p>{/if}

  <div class="panneau" role="tabpanel" aria-label={onglet}>
  {#if onglet === 'Combat'}
    <div class="combat">
      <div>
        <h3>Caractéristiques</h3>
        <div class="caracs">
          {#each vue.caracs as c (c.code)}
            <div class="carac">
              <div class="carac-tete">
                <span class="code">{c.code}</span>
                {#if modifiable}
                  <button class="jet" aria-label={`Lancer un test de ${c.nom}`} onclick={() => tester(`Test de ${c.nom}`, c.mod)}>{signe(c.mod)}</button>
                {:else}
                  <strong>{signe(c.mod)}</strong>
                {/if}
                <span class="aide">valeur {c.valeur}</span>
              </div>
              <ul>
                {#each vue.competences.filter((k) => k.carac === c.code) as k (k.nom)}
                  <li>
                    {k.nom}
                    {#if modifiable}<button class="jet petit-jet" aria-label={`Lancer ${k.nom}`} onclick={() => tester(k.nom, k.mod)}>{signe(k.mod)}</button>{:else}<strong>{signe(k.mod)}</strong>{/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </div>
      </div>
      <div>
        <h3>Attaque et défense</h3>
        <dl class="stats">
          <div><dt>CA</dt><dd data-testid="ca">{vue.stats.ca}</dd></div>
          <div><dt>Initiative</dt><dd>{vue.stats.initiative}</dd></div>
          {#each [['Contact', vue.stats.attaque.contact], ['Distance', vue.stats.attaque.distance], ['Magique', vue.stats.attaque.magique]] as [nom, v] (nom)}
            {#if v !== null}
              <div><dt>{nom}</dt><dd>{#if modifiable}<button class="jet" aria-label={`Lancer l'attaque ${String(nom).toLowerCase()}`} onclick={() => tester(`Attaque ${String(nom).toLowerCase()}`, v as number)}>{signe(v as number)}</button>{:else}{signe(v as number)}{/if}</dd></div>
            {/if}
          {/each}
          {#if vue.stats.reductionDegats}<div><dt>Réduction</dt><dd>{vue.stats.reductionDegats}</dd></div>{/if}
        </dl>
        <h3>Sauvegardes</h3>
        <dl class="stats">
          {#each Object.entries(vue.stats.sauvegardes) as [n, v] (n)}<div><dt>{n}</dt><dd>{#if modifiable}<button class="jet" aria-label={`Lancer ${n}`} onclick={() => tester(`Sauvegarde : ${n}`, v)}>{signe(v)}</button>{:else}{signe(v)}{/if}</dd></div>{/each}
        </dl>
      </div>
    </div>
  {:else if onglet === 'Capacités'}
    <div class="usage" role="group" aria-label="Usage des capacités">
      <button class="bascule" aria-pressed={usage === 'combat'} onclick={() => (usage = 'combat')}>En combat</button>
      <button class="bascule" aria-pressed={usage === 'hors'} onclick={() => (usage = 'hors')}>Hors combat</button>
    </div>
    {#each voiesMontrees as v (v.id)}
      <h3>{v.nom} {#if v.horsProfil}<span class="badge">hors profil</span>{/if}{#if v.chaos}<span class="badge">chaos</span>{/if}</h3>
      <ol class="rangs">
        {#each v.rangs as r (r.rang)}
          <li><strong>{r.rang}. {r.nom}</strong>{#if r.choix}<span class="badge">{r.choix}</span>{/if}{#if r.offert}<span class="badge">offert</span>{/if}<span class="effet">{r.effet}</span></li>
        {/each}
      </ol>
    {/each}
    {#if usage === 'combat'}
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
    {:else}
      <!-- L4.18 : l'arbre du Vécu, pour toutes les fiches. -->
      <ArbreVecu {fiche} {modifiable} {mj} />
      <!-- S3 (9a) : Réseau de rumeurs, une question au MJ, pour le joueur propriétaire. -->
      {#if modifiable && !mj && fiche.proprietaireUid === session.uid}<RumeursVecu {fiche} />{/if}
    {/if}
  {:else if onglet === 'Actions' && vue.refonte}
    <ActionsRefonte
      actions={vue.refonte.actions}
      magie={vue.refonte.magie}
      passifs={vue.refonte.passifs}
      classe={fiche.schemaVersion === 2 ? (classeDeLaRefonte(fiche.refonte.classe) ?? null) : null}
      {modifiable}
      surLancer={lancer}
    />
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
              {#if destinataires.length && don?.cle !== cle}
                <button class="discret petit" aria-label={`Donner ${o.nom}`} onclick={() => ouvrirDon(cle)}>Donner…</button>
              {/if}
            </span>
            {#if don && don.cle === cle}
              <span class="ligne don" role="group" aria-label={`Donner ${o.nom}`}>
                <select aria-label="Donner à" bind:value={don.a}>
                  <option value="">À qui ?</option>
                  {#each destinataires as d (d.perso)}<option value={d.perso}>{d.nom} ({d.joueur})</option>{/each}
                </select>
                {#if qte(o) > 1}
                  <input aria-label="Combien" class="quantite" type="number" min="1" max={qte(o)} bind:value={don.combien} />
                {/if}
                <button class="petit" disabled={!don.a} onclick={proposer}>Proposer</button>
                <button class="discret petit" onclick={() => (don = null)}>Annuler</button>
              </span>
            {/if}
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
  {:else}
    <div class="suivi">
      <div>
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
        {#if modifiable}
          <h3>Portrait</h3>
          <div class="ligne">
            <label class="bouton-fichier">Changer le portrait <input type="file" accept="image/*" onchange={changerPortrait} /></label>
            <button class="discret petit" onclick={() => ecrire(retirerPortrait(fiche.id))}>Retirer</button>
          </div>
        {/if}
      </div>
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
    </div>
  {/if}
  </div>
</section>

<style>
  .fiche {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  /* En-tête collant (L2.6) : reste visible quand la fiche défile, dans la page comme dans le panneau du MJ. */
  .tete {
    position: sticky;
    top: 0;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
    gap: 10px 24px;
    align-items: center;
    margin: -20px -20px 0;
    padding: 16px 20px 12px;
    background: var(--couleur-surface);
    border-bottom: 1px solid var(--couleur-bordure-douce);
    border-radius: var(--rayon-carte) var(--rayon-carte) 0 0;
  }
  .identite {
    display: flex;
    gap: 14px;
    align-items: center;
    min-width: 0;
  }
  .identite p {
    margin: 4px 0 0;
    color: var(--couleur-encre-douce);
  }
  .jauges {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .jauges .aide {
    margin: 0;
  }
  .progression,
  .ressource {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
  }
  .etiquette {
    width: 52px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--couleur-accent);
  }
  .barre {
    flex: 1 1 120px;
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
  .barre.pp {
    background: var(--couleur-accent-pale);
  }
  .barre.pp span {
    background: var(--couleur-accent-clair);
  }
  .etiquette.nom-jauge {
    width: auto;
    min-width: 52px;
  }
  .sans-barre {
    flex: 1 1 120px;
  }
  .barre.jauge {
    background: var(--couleur-accent-pale);
  }
  .barre.jauge span {
    background: var(--couleur-or);
  }
  .barre.crans {
    background: var(--couleur-accent-pale);
  }
  .barre.crans span {
    background: var(--couleur-or);
  }
  .pleine {
    color: var(--couleur-succes);
  }
  .ressource input {
    width: 56px;
    min-height: 32px;
    text-align: center;
  }
  .sur {
    font-variant-numeric: tabular-nums;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  .onglets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    border-bottom: 2px solid var(--couleur-bordure);
  }
  .onglet {
    min-height: 40px;
    margin-bottom: -2px;
    border-radius: var(--rayon) var(--rayon) 0 0;
    background: transparent;
    color: var(--couleur-encre-douce);
    border-bottom: 2px solid transparent;
  }
  .onglet[aria-selected='true'] {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border-bottom-color: var(--couleur-accent);
  }
  .panneau {
    display: flex;
    flex-direction: column;
    gap: 12px;
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
  .bouton-fichier {
    font-size: 13px;
    color: var(--couleur-accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .bouton-fichier input {
    display: none;
  }
  .combat,
  .suivi {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 16px 20px;
    align-items: start;
  }
  .combat > div,
  .suivi > div {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
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
  .caracs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 10px;
  }
  .carac {
    padding: 10px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .carac-tete {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .carac .code {
    font-weight: 700;
    color: var(--couleur-accent);
  }
  .carac ul {
    margin: 6px 0 0;
    padding-left: 18px;
    font-size: 14px;
  }
  .usage {
    display: inline-flex;
    align-self: flex-start;
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--rayon-pastille);
    overflow: hidden;
  }
  .bascule {
    min-height: 34px;
    border-radius: 0;
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
  }
  .bascule[aria-pressed='true'] {
    background: var(--couleur-accent-clair);
    color: #fff;
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
  .jet {
    min-height: 0;
    padding: 2px 10px;
    font-size: inherit;
    background: var(--couleur-accent-pale);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .petit-jet {
    font-size: 13px;
    padding: 0 8px;
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
  .actions-objet,
  .don {
    flex-basis: 100%;
  }
  .don {
    padding: 6px 8px;
    border-radius: var(--rayon);
    background: var(--couleur-accent-pale);
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
  @media (max-width: 1100px) {
    .tete,
    .combat,
    .suivi {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
