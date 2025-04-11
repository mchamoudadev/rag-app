declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage } from 'http';

  export class WebSocket extends EventEmitter {
    constructor(address: string, options?: {
      headers?: Record<string, string>;
    });
    send(data: string): void;
    close(): void;
    readyState: number;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { server: any });
    on(event: 'connection', listener: (ws: WebSocket, req: IncomingMessage) => void): this;
  }
} 