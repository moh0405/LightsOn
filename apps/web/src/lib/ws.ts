import type { ServerMessage } from "./protocol";

export type ConnStatus = "connecting" | "open" | "closed";

export class CommandError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

interface Pending {
  resolve: (r: Record<string, unknown>) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SocketOptions {
  room: string;
  role: "screen" | "play" | "admin";
  /** read on every (re)connect so a reconnect rebinds to the current player */
  getPlayerId?: () => string | null;
  onMessage: (msg: ServerMessage) => void;
  onStatus: (s: ConnStatus) => void;
  /** injectable for tests */
  makeSocket?: (url: string) => WebSocket;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

let nonceCounter = 0;

/** WebSocket with auto-reconnect (exponential backoff) and nonce-matched command acks. */
export class RoomSocket {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private attempt = 0;
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: SocketOptions) {}

  private url(): string {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const q = new URLSearchParams({ role: this.opts.role });
    const pid = this.opts.getPlayerId?.();
    if (pid) q.set("player_id", pid);
    return `${proto}://${location.host}/ws/${this.opts.room}?${q}`;
  }

  connect(): void {
    this.stopped = false;
    this.opts.onStatus("connecting");
    const ws = (this.opts.makeSocket ?? ((u) => new WebSocket(u)))(this.url());
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.opts.onStatus("open");
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === "ack" || (msg.type === "error" && msg.nonce)) this.settle(msg);
      this.opts.onMessage(msg);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failAll(new CommandError("disconnected", "Connection lost."));
      this.opts.onStatus("closed");
      if (this.stopped || ev.code === 4404) return; // 4404: room does not exist, do not hammer
      const base = this.opts.baseDelayMs ?? 500;
      const delay = Math.min(this.opts.maxDelayMs ?? 5000, base * 2 ** this.attempt++);
      this.retry = setTimeout(() => this.connect(), delay);
    };
  }

  close(): void {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.failAll(new CommandError("closed", "Socket closed."));
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  /** Fire-and-forget (pointer events). Silently dropped while disconnected. */
  emit(cmd: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(cmd));
  }

  /** Send a command and wait for its ack (resolves) or error (rejects). */
  send(cmd: Record<string, unknown>, timeoutMs = 8000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new CommandError("disconnected", "Not connected."));
        return;
      }
      const nonce = `n${++nonceCounter}-${Date.now().toString(36)}`;
      const timer = setTimeout(() => {
        this.pending.delete(nonce);
        reject(new CommandError("timeout", "The server did not answer."));
      }, timeoutMs);
      this.pending.set(nonce, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ ...cmd, nonce }));
    });
  }

  private settle(msg: ServerMessage): void {
    if (msg.type !== "ack" && msg.type !== "error") return;
    const nonce = msg.nonce;
    const p = nonce ? this.pending.get(nonce) : undefined;
    if (!p || !nonce) return;
    clearTimeout(p.timer);
    this.pending.delete(nonce);
    if (msg.type === "ack") p.resolve(msg.result);
    else p.reject(new CommandError(msg.code, msg.message));
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}
