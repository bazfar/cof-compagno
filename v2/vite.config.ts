import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
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
    // Deux familles, lancées ensemble par `npm test` :
    //  - unitaires : fonctions pures, sous Node, sans DOM ;
    //  - composants (lot L5.7) : composants Svelte montés dans un DOM
    //    simulé (jsdom), pour les bugs qui ne vivent que dans
    //    l'enchaînement des états d'un écran.
    projects: [
      { extends: true, test: { name: 'unitaires', include: ['tests/unitaires/**/*.test.ts'] } },
      {
        extends: true,
        plugins: [svelteTesting()],
        // Budget par test relevé : montrer Ambush (40 × 25, 360 points de
        // mur) et marquer sa vision coûte à lui seul ~4,5 s de calcul, trop
        // près des 5 s par défaut — la suite échouait une fois sur deux,
        // même machine au repos.
        test: { name: 'composants', include: ['tests/composants/**/*.test.ts'], environment: 'jsdom', testTimeout: 30000 },
      },
    ],
  },
});
