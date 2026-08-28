import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/load-test-env.ts'],
  },
});
