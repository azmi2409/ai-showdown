import { Response } from 'express';

export type SSEEventType =
  | 'init'
  | 'thought'
  | 'move'
  | 'clock'
  | 'log'
  | 'status'
  | 'game_over'
  | 'ping';

export interface SSEMessage {
  type: SSEEventType;
  payload: any;
}

export class SSEHub {
  private clients: Set<Response> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Send periodic ping every 15s to keep connections alive through proxies
    this.heartbeatInterval = setInterval(() => {
      this.broadcast('ping', { timestamp: Date.now() });
    }, 15000);
    this.heartbeatInterval.unref();
  }

  public closeAll(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const client of this.clients) {
      try {
        client.end();
      } catch {}
    }
    this.clients.clear();
  }

  public addClient(res: Response, initialData?: any): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable proxy buffering (Nginx, etc.)
    });

    res.write('\n');
    this.clients.add(res);

    // Send initial snapshot immediately upon connection
    if (initialData) {
      this.sendToClient(res, 'init', initialData);
    }

    const cleanup = () => {
      this.clients.delete(res);
    };

    res.on('close', cleanup);
    res.on('finish', cleanup);
    res.on('error', cleanup);
  }

  public removeClient(res: Response): void {
    this.clients.delete(res);
  }

  public broadcast(type: SSEEventType, payload: any): void {
    const data = JSON.stringify({ type, payload });
    const message = `event: ${type}\ndata: ${data}\n\n`;

    for (const client of this.clients) {
      if (client.destroyed || client.writableEnded) {
        this.clients.delete(client);
        continue;
      }
      try {
        const ok = client.write(message);
        if (!ok && (client.destroyed || client.writableEnded)) {
          this.clients.delete(client);
        }
      } catch {
        this.clients.delete(client);
      }
    }
  }

  private sendToClient(res: Response, type: SSEEventType, payload: any): void {
    if (res.destroyed || res.writableEnded) {
      this.clients.delete(res);
      return;
    }
    try {
      const data = JSON.stringify({ type, payload });
      res.write(`event: ${type}\ndata: ${data}\n\n`);
    } catch {
      this.clients.delete(res);
    }
  }

  public getClientCount(): number {
    return this.clients.size;
  }
}

export const sseHub = new SSEHub();
