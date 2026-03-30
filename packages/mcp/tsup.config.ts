import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: false,
  clean: true,
  target: 'es2022',
  splitting: false,
  sourcemap: true,
  noExternal: ['@atelier-ai/sdk'],
});
