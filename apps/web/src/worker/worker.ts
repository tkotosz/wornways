// The worker: does all the heavy work so the page never freezes. It keeps the library of
// activities and answers the page's requests (see messages.ts).

import { parseSettings, SettingsError } from '@wornways/engine';
import type { Reply, Request } from '../messages.ts';
import { Library } from './library.ts';
import { planVideo } from './plan.ts';
import { makePoster } from './poster.ts';
import { ActivityStoreUnavailable } from './store.ts';
import { pruneStravaCaches } from './strava-cache.ts';
import { StravaError, StravaExpired, StravaSession } from './strava.ts';
import { Canceled, VideoProblem, makeVideo } from './video.ts';

let library: Promise<Library> | undefined;
let strava: StravaSession | null = null;
void pruneStravaCaches();

function getLibrary(): Promise<Library> {
  return (library ??= Library.open().catch((error: unknown) => {
    library = undefined;
    throw error;
  }));
}
/** The requests still running, to cancel them by id. */
const running = new Map<number, AbortController>();

function reply(message: Reply, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

/** The message shown to the person for an error. */
function messageFor(error: unknown): string {
  if (error instanceof SettingsError) return `The setting "${error.setting}" ${error.message}.`;
  if (error instanceof VideoProblem || error instanceof StravaError) return error.message;
  console.error(error);
  if (error instanceof ActivityStoreUnavailable) return error.message;
  return `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
}

async function answer(request: Exclude<Request, { type: 'cancel' }>, signal: AbortSignal) {
  const { id } = request;
  const progress = (p: Extract<Reply, { type: 'progress' }>['progress']) =>
    reply({ type: 'progress', id, progress: p });
  const session = strava;
  switch (request.type) {
    case 'strava-start':
      await session?.close();
      strava = new StravaSession(request.grant);
      return reply({ type: 'strava-started', id });
    case 'strava-end':
      strava = null;
      if (session) await session.end(request.disconnect);
      return reply({ type: 'strava-ended', id });
    case 'strava-list': {
      if (!session)
        throw new StravaExpired('No Strava session is open to list activities. Connect again.');
      const activities = await session.list(
        request.from,
        request.to,
        signal,
        request.activityChanged,
      );
      return reply({ type: 'strava-listed', id, activities });
    }
    case 'strava-prepare': {
      if (!session)
        throw new StravaExpired('No Strava session is open to load tracks. Connect again.');
      const unavailable = await session.prepare(request.ids, signal);
      return reply({ type: 'strava-prepared', id, unavailable });
    }
    case 'strava-prioritize':
      session?.prioritize(request.ids);
      return reply({ type: 'strava-prioritized', id });
  }
  const source = 'strava' in request && request.strava;
  if (source && !session)
    throw new StravaExpired('No Strava session is open for this request. Connect again.');
  if (source && session) {
    if (request.type === 'match')
      return reply({ type: 'matched', id, match: session.match(request.settings) });
    if (request.type === 'places')
      return reply({ type: 'places', id, places: session.places(request.settings, request.end) });
  }
  const renderSignal = source && session ? AbortSignal.any([signal, session.signal]) : signal;
  const tracks = async () => {
    if (!source || !session || !('settings' in request)) return (await getLibrary()).all();
    const settings = parseSettings(request.settings);
    const selected = await session.selected(settings.activities ?? []);
    renderSignal.throwIfAborted();
    return selected;
  };
  switch (request.type) {
    case 'read-library':
      return reply({ type: 'library', id, activities: (await getLibrary()).summaries() });
    case 'add-files': {
      const lib = await getLibrary();
      const report = await lib.add(request.files, progress);
      return reply({ type: 'files-added', id, report, activities: lib.summaries() });
    }
    case 'delete-activities': {
      const lib = await getLibrary();
      await lib.delete(request.ids);
      return reply({ type: 'library', id, activities: lib.summaries() });
    }
    case 'match':
      return reply({ type: 'matched', id, match: (await getLibrary()).match(request.settings) });
    case 'places':
      return reply({
        type: 'places',
        id,
        places: (await getLibrary()).places(request.settings, request.end),
      });
    case 'plan':
      return reply({ type: 'planned', id, plan: planVideo(await tracks(), request.settings) });
    case 'make-poster': {
      const image = await makePoster(
        await tracks(),
        request.settings,
        renderSignal,
        source ? session?.loadTiles : undefined,
      );
      renderSignal.throwIfAborted();
      return reply({ type: 'poster-made', id, image });
    }
    case 'make-video': {
      const { video, report } = await makeVideo(
        await tracks(),
        request.settings,
        renderSignal,
        progress,
        source ? session?.loadTiles : undefined,
      );
      renderSignal.throwIfAborted();
      return reply({ type: 'video-made', id, video, report }, [video]);
    }
  }
}

async function handle(request: Request): Promise<void> {
  if (request.type === 'cancel') {
    running.get(request.id)?.abort();
    return;
  }
  const controller = new AbortController();
  running.set(request.id, controller);
  try {
    await answer(request, controller.signal);
  } catch (error) {
    if (error instanceof Canceled || (error instanceof DOMException && error.name === 'AbortError'))
      reply({ type: 'canceled', id: request.id });
    else
      reply({
        type: 'failed',
        id: request.id,
        message: messageFor(error),
        expired: error instanceof StravaExpired,
      });
  } finally {
    running.delete(request.id);
  }
}

self.onmessage = (event: MessageEvent<Request>) => void handle(event.data);
