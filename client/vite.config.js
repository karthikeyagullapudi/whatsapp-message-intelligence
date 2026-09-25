import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the browser only talks to Vite (:5173). Vite forwards API and
// websocket traffic to the Express server (:4000), so there are no CORS issues.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
