import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        '/opt/glossopetrae',
      ],
    },
  },
});
