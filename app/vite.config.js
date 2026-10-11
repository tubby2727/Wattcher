import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
export default defineConfig({
  base: process.env.WATT_BASE || './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'www', emptyOutDir: true, target: 'es2020' },
});
