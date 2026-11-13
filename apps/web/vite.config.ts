import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devImport } from './dev/import-plugin.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), devImport()],
  server: {
    // Listen on the local network so a phone on the same Wi-Fi can open the dev server.
    host: true,
  },
});
