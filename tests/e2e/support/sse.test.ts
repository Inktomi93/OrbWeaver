// tests/e2e/support/sse — the chat-room SSE collector's VERDICT, proven against a scripted loopback server
// (#1505). Node-lane (vitest) for the same reason target-guard.test.ts is: the arms that matter must be
// provable without booting a stack or a model.
//
// The defect being pinned: the collector returned a bare array whether `until` was satisfied, the timer
// fired, or the server closed the stream, and it discarded every unreadable frame silently.
// An absence assertion over that array (`not.toContain(<the hidden truth>)`) then passed on a stream that
// delivered nothing at all. Every arm below carries its positive twin: the satisfied case proves the scripted
// server delivers, so the timed-out and ended verdicts cannot be a server that never worked.
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe, expect, test } from "vitest";
import { collectChatRoomFrames, requireSatisfied } from "./sse.ts";

const CHAT = castId<ChatId>("chat-under-test");
const OTHER_CHAT = castId<ChatId>("a-different-chat");
/** Long enough that the satisfied arm never races it, short enough that the timed-out arm stays cheap. */
const SHORT_TIMEOUT_MS = 300;
const SATISFIED_TIMEOUT_MS = 10_000;

/** One SSE frame on the wire: the `data:` JSON line, then the per-socket ordinal, then the blank line. */
function frame(data: string, ordinal: number): string {
  return `data: ${data}\nid: ${String(ordinal)}\n\n`;
}

const roomFrame = (seq: number, type: string, chatId: ChatId = CHAT): string => JSON.stringify({ channel: "chat", chatId, seq, event: { type } });

/** How the scripted `stream.connect` behaves after writing its frames. */
type Tail = "hold" | "end";

let server: Server | null = null;

afterEach(async () => {
  const running = server;
  server = null;
  if (running !== null) {
    running.closeAllConnections();
    await new Promise<void>((resolve) => running.close(() => resolve()));
  }
});

/** Boot a loopback server that accepts the attach, then serves `frames` on the connect and either holds the
 *  socket open (the `until`-never-satisfied shape) or ends it (the server-closed shape). */
async function scriptedRoom(frames: readonly string[], tail: Tail): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    if (req.url?.startsWith("/api/trpc/stream.attach") === true) {
      res.writeHead(200, { "content-type": "application/json" }).end("[]");
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`event: connected\n${frame("{}", 0)}`);
    frames.forEach((data, index) => {
      res.write(frame(data, index + 1));
    });
    if (tail === "end") {
      res.end();
    }
  };
  server = createServer(handler);
  const listening = server;
  await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", () => resolve()));
  return `http://127.0.0.1:${String((listening.address() as AddressInfo).port)}`;
}

describe("collectChatRoomFrames verdict", () => {
  test("SATISFIED — the predicate held: outcome satisfied, the room's values delivered, other rooms and control frames skipped", async () => {
    const baseUrl = await scriptedRoom(
      [roomFrame(1, "noise", OTHER_CHAT), JSON.stringify({ channel: "control", kind: "attached" }), roomFrame(2, "messageCommitted")],
      "hold",
    );
    const collection = await collectChatRoomFrames({
      baseUrl,
      headers: {},
      chatId: CHAT,
      until: (values) => values.length > 0,
      timeoutMs: SATISFIED_TIMEOUT_MS,
    });
    expect(collection.outcome).toBe("satisfied");
    expect(collection.values).toEqual([{ seq: 2, event: { type: "messageCommitted" } }]);
    expect(collection.malformedFrames).toBe(0);
    expect(requireSatisfied(collection, "planted satisfied")).toBe(collection.values);
  });

  test("TIMED OUT — a stream that never satisfies `until` is a timed-out verdict, never an empty success", async () => {
    const baseUrl = await scriptedRoom([roomFrame(1, "noise", OTHER_CHAT)], "hold");
    const collection = await collectChatRoomFrames({ baseUrl, headers: {}, chatId: CHAT, until: (values) => values.length > 0, timeoutMs: SHORT_TIMEOUT_MS });
    expect(collection.outcome).toBe("timed-out");
    expect(collection.values).toEqual([]);
    expect(() => requireSatisfied(collection, "member live")).toThrow(/member live.*timed-out/u);
  });

  test("STREAM ENDED — the server closing before `until` held is its own verdict, not satisfaction", async () => {
    const baseUrl = await scriptedRoom([roomFrame(1, "delta")], "end");
    const collection = await collectChatRoomFrames({
      baseUrl,
      headers: {},
      chatId: CHAT,
      until: (values) => values.length >= 2,
      timeoutMs: SATISFIED_TIMEOUT_MS,
    });
    expect(collection.outcome).toBe("stream-ended");
    expect(collection.values).toHaveLength(1);
    expect(() => requireSatisfied(collection, "host replay")).toThrow(/host replay.*stream-ended/u);
  });

  test("MALFORMED — unreadable frames are COUNTED, and a satisfied collection carrying any still refuses", async () => {
    const baseUrl = await scriptedRoom(
      [
        "{not json",
        JSON.stringify({ channel: "chat", chatId: CHAT, event: { type: "seq-missing" } }),
        JSON.stringify({ channel: "chat", chatId: CHAT, seq: 3 }),
        roomFrame(4, "messageCommitted"),
      ],
      "hold",
    );
    const collection = await collectChatRoomFrames({
      baseUrl,
      headers: {},
      chatId: CHAT,
      until: (values) => values.length > 0,
      timeoutMs: SATISFIED_TIMEOUT_MS,
    });
    expect(collection.outcome).toBe("satisfied");
    expect(collection.values).toEqual([{ seq: 4, event: { type: "messageCommitted" } }]);
    expect(collection.malformedFrames).toBe(3);
    expect(() => requireSatisfied(collection, "member replay")).toThrow(/member replay.*3 malformed/u);
  });
});
