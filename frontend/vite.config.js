// Vite build for the StudyBoard frontend (issue #158).
// Bundles the two React pages into dist/, copies the static pages, CSS and JS beside them, and proxies /api in dev.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { cpSync } from 'fs';
import { fileURLToPath } from 'node:url';

// Plain HTML pages that Vite does not bundle; they are copied into dist/ unchanged.
const staticFiles = ['index.html', 'about.html', 'contact.html', 'privacy.html'];
// The frontend folder itself, so the build works from whichever folder npm runs it.
const frontendRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: frontendRoot,
  plugins: [react(), {
    name: 'copy-static-pages',
    closeBundle() {
      // Vite builds the React entry points; copy the traditional static pages alongside them.
      staticFiles.forEach((file) => cpSync(resolve(frontendRoot, file), resolve(frontendRoot, 'dist', file)));
      cpSync(resolve(frontendRoot, 'css'), resolve(frontendRoot, 'dist', 'css'), { recursive: true });
      cpSync(resolve(frontendRoot, 'js'), resolve(frontendRoot, 'dist', 'js'), { recursive: true });
    }
  }],
  server: {
    // During npm run dev, send /api calls to the Express backend, which listens on port 8080.
    proxy: {
      '/api': 'http://127.0.0.1:8080'
    }
  },
  build: {
    // Vite 8 bundles with Rolldown; rolldownOptions replaces the deprecated rollupOptions.
    rolldownOptions: {
      // The two React pages. Each HTML file becomes its own entry with its own JavaScript bundle.
      input: {
        app: resolve(frontendRoot, 'app/index.html'),
        login: resolve(frontendRoot, 'login/index.html')
      }
    }
  }
});