import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      exclude: ['src/main.ts', 'src/**/*.module.ts'],
      include: ['src/**/*.{ts,js}'],
      provider: 'v8',
      reportsDirectory: 'coverage',
    },
    environment: 'node',
    fileParallelism: false,
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});
