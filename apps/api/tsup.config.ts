import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  // The shared package is consumed as TypeScript source, so it must be bundled in.
  noExternal: ['@traceback/shared'],
});
