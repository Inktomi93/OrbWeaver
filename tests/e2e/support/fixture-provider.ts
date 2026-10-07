// External scripted OpenAI-compatible wire fixture; the app still owns HTTP, SSE and persistence.
// Held turns advance only when the browser has observed a prefix, so completion cannot fake streaming.
import type { Server, ServerResponse } from "node:http";
import { createServer } from "node:http";

/** The lie's TRUTH string — the comparand the member payload must never carry (body OR reasoning). Exported
 *  so the spec asserts on the exact bytes the fixture streams. */
export const FIXTURE_LIE_TRUTH = "the baron poisoned the well himself";

/** A distinctive substring of the member-VISIBLE cover prose — the deterministic "the turn's reply landed"
 *  marker BOTH viewers see (the cover prose is never stripped; only the `<lie>` span + reasoning are). A spec
 *  collects a viewer's stream until a committed row carries this. */
export const FIXTURE_COVER_MARKER = "Bad luck with the water";

/** The member-VISIBLE prose that streams AFTER the `<lie>` span closes, in the SAME chunk as the span's
 *  tail. A member resuming at the mid-span boundary must receive THIS and nothing before it — it is what
 *  separates "correctly withheld the tag" from "delivered nothing at all". */
export const FIXTURE_POST_SPAN_PROSE = " He spits into the dust.";

/** The secret-bearing fragment of the span's SECOND chunk — the bytes the pre-ed2aafc5 producer forwarded to
 *  a member who resumed mid-tag (the commit's byte trace: `1234"/> The vault is empty.`).
 *
 *  `FIXTURE_LIE_TRUTH` alone cannot catch this leak: the truth string is SPLIT across the two chunks, so no
 *  single chunk contains it and a `not.toContain(FIXTURE_LIE_TRUTH)` assertion would pass while the tail
 *  leaked. Assert on THIS instead.
 *
 *  QUOTE-FREE, DELIBERATELY. Specs compare against `JSON.stringify(frames)` — the serialized payload a
 *  devtools viewer reads — and that escapes `"` to `\"`. A comparand carrying a raw quote (`well himself"
 *  reason=`) can NEVER appear in it, so the `not.toContain` arm is vacuously green and the `toContain`
 *  differential arm fails against a payload that visibly holds the bytes. Both happened on the first run of
 *  live-hidden-span-resume; the differential is what surfaced it. Keep every wire comparand quote-free. */
export const FIXTURE_LIE_TAIL = "well himself";

/** The `<lie>` span's `reason` VALUE — quote-free (see {@link FIXTURE_LIE_TAIL}), so it is usable as a
 *  second, independent "the tag's innards leaked" comparand. */
export const FIXTURE_LIE_REASON = "to avoid the mob";

/** The visible cover prose + the hidden `<lie>` span the body channel streams (the `<lie>` truth is the
 *  secret; the surrounding prose is member-visible).
 *
 *  THE SPAN IS STREAMED IN TWO CHUNKS, SPLIT MID-ATTRIBUTE (deliberate, 808ba09cc6). A one-chunk span is
 *  unfalsifiable for the mid-slot RESUME defect: any reader — stateful or freshly cold-started — sees the
 *  whole `<lie …/>` at once and strips it, so a spec built on it goes green against BOTH the fixed and the
 *  broken producer. Splitting inside `truth="…"` creates the exact byte window the leak lived in: a reader
 *  that starts AFTER chunk 1 receives a continuation with no `<` in it, which a per-subscription scrubber
 *  called safe and forwarded. The trailing member-visible prose rides chunk 2 so a correct implementation
 *  can be seen DELIVERING (the post-`/>` bytes) while withholding the tag tail — an empty payload would
 *  otherwise pass the same assertion. */
const COVER_PROSE = `The old man shrugs. "${FIXTURE_COVER_MARKER}, is all." `;
/** Chunk 1 — the span's opener, cut mid-`truth` attribute (no `>` yet: the tag is still in flight).
 *  Exported so a spec can LOCATE this chunk's durable frame and resume from exactly the boundary after it. */
export const FIXTURE_LIE_SPAN_OPEN = `<lie character="Baron" type="deception" truth="the baron poisoned the `;
/** Chunk 2 — the secret's TAIL + the tag close + trailing member-visible prose. A reader resuming at the
 *  chunk boundary is handed exactly this and must still withhold everything up to `/>`. */
const LIE_SPAN_TAIL = `${FIXTURE_LIE_TAIL}" reason="${FIXTURE_LIE_REASON}"/>${FIXTURE_POST_SPAN_PROSE}`;

