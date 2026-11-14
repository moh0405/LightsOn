import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandError, RoomSocket } from "./ws";

class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  open() { this.readyState = 1; this.onopen?.(); }
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; }
  drop(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
  recv(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  vi.stubGlobal("location", { protocol: "https:", host: "x.test" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function make(playerId: string | null = "p1") {
  const messages: unknown[] = [];
  const s = new RoomSocket({
    room: "ABCD", role: "play", getPlayerId: () => playerId,
    onMessage: (m) => messages.push(m), onStatus: () => undefined,
    makeSocket: (u) => new FakeWS(u) as unknown as WebSocket,
  });
  s.connect();
  return { s, messages };
}

describe("RoomSocket", () => {
  it("reconnects with backoff and rebinds the player id", () => {
    const { s } = make();
    const first = FakeWS.instances[0]!;
    expect(first.url).toBe("wss://x.test/ws/ABCD?role=play&player_id=p1");
    first.open();
    first.drop();
    vi.advanceTimersByTime(500);
    expect(FakeWS.instances).toHaveLength(2);
    FakeWS.instances[1]!.drop();
    vi.advanceTimersByTime(500);
    expect(FakeWS.instances).toHaveLength(2); // second retry waits 1000ms
    vi.advanceTimersByTime(500);
    expect(FakeWS.instances).toHaveLength(3);
    s.close();
  });

  it("does not retry when the room does not exist (4404)", () => {
    make();
    FakeWS.instances[0]!.drop(4404);
    vi.advanceTimersByTime(10000);
    expect(FakeWS.instances).toHaveLength(1);
  });

  it("resolves send() on ack and rejects on error", async () => {
    const { s } = make();
    const ws = FakeWS.instances[0]!;
    ws.open();
    const ok = s.send({ type: "join", nickname: "Ann" });
    const nonce1 = JSON.parse(ws.sent[0]!).nonce as string;
    ws.recv({ type: "ack", nonce: nonce1, command: "join", result: { player_id: "p9" } });
    await expect(ok).resolves.toEqual({ player_id: "p9" });
    const bad = s.send({ type: "wake" });
    const nonce2 = JSON.parse(ws.sent[1]!).nonce as string;
    ws.recv({ type: "error", nonce: nonce2, code: "wrong_phase", message: "no" });
    await expect(bad).rejects.toMatchObject({ code: "wrong_phase" });
    s.close();
  });

  it("rejects pending commands when the connection drops", async () => {
    const { s } = make();
    const ws = FakeWS.instances[0]!;
    ws.open();
    const p = s.send({ type: "wake" });
    ws.drop();
    await expect(p).rejects.toBeInstanceOf(CommandError);
    s.close();
  });
});
