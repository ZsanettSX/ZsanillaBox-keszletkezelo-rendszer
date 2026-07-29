import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Ugyanaz az alias, mint a tsconfig-ban — így a "@/lib/db" és a "./db"
      // ugyanarra a modulra mutat, és egyetlen vi.mock mindkettőt lefedi.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // A PGlite-os integrációs teszt lassabban indul, mint egy tiszta unit teszt.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
