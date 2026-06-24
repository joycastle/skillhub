import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

import type { ProxyOptions } from 'vite'

const JS_BUILD_TARGET = 'es2020'
const LEGACY_BROWSER_TARGETS = ['chrome83', 'edge83', 'firefox78', 'safari14']

function backendProxy(): ProxyOptions {
  return {
    target: 'http://localhost:8080',
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        const host = req.headers.host
        if (host) {
          proxyReq.setHeader('X-Forwarded-Host', host)
          proxyReq.setHeader('X-Forwarded-Proto', 'http')
        }
      })
    },
  }
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_SKILLHUB_GOVERNANCE_ENABLED': JSON.stringify(
      process.env.VITE_SKILLHUB_GOVERNANCE_ENABLED ?? 'false',
    ),
    'import.meta.env.VITE_SKILLHUB_API_TOKENS_ENABLED': JSON.stringify(
      process.env.VITE_SKILLHUB_API_TOKENS_ENABLED ?? 'false',
    ),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: JS_BUILD_TARGET,
    cssTarget: LEGACY_BROWSER_TARGETS,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: JS_BUILD_TARGET,
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/e2e/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  server: {
    port: 3000,
    watch: {
      usePolling: true,
      interval: 150,
    },
    proxy: {
      '/api': backendProxy(),
      '/oauth2': backendProxy(),
      '/login/oauth2': backendProxy(),
    },
  },
})
