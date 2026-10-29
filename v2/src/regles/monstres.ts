import type { EffetAttaqueMonstre } from '../lib/schemas/monstres';

/*
 * Le bestiaire en combat (lot L6.6a, décisions de Thomas du 28/10/2026).
 *
 * 1. Les états du bestiaire (identifiants v1, au féminin) et leur état de
 *    la refonte, du même nom. « entravée » et « immobilisée » : Immobilisé
 *    (ne se déplace pas). Sans équivalent, l'état n'est pas posé (au MJ) :
 *    « paralysée », « repoussée », « fascinée (illusoire) », « folie
 *    (illusoire) ».
 *
 * 2. Les effets des attaques (6b) : le texte `effetSpecial` de chaque
 *    attaque du bestiaire, traduit en données. Clé : `monstre|attaque`.
 *    N'est traduit que ce que le texte dit en toutes lettres : une
 *    sauvegarde (SAG, INT et CHA : la Volonté, 4a), un état du catalogue, un
 *    malus chiffré d'attaque ou de DEF, une poussée en cases (1,5 m par
 *    case), une limite d'usage, une recharge, un seuil de critique, des
 *    points de DEF ignorés, des jets séparés. Une condition (une charge,
 *    des dégâts ≥ 10, une cible du Chaos…) ne se vérifie pas : elle reste
 *    au MJ, comme tout ce qui n'est pas traduit (`auMj`). Les attaques des
 *    démons (drain, berserk) viennent avec L6.6b ; la Putréfaction est
 *    déjà jouée par `etatSurTouche` (L6.3).
 */

export const ETATS_BESTIAIRE: Readonly<Record<string, string>> = {
  aveuglee: 'aveugle',
  brulure: 'brulure',
  charmee: 'charme',
  confuse: 'confus',
  desarmee: 'desarme',
  effrayee: 'effroi',
  empoisonnee: 'empoisonne',
  endormie: 'endormi',
  entravee: 'immobilise',
  fascinee: 'fascine',
  hallucinee: 'hallucine',
  immobilisee: 'immobilise',
  influencee: 'influence',
  marquee_pretre: 'marque',
  maudite: 'maudit',
  ralentie: 'ralenti',
  renversee: 'renverse',
  silencieuse: 'silence',
};

const renverse = { id: 'renverse', rounds: null };
const immobilise = { id: 'immobilise', rounds: null };
const FOR = (dd: number) => ({ type: 'FOR' as const, dd });
const CON = (dd: number) => ({ type: 'CON' as const, dd });
const DEX = (dd: number) => ({ type: 'DEX' as const, dd });
const VOL = (dd: number) => ({ type: 'Volonte' as const, dd });

