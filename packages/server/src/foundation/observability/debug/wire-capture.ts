// The WIRE-CAPTURE recorder (TASK-24): the ONE missing observability layer — the FINAL provider request
// body each chat backend actually sends, keyed by chatId. Purpose: a four-layer round-trip fidelity harness
// can prove a setting flipped at the FE propagates truthfully into the real wire (FE → assemble → WIRE → DB).
//
// GATING IS LOAD-BEARING — this is dev/test-only + prod-safe, mirroring the RPG flight recorder (R-OBS):
//   • OFF by default and in prod. Enabled only via `WIRE_CAPTURE=on` OR the `wireCapture` compose force flag
//     (the harness / an int test forces it, bypassing the env). When disabled, compose injects NO sink into
//     the backends, so a send boundary never calls `recordWireCapture` — ZERO overhead + ZERO retained bytes.
//   • Read HOST-ONLY at /api/_debug/wire/captures (the debug-token / admin-cookie gate), read-only, no table.
//
// PROVIDER-NATIVE BODIES DIFFER BY BACKEND BY DESIGN (the API axis: per-provider specials
// discipline), and so does CAPTURE FIDELITY. Three levels, each the most honest "final bytes WE send" that
// backend can offer:
//   • LITERAL fetch body (vLLM + custom-byo) — the exact JSON object handed to `fetch`, byte-for-byte the wire.
//     (custom-byo additionally SCRUBS known credential literals by value first: `includeBody` can carry
//     key-in-body auth, and the ring must not sink a secret — see the custom-byo runner.)
//   • SDK-OUTBOUND-SCHEMA-TRANSFORMED true wire (OpenRouter) — the runner hands the SDK a camelCase object,
//     then the SDK's own outbound zod schema renames camelCase→snake_case and strips unknown keys BEFORE the
//     real HTTP send; the runner re-parses the body through that same `$outboundSchema` at the capture site so
//     the recorded bytes ARE the literal wire, not the pre-serialize SDK input.
//   • SDK QUERY INPUT / honest exception (agent-sdk) — the bundled SDK subprocess builds the Anthropic
//     `/v1/messages` body itself, so there is no observable HTTP body here; the faithful capture is the SDK
//     QUERY INPUT (prompt + systemPrompt + resolved options), never a fabricated Anthropic body (that'd be a lie).
// We capture whatever each backend actually sends; we do NOT normalize across backends. `body` is therefore an
// opaque JSON object whose shape is the backend's own wire vocabulary.
//
// The recorder RING is a module singleton (like `logRing`/the trace ring), but WRITES are gated: the sink the
// backends receive is `recordWireCapture`, and compose only wires it when capture is enabled — so the ring
// stays empty (never written) with the feature off. Test isolation: `resetWireCaptures()` clears the ring
// between tests so a foreign run's bytes never bleed in.

// ── THE OUTCOME ARM (added after a live session spent hours guessing) ────────────────────────────────────
// The request ring alone cannot answer "what came back", so a prose-less turn, a tool-terminated turn and a
// provider that returned nothing are indistinguishable after the fact — the operator ends up reading the
// browser console aloud. `recordTurnOutcome` closes that: TWO call sites in the engine — one after the
// pipeline RESOLVES, one on its post-start THROW — covering EVERY backend and every chat turn without
// touching a runner. Deliberately NOT threaded through the five per-surface `captureWire` sinks — those fire
// at SEND time (a streamed response completes far later), so an outcome there would mean pre/post
// correlation in every runner for the same data the engine already holds.
//
// THE FAULT ARM IS THE ROW A READER ACTUALLY HUNTS (added 2026-08-14 after a live 110s agent-sdk turn died
// as an HTTP 500 with EVERY debug surface blank — `docs/design/streaming-shape-churn.md` §7.5, reproduced
// 3/3). Until then the recorder ran only after `runTurnPipeline` resolved, so a THROWN turn could not leave
// a row BY CONSTRUCTION: the one comment claiming a "REFUSED turn still leaves the record that explains it"
// was true for a refusal and false for a FAULT. `disposition` is the discriminator that separates them.
//
// METADATA ONLY — finish/stop reason, token counts, tool-call names + args, content/reasoning LENGTHS. Never
// the reply text: the ring is a debug surface, and the canon row already holds the prose.
//
// GATING ASYMMETRY, stated because it is real: the request sink is compose-injected (env OR the `wireCapture`
// force flag), while the outcome arm self-gates on `isWireCaptureEnabled()` — it has no compose seam to ride.
// An int test that forces capture via the flag therefore records requests but NOT outcomes; set `WIRE_CAPTURE=on`
// if a test needs both.
//
// ── SPILL TO DISK ───────────────────────────────────────────────────────────────────────────────────────
// The ring is in-memory and 256 slots, so a restart or a busy hour erases exactly the evidence you went
// looking for (it did). Both arms therefore ALSO append to a size-capped JSONL under `.cache/`, best-effort:
// a spill failure never touches the request path. Off with the feature off, like everything else here.

