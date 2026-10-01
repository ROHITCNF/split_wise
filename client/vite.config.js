import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser only talks to the Vite origin; /api is forwarded to Express so the
// session cookie stays first-party and no CORS setup is needed (ADR-012).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
