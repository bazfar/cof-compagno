import { doc, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import { actionParId } from '../../regles/index.ts';
import { lancerDegats, type CarteDuCombat } from '../combat/attaque';
import { appliquerChangements, texteJet, type Lu } from '../combat/changements';
import { peutAgir } from '../combat/etats';
import { actionsDuTour } from '../combat/ordre';
import { arriveePermise, DEGATS_COLLISION_DECOR, DEGATS_COLLISION_JETON, trajet } from '../combat/poussee';
import { payer, type Jauges } from '../combat/ressources';
import { zoneDuSort } from '../combat/effets-zone';
import { apercu, CATALOGUE, ciblageDe, OPPORTUNITE, preparerLancer, reactionsDeCombat, sortsDeCombat, type ChoixDuLancer } from '../combat/sorts';
import { centreDeZone } from '../combat/zone';
import { resoudreLancer } from '../effets/resolution';
import { actionAuPalier } from '../effets/paliers';
import { concentrationDuLancer } from '../combat/concentration';
import { invocationsDuLancer } from '../combat/invocations';
import { formuleTest } from '../regles/des';
import { combinaisonUnParCombat } from '../combat/options-lancer';
import { poserPosture, textePosture, USAGE_COMBINAISON } from '../combat/posture';
import { estDeSang } from '../combat/passifs';
import { jouerPassifs } from './passifs';
import { reactionDisponible, USAGE_REACTION } from '../combat/reactions';
import { legendairesServies, USAGE_LEGENDAIRE } from '../combat/legendaire';
import { ppDisponibles } from '../fiche/sorts-hors-combat';
import { vueFiche } from '../fiche/vue-fiche';
import type { Case } from '../battlemap/geometrie';
import { schemaCombattant, type BonusCombat, type Combat, type Combattant } from '../schemas/combat';
import type { Fiche, FicheV2 } from '../schemas/fiche';
import { session } from '../session.svelte';
import { blesser } from './attaques';
import { RefusCombat } from './combat';
import { noterJet } from './journal';
import { apresDeplacement, poserZone, type ContexteZones } from './zones';
import { finirConcentration, rompreParAttaque, type InvocationAPoser } from './invocations';
import { coutAuPalier, degatsAuPalier, palierDe, plongeeGagnee, verseParLeSort } from '../combat/remous';
import type { Remous } from '../schemas/remous';
import { alimenterRemous } from './remous';

/*
 * Lancer un sort ou une capacité en combat (lot L6.4a, décisions de Thomas
 * du 23/10/2026). Les règles sont dans lib/combat (sorts.ts, zone.ts,
 * changements.ts) et dans le moteur (lib/effets/resolution.ts) ; ce module
 * vérifie le tour, paie, écrit et note au journal.
 *   - 2a : le client du lanceur résout ; les PV des monstres, leurs états
 *     et ceux des PJ sont lus et écrits dans une transaction ;
 *   - 4a : le coût de combat entier (PP, PV du sang, ressources de classe),
 *     payé même si le sort rate ou dérape (le moteur le dit) ;
 *   - 5a : l'action du tour que prend l'action, refusée si elle est déjà
 *     prise ; les limites « 1×/round » et « 1×/combat » ;
 *   - 10a : les changements appliqués (changements.ts) ; les déplacements
 *     joués sur la carte, ceux qu'on place à la main rendus au joueur ;
 *   - 13a : au journal, le jet du lanceur, puis chaque cible : sa
 *     sauvegarde ou l'attaque, et ce qu'elle prend.
 *
 * Lot L6.4b2 (décisions de Thomas du 24/10/2026) :
 *   - 1a, 3a : un sort de concentration réussi remplace celle du lanceur
 *     (ce que l'ancienne a posé s'en va d'abord), puis s'inscrit sur son
 *     combattant ; une attaque d'un sort contre la cible d'une concentration
 *     qui le dit la rompt ;
 *   - 13b, 4a, 5a, 6a : ce que le sort appelle est rendu à la barre, qui le
 *     fait poser d'un clic ; l'initiative est lancée ici, un jet par lancer,
 *     au journal.
 *
 * Lot L6.7b (décisions de Thomas du 29/10/2026) : `combat.remous`, la
 * jauge de la scène. 8a : un sort qui coûte des PP coûte moins et frappe
 * plus fort au palier ; 6a, 7a : il verse ses PP réellement payés (× la
 * race) et sa Plongée dans la jauge, payé même s'il rate.
 */

type AvecId<T> = T & { id: string };

const refCombattant = (idCombat: string, c: string) => doc(db, `tables/${session.table}/combats/${idCombat}/combattants/${c}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);
const refJeton = (scene: string, id: string) => doc(db, `tables/${session.table}/scenes/${scene}/jetons/${id}`);

/** Un déplacement que le joueur place à la main (téléporte, libre). */
export interface APlacer {
  cible: string;
  nom: string;
  cases: number;
}

export interface SortLance {
  issue: 'reussi' | 'echecEcole' | 'derapage';
  /** Ce que la barre dit en une phrase. */
  texte: string;
  aPlacer: APlacer[];
  /** L6.4b2 (13b) : les créatures appelées, à poser d'un clic. */
  aInvoquer: InvocationAPoser[];
}

export { texteJet };

/**
 * Le joueur lance un sort ou une capacité, à son tour (2a, 5a) : le moteur
 * résout, il paie, les cibles prennent (10a). Rend l'issue et les
 * déplacements à placer.
 *
 * L6.5b (1a) : `choix.reaction` : une réaction, que le client du MJ joue
 * pour lui, hors de son tour ; elle ne prend pas d'action du tour, mais la
 * réaction du round (7a) ; ses bonus de DEF et d'attaque tombent avec la
 * prochaine attaque (8a).
 */
export async function lancerSortEnCombat(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'round' | 'scene' | 'actif' | 'porteesLibres'> & { remous?: Remous | null },
  moi: AvecId<Combattant>,
  fiche: AvecId<FicheV2>,
  choix: ChoixDuLancer,
  carte: CarteDuCombat | null,
  combattants: readonly AvecId<Combattant>[],
  fiches: ReadonlyMap<string, AvecId<Fiche>>,
  alea: () => number = Math.random,
): Promise<SortLance> {
  // L6.5b (6a, 7a) : une réaction se joue hors de son tour, une par round.
  const reaction = !!choix.reaction;
  if (reaction && combat.actif === moi.id) throw new RefusCombat('À ton tour, pas de réaction : elle se joue hors de ton tour.');
  if (reaction && !reactionDisponible(moi)) throw new RefusCombat(`${moi.nom} a déjà réagi ce round.`);
  if (!reaction && combat.actif !== moi.id) throw new RefusCombat('Ce n’est pas ton tour.');
  const agit = peutAgir(moi.etats);
  if (agit !== 'oui') throw new RefusCombat(agit === 'non' ? `${moi.nom} ne peut pas agir ce tour.` : `${moi.nom} ne peut que se déplacer ce tour.`);
  const s = (reaction ? reactionsDeCombat : sortsDeCombat)(fiche).find((x) => x.id === choix.sort);
  const action = actionParId.get(choix.sort);
  if (!s || !action) throw new RefusCombat('Tu ne connais pas ce sort.');
  // 5a : l'action du tour, et les limites. Hors de son tour (une réaction), ses actions du tour sont libres.
  const actions = actionsDuTour(moi, combat.tour);
  if (s.typeAction === 'principale' && actions.principale) throw new RefusCombat('L’action principale est déjà prise ce tour.');
  if (s.typeAction === 'secondaire' && actions.secondaire) throw new RefusCombat('L’action secondaire est déjà prise ce tour.');
  const usage = moi.usages[s.id];
  if (s.limite === '1x/combat' && usage) throw new RefusCombat(`${s.nom} a déjà servi ce combat.`);
  if (s.limite === '1x/round' && usage === combat.round) throw new RefusCombat(`${s.nom} a déjà servi ce round.`);
  if ((s.limite === '1x/scene' || s.limite === '1x/scenario') && usage) throw new RefusCombat(`${s.nom} a déjà servi.`);

  const lancer = preparerLancer(fiche, moi, combat, choix, carte, combattants, fiches, alea);
  if (typeof lancer === 'string') throw new RefusCombat(lancer);
  const r = resoudreLancer(lancer, CATALOGUE);
  if (!r.ok) throw new RefusCombat(`${s.nom} : ${r.raison}.`);

  // 4a : le coût, refusé s'il manque de quoi payer ; L6.7b (8a) : moins cher au palier du Remous.
  const palier = palierDe(combat.remous ?? null);
  const pp = coutAuPalier(r.cout.pp, palier);
  const vue = vueFiche(fiche);
  if (pp > ppDisponibles(fiche)) throw new RefusCombat(`Il te faut ${pp} PP (il t’en reste ${ppDisponibles(fiche)}).`);
  if (r.cout.pv && r.cout.pv >= vue.pv.actuel) throw new RefusCombat(`Il te faut plus de ${r.cout.pv} PV.`);
  let jauges: Jauges = {};
  const aPayer = { ...(r.cout.ressources ?? {}), ...(r.cout.sacre ? { sacre: (r.cout.ressources?.sacre ?? 0) + r.cout.sacre } : {}) };
  for (const [cle, montant] of Object.entries(aPayer)) {
    const p = payer({ ...fiche, refonte: { ...fiche.refonte, jauges: { ...fiche.refonte.jauges, ...jauges } } } as FicheV2, cle, montant);
    if (typeof p === 'string') throw new RefusCombat(p);
    jauges = { ...jauges, ...p };
  }
  let usages = moi.usages;
  if (r.cout.attaqueSpecialeDuCombat) {
    if (usages.attaqueSpeciale) throw new RefusCombat('L’attaque spéciale du combat est déjà faite.');
    usages = { ...usages, attaqueSpeciale: combat.round };
  }
  if (s.limite !== 'volonte') usages = { ...usages, [s.id]: combat.round };
  if (reaction) usages = { ...usages, [USAGE_REACTION]: combat.tour };
  // L6.5a (4a) : une combinaison dont le second élément n'est pas Maître sert une fois par combat.
  const second = lancer.secondElement ?? null;
  if (combinaisonUnParCombat(second?.maitrise ?? null)) {
    if (moi.usages[USAGE_COMBINAISON]) throw new RefusCombat('La combinaison du combat est déjà faite.');
    usages = { ...usages, [USAGE_COMBINAISON]: combat.round };
  }
  // L6.5a (3a) : la posture tient jusqu'à ce qu'il en change ; le moteur la pose pour un round, l'app la rend durable.
  const posture = lancer.posture && r.changements.some((c) => c.type === 'bonus' && c.cible === moi.id) ? lancer.posture : null;
  const sansPosture = posture ? r.changements.filter((c) => !(c.type === 'bonus' && c.cible === moi.id && (c.sur === posture.plus || c.sur === posture.moins))) : r.changements;
  // L6.5b (4) : le déplacement va au bout, l'opportunité part quand même : « Son déplacement s'arrête là » ne se joue pas.
  const sansRemous = s.id === OPPORTUNITE ? sansPosture.filter((c) => c.type !== 'narratif') : sansPosture;
  // L6.7b (8a) : un sort qui puise des PP frappe plus fort au palier.
  const changements = r.cout.pp ? degatsAuPalier(sansRemous, palier) : sansRemous;

  // L6.4b2 (1a, 3a) : un sort de concentration réussi met fin à l'ancienne avant de s'écrire.
  const lancerId = `t${combat.tour}`;
  const auPalier = actionAuPalier(action, r.palierLance);
  const seConcentre = r.issue === 'reussi' && auPalier.persistance.type === 'concentration';
  if (seConcentre && moi.concentration) await finirConcentration(idCombat, combat.scene, moi, combattants, `${s.nom} la remplace`, fiche.nom);

  // Ceux que le sort touche : lus et écrits dans une transaction (2a).
  const touches = new Set<string>([moi.id]);
  for (const c of r.changements) if ('cible' in c) touches.add(c.cible);
  const parId = new Map(combattants.map((c) => [c.id, c]));
  const pvApresCout = vue.pv.actuel - r.cout.pv;
  const e = await runTransaction(db, async (tx) => {
    const lus = new Map<string, Lu>();
    for (const id of touches) {
      if (!parId.has(id)) continue;
      const d = await tx.get(refCombattant(idCombat, id));
      if (!d.exists()) continue;
      const c = { ...schemaCombattant.parse(d.data()), id };
      lus.set(id, { c, fiche: c.perso ? (c.perso === fiche.id ? fiche : (fiches.get(c.perso) ?? null)) : null });
    }
    const ecr = appliquerChangements(changements, lus, { id: moi.id, nom: fiche.nom, fiche }, { pv: new Map([[fiche.id, pvApresCout]]), jauges, reaction });
    // L6.6a (7a) : les résistances légendaires que le sort a coûtées à un boss.
    for (const [id, n] of legendairesServies(r.jets)) {
      const c = lus.get(id)?.c;
      if (!c) continue;
      ecr.combattants.set(id, { ...(ecr.combattants.get(id) ?? {}), usages: { ...c.usages, [USAGE_LEGENDAIRE]: Math.min(999, (c.usages[USAGE_LEGENDAIRE] ?? 0) + n) } });
    }
    const actionsPrises = reaction || s.typeAction === 'gratuite' ? {} : { tourActions: combat.tour, ...actions, [s.typeAction]: true };
    const moiMaj: Record<string, unknown> = { ...(ecr.combattants.get(moi.id) ?? {}), ...actionsPrises, ...(usages !== moi.usages ? { usages } : {}) };
    if (posture) {
      const avant = (moiMaj.bonus as BonusCombat[] | undefined) ?? lus.get(moi.id)?.c.bonus ?? moi.bonus;
      moiMaj.bonus = poserPosture(avant, posture);
      ecr.lignes.set(moi.id, [...(ecr.lignes.get(moi.id) ?? []), textePosture(posture)]);
    }
    for (const [id, m] of ecr.combattants) if (id !== moi.id) tx.update(refCombattant(idCombat, id), m);
    if (Object.keys(moiMaj).length) tx.update(refCombattant(idCombat, moi.id), moiMaj);
    const maFiche: Record<string, unknown> = { ...(pp ? { ppActuel: ppDisponibles(fiche) - pp } : {}), ...(r.cout.pv ? { pvActuel: pvApresCout } : {}), ...(ecr.fiches.get(fiche.id) ?? {}) };
    for (const [id, m] of ecr.fiches) if (id !== fiche.id) tx.update(refPerso(id), m);
    if (Object.keys(maFiche).length) tx.update(refPerso(fiche.id), maFiche);
    return ecr;
  });

  // L6.7b (6a, 7a) : ce que le sort verse au Remous de la scène.
  await alimenterRemous(combat.scene, verseParLeSort(fiche.race ?? '', pp, plongeeGagnee(r.changements, moi.id)), fiche.id);

  // L6.5a (12a) : un ennemi abattu par ce sort déclenche ses passifs (Soif de sang, Sang impie).
  const abattus = [...e.combattants].filter(([id, m]) => m.aTerre === true && parId.get(id)?.genre === 'monstre' && !parId.get(id)?.aTerre);
  if (abattus.length) {
    const pvApres = (e.fiches.get(fiche.id)?.pvActuel as number | undefined) ?? pvApresCout;
    await jouerPassifs(idCombat, moi, fiche, { quoi: 'ennemiAbattu', parSortDeSang: estDeSang(action, lancer.element?.id ?? null) }, pvApres, alea);
  }

  // L6.4b1 (5a, 8a, 10a) : une zone qui dure, un piège ou un terrain reste au sol.
  const lanceurJeton = carte?.jetons.find((j) => j.id === moi.id) ?? null;
  const cib = ciblageDe(s.id, r.palierLance);
  let zonePosee: string | null = null;
  if (carte && lanceurJeton && cib && r.issue === 'reussi') {
    const vise = choix.visee.point ?? carte.jetons.find((j) => j.id === choix.visee.cibles[0]) ?? lanceurJeton;
    const cases = cib.zone ? apercu(carte.scene, carte.jetons, moi.id, cib, choix.visee, true).cases : cib.type === 'point' ? [vise] : [];
    const suit = !!cib.zone && cib.zone.origine === 'lanceur' && (cib.zone.forme === 'carre' || cib.zone.forme === 'cercle');
    const l = lancer.lanceur;
    const mods = Object.fromEntries(Object.entries(l.mods ?? {}).filter(([, v]) => Number.isInteger(v)));
    const z = zoneDuSort({
      action: s.id,
      palier: r.palierLance,
      element: lancer.element ?? null,
      lanceur: { id: moi.id, nom: fiche.nom.slice(0, 40), camp: 'pj', def: l.def, sauvegardes: { FOR: l.sauvegardes.FOR, DEX: l.sauvegardes.DEX, CON: l.sauvegardes.CON, Volonte: l.sauvegardes.Volonte }, modMagie: l.modMagie, attaqueMagique: l.attaqueMagique, niveau: l.niveau ?? 1, mods },
      dd: r.dd,
      cases,
      ancre: suit ? lanceurJeton : cib.zone ? centreDeZone(cib.zone, lanceurJeton, vise) : vise,
      suit,
      changements: r.changements,
      maintenant: Date.now(),
    });
    if (z) zonePosee = await poserZone(idCombat, z);
  }
  if (zonePosee) e.auMj.splice(0, e.auMj.length, ...e.auMj.filter((x) => !x.startsWith('Terrain')));

  // L6.4b2 (13b, 5a, 6a) : les créatures appelées ; un jet d'initiative par lancer.
  const maitre = { niveau: lancer.lanceur.niveau ?? fiche.niveau, modMagie: lancer.lanceur.modMagie, attaqueMagique: lancer.lanceur.attaqueMagique, def: lancer.lanceur.def, pvActuel: pvApresCout, modInit: moi.modInit };
  // Un sort raté ou qui dérape ne rend pas d'invocation : le moteur ne l'a pas appelée.
  const aInvoquer: InvocationAPoser[] = invocationsDuLancer(r.changements, moi.id, lancerId).map((a) => ({ ...a, maitre, de: 1 + Math.floor(alea() * 20), lancer: lancerId }));
  if (aInvoquer.length) e.auMj.splice(0, e.auMj.length, ...e.auMj.filter((x) => !x.startsWith('Invocation')));

  // 13a : au journal, le lanceur, puis chaque cible.
  const nom = `${s.nom} ${r.palierLance}`;
  const duLanceur = r.jets.filter((j) => !j.cible);
  const issue = r.issue === 'echecEcole' ? 'raté (maîtrise de l’école)' : r.issue === 'derapage' ? 'l’élément dérape' : 'lancé';
  const cout = [pp ? `${pp} PP` : '', r.cout.pv ? `${r.cout.pv} PV` : '', ...Object.entries(aPayer).map(([k, v]) => `${v} ${k}`)].filter(Boolean).join(', ');
  const premier = duLanceur[0];
  await noterJet(
    nom,
    premier ? '1d20' : '0',
    premier ? { des: premier.des, faces: 20, bonus: 0, total: premier.total } : { des: [], faces: 0, bonus: 0, total: 0 },
    fiche.nom,
    [`${fiche.nom} : ${issue}${cout ? ` (${cout})` : ''}`, ...(r.cout.pp && palier.palier ? [`Remous, palier ${palier.palier} : −${palier.coutSorts} PP, +${palier.degatsSorts} dégâts`] : []), ...duLanceur.map(texteJet), ...(e.lignes.get(moi.id) ?? []), ...e.auMj.map((x) => `MJ : ${x}`)].join(' ; '),
  );
  const cibles = [...new Set([...r.jets.filter((j) => j.cible && j.cible !== moi.id).map((j) => j.cible!), ...[...e.lignes.keys()].filter((id) => id !== moi.id)])];
  for (const id of cibles) {
    const jets = r.jets.filter((j) => j.cible === id);
    const j = jets[0];
    const nomCible = parId.get(id)?.nom ?? id;
    const detail = [...jets.map(texteJet), ...(e.lignes.get(id) ?? [])].join(' ; ') || 'rien';
    await noterJet(`${s.nom} sur ${nomCible}`, j ? '1d20' : '0', j ? { des: j.des, faces: 20, bonus: 0, total: j.total } : { des: [], faces: 0, bonus: 0, total: 0 }, fiche.nom, detail);
  }

  for (const a of aInvoquer)
    await noterJet(`Initiative de ${a.nom}`, formuleTest(moi.modInit), { des: [a.de], faces: 20, bonus: moi.modInit, total: a.de + moi.modInit }, fiche.nom, `${a.ids.length > 1 ? `${a.ids.length} × ` : ''}${a.nom} : à poser, ${a.portee} cases au plus.`);

  // L6.4b2 (1a) : une attaque du sort contre la cible d'une concentration qui le dit la rompt.
  for (const id of new Set(r.jets.filter((j) => j.cible && j.quoi.startsWith('attaque')).map((j) => j.cible!))) await rompreParAttaque(idCombat, combat.scene, id, combattants, fiche.nom);
  // 1a, 3a : la concentration s'inscrit, avec ce que le lancer a posé.
  const conc = seConcentre ? concentrationDuLancer(auPalier, lancerId, r.changements, zonePosee, aInvoquer.flatMap((a) => a.ids)) : null;
  if (conc) await updateDoc(refCombattant(idCombat, moi.id), { concentration: conc });

  // 10a : les déplacements.
  const aPlacer: APlacer[] = [];
  let jetons = carte?.jetons ?? [];
  // Une zone posée sur une case repousse ou attire depuis son centre (Vortex) ; sinon, depuis le lanceur.
  const zone = ciblageDe(s.id, r.palierLance)?.zone ?? null;
  const centre = choix.visee.point ?? jetons.find((j) => j.id === choix.visee.cibles[0]) ?? null;
  const origine = zone && zone.origine !== 'lanceur' && centre ? { cx: centre.cx, cy: centre.cy } : null;
  for (const d of e.deplacements) {
    const c = parId.get(d.cible);
    if (!c) continue;
    if (d.sens === 'teleporte' || d.sens === 'libre') {
      aPlacer.push({ cible: d.cible, nom: c.nom, cases: d.cases });
      continue;
    }
    if (!carte) continue;
    const lanceur = jetons.find((j) => j.id === moi.id);
    if (!lanceur) continue;
    const t = trajet(carte.scene, jetons, origine ?? lanceur, d.cible, d.sens, d.cases);
    if (t.vers) {
      const v = t.vers;
      await updateDoc(refJeton(combat.scene, d.cible), { cx: v.cx, cy: v.cy });
      const avant = jetons.find((j) => j.id === d.cible);
      jetons = jetons.map((j) => (j.id === d.cible ? { ...j, cx: v.cx, cy: v.cy } : j));
      // L6.4b1 (7a) : poussé ou attiré dans une zone, il la déclenche.
      if (avant && carte.zones?.length) await apresDeplacement(contexteZones(carte, jetons, combat, idCombat, combattants, fiches, fiche.nom), { id: d.cible, de: avant, vers: v }, alea);
    }
    if (t.collision) {
      // L'état d'après le sort : ses états, ses PV temporaires, les PV de sa fiche.
      const apres = (x: AvecId<Combattant>): AvecId<Combattant> => ({ ...x, ...(e.combattants.get(x.id) ?? {}) }) as AvecId<Combattant>;
      const ficheDe = (x: AvecId<Combattant>) => {
        const f = x.perso ? (x.perso === fiche.id ? fiche : (fiches.get(x.perso) ?? null)) : null;
        return f ? ({ ...f, ...(e.fiches.get(f.id)?.pvActuel !== undefined ? { pvActuel: e.fiches.get(f.id)!.pvActuel } : {}) } as AvecId<Fiche>) : null;
      };
      const formule = t.collision.collision === 'jeton' ? DEGATS_COLLISION_JETON : DEGATS_COLLISION_DECOR;
      await blesser(idCombat, apres(c), ficheDe(c), lancerDegats(formule, alea)!, formule, 'physique', `Collision : ${c.nom} ${t.collision.collision === 'jeton' ? 'heurte un jeton' : 'heurte le décor'}`, fiche.nom);
      const autre = t.collision.collision === 'jeton' ? parId.get(t.collision.avec) : undefined;
      if (autre) await blesser(idCombat, apres(autre), ficheDe(autre), lancerDegats(formule, alea)!, formule, 'physique', `Collision : ${autre.nom} est heurté`, fiche.nom);
    }
  }
  const texte = r.issue === 'reussi' ? `${nom} lancé.` : r.issue === 'echecEcole' ? `${nom} : raté, les PP sont dépensés.` : `${nom} : l’élément dérape, le sort échoue.`;
  return { issue: r.issue, texte: `${texte}${conc ? ` Concentration : ${conc.nom}.` : ''}`, aPlacer, aInvoquer };
}

/** Les zones du combat sur la carte, pour les déclencher (L6.4b1). */
export function contexteZones(
  carte: CarteDuCombat,
  jetons: CarteDuCombat['jetons'],
  combat: Pick<Combat, 'tour'>,
  idCombat: string,
  combattants: readonly AvecId<Combattant>[],
  fiches: ReadonlyMap<string, AvecId<Fiche>>,
  auteur: string,
): ContexteZones {
  return { lieu: { combat: idCombat }, zones: (carte.zones ?? []).filter((z) => !carte.idsZonesCombat || carte.idsZonesCombat.has(z.id)), jetons, combat: { id: idCombat, tour: combat.tour }, combattants, fiches, auteur };
}

/** Placer un jeton déplacé par un sort (téléporte, libre : 10a) sur la case cliquée. */
export async function placerParSort(scene: string, carte: CarteDuCombat, p: APlacer, vers: Case): Promise<void> {
  const refus = arriveePermise(carte.scene, carte.jetons, p.cible, vers, p.cases);
  if (refus) throw new RefusCombat(`${p.nom} : ${refus}.`);
  await updateDoc(refJeton(scene, p.cible), { cx: vers.cx, cy: vers.cy });
}