/** The reasoning channel that SPELLS the truth — the deception-model "thinking out loud" a member must never
 *  see on a deception-active game (the whole channel is host-only). */
const REASONING_TEXT = `The player is asking about the well. I will deflect, but the fact is ${FIXTURE_LIE_TRUTH}.`;

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
} as const;

/** One OpenAI-compat streaming chunk envelope carrying a single delta field. (OpenAI wire fields are fixed
 *  snake_case; this file is on the biome config-file naming override alongside the other e2e-support wire/env
 *  emitters — global-setup.ts / modes.ts.) */
function chunk(delta: Record<string, unknown>): string {
  const payload = { id: "fixture-1", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** The terminal chunk (finish_reason + usage) then the `[DONE]` sentinel. */
function doneFrames(): string {
  const finish = {
    id: "fixture-1",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  };
  return `data: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`;
}

/** Write the scripted deception turn: reasoning channel (spells the truth) → cover prose → the `<lie>` span
 *  in TWO chunks split mid-attribute (the mid-slot resume window) → done. */
function writeScriptedTurn(write: (frame: string) => void): void {
  write(chunk({ reasoning: REASONING_TEXT }));
  write(chunk({ content: COVER_PROSE }));
  write(chunk({ content: FIXTURE_LIE_SPAN_OPEN }));
  write(chunk({ content: LIE_SPAN_TAIL }));
  write(doneFrames());
}

/** A bounded synthetic turn; a wrong outbound user message refuses the response. */
export interface FixtureTurn {
  readonly userMessage: string;
  readonly prefix: string;
  readonly suffix: string;
}

// Capture peer closure before fixture cleanup can cause it.
interface FixtureRequest {
  readonly body: string;
  closed: boolean;
  socketClosed: boolean;
  finished: boolean;
}

export interface FixtureProvider {
  readonly baseUrl: string;
  readonly host: string;
  readonly requests: readonly FixtureRequest[];
  readonly release: (index: number) => void;
  readonly close: () => Promise<void>;
}

interface ChatRequest {
  readonly messages: readonly { readonly role: string; readonly content: string }[];
}

/** Scripted turns require exact latest-user content; deception input accepts a name-stamped first line. */
export function startFixtureProvider(port: number, turns?: readonly FixtureTurn[], expectedUserMarker?: string): Promise<FixtureProvider> {
  const requests: FixtureRequest[] = [];
  const held = new Map<number, ServerResponse>();
  const server: Server = createServer((req, res) => {
    if (req.method === "GET" && req.url?.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "fixture-model", object: "model", created: 0, owned_by: "fixture" }] }));
      return;
    }
    if (req.method !== "POST" || req.url === undefined || !req.url.endsWith("/chat/completions")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "fixture-provider: only POST .../chat/completions is served" } }));
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (part: string) => {
      body += part;
    });
    req.on("end", () => {
      const index = requests.length;
      const request: FixtureRequest = { body, closed: false, socketClosed: false, finished: false };
      requests.push(request);
      req.socket.once("close", () => {
        request.socketClosed = true;
      });
      res.on("close", () => {
        request.closed = true;
        held.delete(index);
      });
      const parsed = JSON.parse(body) as ChatRequest;
      const lastUser = parsed.messages.findLast((message) => message.role === "user");
      const userLine = lastUser?.content.split("\n")[0];
      if (expectedUserMarker !== undefined && userLine !== expectedUserMarker && !userLine?.endsWith(`: ${expectedUserMarker}`)) {
        res.writeHead(422, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "fixture-provider: wrong user turn" } }));
        return;
      }
      if (turns === undefined) {
        res.writeHead(200, SSE_HEADERS);
        writeScriptedTurn((frame) => res.write(frame));
        request.finished = true;
        res.end();
        return;
      }
      const turn = turns[index];
      if (turn === undefined || lastUser?.content !== turn.userMessage) {
        res.writeHead(422, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "fixture-provider: exhausted script or wrong user turn" } }));
        return;
      }
      res.writeHead(200, SSE_HEADERS);
      res.write(chunk({ content: turn.prefix }));
      held.set(index, res);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("fixture-provider: no TCP address"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        host: "127.0.0.1",
        requests,
        release: (index) => {
          const response = held.get(index);
          const turn = turns?.[index];
          const request = requests[index];
          if (response === undefined || turn === undefined || request === undefined) {
            throw new Error(`fixture-provider: turn ${index} is not held`);
          }
          response.write(chunk({ content: turn.suffix }));
          response.write(doneFrames());
          request.finished = true;
          response.end();
          held.delete(index);
        },
        close: () =>
          new Promise<void>((done) => {
            for (const response of held.values()) {
              response.destroy();
            }
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
