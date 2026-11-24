// The worker: does all the heavy work so the page never freezes. It keeps the library of
// activities and answers the page's requests (see messages.ts).

import { parseSettings, SettingsError } from '@wornways/engine';
import type { ActivitySummary, Reply, Request } from '../messages.ts';
import { DemoUnavailable, openDemo } from './demo.ts';
import { Library } from './library.ts';
import { planVideo } from './plan.ts';
import { makePoster } from './poster.ts';
import { ActivityStoreUnavailable } from './store.ts';
import {
  forgetRideWithGps,
  RideWithGpsDisconnected,
  RideWithGpsError,
  RideWithGpsSession,
} from './ridewithgps.ts';
import { cachedSummaries, deleteCachedTracks } from './ridewithgps-cache.ts';
import { pruneStravaCaches } from './strava-cache.ts';
import { StravaError, StravaExpired, StravaSession } from './strava.ts';
import { Canceled, VideoProblem, makeVideo } from './video.ts';

let library: Promise<Library> | undefined;
let strava: StravaSession | null = null;
/** Strava's session while another source is open: its cache stays, to count what it keeps. */
let pausedStrava: StravaSession | null = null;
let rwgps: RideWithGpsSession | null = null;
/** The demo's activities while the demo is open. */
let demo: Promise<Library> | null = null;
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
  if (
    error instanceof VideoProblem ||
    error instanceof StravaError ||
    error instanceof RideWithGpsError ||
    error instanceof DemoUnavailable
  )
    return error.message;
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
      // Reopening the same sign-in uses the same cache, so it is not cleared here.
      pausedStrava = null;
      strava = new StravaSession(request.grant);
      return reply({ type: 'strava-started', id });
    // What Strava or Ride with GPS keeps on this device, read from the stored copies only.
    case 'downloaded-count':
    case 'downloaded':
    case 'forget-downloaded': {
      let activities: ActivitySummary[];
      if (request.service === 'strava') {
        const kept = session ?? pausedStrava;
        if (kept && request.type === 'forget-downloaded') await kept.forget(request.ids);
        activities = kept ? await kept.downloaded() : [];
      } else {
        if (request.type === 'forget-downloaded') {
          const ids =
            request.ids === 'all' ? (await cachedSummaries()).map((a) => a.id) : request.ids;
          rwgps?.forget(ids);
          await deleteCachedTracks(ids);
        }
        activities = await cachedSummaries();
      }
      if (request.type === 'downloaded-count')
        return reply({ type: 'downloaded-count', id, count: activities.length });
      return reply({ type: 'downloaded', id, activities });
    }
    case 'strava-keep':
      if (!session) pausedStrava = new StravaSession(request.grant);
      return reply({ type: 'strava-kept', id });
    case 'strava-close':
      strava = null;
      session?.pause();
      if (session) pausedStrava = session;
      return reply({ type: 'strava-closed', id });
    case 'strava-end': {
      // Also a connection that is not the source: disconnecting from its screen ends it.
      const ending = session ?? pausedStrava;
      strava = null;
      pausedStrava = null;
      if (ending) await ending.end(request.disconnect);
      return reply({ type: 'strava-ended', id });
    }
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
      const unavailable = await session.prepare(request.ids, signal, progress);
      return reply({ type: 'strava-prepared', id, unavailable });
    }
    case 'strava-prioritize':
      session?.prioritize(request.ids);
      return reply({ type: 'strava-prioritized', id });
    case 'demo-start': {
      demo ??= openDemo().catch((error: unknown) => {
        demo = null;
        throw error;
      });
      return reply({ type: 'demo-started', id, activities: (await demo).summaries() });
    }
    case 'demo-end':
      demo = null;
      return reply({ type: 'demo-ended', id });
    case 'rwgps-start': {
      rwgps?.close();
      const opened = new RideWithGpsSession();
      rwgps = opened;
      const activities = await opened.list(signal);
      return reply({ type: 'rwgps-started', id, activities });
    }
    case 'rwgps-end':
      rwgps?.close();
      rwgps = null;
      if (request.forget) await forgetRideWithGps();
      return reply({ type: 'rwgps-ended', id });
    case 'rwgps-prepare': {
      if (!rwgps) throw new RideWithGpsDisconnected('Ride with GPS is not open. Choose it again.');
      const unavailable = await rwgps.prepare(request.ids, signal, progress);
      return reply({ type: 'rwgps-prepared', id, unavailable });
    }
    case 'rwgps-prioritize':
      rwgps?.prioritize(request.ids);
      return reply({ type: 'rwgps-prioritized', id });
  }
  const source = 'source' in request ? request.source : 'files';
  /** A connected service's activities, when one is the source. */
  const remote = source === 'strava' ? session : source === 'rwgps' ? rwgps : null;
  if (source === 'strava' && !remote)
    throw new StravaExpired('No Strava session is open for this request. Connect again.');
  if (source === 'rwgps' && !remote)
    throw new RideWithGpsDisconnected('Ride with GPS is not open. Choose it again.');
  if (remote) {
    if (request.type === 'match')
      return reply({ type: 'matched', id, match: remote.match(request.settings) });
    if (request.type === 'places')
      return reply({ type: 'places', id, places: remote.places(request.settings, request.end) });
  }
  /** The library the request is about: this device's own, or the demo's. */
  const library = async (): Promise<Library> => {
    if (source !== 'demo') return getLibrary();
    if (!demo) throw new DemoUnavailable();
    return demo;
  };
  const renderSignal = remote ? AbortSignal.any([signal, remote.signal]) : signal;
  const tracks = async () => {
    if (!remote || !('settings' in request)) return (await library()).all();
    const settings = parseSettings(request.settings);
    const selected = await remote.selected(settings.activities ?? []);
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
      return reply({ type: 'matched', id, match: (await library()).match(request.settings) });
    case 'places':
      return reply({
        type: 'places',
        id,
        places: (await library()).places(request.settings, request.end),
      });
    case 'plan':
      return reply({ type: 'planned', id, plan: planVideo(await tracks(), request.settings) });
    case 'make-poster': {
      const image = await makePoster(
        await tracks(),
        request.settings,
        renderSignal,
        remote?.loadTiles,
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
        remote?.loadTiles,
        request.draft,
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
        disconnected: error instanceof RideWithGpsDisconnected,
      });
  } finally {
    running.delete(request.id);
  }
}

self.onmessage = (event: MessageEvent<Request>) => void handle(event.data);
