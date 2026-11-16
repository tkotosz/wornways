// The engine compiles without DOM or Node typings so it cannot reach for platform APIs by
// accident. The few web APIs it uses exist in browsers, workers and Node alike; only the
// parts it uses are declared here.

declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array): string;
}

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

// Downloading map tiles

declare class AbortSignal {
  static timeout(milliseconds: number): AbortSignal;
  readonly aborted: boolean;
}

declare class Response {
  constructor(body?: ReadableStream<Uint8Array> | Uint8Array | null);
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
}

declare function fetch(
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
): Promise<Response>;

// Unpacking gzip-compressed tiles

declare class ReadableStream<T> {
  pipeThrough<U>(transform: { writable: unknown; readable: ReadableStream<U> }): ReadableStream<U>;
  private readonly chunk?: T;
}

declare class Blob {
  constructor(parts: Uint8Array[]);
  stream(): ReadableStream<Uint8Array>;
}

declare class DecompressionStream {
  constructor(format: 'gzip' | 'deflate' | 'deflate-raw');
  readonly writable: unknown;
  readonly readable: ReadableStream<Uint8Array>;
}
