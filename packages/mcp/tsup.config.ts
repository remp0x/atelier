import { defineConfig } from 'tsup';
import path from 'path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: false,
  clean: true,
  target: 'es2022',
  splitting: false,
  sourcemap: true,
  noExternal: ['@atelier-ai/sdk'],
  esbuildOptions(options) {
    // Bundle the shared registry + SDK from local source (the SDK is not published
    // under this version; the app does the same via webpack aliases).
    options.alias = {
      ...(options.alias || {}),
      '@atelier-ai/sdk': path.resolve(__dirname, '../sdk/src/index.ts'),
    };
  },
});
