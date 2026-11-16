import basicSsl from '@vitejs/plugin-basic-ssl';
import vue from '@vitejs/plugin-vue';
import { defaultClientConditions, defineConfig } from 'vite';
import { LICENSES_FILE, licenses } from './licenses-build.ts';
import { serviceWorker } from './service-worker-build.ts';

// For trying the app on a phone on the local network (npm run dev:phone): the browser only
// makes videos over HTTPS or on localhost, so the server gets a self-signed certificate,
// which the phone asks to accept once.
const phone = process.env['WORNWAYS_PHONE'] === '1';

// The engine is read from its TypeScript source ("source" export condition), so no watch
// build is needed while developing. The worker is an ES module like the page.
export default defineConfig({
  plugins: [vue(), licenses(), serviceWorker(), ...(phone ? [basicSsl()] : [])],
  resolve: { conditions: ['source', ...defaultClientConditions] },
  worker: { format: 'es' },
  // The map library (about 1.1 MB) is one chunk, loaded only when the home map is opened.
  // The licenses of what the app ships, completed by licenses-build.ts.
  build: { chunkSizeWarningLimit: 1200, license: { fileName: LICENSES_FILE } },
});
