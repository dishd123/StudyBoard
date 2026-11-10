import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { cpSync } from 'fs';
import { fileURLToPath } from 'node:url';

const staticFiles = ['index.html', 'about.html', 'contact.html'];
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
  build: {
    rollupOptions: {
      input: {
        app: resolve(frontendRoot, 'app/index.html'),
        login: resolve(frontendRoot, 'login/index.html')
      }
    }
  }
});
