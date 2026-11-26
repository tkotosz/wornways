import { describe, expect, it } from 'vitest';
import { deviceSummary } from '../src/report.ts';

describe('deviceSummary', () => {
  it('tells the kind of device, the browser and whether the app is installed', () => {
    const pixel =
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
    expect(deviceSummary(pixel, true, true)).toBe('Android phone, Chrome, installed app');
    const samsung =
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/29.0 Chrome/136.0.0.0 Mobile Safari/537.36';
    expect(deviceSummary(samsung, false, true)).toBe(
      'Android phone, Samsung Internet, in the browser',
    );
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    expect(deviceSummary(iphone, false, true)).toBe('iPhone, Safari, in the browser');
    // iPadOS says Mac, but has touch.
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
    expect(deviceSummary(mac, true, true)).toBe('iPad, Safari, installed app');
    expect(deviceSummary(mac, false, false)).toBe('Mac, Safari, in the browser');
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0';
    expect(deviceSummary(edge, false, false)).toBe('Windows, Edge, in the browser');
    const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0';
    expect(deviceSummary(firefox, false, false)).toBe('Linux, Firefox, in the browser');
  });
});
