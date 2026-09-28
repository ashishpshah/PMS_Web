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
      port: 3001,
      proxy: {
        '/api': {
          target: 'http://localhost:5178',
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              // Forward cookies from client to backend
              const cookie = req.headers.cookie;
              if (cookie) {
                proxyReq.setHeader('cookie', cookie);
              }
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              // Forward cookies from backend to client
              const cookies = proxyRes.headers['set-cookie'];
              if (cookies) {
                res.setHeader('set-cookie', cookies);
              }
            });
          },
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