import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { createBoundedRing } from "@orb/kit/bounded-ring";
import type { ChatId } from "@orb/kit/ids";
import { env } from "#foundation/env";

/** How many captures the ring retains (most-recent-wins). Bounded so a long-lived dev process can't grow it. */
const WIRE_CAPTURE_RING_CAPACITY = 256;

/** One captured provider request. `body` is the backend's OWN wire shape (see the file header) — an opaque
 *  JSON object, never normalized across wires. `api` is the protocol axis; `wire` + `providerId` the runtime's
 *  own two provenance axes (plain strings — foundation imports nothing UP from the package). */
export interface WireCapture {
  /** The chat this send belongs to — the harness's correlation key (it opens unique-title chats). Absent on
   *  a chatless probe turn. */
  readonly chatId?: ChatId | undefined;
  /** The axis the request rode: "agent-sdk" (SDK-input shape) | "chat-completions"/"responses"
   *  (openai-compat body shape) | "summarize" (the chatless summarization role) | "structured" (the chatless
   *  schema-constrained-generation role — the rpg structured extraction / the split-out structured surface; both
   *  vLLM + OR capture their per-item bodies under the summarize/structured tag matching the role served). */
  readonly api: string;
  readonly wire: string;
  readonly providerId: string;
  /** The resolved model string on the request (provenance cross-check against the DB canon `model` stamp). */
  readonly model: string;
  readonly at: number;
  /** The final request body in the backend's own wire vocabulary (see the header). */
  readonly body: Record<string, unknown>;
  /** What came back's ENVELOPE, when the send produced a response: the provider's headers, lower-cased and
   *  secret-scrubbed at the send boundary. The support handle (`request-id`) and the rate-limit budget live
   *  here, and without them a captured request cannot be correlated with anything the provider logged.
   *  Absent on a transport failure (the request is still recorded) and on the agent-sdk wire (no HTTP). */
  readonly responseHeaders?: Readonly<Record<string, string>> | undefined;
}

/** Filter for a host read: by `chatId` and/or `providerId`, newest-first, capped by `limit`. */
export interface WireCaptureFilter {
  readonly chatId?: ChatId | undefined;
  readonly providerId?: string | undefined;
  readonly limit?: number | undefined;
}

// The bounded ring (most-recent-first read). Module singleton — SAFE because writes are gated (see header).
// The circular-buffer MECHANISM is @orb/kit/bounded-ring (one engine, every recorder: the log + request
// rings ride the same one); the retention POLICY — what is worth capturing, and the gate that decides
// whether anything is written at all — stays here.
const ring = createBoundedRing<WireCapture>(WIRE_CAPTURE_RING_CAPACITY);

/** True iff the env flag enables capture. Compose ORs this with its force flag to decide whether to wire the
 *  sink into the backends — so with capture off, the sink is absent and the boundaries never write. */
export function isWireCaptureEnabled(): boolean {
  return env.WIRE_CAPTURE === "on";
}

/** Record ONE captured wire body. This is the SINK compose injects into the backends (only when capture is
 *  enabled). Kept in the process ring for the live `/api/_debug` read AND best-effort spilled to
 *  `.cache/wire-capture/captures.jsonl` (see SPILL below) — never a DB table, but not process-memory-only
 *  either. */
export function recordWireCapture(capture: WireCapture): void {
  ring.push(capture);
  spill("request", capture);
}

const DEFAULT_READ_LIMIT = 50;

