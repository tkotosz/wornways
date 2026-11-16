import { createApp } from 'vue';
import App from './App.vue';
import { EngineClient } from './engine-client.ts';
import { listenForInstallOffer, registerServiceWorker } from './install.ts';
import './style.css';

const worker = new Worker(new URL('./worker/worker.ts', import.meta.url), { type: 'module' });
const engine = new EngineClient(worker);

listenForInstallOffer();
registerServiceWorker();
createApp(App, { engine }).mount('#app');
