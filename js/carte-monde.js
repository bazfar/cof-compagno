/* ============================================================
   Carte du monde (de base) — SVG intégré, reconstitué d'après
   la géographie de la lore et la légende du plan officiel.
   Stylisée : régions positionnées selon leur orientation
   (nord/sud/est/ouest), Chaîne des Anciens au centre.
   ============================================================ */

const CARTE_MONDE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 720" width="1000" height="720">
  <style>
    text{font-family:'Segoe UI',Arial,sans-serif;}
    .titre{font-size:30px;font-weight:800;fill:#3d2a52;}
    .stitre{font-size:14px;fill:#5a3d78;font-style:italic;}
    .rg{font-size:21px;font-weight:800;fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:3.4px;stroke-linejoin:round;}
    .sub{font-size:12.5px;fill:#fff;opacity:.95;paint-order:stroke;stroke:rgba(0,0,0,.45);stroke-width:2.4px;stroke-linejoin:round;}
    .cap{font-size:13px;font-weight:700;fill:#fff8e8;paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:2.6px;stroke-linejoin:round;}
    .geo{font-size:13px;font-weight:700;fill:#3a2e1c;opacity:.8;}
    .ico{font-size:22px;paint-order:stroke;stroke:rgba(0,0,0,.4);stroke-width:2px;}
  </style>

  <!-- Mer -->
  <rect x="0" y="0" width="1000" height="720" fill="#a9c5cf"/>
  <rect x="0" y="0" width="1000" height="720" fill="none"/>

  <!-- Régions (Ouest) -->
  <ellipse cx="185" cy="175" rx="125" ry="115" fill="#5b7fa6"/>
  <ellipse cx="150" cy="375" rx="115" ry="100" fill="#4f8a52"/>
  <ellipse cx="165" cy="565" rx="110" ry="98" fill="#6d5a86"/>
  <ellipse cx="360" cy="545" rx="115" ry="95" fill="#3f6fb0"/>
  <ellipse cx="375" cy="350" rx="115" ry="100" fill="#2f9e8f"/>
  <ellipse cx="330" cy="668" rx="135" ry="62" fill="#2b7a9e"/>

  <!-- Régions (Est) -->
  <ellipse cx="735" cy="235" rx="200" ry="165" fill="#b5462f"/>
  <ellipse cx="905" cy="455" rx="95" ry="160" fill="#55663f"/>
  <ellipse cx="645" cy="475" rx="115" ry="98" fill="#c98a3a"/>
  <ellipse cx="580" cy="615" rx="105" ry="82" fill="#6b7f8c"/>
  <ellipse cx="885" cy="120" rx="100" ry="82" fill="#7a6f63"/>

  <!-- Chaîne des Anciens (centre) + Pics Lointains -->
  <rect x="468" y="80" width="64" height="580" rx="26" fill="#b8ae99" opacity="0.9"/>
  <g fill="#8f8472" stroke="#6b6256" stroke-width="1.5" stroke-linejoin="round">
    <polygon points="477,141 500,99 523,141"/>
    <polygon points="485,193 508,151 531,193"/>
    <polygon points="475,245 498,203 521,245"/>
    <polygon points="487,297 510,255 533,297"/>
    <polygon points="476,349 499,307 522,349"/>
    <polygon points="486,401 509,359 532,401"/>
    <polygon points="475,453 498,411 521,453"/>
    <polygon points="487,505 510,463 533,505"/>
    <polygon points="476,557 499,515 522,557"/>
    <polygon points="486,609 509,567 532,609"/>
    <!-- Pics Lointains (branche nord-est) -->
    <polygon points="548,128 566,92 584,128"/>
    <polygon points="600,116 620,76 640,116"/>
    <polygon points="660,104 682,62 704,104"/>
    <polygon points="724,96 744,58 764,96"/>
  </g>

  <!-- Forteresses-cols des Nains de l'Ordre -->
  <g class="ico" fill="#3d2a52">
    <text x="500" y="170" text-anchor="middle">▲</text>
    <text x="500" y="392" text-anchor="middle">▲</text>
    <text x="505" y="600" text-anchor="middle">▲</text>
  </g>

  <!-- Tribus (foothills ouest de la Chaîne) -->
  <g class="ico" fill="#3b3326">
    <text x="445" y="235" text-anchor="middle">⚑</text>
    <text x="455" y="445" text-anchor="middle">⚑</text>
  </g>

  <!-- Libellés des régions -->
  <!-- Aetharion -->
  <text class="ico" x="150" y="140" text-anchor="middle" fill="#f0c14b">✦</text>
  <text class="rg" x="185" y="175" text-anchor="middle">AETHARION</text>
  <text class="sub" x="185" y="196" text-anchor="middle">Hauts Elfes · Arbre-Monde</text>

  <text class="rg" x="150" y="372" text-anchor="middle">AELINDRA</text>
  <text class="sub" x="150" y="393" text-anchor="middle">Elfes Sylvains</text>

  <text class="rg" x="165" y="560" text-anchor="middle">MORDANEL</text>
  <text class="sub" x="165" y="581" text-anchor="middle">Elfes du Crépuscule</text>

  <text class="rg" x="360" y="535" text-anchor="middle">VALDORNE</text>
  <text class="sub" x="360" y="556" text-anchor="middle">Chevalerie sincère</text>
  <text class="cap" x="360" y="574" text-anchor="middle">★ Valdcourt</text>

  <text class="rg" x="375" y="340" text-anchor="middle">LIBERRA</text>
  <text class="sub" x="375" y="361" text-anchor="middle">République</text>
  <text class="cap" x="375" y="379" text-anchor="middle">★ Libris</text>

  <text class="rg" x="305" y="666" text-anchor="middle">MORNAC</text>
  <text class="sub" x="305" y="686" text-anchor="middle">Maritime · ● Mornhaven</text>

  <!-- Solvarn -->
  <text class="rg" x="745" y="210" text-anchor="middle">SOLVARN</text>
  <text class="sub" x="745" y="231" text-anchor="middle">Empire · Solaire</text>
  <text class="cap" x="745" y="249" text-anchor="middle">★ Solmaris</text>

  <text class="rg" x="648" y="470" text-anchor="middle">ARVETH</text>
  <text class="sub" x="648" y="491" text-anchor="middle">Le Vacillant</text>
  <text class="cap" x="648" y="509" text-anchor="middle">★ Arvenfall</text>

  <text class="rg" x="580" y="610" text-anchor="middle">SERVAL</text>
  <text class="cap" x="580" y="630" text-anchor="middle">★ Serval</text>

  <text class="rg" x="885" y="118" text-anchor="middle" style="font-size:18px;">KHAZRAK DÛM</text>
  <text class="sub" x="885" y="138" text-anchor="middle">Race Sublimée</text>

  <text class="rg" x="905" y="450" text-anchor="middle" style="font-size:18px;">HORDES</text>
  <text class="sub" x="905" y="470" text-anchor="middle">de l'Est</text>

  <!-- Géographie -->
  <text class="geo" x="500" y="345" text-anchor="middle" transform="rotate(-90 500 345)">CHAÎNE DES ANCIENS</text>
  <text class="geo" x="660" y="50" text-anchor="middle">Pics Lointains</text>
  <text class="sub" x="455" y="252" text-anchor="middle" style="font-size:11px;">Tribus</text>
  <text class="sub" x="465" y="462" text-anchor="middle" style="font-size:11px;">Tribus</text>

  <!-- Titre -->
  <text class="titre" x="30" y="46">Carte du Monde</text>
  <text class="stitre" x="32" y="66">Chroniques Oubliées Fantasy — Campagne maison</text>

  <!-- Rose des vents -->
  <g transform="translate(930,650)">
    <circle r="34" fill="#f3ead3" stroke="#3d2a52" stroke-width="2"/>
    <polygon points="0,-30 6,0 0,8 -6,0" fill="#b5462f"/>
    <polygon points="0,30 6,0 0,-8 -6,0" fill="#3d2a52"/>
    <polygon points="-30,0 0,6 8,0 0,-6" fill="#3d2a52"/>
    <polygon points="30,0 0,6 -8,0 0,-6" fill="#3d2a52"/>
    <text x="0" y="-37" text-anchor="middle" style="font-size:13px;font-weight:700;fill:#3d2a52;">N</text>
    <text x="0" y="48" text-anchor="middle" style="font-size:12px;fill:#3d2a52;">S</text>
    <text x="42" y="4" text-anchor="middle" style="font-size:12px;fill:#3d2a52;">E</text>
    <text x="-42" y="4" text-anchor="middle" style="font-size:12px;fill:#3d2a52;">O</text>
  </g>
</svg>`;

const CARTE_MONDE_DATAURL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(CARTE_MONDE_SVG);
