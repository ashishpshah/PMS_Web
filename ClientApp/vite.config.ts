import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: '../wwwroot',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['lucide-react', 'sonner', 'motion'],
            'vendor-utils': ['date-fns'],
            'vendor-select': ['react-select'],
          },
        },
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:5178',
          changeOrigin: true,
          secure: false,
        },
        '/hubs': {
          target: 'http://localhost:5178',
          changeOrigin: true,
          rewriteWsOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
  };
});