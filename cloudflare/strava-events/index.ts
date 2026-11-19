// The relay is addressed only through the Pages binding. Its only state is the
// set of open WebSockets. Even when hibernating it holds no activities or tokens.
interface RelayState {
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
}

declare const WebSocketPair: new () => { 0: WebSocket; 1: WebSocket };

export class StravaEvents {
  constructor(private readonly state: RelayState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const { 0: client, 1: server } = new WebSocketPair();
      this.state.acceptWebSocket(server);
      const protocol = request.headers.get('Sec-WebSocket-Protocol') ?? '';
      const response = {
        status: 101,
        webSocket: client,
        headers: { 'Sec-WebSocket-Protocol': protocol },
      };
      return new Response(null, response);
    }
    if (request.method === 'POST') {
      const event = await request.text();
      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send(event);
        } catch {
          // A socket that closed while the event was in flight has already detached.
        }
      }
      return new Response();
    }
    return new Response(null, { status: 404 });
  }

  webSocketClose(socket: WebSocket, code: number): void {
    socket.close(code === 1005 || code === 1006 ? 1000 : code);
  }

  webSocketError(socket: WebSocket): void {
    socket.close(1011, 'Connection interrupted');
  }
}

export default {
  fetch: () => new Response(null, { status: 404 }),
};