/** Read recent captures, newest-first, optionally filtered by chatId/backend. The host-gated debug read. */
export function recentWireCaptures(filter: WireCaptureFilter = {}): WireCapture[] {
  const limit = filter.limit ?? DEFAULT_READ_LIMIT;
  const out: WireCapture[] = [];
  // LAZY newest-first + break at `limit`: the filter has to scan PAST non-matches, so a pre-sliced tail
  // would silently under-report a filtered read (the reason the primitive exposes an iterator at all).
  for (const capture of ring.newestFirst()) {
    if (filter.chatId !== undefined && capture.chatId !== filter.chatId) {
      continue;
    }
    if (filter.providerId !== undefined && capture.providerId !== filter.providerId) {
      continue;
    }
    out.push(capture);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

/** Clear the ring — test isolation (the harness resets between matrix rows so a prior row's wire never bleeds
 *  into the next assertion). No-op cost with the feature off (ring already empty). */
export function resetWireCaptures(): void {
  ring.clear();
  outcomeRing.clear();
}

// ── OUTCOMES ────────────────────────────────────────────────────────────────────────────────────────────

/** One tool call as it came back, for the debug read. `args` is the RAW argument string the model emitted —
 *  not the parsed form — because the malformed cases are exactly the ones worth seeing, and those do not
 *  parse. Truncated: a log surface, not a payload store. */
export interface WireToolCall {
  readonly name: string;
  readonly args: string;
}

/** One RAW provider degradation the turn's runner raised, exactly as it was raised (#1440). The user gets a
 *  re-voiced `settings_adjusted` chat warning; the OPERATOR gets this — the runner's own code + prose, which
 *  names the knob and the value it clamped to. Foundation cannot import infra's `WARNING_CODES`, so `code` is
 *  a plain string here for the same reason `terminalReason` is: assignability at the engine's call site is
 *  the enforcer. */
export interface WireWarning {
  readonly code: string;
  readonly message: string;
}

/** What the model actually returned for one turn. Lengths, not bodies (see the header). */
export interface WireOutcome {
  readonly chatId: ChatId;
  readonly at: number;
  readonly model: string | null;
  /** How the turn ENDED, from the engine's own lifecycle classification. `"completed"` = `runTurnPipeline`
   *  RESOLVED (the historical only case — note that a REFUSED empty generation is still `"completed"`: the
   *  pipeline returned, the guard refused after). The other three are the POST-START THROW arms and mirror
   *  the domain's `TurnAbortReason` value-for-value: `"error"` a provider/DB fault · `"user"` a caller
   *  cancel · `"stale"` the heartbeat's lock-loss. Foundation cannot import the domain union (it reaches UP
   *  to nothing), so ASSIGNABILITY at the engine's two call sites is the enforcer — a new abort reason
   *  fails `tsc` here rather than landing as an unrecognized string. */
  readonly disposition: "completed" | "error" | "user" | "stale";
  /** The provider's own terminator — the single most diagnostic field, and the tell for a tool-only
   *  completion on a folded turn (whose tool calls land no `ToolCallRecord`, so `toolCalls` reads 0). */
  readonly finishReason: string | null;
  readonly stopReason: string | null;
  /** The RAW backend terminal/subtype string this turn ended on (`ProviderError.terminalReason` — the
   *  agent-sdk dialect, e.g. `"api_error"`/`"prompt_too_long"`), falling back to the normalized
   *  `ProviderError.kind`. On a fault it is threaded from the error the provider layer ALREADY classified
   *  — never re-derived here. `null` when the backend reported none. */
  readonly terminalReason: string | null;
  readonly contentChars: number;
  readonly reasoningChars: number;
  readonly tokensOut: number | null;
  readonly maxOutputTokens: number | null;
  /** How many MODEL CALLS the backend made for this ONE turn (the agent-sdk's `num_turns`; 1 on a plain
   *  single-shot completion, `null` when a backend reports none).
   *
   *  LOAD-BEARING FOR READING `tokensOut`, and the reason this field exists: `tokensOut` is the SUM over
   *  every call in the turn, while `maxOutputTokens` is the PER-CALL ceiling. Without the denominator a
   *  four-call turn reads as `tokensOut:8192` against `maxOutputTokens:2048` and looks exactly like a
   *  backend ignoring the output cap — the misread that put a phantom cost bug on the board
   *  (`docs/design/streaming-shape-churn.md` §7.5). The cap is honored per call; the row was missing its
   *  unit. */
  readonly modelCalls: number | null;
  readonly reasoningEffort: string | null;
  readonly toolCalls: readonly WireToolCall[];
  /** The RAW provider degradations this turn carried — empty on a fault (the pipeline threw before it could
   *  report any) and on a turn the provider ran exactly as asked. */
  readonly warnings: readonly WireWarning[];
}

const outcomeRing = createBoundedRing<WireOutcome>(WIRE_CAPTURE_RING_CAPACITY);

/** Cap on one rendered tool-argument string. */
const TOOL_ARGS_MAX = 2000;

/** Record ONE turn outcome. Self-gated (see the header's gating-asymmetry note) so the engine can call it
 *  unconditionally without a compose seam of its own. */
export function recordTurnOutcome(outcome: WireOutcome): void {
  if (!isWireCaptureEnabled()) {
    return;
  }
  const bounded: WireOutcome = {
    ...outcome,
    toolCalls: outcome.toolCalls.map((call) => ({
      name: call.name,
      args: call.args.length > TOOL_ARGS_MAX ? `${call.args.slice(0, TOOL_ARGS_MAX)}…` : call.args,
    })),
  };
  outcomeRing.push(bounded);
  spill("outcome", bounded);
}

/** Read recent outcomes, newest-first, optionally filtered by chatId. */
export function recentTurnOutcomes(filter: { readonly chatId?: ChatId | undefined; readonly limit?: number | undefined } = {}): WireOutcome[] {
  const limit = filter.limit ?? DEFAULT_READ_LIMIT;
  const out: WireOutcome[] = [];
  for (const outcome of outcomeRing.newestFirst()) {
    if (filter.chatId !== undefined && outcome.chatId !== filter.chatId) {
      continue;
    }
    out.push(outcome);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

// ── SPILL ───────────────────────────────────────────────────────────────────────────────────────────────

const SPILL_DIR = ".cache/wire-capture";
const SPILL_PATH = join(SPILL_DIR, "captures.jsonl");
const SPILL_PREV_PATH = join(SPILL_DIR, "captures.prev.jsonl");
/** Rotate past this (32 MiB); two generations are retained, so the on-disk ceiling is 64 MiB. */
const SPILL_MAX_BYTES = 33_554_432;

/** Serializes every append so concurrent turns cannot interleave a half-written line. Failures are swallowed
 *  into the chain (never rethrown) — an unwritable `.cache/` must not fail a chat turn. */
let spillChain: Promise<void> = Promise.resolve();

/** Append one record as JSONL, rotating at the cap. Best-effort by construction. */
function spill(kind: "request" | "outcome", record: WireCapture | WireOutcome): void {
  let line: string;
  // @orb-waive caught-failure-ownership(catch): documented — an unserializable body is not
  // worth failing (or retrying) a turn over, best-effort observability spill. Ends if spill() stops being
  // best-effort by contract.
  try {
    line = `${JSON.stringify({ kind, ...record })}\n`;
  } catch {
    return; // an unserializable body is not worth failing (or retrying) a turn over
  }
  // @orb-waive caught-failure-ownership(spillChain): documented above the spillChain
  // declaration — failures are swallowed into the chain, never rethrown; an unwritable .cache/ must not
  // fail a chat turn. Ends if spill stops being best-effort by contract.
  spillChain = spillChain
    .then(async () => {
      await mkdir(SPILL_DIR, { recursive: true });
      let bytes = 0;
      // @orb-waive caught-failure-ownership(catch): documented — first write of a fresh
      // generation has no prior file to stat, treated as size 0 (nothing to rotate). Ends if the rotation
      // logic stops treating a missing file as size 0.
      try {
        bytes = (await stat(SPILL_PATH)).size;
      } catch {
        bytes = 0; // first write of a fresh generation — nothing to rotate
      }
      if (bytes >= SPILL_MAX_BYTES) {
        await rename(SPILL_PATH, SPILL_PREV_PATH);
      }
      await appendFile(SPILL_PATH, line, "utf8");
    })
    .catch(() => undefined);
}
