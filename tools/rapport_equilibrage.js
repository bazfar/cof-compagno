#!/usr/bin/env node
/* ============================================================
   Rapport d'écarts au socle d'équilibrage (cf. equilibrage_bestiaire.pdf,
   chantier "Rôles d'archétype et index de rencontre"). Sans effet de bord —
   ne modifie ni data/bestiaire.json ni data/bestiaire.js, à lancer à la
   main. Document de travail de la future passe de recalibrage : ce script
   ne corrige rien, il liste ce qui s'écarte du socle × modificateur de rôle.

   Usage : node tools/rapport_equilibrage.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");

function chargerEquilibrage() {
  const s = fs.readFileSync(path.join(RACINE, "data", "equilibrage.js"), "utf8");
  const socle = eval("(" + s.replace(/^[\s\S]*?const\s+SOCLE_DANGEROSITE\s*=\s*/, "").replace(/;\s*\n[\s\S]*/, "") + ")");
  const roles = eval("(" + s.replace(/^[\s\S]*?const\s+ROLES_MONSTRE\s*=\s*/, "").replace(/;\s*\n[\s\S]*/, "") + ")");
  return { socle, roles };
}

const { socle: SOCLE_DANGEROSITE, roles: ROLES_MONSTRE } = chargerEquilibrage();
const bestiaire = JSON.parse(fs.readFileSync(path.join(RACINE, "data", "bestiaire.json"), "utf8")).monstres;

const lignes = bestiaire.map((m) => {
  const s = SOCLE_DANGEROSITE[m.dangerosite];
  const r = ROLES_MONSTRE[m.role];
  if (!s || !r) return null; // signalé par tools/valider_bestiaire.js, pas ici
  const attendu = {
    pv: Math.round(s.pv * r.pv),
    def: s.def + r.def,
    atk: s.atk + r.atk,
    init: s.init + r.init,
  };
  const ecarts = {
    pv: m.pv - attendu.pv,
    def: m.def - attendu.def,
    atk: m.atk - attendu.atk,
    init: m.init - attendu.init,
  };
  const ecartTotal = Object.values(ecarts).reduce((t, e) => t + Math.abs(e), 0);
  return { id: m.id, dangerosite: m.dangerosite, role: m.role, observe: m, attendu, ecarts, ecartTotal };
}).filter(Boolean);

lignes.sort((a, b) => b.ecartTotal - a.ecartTotal);

function fmtEcart(e) { return (e > 0 ? "+" : "") + e; }

console.log(`${"monstre".padEnd(30)} ${"dgr".padStart(3)} ${"rôle".padEnd(14)} ` +
  `${"PV obs/att".padStart(12)} ${"DEF".padStart(9)} ${"ATK".padStart(9)} ${"init".padStart(9)}  écart`);
lignes.forEach((l) => {
  console.log(
    `${l.id.padEnd(30)} ${String(l.dangerosite).padStart(3)} ${l.role.padEnd(14)} ` +
    `${`${l.observe.pv}/${l.attendu.pv}`.padStart(12)} ` +
    `${`${l.observe.def}/${l.attendu.def}`.padStart(9)} ` +
    `${`${l.observe.atk}/${l.attendu.atk}`.padStart(9)} ` +
    `${`${l.observe.init}/${l.attendu.init}`.padStart(9)}  ` +
    `${l.ecartTotal.toFixed(1)} (PV${fmtEcart(l.ecarts.pv)} DEF${fmtEcart(l.ecarts.def)} ATK${fmtEcart(l.ecarts.atk)} init${fmtEcart(l.ecarts.init)})`
  );
});
console.log(`\n${lignes.length} monstre(s). Écart moyen : ${(lignes.reduce((t, l) => t + l.ecartTotal, 0) / lignes.length).toFixed(2)}.`);
