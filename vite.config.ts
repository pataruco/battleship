import { defineConfig, loadEnv, type Plugin } from 'vite';
import { buildCsp } from './src/build/csp';
import { makeBuildId, swPlugin } from './src/build/sw-plugin';

// Safari 16.4 in Lightning CSS's numeric encoding: (major << 16) | (minor << 8).
const SAFARI_16_4 = (16 << 16) | (4 << 8);

function cspPlugin(natsUrl: string): Plugin {
  return {
    name: 'bship-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp(natsUrl) },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const buildId = makeBuildId();
  return {
    base: '/battleship/',
    define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId) },
    plugins: [cspPlugin(env.VITE_NATS_URL ?? ''), swPlugin(buildId)],
    css: {
      transformer: 'lightningcss',
      lightningcss: { targets: { safari: SAFARI_16_4 } },
    },
    build: {
      target: ['safari16.4', 'chrome120', 'firefox120'],
      cssMinify: 'lightningcss',
      // The sprite and wasm are fetched by URL; a data: URL would break under connect-src 'self'.
      assetsInlineLimit: 0,
      rollupOptions: {
        treeshake: { moduleSideEffects: (id: string) => !/@nats-io/.test(id) },
        output: { codeSplitting: false },
      },
    },
    server: {
      proxy: {
        '/nats': { target: 'ws://localhost:9222', ws: true, rewrite: () => '/' },
      },
    },
  };
});
