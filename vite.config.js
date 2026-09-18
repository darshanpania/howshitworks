import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

// Every folder under appliances/ with an index.html becomes a page.
const appliances = readdirSync(resolve(__dirname, 'appliances'), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .reduce((acc, d) => {
    acc[d.name] = resolve(__dirname, 'appliances', d.name, 'index.html');
    return acc;
  }, {});

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), ...appliances },
    },
  },
});
