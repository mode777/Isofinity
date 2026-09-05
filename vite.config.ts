import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tool version, recomputed on every build/dev start: v<commit count>+<short
// hash> (e.g. "v142+9f2a1bc"). It increases by one with each commit — never
// bump by hand. Falls back to "dev" when git metadata is unavailable.
function appVersion(): string {
  try {
    const count = execSync('git rev-list --count HEAD').toString().trim();
    const hash = execSync('git rev-parse --short HEAD').toString().trim();
    return `v${count}+${hash}`;
  } catch {
    return 'dev';
  }
}

// Relative base so the built site works when served from the GitHub Pages
// project subpath (https://<owner>.github.io/Isofinity/).
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        // Verification harnesses ship with the site (Pages deploys build
        // every push): /scratch-verify.html, /mesh-debug.html.
        'scratch-verify': 'scratch-verify.html',
        'mesh-debug': 'mesh-debug.html',
      },
    },
  },
});
