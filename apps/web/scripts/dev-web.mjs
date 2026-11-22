import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const host = '127.0.0.1';
const relayPort = '8787';
const appPort = '8788';
const origin = `http://${host}:${appPort}`;
const children = new Set();
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill();
}

function start(name, port, args) {
  const child = spawn('wrangler', [...args, '--ip', host, '--port', port, '--log-level', 'error'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.add(child);
  child.on('error', (error) => {
    console.error(`${name} could not start. ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${name} stopped.`);
      stop(code || 1);
    }
  });
}

async function ready(url, name, acceptsResponse) {
  const deadline = Date.now() + 20_000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(700) });
      if (await acceptsResponse(response)) return !stopping;
    } catch {
      // Wrangler can take a few seconds to start listening.
    }
    await delay(200);
  }
  if (!stopping) {
    console.error(`${name} did not start at ${url}.`);
    stop(1);
  }
  return false;
}

process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));

start('Strava relay', relayPort, ['dev', '--config', 'cloudflare/strava-events/wrangler.jsonc']);
if (await ready(`http://${host}:${relayPort}`, 'Strava relay', () => true)) {
  start('Wornways', appPort, [
    'pages',
    'dev',
    'apps/web/dist',
    '--compatibility-date',
    '2024-11-11',
    '--binding',
    `STRAVA_ORIGIN=${origin}`,
    '--binding',
    `RWGPS_ORIGIN=${origin}`,
    '--do',
    'STRAVA_EVENTS=StravaEvents@wornways-strava-events',
  ]);
  if (await ready(origin, 'Wornways', (response) => response.ok)) {
    console.log(`Wornways is running at ${origin}/`);
  }
}
