// The worker: does all the heavy work so the page never freezes. It keeps the library of
// activities and answers the page's requests (see messages.ts).

import { SettingsError } from '@wornways/engine';
import type { Reply, Request } from '../messages.ts';
import { Library } from './library.ts';
import { planVideo } from './plan.ts';
import { makePoster } from './poster.ts';
import { ActivityStoreUnavailable } from './store.ts';
import { Canceled, VideoProblem, makeVideo } from './video.ts';

let library: Promise<Library> | undefined;

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
  if (error instanceof VideoProblem) return error.message;
  console.error(error);
  if (error instanceof ActivityStoreUnavailable) return error.message;
  return `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
}

async function answer(request: Exclude<Request, { type: 'cancel' }>, signal: AbortSignal) {
  const { id } = request;
  const progress = (p: Extract<Reply, { type: 'progress' }>['progress']) =>
    reply({ type: 'progress', id, progress: p });
  const lib = await getLibrary();
  switch (request.type) {
    case 'read-library':
      return reply({ type: 'library', id, activities: lib.summaries() });
    case 'add-files': {
      const report = await lib.add(request.files, progress);
      return reply({ type: 'files-added', id, report, activities: lib.summaries() });
    }
    case 'delete-activities':
      await lib.delete(request.ids);
      return reply({ type: 'library', id, activities: lib.summaries() });
    case 'match':
      return reply({ type: 'matched', id, match: lib.match(request.settings) });
    case 'places':
      return reply({ type: 'places', id, places: lib.places(request.settings, request.end) });
    case 'plan':
      return reply({ type: 'planned', id, plan: planVideo(lib.all(), request.settings) });
    case 'make-poster': {
      const image = await makePoster(lib.all(), request.settings, signal);
      return reply({ type: 'poster-made', id, image });
    }
    case 'make-video': {
      const { video, report } = await makeVideo(lib.all(), request.settings, signal, progress);
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
    if (error instanceof Canceled) reply({ type: 'canceled', id: request.id });
    else reply({ type: 'failed', id: request.id, message: messageFor(error) });
  } finally {
    running.delete(request.id);
  }
}

self.onmessage = (event: MessageEvent<Request>) => void handle(event.data);
