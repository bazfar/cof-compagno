import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Au build, chaque fichier JS/CSS porte une empreinte de son contenu dans
// son nom : un fichier modifié change de nom, le navigateur ne peut plus
// servir une vieille version en cache. Fin des ?v= manuels de la v1.
export default defineConfig({
  plugins: [svelte()],
  build: {
    // Le SDK Firebase pèse à lui seul ~650 Ko (≈ 200 Ko compressés) ; le
    // seuil par défaut de 500 Ko signalerait chaque build. Les écrans lourds
    // (battlemap) seront chargés à la demande quand ils arriveront.
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unitaires/**/*.test.ts'],
  },
});
