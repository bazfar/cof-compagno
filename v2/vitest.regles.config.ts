import { defineConfig } from 'vitest/config';

// Tests des règles Firestore : ils tournent contre l'émulateur lancé par
// `npm run test:regles` (firebase emulators:exec), jamais contre la prod.
export default defineConfig({
  test: {
    include: ['tests/regles/**/*.test.ts'],
    testTimeout: 20000,
    fileParallelism: false,
  },
});
