// A SCRIPTED OpenAI-compatible chat provider — harness test infra (like a mock IdP), NOT a product backdoor.
// It is a real, external, OpenAI-compatible endpoint the app talks to through a REAL `custom-openai` (BYO
// endpoint) connection + turn/SSE path — the only thing "special" is that WE control what it streams, so a
// turn produces a DETERMINISTIC reasoning channel + hidden `<lie>` body (a live 8B emits neither reliably).
//
// WHY this exists (the reasoning-channel proof): D110 §3.6's deception reasoning-host-only cut is applied in
// the REAL member SSE path (`chatEventStream`/`resolveLiveYield` + `replayChatEvents`), keyed on the model's
// streamed `reasoning` deltas + committed `view.reasoning`. There is NO product surface that lets a caller
// PLANT reasoning (reasoning is model-generated; `editReasoning` is deliberately unwired), so the ONLY
// legitimate deterministic input is a provider that EMITS a known reasoning stream — driven through the real
// turn. The app's `custom-openai` connection (a user-declared OpenAI-compatible baseUrl) is exactly that
// seam: a real product feature, here pointed at this fixture.
//
// THE SCRIPT (one turn): the SSE stream emits, in order — a `reasoning` channel that SPELLS the lie's truth
// ("I'll tell them ... but secretly <truth>"), then body `content` carrying visible cover prose, then a
// `<lie truth="<truth>"/>` span SPLIT ACROSS TWO CHUNKS mid-attribute, then `[DONE]`. So a deception-active
// member turn produces BOTH hidden-class channels; the member SSE strip must withhold the reasoning channel
// (whole) AND the `<lie>` body span, while the host sees both.
//
// WHY THE SPAN IS SPLIT (ed2aafc5): a one-chunk span cannot falsify the MID-SLOT RESUME defect — a reader
// that starts after the opener is the whole bug, and it only exists when the tag straddles a chunk boundary.
// See the `LIE_SPAN_*` block below for the full rationale + the exported comparands.
//
// It streams `choices[0].delta.{reasoning,content}` — the shape the custom-byo runner reshapes (its
// STREAM_DEFAULT_MAP reads `choices.0.delta.reasoning` + `choices.0.delta.content`). Content-type is
// `text/event-stream` (the runner's streaming path). Kept in the e2e-support tree, import-free of the app.

import type { Server } from "node:http";
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
 *  THE SPAN IS STREAMED IN TWO CHUNKS, SPLIT MID-ATTRIBUTE (deliberate, ed2aafc5). A one-chunk span is
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

export interface FixtureProvider {
  /** The baseUrl to write on the `custom-openai` connection (the runner appends `/chat/completions`). */
  readonly baseUrl: string;
  /** The bare host (for the egress allowlist). */
  readonly host: string;
  readonly close: () => Promise<void>;
}

/** Boot the scripted provider on `127.0.0.1:<port>`. Answers `POST <anything>/chat/completions` with the
 *  scripted deception SSE stream; every other route is a 404. Returns the baseUrl to wire onto the credential. */
export function startFixtureProvider(port: number): Promise<FixtureProvider> {
  const server: Server = createServer((req, res) => {
    if (req.method === "POST" && req.url !== undefined && req.url.endsWith("/chat/completions")) {
      // Drain the request body (the assembled prompt) — we ignore it; the script is fixed — then stream.
      req.on("data", () => undefined);
      req.on("end", () => {
        res.writeHead(200, SSE_HEADERS);
        writeScriptedTurn((frame) => res.write(frame));
        res.end();
      });
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "fixture-provider: only POST .../chat/completions is served" } }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const host = "127.0.0.1";
      resolve({
        baseUrl: `http://${host}:${port}/v1`,
        host,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}
