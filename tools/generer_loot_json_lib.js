/* Sérialisation partagée entre tools/generer_loot_json.js (qui écrit
   data/loot.json) et tools/valider_loot.js (qui vérifie que le fichier sur
   disque est bien celui que le générateur produirait). Une seule définition
   du format, donc aucun moyen que les deux divergent. */
function serialiserItem(o) {
  const parts = Object.keys(o).map((k) => {
    const v = o[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = Object.keys(v).map((kk) => `"${kk}": ${JSON.stringify(v[kk])}`).join(", ");
      return `"${k}": { ${inner} }`;
    }
    return `"${k}": ${JSON.stringify(v)}`;
  });
  return `    { ${parts.join(", ")} }`;
}

function rendre(items, version) {
  return `{\n  "version": ${JSON.stringify(version)},\n  "items": [\n` +
    items.map(serialiserItem).join(",\n") + `\n  ]\n}\n`;
}

module.exports = { rendre, serialiserItem };
