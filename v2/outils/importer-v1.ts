/**
 * Importe les données de règles de la v1 vers src/donnees/*.json.
 *
 *   npm run importer-v1             régénère les fichiers JSON
 *   npm run importer-v1 -- --verifier   ne touche à rien, échoue si les JSON
 *                                    ne correspondent plus à la v1
 *
 * Pourquoi (décision 1a du lot L1, 15/10/2026) : la v1 reste la source des
 * règles jusqu'à la bascule. Thomas continue à les modifier dans la v1
 * pendant la campagne ; après un merge de thomas/contributions dans v2,
 * ce script remet la 2.0 à jour. `npm run verifier` lance le mode
 * --verifier : un import oublié fait échouer la CI.
 *
 * Identifiants (décision 2a) : les voies n'ont pas d'identifiant en v1.
 * On en dérive un du nom (`guerrier.soldat`), puis on le fige dans
 * src/donnees/identifiants.json. Une entrée de cette table n'est jamais
 * modifiée par ce script : renommer une voie dans la v1 demande une
 * décision explicite (voir le message d'erreur et src/donnees/LISEZMOI.md).
 *
 * Exécuté directement par Node 24 (types effacés à la volée) : seulement
 * de la syntaxe TypeScript effaçable, imports relatifs avec extension.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import type { z } from 'zod';
import {
  schemaClasse,
  schemaConstantes,
  schemaDon,
  schemaEtat,
  schemaIdentifiants,
  schemaMutations,
  schemaRace,
  schemaSort,
} from '../src/lib/schemas/regles.ts';
import { schemaArmeMonstre, schemaArmureMonstre, schemaBestiaire, schemaEquilibrage } from '../src/lib/schemas/bestiaire.ts';
import { schemaCatalogueObjets, schemaEquipementDepart } from '../src/lib/schemas/objets.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE_V1 = resolve(ICI, '../..');
const DOSSIER_DONNEES = resolve(ICI, '../src/donnees');
const MODE_VERIFIER = process.argv.includes('--verifier');

const FICHIERS_V1 = [
  'js/etats.js',
  'data/donnees.js',
  'data/dons.js',
  'data/mutations.js',
  // L1.2 : bestiaire et objets. data/bestiaire.json est lu à part (c'est
  // lui la source en v1 ; data/bestiaire.js en est généré). Pour le loot,
  // c'est l'inverse : data/loot.js est la source, data/loot.json en est généré.
  'data/armes_monstres.js',
  'data/armures_monstres.js',
  'data/equilibrage.js',
  'data/loot.js',
  'data/equipement_depart.js',
];

type Brut = any;

class ErreurImport extends Error {}

function echouer(message: string): never {
  throw new ErreurImport(message);
}

/** Charge les fichiers de données v1 dans un contexte isolé (même technique que tools/valider_mecaniques.js). */
function chargerV1(): Record<string, Brut> {
  const contexte: Record<string, Brut> = { console, Math, JSON, Object, Array, Number, String, Date };
  contexte.window = contexte;
  createContext(contexte);
  for (const fichier of FICHIERS_V1) {
    const source = readFileSync(join(RACINE_V1, fichier), 'utf8')
      .replace(/^const (\w+)\s*=/gm, 'var $1 =')
      .replace(/^let (\w+)\s*=/gm, 'var $1 =')
      .replace(/^class (\w+)/gm, 'var $1 = class $1');
    runInContext(source, contexte, { filename: fichier });
  }
  return contexte;
}

