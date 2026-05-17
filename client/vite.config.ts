import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiHttp = env.VITE_API_PROXY || 'http://localhost:3000';
  const apiWs = apiHttp.replace(/^http/, 'ws');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': { target: apiHttp, changeOrigin: true },
        '/ws': { target: apiWs, ws: true, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
