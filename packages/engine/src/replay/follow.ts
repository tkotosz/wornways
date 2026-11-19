import type { Track } from '../track/types.ts';
import type { CameraPath } from './camera.ts';
import { projectTrack } from './project.ts';
import type { Timeline } from './timeline.ts';
import { trackArea, type View } from './view.ts';

const MAX_ZOOM = 64;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ease = (value: number) => value ** 2 * (3 - 2 * value);
const mix = (a: number, b: number, weight: number) => a + (b - a) * weight;

/**
 * Follows the latest activity to start, glides to the next one, then settles on the view
 * of the whole replay. The timeline and projection are the same ones used to draw it.
 */
export function followRouteCamera(
  tracks: Pick<Track, 'points'>[],
  timeline: Timeline,
  view: View,
  fps: number,
): CameraPath {
  const windows = timeline.windows;
  if (!windows?.length) throw new Error('The follow camera needs activity drawing windows');
  const frames = Math.round(timeline.duration * fps);
  const area = trackArea(view.width, view.height);
  const centreX = area.x + area.w / 2;
  const centreY = area.y + area.h / 2;
  const camera: CameraPath = {
    zoom: new Float32Array(frames),
    tx: new Float32Array(frames),
    ty: new Float32Array(frames),
    maxZoom: 1,
  };

  const order = windows.map((window, track) => ({ ...window, track }));
  order.sort((a, b) => a.start - b.start || a.track - b.track);
  const headX = new Float64Array(frames);
  const headY = new Float64Array(frames);
  const cuts = [0];
  let selected = 0;
  let route = projectTrack(tracks[order[0].track], view, 0.35 / MAX_ZOOM);
  let point = 0;
  for (let frame = 0; frame < frames; frame++) {
    const time = frame / fps;
    let next = selected;
    while (next + 1 < order.length && order[next + 1].start <= time) next++;
    if (next !== selected) {
      selected = next;
      route = projectTrack(tracks[order[selected].track], view, 0.35 / MAX_ZOOM);
      point = 0;
      if (frame > 0) cuts.push(frame);
    }
    const progress = timeline.progress(order[selected].track, time);
    while (point + 1 < route.count && route.u[point + 1] <= progress) point++;
    const end = Math.min(point + 1, route.count - 1);
    const span = route.u[end] - route.u[point];
    const weight = span > 0 ? clamp((progress - route.u[point]) / span, 0, 1) : 0;
    headX[frame] = mix(route.xy[point * 2], route.xy[end * 2], weight);
    headY[frame] = mix(route.xy[point * 2 + 1], route.xy[end * 2 + 1], weight);
  }
  cuts.push(frames);

  const x = new Float64Array(frames);
  const y = new Float64Array(frames);
  const size = new Float64Array(frames);
  // Average symmetrically around each frame so the camera anticipates turns.
  const radius = Math.max(1, Math.round(fps));
  const weights = Array.from(
    { length: radius * 2 + 1 },
    (_, i) => (1 + Math.cos((Math.PI * (i - radius)) / radius)) / 2,
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  for (let part = 1; part < cuts.length; part++) {
    const from = cuts[part - 1];
    const last = cuts[part] - 1;
    const speeds: number[] = [];
    for (let frame = from; frame <= last; frame++) {
      for (let offset = -radius; offset <= radius; offset++) {
        const sample = clamp(frame + offset, from, last);
        const weight = weights[offset + radius] / total;
        x[frame] += headX[sample] * weight;
        y[frame] += headY[sample] * weight;
      }
      if (frame > from)
        speeds.push(Math.hypot(x[frame] - x[frame - 1], y[frame] - y[frame - 1]) * fps);
    }
    speeds.sort((a, b) => a - b);
    // Fit the pan speed to the activity, ignoring isolated bursts. Quantise close views
    // to powers of two so they use one map level between transitions.
    const speed = Math.max(
      speeds[Math.floor(speeds.length * 0.95)] ?? 0,
      (Math.hypot(headX[last] - headX[from], headY[last] - headY[from]) * fps) /
        Math.max(1, last - from),
    );
    const mercatorY = (headY[from] - view.offY) / view.scale;
    const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * mercatorY)));
    const metresPerPixel = (40075016.686 * Math.cos(latitude)) / view.scale;
    const limit = clamp(
      Math.min((0.45 * view.width) / speed, (area.w * metresPerPixel) / 1500),
      1,
      MAX_ZOOM,
    );
    const zoom = limit >= 2 ? 2 ** Math.floor(Math.log2(limit)) : limit;
    const pan = ease(clamp((zoom - 1) / 0.25, 0, 1));
    for (let frame = from; frame <= last; frame++) {
      size[frame] = 1 / zoom;
      // Limit lag on sharp turns so the route head stays in the middle of the map.
      const halfWidth = (area.w * 0.3) / zoom;
      const halfHeight = (area.h * 0.3) / zoom;
      x[frame] = mix(
        centreX,
        clamp(x[frame], headX[frame] - halfWidth, headX[frame] + halfWidth),
        pan,
      );
      y[frame] = mix(
        centreY,
        clamp(y[frame], headY[frame] - halfHeight, headY[frame] + halfHeight),
        pan,
      );
    }
  }

  for (let part = 1; part < cuts.length - 1; part++) {
    const cut = cuts[part];
    const span = Math.min(
      Math.round(fps),
      Math.floor((cut - cuts[part - 1]) / 2),
      Math.floor((cuts[part + 1] - cut) / 2),
    );
    if (span === 0) continue;
    // Meet at a view that contains both routes' heads during the transition. Interpolating
    // the centres and sizes together keeps a head in view if both end views contain it.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let wide = 0;
    for (let frame = cut - span; frame < cut + span; frame++) {
      minX = Math.min(minX, headX[frame]);
      minY = Math.min(minY, headY[frame]);
      maxX = Math.max(maxX, headX[frame]);
      maxY = Math.max(maxY, headY[frame]);
      wide = Math.max(wide, size[frame]);
    }
    wide = Math.min(
      1,
      Math.max(wide, (maxX - minX) / (0.8 * area.w), (maxY - minY) / (0.8 * area.h)),
    );
    const bridgeX = wide === 1 ? centreX : (minX + maxX) / 2;
    const bridgeY = wide === 1 ? centreY : (minY + maxY) / 2;
    for (let frame = cut - span; frame < cut + span; frame++) {
      const weight = ease(1 - Math.abs(frame - cut) / span);
      size[frame] = mix(size[frame], wide, weight);
      x[frame] = mix(x[frame], bridgeX, weight);
      y[frame] = mix(y[frame], bridgeY, weight);
    }
  }

  const pullBack = Math.max(1, Math.min(Math.round(2 * fps), Math.round(frames / 3)));
  for (let frame = 0; frame < frames; frame++) {
    const weight = ease(clamp(1 - (frames - 1 - frame) / pullBack, 0, 1));
    const zoom = 1 / mix(size[frame], 1, weight);
    camera.zoom[frame] = zoom;
    camera.tx[frame] = centreX - mix(x[frame], centreX, weight) * zoom;
    camera.ty[frame] = centreY - mix(y[frame], centreY, weight) * zoom;
    camera.maxZoom = Math.max(camera.maxZoom, camera.zoom[frame]);
  }
  return camera;
}
