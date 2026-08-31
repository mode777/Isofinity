import { defineConfig } from 'vite';

// Relative base so the built site works when served from the GitHub Pages
// project subpath (https://<owner>.github.io/Isofinity/).
export default defineConfig({
  base: './',
});
