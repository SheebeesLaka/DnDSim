import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two entry pages: the DM window (index.html) and the player window (player.html).
// /api/* and /ws are served by the Hono server (server/src) on :8787 in dev.
export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
    // three.js alone is ~600 kB minified (~150 kB gzipped); it gets its own long-lived chunk
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        player: resolve(__dirname, 'player.html'),
      },
      output: {
        manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
  // The repo-root saves/ and scenarios/ are read through the API, never bundled.
  publicDir: false,
});
