// The WIRE-CAPTURE recorder (TASK-24): the ONE missing observability layer — the FINAL provider request
// body each chat backend actually sends, keyed by chatId. Purpose: a four-layer round-trip fidelity harness
// can prove a setting flipped at the FE propagates truthfully into the real wire (FE → assemble → WIRE → DB).
//
// GATING IS LOAD-BEARING — this is dev/test-only + prod-safe, mirroring the RPG flight recorder (R-OBS):
//   • THE REPLY TAP IS A SECOND, INDEPENDENT OPT-IN (`WIRE_CAPTURE_REPLY=on` in the root's env record, audit
//     D2/D3). It adds the provider's literal reply bytes to each REQUEST entry. It is not
//     folded into `WIRE_CAPTURE` because the request body is the operator's own prompt while the reply is the
//     model's prose — the exact thing the OUTCOME arm refuses to keep (see METADATA ONLY below). Inert with
//     capture off: no sink is wired, so no send boundary taps anything.
//   • OFF by default and in prod. Enabled only via `WIRE_CAPTURE=on` in the root's env record (a test root sets
//     it in its own record). When disabled, compose injects NO sink into
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
// stays empty (never written) with the feature off.

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
// as an HTTP 500 with EVERY debug surface blank, reproduced
// 3/3). Until then the recorder ran only after `runTurnPipeline` resolved, so a THROWN turn could not leave
// a row BY CONSTRUCTION: the one comment claiming a "REFUSED turn still leaves the record that explains it"
// was true for a refusal and false for a FAULT. `disposition` is the discriminator that separates them.
//
// METADATA ONLY — finish/stop reason, token counts, tool-call names + args, content/reasoning LENGTHS. Never
// the reply text: the ring is a debug surface, and the canon row already holds the prose.
//
// ONE GATE FOR BOTH ARMS: compose injects the request sink and the outcome recorder together, on the same
// decision (`WIRE_CAPTURE` in the record); with capture off the engine holds no recorder at all.
//
// ── SPILL TO DISK ───────────────────────────────────────────────────────────────────────────────────────
// The ring is in-memory and 256 slots, so a restart or a busy hour erases exactly the evidence you went
// looking for (it did). Both arms therefore ALSO append to a size-capped JSONL under the data layout's
// `wireCapture` slot, best-effort: a spill failure never touches the request path. Off with the feature off,
// like everything else here. The spill holds provider request bodies, so it never derives from the process
// cwd: a stack started from a checkout must not write its data's prompts into that checkout. Each composed
// graph owns one spill queue over its directory (the record's data layout slot in production) and passes it on every record.

import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import type { WireCapture } from "@orb/contracts/debug";
import { createBoundedRing } from "@orb/kit/bounded-ring";
import type { Env } from "#foundation/env/record";
import type { WireCaptureFilter, WireOutcome } from "../contract/wire-capture.ts";

export type { WireCaptureFilter, WireOutcome, WireToolCall, WireWarning } from "../contract/wire-capture.ts";

/** How many captures the ring retains (most-recent-wins). Bounded so a long-lived dev process can't grow it. */
const WIRE_CAPTURE_RING_CAPACITY = 256;

// The bounded ring (most-recent-first read). Module singleton — SAFE because writes are gated (see header).
// The circular-buffer MECHANISM is @orb/kit/bounded-ring (one engine, every recorder: the log + request
// rings ride the same one); the retention POLICY — what is worth capturing, and the gate that decides
// whether anything is written at all — stays here.
const ring = createBoundedRing<WireCapture>(WIRE_CAPTURE_RING_CAPACITY);

/** True iff the record enables capture. Compose decides from it whether to wire the sink into the backends — so with
 *  capture off, the sink is absent and the boundaries never write. */
export function isWireCaptureEnabled(record: Pick<Env, "WIRE_CAPTURE">): boolean {
  return record.WIRE_CAPTURE === "on";
}

/** True iff the record enables the REPLY tap. Compose hands the verdict to the runtime, which is where the tap lives
 *  (the send boundary owns the cap and the scrub). */
export function isWireReplyCaptureEnabled(record: Pick<Env, "WIRE_CAPTURE_REPLY">): boolean {
  return record.WIRE_CAPTURE_REPLY === "on";
}

