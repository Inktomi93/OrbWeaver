// A SCRIPTED OpenAI-compatible chat provider — harness test infra (like a mock IdP), NOT a product backdoor.
// It is a real, external, OpenAI-compatible endpoint the app talks to through its REAL `custom_openai`
// (BYO) backend + turn/SSE path — the only thing "special" is that WE control exactly what it streams, so a
// turn produces a DETERMINISTIC reasoning channel + hidden `<lie>` body (a live 8B emits neither reliably).
//
// WHY this exists (the reasoning-channel proof): D110 §3.6's deception reasoning-host-only cut is applied in
// the REAL member SSE path (`chatEventStream`/`resolveLiveYield` + `replayChatEvents`), keyed on the model's
// streamed `reasoning` deltas + committed `view.reasoning`. There is NO product surface that lets a caller
// PLANT reasoning (reasoning is model-generated; `editReasoning` is deliberately unwired), so the ONLY
// legitimate deterministic input is a provider that EMITS a known reasoning stream — driven through the real
// turn. The app's `custom_openai` credential (a user-declared OpenAI-compatible baseUrl) is exactly that
// seam: a real product feature, here pointed at this fixture.
//
// THE SCRIPT (one turn): the SSE stream emits, in order — a `reasoning` channel that SPELLS the lie's truth
// ("I'll tell them ... but secretly <truth>"), then body `content` carrying a `<lie truth="<truth>"/>` span,
// then `[DONE]`. So a deception-active member turn produces BOTH hidden-class channels; the member SSE strip
// must withhold the reasoning channel (whole) AND the `<lie>` body span, while the host sees both.
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

/** The visible cover prose + the hidden `<lie>` span the body channel streams (the `<lie>` truth is the
 *  secret; the surrounding prose is member-visible). */
const COVER_PROSE = `The old man shrugs. "${FIXTURE_COVER_MARKER}, is all." `;
const LIE_SPAN = `<lie character="Baron" type="deception" truth="${FIXTURE_LIE_TRUTH}" reason="to avoid the mob"/>`;

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

/** Write the scripted deception turn: reasoning channel (spells the truth) → cover prose → `<lie>` span → done. */
function writeScriptedTurn(write: (frame: string) => void): void {
  write(chunk({ reasoning: REASONING_TEXT }));
  write(chunk({ content: COVER_PROSE }));
  write(chunk({ content: LIE_SPAN }));
  write(doneFrames());
}

export interface FixtureProvider {
  /** The baseUrl to configure on the `custom_openai` credential (the runner appends `/chat/completions`). */
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
