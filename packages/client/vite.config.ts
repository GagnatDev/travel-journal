import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Dev server API target. Playwright sets E2E_API_ORIGIN so the client proxies to the e2e global-setup server. */
const apiProxyTarget = process.env['E2E_API_ORIGIN'] ?? 'http://localhost:3100';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