/** Record ONE captured wire body. This is the SINK compose injects into the backends (only when capture is
 *  enabled). Kept in the process ring for the live `/api/_debug` read AND best-effort spilled to
 *  `captures.jsonl` in the data layout's `wireCapture` slot (see SPILL below) — never a DB table, but not
 *  process-memory-only either. */
export function recordWireCapture(capture: WireCapture, spill: WireCaptureSpill): void {
  ring.push(capture);
  spill.append("request", capture);
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

const outcomeRing = createBoundedRing<WireOutcome>(WIRE_CAPTURE_RING_CAPACITY);

/** Cap on one rendered tool-argument string. */
const TOOL_ARGS_MAX = 2000;

/** Record ONE turn outcome. Ungated here: compose hands it to the engine only when capture is on. */
export function recordTurnOutcome(outcome: WireOutcome, spill: WireCaptureSpill): void {
  const bounded: WireOutcome = {
    ...outcome,
    toolCalls: outcome.toolCalls.map((call) => ({
      name: call.name,
      args: call.args.length > TOOL_ARGS_MAX ? `${call.args.slice(0, TOOL_ARGS_MAX)}…` : call.args,
    })),
  };
  outcomeRing.push(bounded);
  spill.append("outcome", bounded);
}

/** Read recent outcomes, newest-first, optionally filtered by chatId. */
export function recentTurnOutcomes(filter: Pick<WireCaptureFilter, "chatId" | "limit"> = {}): WireOutcome[] {
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

const SPILL_FILE = "captures.jsonl";
const SPILL_PREV_FILE = "captures.prev.jsonl";
/** Rotate past this (32 MiB); two generations are retained, so the on-disk ceiling is 64 MiB. */
const SPILL_MAX_BYTES = 33_554_432;

/** One composed graph's spill queue over one directory. */
export interface WireCaptureSpill {
  /** Queue one record as JSONL, rotating at the cap. Best-effort by construction. */
  readonly append: (kind: "request" | "outcome", record: WireCapture | WireOutcome) => void;
  /** Resolves once every append queued on THIS spill has settled, so a graph's disposal waits on its own writes
   *  only and no append outlives its directory. Never rejects: the chain swallows its own failures. */
  readonly settle: () => Promise<void>;
}

/** Create a graph's spill queue over its directory, the record's `DATA_LAYOUT.wireCapture` slot in production. */
export function createWireCaptureSpill(spillDir: string): WireCaptureSpill {
  // Serializes this graph's appends so concurrent turns cannot interleave a half-written line. Failures are
  // swallowed into the chain (never rethrown) — an unwritable spill directory must not fail a chat turn.
  let chain: Promise<void> = Promise.resolve();
  return {
    append: (kind, record): void => {
      chain = appendSpillLine(chain, spillDir, kind, record);
    },
    settle: () => chain,
  };
}

function appendSpillLine(chain: Promise<void>, spillDir: string, kind: "request" | "outcome", record: WireCapture | WireOutcome): Promise<void> {
  let line: string;
  // documented — an unserializable body is not
  // worth failing (or retrying) a turn over, best-effort observability spill. Ends if the spill stops being
  // best-effort by contract.
  try {
    line = `${JSON.stringify({ kind, ...record })}\n`;
  } catch {
    return chain; // an unserializable body is not worth failing (or retrying) a turn over
  }
  // documented above the chain declaration in createWireCaptureSpill
  // — failures are swallowed into the chain, never rethrown; an unwritable spill directory must not
  // fail a chat turn. Ends if the spill stops being best-effort by contract.
  return chain
    .then(async () => {
      const spillPath = join(spillDir, SPILL_FILE);
      await mkdir(spillDir, { recursive: true });
      let bytes = 0;
      // a missing file is the normal first write of a generation and counts as size 0, so nothing rotates. Any other stat fault is met again by the `appendFile` below, whose rejection ends in the chain's catch (waived separately). Ends if rotation needs the stat fault itself.
      try {
        bytes = (await stat(spillPath)).size;
      } catch {
        bytes = 0; // first write of a fresh generation — nothing to rotate
      }
      if (bytes >= SPILL_MAX_BYTES) {
        await rename(spillPath, join(spillDir, SPILL_PREV_FILE));
      }
      await appendFile(spillPath, line, "utf8");
    })
    .catch(() => undefined);
}