export const EFFETS_ATTAQUES: Readonly<Record<string, EffetAttaqueMonstre>> = {
  // « Une utilisation par combat (stock de 2 javelots). »
  'goblin_garde|Javelot': { parCombat: 1, auMj: 'Stock de 2 javelots.' },
  // « Si touché : cible entravée (DEF -2, pas de déplacement). Test FOR diff. 12 à chaque tour pour se libérer. Recharge : 3 rounds. »
  'goblin_chef|Filet de chasse': { recharge: 3, etats: [immobilise, { id: 'expose', rounds: null }], auMj: 'Test FOR diff. 12 à chaque tour pour se libérer (Immobilisé et Exposé tombent).' },
  // « Si touché : la cible doit réussir un test CON diff. 12 ou subir -1 en ATK jusqu'à la fin du combat (effet cumulable une fois max). »
  'goblin_chaman|Crachat de Sève noire': { sauvegarde: CON(12), malus: [{ sur: 'attaque', valeur: -1, rounds: null }], auMj: 'Effet cumulable une fois au plus.' },
  // « Si touché : test FOR diff. 11 ou la cible est renversée (DEF -2 jusqu'à se relever avec une action). »
  'loup_des_bois|Plaquage': { sauvegarde: FOR(11), etats: [renverse], auMj: null },
  // « Utilisable seulement si le sanglier se déplace d'au moins 6m en ligne droite avant l'attaque. Si touché : test FOR diff. 13 ou repoussé de 3m et renversé. »
  'sanglier_de_rage|Charge': { sauvegarde: FOR(13), repousse: 2, etats: [renverse], auMj: 'Seulement après 6 m en ligne droite.' },
  // « Si touché : test CON diff. 11 ou -1 en initiative jusqu'à la fin du combat. »
  'spectre_de_ruine|Toucher glacial': { sauvegarde: CON(11), auMj: 'Sauvegarde ratée : −1 en initiative jusqu’à la fin du combat.' },
  // « Recharge : 3 rounds. Test SAG diff. 12 ou la cible perd son action le prochain tour (paralysie de terreur). »
  'spectre_de_ruine|Hurlement du vide': { recharge: 3, sauvegarde: VOL(12), etats: [{ id: 'etourdi', rounds: 1 }], auMj: null },
  // « Si touché : la cible est saisie (ne peut pas se déplacer). Test FOR diff. 13 à chaque tour pour se libérer. La racine peut maintenir et attaquer en même temps. »
  'racine_eveille|Emprise': { etats: [immobilise], auMj: 'Test FOR diff. 13 à chaque tour pour se libérer ; la racine peut maintenir et attaquer.' },
  // « 1 utilisation (récupère la hache si il ne subit pas de dégâts ce tour). »
  'orc_pillard|Lancer de hache': { parCombat: 1, auMj: 'Récupère la hache s’il ne subit pas de dégâts ce tour.' },
  // « Si touché : test CON diff. 14 ou la cible est empoisonnée (1d4 dégâts par round, 3 rounds). L'antidote est de la Sève pure… »
  'sylvath_fragment|Liane de corruption': { sauvegarde: CON(14), etats: [{ id: 'empoisonne', rounds: 3, des: '1d4' }], auMj: 'L’antidote : de la Sève pure, appliquée par un Druide ou un Prêtre.' },
  // « Recharge : 4 rounds. Toutes les créatures dans la zone sont affectées. Test CON diff. 13 ou aveuglées pendant 1 round. »
  'sylvath_fragment|Explosion de spores': { recharge: 4, sauvegarde: CON(13), etats: [{ id: 'aveugle', rounds: 1 }], auMj: 'Toutes les créatures de la zone sont affectées.' },
  'garde_solvarn|Épée longue solaire': { auMj: '+1d4 dégâts contre les créatures du Chaos.' },
  // « Test FOR diff. 12 ou la cible est repoussée de 1,5m et perd son action de déplacement. »
  'garde_solvarn|Bouclier-frappe': { sauvegarde: FOR(12), repousse: 1, auMj: 'Sauvegarde ratée : elle perd aussi son action de déplacement.' },
  'golem_de_pierre_naine|Poing de granit': { auMj: 'Si dégâts ≥ 10 en une frappe : test FOR diff. 15 ou la cible est projetée à 3 m et renversée.' },
  'golem_de_pierre_naine|Piétinement': { auMj: 'Cible au sol uniquement. Les dégâts ignorent les armures légères.' },
  'elfe_du_crepuscule_renegat|Lame d\'ombre': { auMj: 'En lumière faible ou obscurité : +1d4 dégâts.' },
  // « Si touché : test SAG diff. 13 ou la cible est désorientée (-2 en ATK et DEF) pendant 1 round. »
  'elfe_du_crepuscule_renegat|Flèche de Sève noire': {
    sauvegarde: VOL(13),
    malus: [
      { sur: 'attaque', valeur: -2, rounds: 1 },
      { sur: 'DEF', valeur: -2, rounds: 1 },
    ],
    auMj: null,
  },
  'loup_veteran|Plaquage': { sauvegarde: FOR(11), etats: [renverse], auMj: null },
  // « Test CON diff. 12 ou -1 DEF pendant 3 rounds (Sève corrompue dans les crocs). »
  'loup_elite|Morsure empoisonnée': { sauvegarde: CON(12), malus: [{ sur: 'DEF', valeur: -1, rounds: 3 }], auMj: null },
  'loup_elite|Plaquage': { sauvegarde: FOR(12), etats: [renverse], auMj: null },
  // « Saignement : 1d4 dégâts/round pendant 3 rounds (test CON diff. 13 pour stopper). »
  'loup_champion|Morsure déchirante': { sauvegarde: CON(13), etats: [{ id: 'saignement', rounds: 3, des: '1d4' }], auMj: null },
  // « Test FOR diff. 15 ou renversé + désarmé. »
  'loup_champion|Plaquage brutal': { sauvegarde: FOR(15), etats: [renverse, { id: 'desarme', rounds: null }], auMj: null },
  'ours_veteran|Griffes lacérantes': { sauvegarde: CON(11), etats: [{ id: 'saignement', rounds: 2, des: '1d4' }], auMj: null },
  // « Si touché : cible saisie. Test FOR diff. 14 par tour pour se libérer. L'ours inflige 1d6+3 dégâts automatiques à chaque tour sur une cible saisie. »
  'ours_veteran|Étreinte': { etats: [immobilise], auMj: 'Test FOR diff. 14 par tour pour se libérer ; 1d6+3 dégâts automatiques à chaque tour tant qu’elle est saisie.' },
  'ours_elite|Étreinte écrasante': { etats: [immobilise], auMj: 'Test FOR diff. 16 pour se libérer ; 1d8+4 dégâts automatiques par tour ; saisie, elle ne lance pas de sorts.' },
  'ours_elite|Charge bélier': { sauvegarde: FOR(15), repousse: 2, etats: [renverse], auMj: 'Seulement après 6 m en ligne droite.' },
  // « Ignore 3 points de DEF (armure naturelle dépassée). »
  'ours_champion|Griffes dévastatrices': { defIgnoree: 3, auMj: null },
  'ours_champion|Morsure broyante': { auMj: 'Si dégâts ≥ 12 : brise une armure (DEF −2 pour tout le combat).' },
  'ours_champion|Dévastation': { parCombat: 1, auMj: 'Attaque tous les ennemis adjacents, un jet chacun.' },
  'orc_basique|Lancer de hache': { parCombat: 1, auMj: null },
  'orc_veteran|Bouclier-frappe': { sauvegarde: FOR(12), repousse: 1, auMj: null },
  // « 1 fois/round. Deux jets d'attaque séparés en une action. »
  'orc_elite|Double frappe': { unParRound: true, jets: 2, auMj: null },
  'orc_champion|Masse de guerre runique': { auMj: 'Contre les Elfes et les créatures de la Sève pure : +1d6 dégâts.' },
  'orc_champion|Double frappe': { unParRound: true, auMj: null },
  'bandit_veteran|Dague dans le dos': { auMj: 'Requiert le flanquement ou une cible surprise. Le 1d6 est l’Attaque sournoise.' },
  'bandit_elite|Pistolet d\'arçon': { parCombat: 1, auMj: 'Ignoré par les armures légères.' },
  'bandit_elite|Attaque sournoise': { auMj: 'Requiert le flanquement ou l’obscurité. Les 2d6 sont compris dans les dégâts de l’arme.' },
  'bandit_champion|Épée longue enchantée +1': { auMj: 'Le +1 vaut +1 dégât fixe (enchantement).' },
  'bandit_champion|Double frappe': { unParRound: true, auMj: null },
  'bandit_champion|Riposte': { auMj: 'Réaction si une attaque rate le Fléau. Gratuite, hors tour.' },
  // « 2 utilisations/combat. Les deux tirs comptent comme une action. »
  'bandit_champion|Pistolets jumelés': { parCombat: 2, jets: 2, auMj: null },
  'garde_basique|Arbalète légère': { recharge: 1, auMj: null },
  'garde_veteran|Bouclier-frappe': { sauvegarde: FOR(11), repousse: 1, auMj: null },
  'garde_elite|Bouclier héraldique': { sauvegarde: FOR(14), etats: [renverse], auMj: 'L’emblème peut intimider : test SAG diff. 10 ou −1 ATK.' },
  'garde_champion|Épée de la Couronne (enchantée +2)': { auMj: '+2 dégâts fixes (enchantement). Contre les créatures du Chaos : +1d6 dégâts.' },
  'garde_lancier_basique|Lance': { auMj: 'Peut attaquer à 1 case de plus. Si la cible charge vers lui : +1d4 dégâts.' },
  'garde_lancier_basique|Dague de ceinture': { auMj: 'Repli : au contact direct, quand la lance ne peut pas être maniée.' },
  'garde_lancier_veteran|Lance de guerre': { auMj: 'Portée allongée. Si la cible charge : +1d4 dégâts. Si 2 lanciers ciblent la même créature : test FOR diff. 12 ou repoussée de 1,5 m.' },
  // « Utilise l'extrémité de la lance au contact. Test FOR diff. 11 ou cible déséquilibrée (-1 DEF ce round). »
  'garde_lancier_veteran|Frappe de hampe': { sauvegarde: FOR(11), malus: [{ sur: 'DEF', valeur: -1, rounds: 1 }], auMj: null },
  'garde_lancier_elite|Lance longue renforcée': { auMj: 'Portée allongée. Charge ennemie : +1d6 dégâts. Peut viser une seconde créature alignée derrière (jet séparé à −2).' },
  'garde_lancier_elite|Frappe de hampe lourde': { sauvegarde: FOR(13), etats: [renverse], auMj: null },
  'garde_lancier_champion|Lance de primus (enchantée +1)': { auMj: 'Portée allongée. Charge : +1d8 dégâts. Percée : jusqu’à 2 créatures alignées (second jet à −1). +1 dégât fixe.' },
  'garde_lancier_champion|Balayage de hampe': { unParRound: true, auMj: 'Toutes les créatures de l’arc frontal (3 m, 180°), un jet chacune.' },
  'bandit_lancier_basique|Pique improvisée': { auMj: 'Portée allongée. Au contact direct : −2 ATK.' },
  'bandit_lancier_basique|Couteau': { auMj: 'Repli d’urgence si désarmé ou au contact direct.' },
  'bandit_lancier_veteran|Lance de chasse': { auMj: 'Portée allongée. Peut lancer la lance (6 m, 1d8+1, une fois, récupérable).' },
  'bandit_lancier_veteran|Lance jetée': { parCombat: 1, auMj: 'Récupérable si pas de combat à portée. Après le lancer, combat au couteau.' },
  'bandit_lancier_elite|Fauchard de bande': { auMj: 'Portée allongée. Charge : +1d6 dégâts. Feinte : test CHA diff. 11, la cible perd sa DEF de bouclier ce round.' },
  // « Test DEX diff. 12 ou cible renversée. Utilisable 1 fois/combat. »
  'bandit_lancier_elite|Balayage bas': { parCombat: 1, sauvegarde: DEX(12), etats: [renverse], auMj: null },
  'bandit_lancier_champion|Hallebarde de guerre': { auMj: 'Portée allongée. Charge : +1d8 dégâts. Si dégâts ≥ 12 : saignement (1d4 par round, 3 rounds, CON diff. 12 pour stopper).' },
  'bandit_lancier_champion|Double frappe': { unParRound: true, auMj: 'Peut viser deux créatures différentes à portée.' },
  'bandit_lancier_champion|Riposte': { auMj: 'Réaction si une attaque rate La Pointe. Gratuite, hors tour.' },
  'chevalier_inquisiteur_veteran|Épée de jugement': { auMj: '+1d6 dégâts contre les créatures du Chaos ou les personnages en Marque ou Fracture.' },
  'chevalier_inquisiteur_elite|Épée de jugement (bénie)': { auMj: '+1d6 dégâts contre les créatures du Chaos ou les personnages en Marque ou Fracture.' },
  'chevalier_inquisiteur_elite|Jugement': { parCombat: 1, auMj: 'Touche d’office une cible en Fracture de corruption.' },
  'chevalier_inquisiteur_champion|Épée du Concile (enchantée +2)': { auMj: '+2 dégâts fixes (enchantement). +1d6 contre les créatures du Chaos ou les personnages en Marque ou Fracture.' },
  'chevalier_inquisiteur_champion|Bûcher purificateur': { parCombat: 1, auMj: 'Zone de 3 m. Ignore la moitié de l’armure des créatures du Chaos.' },
  'ordre_pont_veteran|Bouclier du Pont': { sauvegarde: FOR(12), repousse: 1, auMj: null },
  'ordre_pont_champion|Épée du Serment (héritage de l\'Ordre)': { auMj: '+1d6 dégâts contre une cible qui a frappé un allié tombé à terre ce combat.' },
  'squelette_lame|Estoc rouillé': { auMj: '1 fois par round : peut refuser une attaque de contact reçue (ATK de l’attaquant contre DEF + 2 ; échec : annulée).' },
  'ossuaire_ambulant|Fauchage d\'os': { auMj: 'Touche jusqu’à 2 cibles adjacentes en un seul jet.' },
  // « Critique sur 19-20 (au lieu de 20 seul). »
  'connetable_cendre|Lame du serment brisé': { critique: 19, auMj: null },
  'charogne_du_chaos|Morsure putride': { sauvegarde: CON(10), auMj: 'Sauvegarde ratée : −1 aux tests physiques pendant 1 round (infection mineure).' },
  'charogne_enragee|Griffures frénétiques': { auMj: '2 attaques par round contre une cible déjà infectée (Morsure putride ou semblable).' },
  'colosse_charognard|Poigne broyeuse': { sauvegarde: FOR(14), etats: [immobilise], auMj: 'Sauvegarde ratée : 1d6 dégâts automatiques au round suivant si elle est toujours saisie.' },
  // « Si touché : test CON diff. 12 ou paralysé 1 round (sans effet contre les morts-vivants et les constructs). »
  'goule_des_cendres|Morsure paralysante': {
    sauvegarde: CON(12),
    etats: [
      { id: 'etourdi', rounds: 1 },
      { id: 'immobilise', rounds: 1 },
    ],
    auMj: 'Sans effet contre les morts-vivants et les constructs.',
  },
  'faucheur_de_brume|Faux spectrale': { sauvegarde: CON(13), auMj: 'Sauvegarde ratée : −2 PV maximum jusqu’à la fin du combat (vol de vitalité).' },
  'coeur_pourri|Étreinte racinaire': { sauvegarde: FOR(14), etats: [immobilise], auMj: 'Saisie : 1d6 dégâts automatiques par round tant qu’elle le reste.' },
  // « Si touché : test SAG diff. 14 ou la cible est hallucinée 1 round (attaque au hasard une créature adjacente, y compris un allié, s'il y en a une). »
  'vestige_hallucine|Toucher de dissolution': { sauvegarde: VOL(14), etats: [{ id: 'confus', rounds: 1 }], auMj: null },
  'seigneur_gangrene|Lame de la Gangrène': { critique: 19, auMj: 'Touchée : marquée par la corruption (conséquence narrative, à la discrétion du MJ).' },
  'cupide_meneur|Pistolet usé': { parCombat: 1, auMj: 'Ignoré par les armures légères.' },
  'charogne_du_chaos_champion|Étreinte du charnier': { sauvegarde: CON(12), auMj: 'Sauvegarde ratée : −2 aux tests physiques pendant 1 round (infection majeure).' },
  'ordre_pont_elite|Bouclier du Pont': { sauvegarde: FOR(12), repousse: 1, auMj: null },
  'rodeur_de_brume|Morsure silencieuse': { auMj: 'Depuis la dissimulation : la cible ne peut pas réagir ce round.' },
  'loup_de_la_sombre|Morsure de charogne': { auMj: 'Cible sous la moitié de ses PV : ignore 1 point de réduction de dégâts.' },
  'verrat_roi_futaies|Boutoir': { sauvegarde: FOR(15), etats: [renverse], auMj: 'Seulement après 6 m en ligne droite.' },
  'silure_de_la_lisdane|Gueule aspirante': { auMj: 'Si l’attaque dépasse la DEF de 5 ou plus et que la cible est de taille moyenne ou moins : engloutie (cf. Engloutissement).' },
  'tisserand_des_cimes|Fil tranchant': { sauvegarde: DEX(13), etats: [immobilise], auMj: 'Entravée : −2 aux attaques aussi ; se libérer : action complète, test FOR diff. 13.' },
  'chasseur_de_verre|Morsure de verre': { auMj: 'Après la morsure, il peut se déplacer de 3 m sans provoquer d’attaque d’opportunité.' },
  'cerf_blanc|Ramure': { sauvegarde: FOR(14), repousse: 2, auMj: 'Uniquement en riposte, ou acculé.' },
  'nuee_scarabees_forge|Grouillement': { auMj: 'Touche d’office toute créature qui finit son tour dans la case de la nuée, sans jet.' },
  'ver_de_roche_adulte|Morsure annelée': { auMj: 'S’il surgit du sol ce round : la cible perd sa réduction de dégâts pour cette attaque.' },
  'mere_de_roche|Broiement': { auMj: 'Cible grande ou moins : agrippée ; elle subit les dégâts du Broiement au début du tour suivant de la Mère, sauf si elle se libère (test FOR diff. 17).' },
};

/** L'effet traduit d'une attaque du bestiaire, ou null. */
export function effetAttaque(monstre: string, attaque: string): EffetAttaqueMonstre | null {
  return EFFETS_ATTAQUES[`${monstre}|${attaque}`] ?? null;
}
