import { describe, expect, it } from 'vitest';
import armesMonstresJson from '../../src/donnees/armes-monstres.json';
import armuresMonstresJson from '../../src/donnees/armures-monstres.json';
import bestiaireJson from '../../src/donnees/bestiaire.json';
import equilibrageJson from '../../src/donnees/equilibrage.json';
import equipementDepartJson from '../../src/donnees/equipement-depart.json';
import objetsJson from '../../src/donnees/objets.json';
import {
  armeMonstreParId,
  armesMonstres,
  armureMonstreParId,
  armuresMonstres,
  classeParId,
  equilibrage,
  equipementDepart,
  etatParId,
  monstres,
  objetParId,
  objets,
  sortParId,
} from '../../src/lib/regles/donnees';
import {
  schemaArmeMonstre,
  schemaArmureMonstre,
  schemaBestiaire,
  schemaEquilibrage,
} from '../../src/lib/schemas/bestiaire';
import { schemaCatalogueObjets, schemaEquipementDepart } from '../../src/lib/schemas/objets';

/*
 * Même principe que donnees-regles.test.ts : revalidation de chaque JSON
 * généré, puis cohérence ENTRE fichiers (une arme, une armure, un état ou
 * un objet cité doit exister).
 */
describe('schémas', () => {
  it.each([
    ['bestiaire', bestiaireJson, schemaBestiaire],
    ['armes-monstres', armesMonstresJson, schemaArmeMonstre.array()],
    ['armures-monstres', armuresMonstresJson, schemaArmureMonstre.array()],
    ['equilibrage', equilibrageJson, schemaEquilibrage],
    ['objets', objetsJson, schemaCatalogueObjets],
    ['equipement-depart', equipementDepartJson, schemaEquipementDepart],
  ] as const)('%s.json respecte son schéma', (_nom, donnees, schema) => {
    const resultat = schema.safeParse(donnees);
    expect(resultat.success ? [] : resultat.error.issues.slice(0, 5)).toEqual([]);
  });
});

describe('volumes (garde-fou contre un import tronqué)', () => {
  it('122 monstres, 152 armes et 50 armures de monstres, 414 objets', () => {
    expect(monstres).toHaveLength(122);
    expect(armesMonstres).toHaveLength(152);
    expect(armuresMonstres).toHaveLength(50);
    expect(objets).toHaveLength(414);
  });
});

const etatExiste = (id: string) => etatParId.has(/^marquee_.+/.test(id) ? 'marquee' : id);

describe('bestiaire : références', () => {
  it('chaque attaque utilise une arme du catalogue', () => {
    const manquantes = monstres.flatMap((m) =>
      m.attaques.filter((a) => !armeMonstreParId.has(a.armeId)).map((a) => `${m.id} → ${a.armeId}`),
    );
    expect(manquantes).toEqual([]);
  });

  it('chaque armure citée existe', () => {
    const manquantes = monstres.filter((m) => m.armureId && !armureMonstreParId.has(m.armureId)).map((m) => `${m.id} → ${m.armureId}`);
    expect(manquantes).toEqual([]);
  });

  it('chaque rôle et chaque dangerosité existent dans le socle d’équilibrage', () => {
    expect(monstres.filter((m) => !equilibrage.roles[m.role]).map((m) => `${m.id} → ${m.role}`)).toEqual([]);
    expect(monstres.filter((m) => !equilibrage.socleDangerosite[String(m.dangerosite)]).map((m) => m.id)).toEqual([]);
  });

  it('les états infligés ou ignorés par les monstres existent', () => {
    const inconnus = monstres.flatMap((m) => [
      ...m.attaques.flatMap((a) => (a.etatSurTouche && !etatExiste(a.etatSurTouche.id) ? [`${m.id} → ${a.etatSurTouche.id}`] : [])),
      ...(m.immunites ?? []).filter((id) => !etatExiste(id)).map((id) => `${m.id} (immunité) → ${id}`),
      ...(m.immunitesConditionnelles ?? []).flatMap((c) => c.etats.filter((id) => !etatExiste(id)).map((id) => `${m.id} (immunité) → ${id}`)),
    ]);
    expect(inconnus).toEqual([]);
  });
});

describe('objets : références', () => {
  it('chaque sort appris par un parchemin existe', () => {
    expect(objets.filter((o) => o.sortAppris && !sortParId.has(o.sortAppris)).map((o) => `${o.id} → ${o.sortAppris}`)).toEqual([]);
  });

  it('les classes citées par un grimoire existent', () => {
    const inconnues = objets.flatMap((o) => (o.grimoireClasses ?? []).filter((k) => !classeParId.has(k)).map((k) => `${o.id} → ${k}`));
    expect(inconnues).toEqual([]);
  });

  it("l'équipement de départ vise des classes et des objets existants, du bon type", () => {
    const problemes: string[] = [];
    for (const [classe, kit] of Object.entries(equipementDepart)) {
      if (!classeParId.has(classe)) problemes.push(`classe inconnue : ${classe}`);
      const attendus: [string | null | undefined, string][] = [
        [kit.arme, 'arme'],
        [kit.armure, 'armure'],
        [kit.bouclier, 'bouclier'],
        [kit.accessoire, 'accessoire'],
        ...kit.consommables.map((c): [string, string] => [c, 'consommable']),
      ];
      for (const [id, type] of attendus) {
        if (!id) continue;
        const objet = objetParId.get(id);
        if (!objet) problemes.push(`${classe} → ${id} introuvable`);
        else if (objet.type !== type) problemes.push(`${classe} → ${id} est un(e) ${objet.type}, pas un(e) ${type}`);
      }
    }
    expect(problemes).toEqual([]);
  });
});