/** « Voie de la magie élémentaire » → « magie-elementaire ». */
function slugVoie(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^voie\s+(de\s+la|du|des|de\s+l'|d'|de)\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function valider<T>(schema: z.ZodType<T>, valeur: unknown, ou: string): T {
  const resultat = schema.safeParse(valeur);
  if (!resultat.success) {
    const details = resultat.error.issues
      .slice(0, 8)
      .map((i) => `  - ${ou}${i.path.length ? '.' + i.path.join('.') : ''} : ${i.message}`)
      .join('\n');
    echouer(`Donnée v1 non conforme au schéma 2.0 :\n${details}`);
  }
  return resultat.data;
}

/**
 * Égalité de contenu. Pas de comparaison stricte : les objets v1 viennent
 * d'un contexte vm isolé, leur prototype diffère de ceux créés ici.
 */
function memeContenu(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function capacite(idVoie: string, r: Brut) {
  return { id: `${idVoie}.${r.rang}`, rang: r.rang, nom: r.nom, effet: r.effet, mecanique: r.mecanique ?? null };
}

function deVie(texte: string, classe: string): number {
  const m = /^1d(\d+)$/.exec(texte);
  if (!m?.[1]) echouer(`Classe ${classe} : dé de vie « ${texte} » illisible (attendu « 1dN »).`);
  return Number(m[1]);
}

function importer() {
  const v1 = chargerV1();
  const cheminIds = join(DOSSIER_DONNEES, 'identifiants.json');
  const identifiants = existsSync(cheminIds)
    ? valider(schemaIdentifiants, JSON.parse(readFileSync(cheminIds, 'utf8')), 'identifiants')
    : { voies: {} as Record<string, string> };

  // ---------- Voies : identifiants figés ----------
  const cleesUtilisees = new Set<string>();
  const nouvelles: string[] = [];
  const idsPris = new Set(Object.values(identifiants.voies));
  const idVoie = (classe: string, nom: string): string => {
    const cle = `${classe}|${nom}`;
    cleesUtilisees.add(cle);
    const existant = identifiants.voies[cle];
    if (existant) return existant;
    const id = `${classe}.${slugVoie(nom)}`;
    if (idsPris.has(id)) echouer(`Identifiant ${id} déjà pris : choisis-en un à la main pour « ${cle} » dans identifiants.json.`);
    identifiants.voies[cle] = id;
    idsPris.add(id);
    nouvelles.push(cle);
    return id;
  };

  const ordreClasses: string[] = v1.ORDRE_CLASSES;
  const classes = ordreClasses.map((cleClasse) => {
    const k = v1.CLASSES[cleClasse];
    if (!k) echouer(`ORDRE_CLASSES cite « ${cleClasse} », absente de CLASSES.`);
    return valider(
      schemaClasse,
      {
        id: cleClasse,
        nom: k.nom_affiche,
        deVie: deVie(k.de_de_vie, cleClasse),
        armes: k.armes,
        armures: k.armures,
        attaque: k.attaque,
        notesGenerales: k.notes_generales,
        creation: k.creation,
        voies: k.voies.map((v: Brut) => {
          const id = idVoie(cleClasse, v.nom);
          return { id, nom: v.nom, speciale: v.speciale, description: v.description, rangs: v.rangs.map((r: Brut) => capacite(id, r)) };
        }),
      },
      `classes.${cleClasse}`,
    );
  });

  const disparues = Object.keys(identifiants.voies).filter((cle) => !cleesUtilisees.has(cle));
  if (disparues.length) {
    const lignes = disparues.map((cle) => {
      const classe = cle.split('|')[0];
      const candidates = nouvelles.filter((n) => n.startsWith(`${classe}|`));
      return `  - « ${cle} » (id ${identifiants.voies[cle]})${candidates.length ? ` — renommée en ${candidates.map((c) => `« ${c} »`).join(' ou ')} ?` : ''}`;
    });
    echouer(
      `Voie(s) de identifiants.json absentes de la v1 :\n${lignes.join('\n')}\n` +
        `Renommage : dans identifiants.json, remplace l'ancienne clé par le nouveau nom en gardant l'identifiant.\n` +
        `Suppression : retire l'entrée à la main (vérifie d'abord qu'aucune fiche ne l'utilise).`,
    );
  }

  // ---------- Races ----------
  const ordreRaces: string[] = v1.ORDRE_RACES;
  const races = ordreRaces.map((cleRace) => {
    const r = v1.RACES[cleRace];
    if (!r) echouer(`ORDRE_RACES cite « ${cleRace} », absente de RACES.`);
    const id = `race.${cleRace}`;
    return valider(
      schemaRace,
      {
        id: cleRace,
        nom: r.nom_affiche,
        description: r.description,
        traitPassif: r.trait_passif,
        voie: { id, nom: r.voie_nom, rangs: r.rangs.map((x: Brut) => capacite(id, x)) },
        variantes: (r.variantes ?? []).map((v: Brut) => ({
          id: `${id}.variante.${v.code}`,
          code: v.code,
          nom: v.nom_affiche,
          nomCapacite: v.nom_capacite,
          effet: v.effet,
          mecanique: v.mecanique ?? null,
        })),
      },
      `races.${cleRace}`,
    );
  });

  // ---------- Sorts : un seul catalogue, chaque sort connaît ses listes ----------
  const parId = new Map<string, Brut>();
  const ajouterListe = (sorts: Brut[], liste: 'arcanique' | 'pretre') => {
    for (const s of sorts) {
      const deja = parId.get(s.id);
      if (deja) {
        const { listes, ...sansListes } = deja;
        if (!memeContenu(sansListes, s)) echouer(`Sort « ${s.id} » présent dans deux listes avec des contenus différents.`);
        listes.push(liste);
      } else parId.set(s.id, { ...s, listes: [liste] });
    }
  };
  ajouterListe(v1.SORTS_ARCANIQUES, 'arcanique');
  ajouterListe(v1.SORTS_PRETRE, 'pretre');
  const sorts = [...parId.values()].map((s) => valider(schemaSort, s, `sorts.${s.id}`));
  // La 2.0 dérive les sorts d'une classe de ses listes : on vérifie que c'est exactement ce que fait la v1.
  const listeDeClasse: Record<string, 'arcanique' | 'pretre'> = { magicien: 'arcanique', enchanteur: 'arcanique', necromancien: 'arcanique', pretre: 'pretre' };
  for (const [classe, sortsV1] of Object.entries(v1.SORTS_PAR_CLASSE as Record<string, Brut[]>)) {
    const liste = listeDeClasse[classe];
    if (!liste) echouer(`SORTS_PAR_CLASSE.${classe} : classe sans liste de sorts connue de l'import.`);
    const attendus = sorts.filter((s) => s.listes.includes(liste)).map((s) => s.id).sort();
    const v1Ids = sortsV1.map((s) => s.id).sort();
    if (!memeContenu(attendus, v1Ids)) echouer(`SORTS_PAR_CLASSE.${classe} ne correspond plus à la liste « ${liste} ».`);
  }

  // ---------- États, dons, mutations ----------
  const etats = Object.entries(v1.ETATS as Record<string, Brut>).map(([id, e]) => valider(schemaEtat, { id, ...e }, `etats.${id}`));
  const dons = (v1.DONS as Brut[]).map((d) => valider(schemaDon, d, `dons.${d.id}`));
  const mutations = valider(
    schemaMutations,
    {
      seuilsPaliers: v1.SEUILS_PALIERS_MUTATION,
      paliers: Object.entries(v1.TABLE_MUTATIONS as Record<string, Brut>).map(([palier, p]) => ({ palier: Number(palier), ...p })),
      rupture: v1.PALIER_4_RUPTURE,
    },
    'mutations',
  );

  // ---------- Constantes : références par nom de voie converties en identifiants ----------
  const toutesVoies = classes.flatMap((k) => k.voies.map((v) => ({ classe: k.id, ...v })));
  const voieDeClasse = (classe: string, nom: string, ou: string) => {
    const v = toutesVoies.find((x) => x.classe === classe && x.nom === nom);
    if (!v) echouer(`${ou} : voie « ${nom} » introuvable dans la classe ${classe}.`);
    return v;
  };
  const idsSorts = new Set(sorts.map((s) => s.id));
  const constantes = valider(
    schemaConstantes,
    {
      caracs: v1.CARACS,
      sauvegardes: v1.SAUVEGARDES,
      competencesParCarac: v1.COMPETENCES_PAR_CARAC,
      ordreClasses,
      ordreRaces,
      archetypeClasse: v1.ARCHETYPE_CLASSE,
      diviseurAttaque: v1.DIVISEUR_ATTAQUE,
      multiplicateurModPP: v1.MULTIPLICATEUR_MOD_PP,
      familleClasse: v1.FAMILLE_CLASSE,
      caracMagie: v1.CARAC_MAGIE,
      bonusCaracsClasse: v1.CLASS_BONUS_CARACS,
      maitriseArmure: v1.PROFICIENCE_ARMURE,
      maitriseArme: v1.PROFICIENCE_ARME,
      rangCategorieArmure: v1.RANG_CATEGORIE,
      rangMaitriseArme: v1.RANG_MAITRISE_ARME,
      classesEligiblesAttaqueOpportunite: v1.CLASSES_ELIGIBLES_AO,
      coutPPParRang: v1.COUT_PP_PAR_RANG,
      niveauMinParRang: v1.NIVEAU_MIN_PAR_RANG,
      grimoireInscritsBase: v1.GRIMOIRE_INSCRITS_BASE,
      grimoireNiveauPivot: v1.GRIMOIRE_NIVEAU_PIVOT,
      cercleSortGratuit: v1.CERCLE_SORT_GRATUIT,
      // La v1 teste ces voies par leur seul nom (Personnage.estChoisie), quelle
      // que soit la classe : on garde ce sens en listant toutes les voies du nom.
      ecoleDeblocage: Object.fromEntries(
        Object.entries(v1.ECOLE_VERS_VOIE_DEBLOCAGE as Record<string, Brut>).map(([ecole, { voie, rang }]) => {
          const ids = toutesVoies.filter((v) => v.nom === voie).map((v) => `${v.id}.${rang}`);
          if (!ids.length) echouer(`ECOLE_VERS_VOIE_DEBLOCAGE.${ecole} : aucune voie « ${voie} ».`);
          return [ecole, ids];
        }),
      ),
      sortsAccordes: (v1.SORTS_ACCORDES_PAR_VOIE as Brut[]).map((a) => {
        if (!idsSorts.has(a.idSort)) echouer(`SORTS_ACCORDES_PAR_VOIE : sort « ${a.idSort} » inconnu.`);
        return { capacite: `${voieDeClasse(a.classe, a.voie, 'SORTS_ACCORDES_PAR_VOIE').id}.${a.rang}`, sort: a.idSort };
      }),
      invocations: (v1.INVOCATIONS as Brut[]).map(({ voie, rangRequis, ...reste }) => ({
        ...reste,
        rangRequis,
        capacite: `${voieDeClasse(reste.classe, voie, `INVOCATIONS.${reste.id}`).id}.${rangRequis}`,
      })),
    },
    'constantes',
  );

  // ---------- Bestiaire, armes et armures de monstres, équilibrage (L1.2) ----------
  const bestiaireV1 = JSON.parse(readFileSync(join(RACINE_V1, 'data/bestiaire.json'), 'utf8'));
  const bestiaire = valider(
    schemaBestiaire,
    {
      version: bestiaireV1.version,
      notes: { generale: bestiaireV1.note, familles: bestiaireV1.note_familles, race: bestiaireV1.note_race },
      monstres: bestiaireV1.monstres,
    },
    'bestiaire',
  );
  const armesMonstres = (v1.ARMES_MONSTRES as Brut[]).map((a) => valider(schemaArmeMonstre, a, `armes-monstres.${a.id}`));
  const armuresMonstres = (v1.ARMURES_MONSTRES as Brut[]).map((a) => valider(schemaArmureMonstre, a, `armures-monstres.${a.id}`));
  const equilibrage = valider(
    schemaEquilibrage,
    {
      socleDangerosite: v1.SOCLE_DANGEROSITE,
      roles: v1.ROLES_MONSTRE,
      pmDangerosite: v1.PM_DANGEROSITE,
      coeffBoss: v1.COEFF_BOSS,
    },
    'equilibrage',
  );

  // ---------- Objets et équipement de départ (L1.2) ----------
  const objets = valider(
    schemaCatalogueObjets,
    { version: v1.LOOT_VERSION, typesEmpilables: v1.TYPES_EMPILABLES, objets: v1.LOOT_CATALOGUE },
    'objets',
  );
  const equipementDepart = valider(schemaEquipementDepart, v1.EQUIPEMENT_DEPART, 'equipement-depart');

  return {
    fichiers: {
      'classes.json': classes,
      'races.json': races,
      'sorts.json': sorts,
      'etats.json': etats,
      'dons.json': dons,
      'mutations.json': mutations,
      'constantes.json': constantes,
      'bestiaire.json': bestiaire,
      'armes-monstres.json': armesMonstres,
      'armures-monstres.json': armuresMonstres,
      'equilibrage.json': equilibrage,
      'objets.json': objets,
      'equipement-depart.json': equipementDepart,
      'identifiants.json': identifiants,
    } as Record<string, unknown>,
    nouvelles,
  };
}

function principal(): number {
  let resultat: ReturnType<typeof importer>;
  try {
    resultat = importer();
  } catch (e) {
    if (e instanceof ErreurImport) {
      console.error(`✘ Import v1 impossible.\n${e.message}`);
      return 1;
    }
    throw e;
  }
  const differents: string[] = [];
  for (const [nom, contenu] of Object.entries(resultat.fichiers)) {
    const texte = JSON.stringify(contenu, null, 2) + '\n';
    const chemin = join(DOSSIER_DONNEES, nom);
    const actuel = existsSync(chemin) ? readFileSync(chemin, 'utf8') : null;
    if (actuel === texte) continue;
    differents.push(nom);
    if (!MODE_VERIFIER) writeFileSync(chemin, texte);
  }
  if (MODE_VERIFIER) {
    if (differents.length) {
      console.error(`✘ src/donnees ne correspond plus à la v1 : ${differents.join(', ')}.\n  Lance « npm run importer-v1 » puis commite le résultat.`);
      return 1;
    }
    console.log('✔ src/donnees est à jour avec la v1.');
    return 0;
  }
  for (const cle of resultat.nouvelles) console.log(`  + nouvel identifiant : ${cle} → ${(resultat.fichiers['identifiants.json'] as { voies: Record<string, string> }).voies[cle]}`);
  console.log(differents.length ? `✔ Mis à jour : ${differents.join(', ')}` : '✔ Rien à changer : src/donnees est déjà à jour.');
  return 0;
}

process.exitCode = principal();
