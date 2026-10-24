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
import { apercu, CATALOGUE, ciblageDe, preparerLancer, sortsDeCombat, type ChoixDuLancer } from '../combat/sorts';
import { centreDeZone } from '../combat/zone';
import { resoudreLancer } from '../effets/resolution';
import { actionAuPalier } from '../effets/paliers';
import { concentrationDuLancer } from '../combat/concentration';
import { invocationsDuLancer } from '../combat/invocations';
import { formuleTest } from '../regles/des';
import { ppDisponibles } from '../fiche/sorts-hors-combat';
import { vueFiche } from '../fiche/vue-fiche';
import type { Case } from '../battlemap/geometrie';
import { schemaCombattant, type Combat, type Combattant } from '../schemas/combat';
import type { Fiche, FicheV2 } from '../schemas/fiche';
import { session } from '../session.svelte';
import { blesser } from './attaques';
import { RefusCombat } from './combat';
import { noterJet } from './journal';
import { apresDeplacement, poserZone, type ContexteZones } from './zones';
import { finirConcentration, rompreParAttaque, type InvocationAPoser } from './invocations';

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
 */
export async function lancerSortEnCombat(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'round' | 'scene' | 'actif' | 'porteesLibres'>,
  moi: AvecId<Combattant>,
  fiche: AvecId<FicheV2>,
  choix: ChoixDuLancer,
  carte: CarteDuCombat | null,
  combattants: readonly AvecId<Combattant>[],
  fiches: ReadonlyMap<string, AvecId<Fiche>>,
  alea: () => number = Math.random,
): Promise<SortLance> {
  if (combat.actif !== moi.id) throw new RefusCombat('Ce n’est pas ton tour.');
  const agit = peutAgir(moi.etats);
  if (agit !== 'oui') throw new RefusCombat(agit === 'non' ? `${moi.nom} ne peut pas agir ce tour.` : `${moi.nom} ne peut que se déplacer ce tour.`);
  const s = sortsDeCombat(fiche).find((x) => x.id === choix.sort);
  const action = actionParId.get(choix.sort);
  if (!s || !action) throw new RefusCombat('Tu ne connais pas ce sort.');
  // 5a : l'action du tour, et les limites.
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

  // 4a : le coût, refusé s'il manque de quoi payer.
  const vue = vueFiche(fiche);
  if (r.cout.pp > ppDisponibles(fiche)) throw new RefusCombat(`Il te faut ${r.cout.pp} PP (il t’en reste ${ppDisponibles(fiche)}).`);
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
    const ecr = appliquerChangements(r.changements, lus, { id: moi.id, nom: fiche.nom, fiche }, { pv: new Map([[fiche.id, pvApresCout]]), jauges });
    const actionsPrises = s.typeAction === 'gratuite' ? {} : { tourActions: combat.tour, ...actions, [s.typeAction]: true };
    const moiMaj = { ...(ecr.combattants.get(moi.id) ?? {}), ...actionsPrises, ...(usages !== moi.usages ? { usages } : {}) };
    for (const [id, m] of ecr.combattants) if (id !== moi.id) tx.update(refCombattant(idCombat, id), m);
    if (Object.keys(moiMaj).length) tx.update(refCombattant(idCombat, moi.id), moiMaj);
    const maFiche: Record<string, unknown> = { ...(r.cout.pp ? { ppActuel: ppDisponibles(fiche) - r.cout.pp } : {}), ...(r.cout.pv ? { pvActuel: pvApresCout } : {}), ...(ecr.fiches.get(fiche.id) ?? {}) };
    for (const [id, m] of ecr.fiches) if (id !== fiche.id) tx.update(refPerso(id), m);
    if (Object.keys(maFiche).length) tx.update(refPerso(fiche.id), maFiche);
    return ecr;
  });

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
  const cout = [r.cout.pp ? `${r.cout.pp} PP` : '', r.cout.pv ? `${r.cout.pv} PV` : '', ...Object.entries(aPayer).map(([k, v]) => `${v} ${k}`)].filter(Boolean).join(', ');
  const premier = duLanceur[0];
  await noterJet(
    nom,
    premier ? '1d20' : '0',
    premier ? { des: premier.des, faces: 20, bonus: 0, total: premier.total } : { des: [], faces: 0, bonus: 0, total: 0 },
    fiche.nom,
    [`${fiche.nom} : ${issue}${cout ? ` (${cout})` : ''}`, ...duLanceur.map(texteJet), ...(e.lignes.get(moi.id) ?? []), ...e.auMj.map((x) => `MJ : ${x}`)].join(' ; '),
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
