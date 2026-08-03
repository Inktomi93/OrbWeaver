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
// PROVIDER-NATIVE BODIES DIFFER BY BACKEND BY DESIGN (the api axis — retro-workboard "per-provider specials"
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

import type { ChatId } from "@orb/kit/ids";
import { env } from "#foundation/env";

/** How many captures the ring retains (most-recent-wins). Bounded so a long-lived dev process can't grow it. */
const WIRE_CAPTURE_RING_CAPACITY = 256;

/** One captured provider request. `body` is the backend's OWN wire shape (see the file header) — an opaque
 *  JSON object, never normalized across backends. `api` is the protocol axis; `backend` the sealed runner key
 *  (a plain string — foundation imports nothing UP from infra; the value is provenance only). */
export interface WireCapture {
  /** The chat this send belongs to — the harness's correlation key (it opens unique-title chats). Absent on
   *  a chatless probe turn. */
  readonly chatId?: ChatId | undefined;
  /** The axis the request rode: "agent-sdk" (SDK-input shape) | "chat-completions"/"responses"
   *  (openai-compat body shape) | "summarize" (the chatless summarization role) | "structured" (the chatless
   *  schema-constrained-generation role — the rpg structured extraction / the split-out structured surface; both
   *  vLLM + OR capture their per-item bodies under the summarize/structured tag matching the role served). */
  readonly api: string;
  readonly backend: string;
  /** The resolved model string on the request (provenance cross-check against the DB canon `model` stamp). */
  readonly model: string;
  readonly at: number;
  /** The final request body in the backend's own wire vocabulary (see the header). */
  readonly body: Record<string, unknown>;
}

/** Filter for a host read: by `chatId` and/or `backend`, newest-first, capped by `limit`. */
export interface WireCaptureFilter {
  readonly chatId?: ChatId | undefined;
  readonly backend?: string | undefined;
  readonly limit?: number | undefined;
}

// The bounded ring (most-recent-first read). Module singleton — SAFE because writes are gated (see header).
const ring: (WireCapture | undefined)[] = new Array<WireCapture | undefined>(WIRE_CAPTURE_RING_CAPACITY);
let head = 0;
let size = 0;

/** True iff the env flag enables capture. Compose ORs this with its force flag to decide whether to wire the
 *  sink into the backends — so with capture off, the sink is absent and the boundaries never write. */
export function isWireCaptureEnabled(): boolean {
  return env.WIRE_CAPTURE === "on";
}

/** Record ONE captured wire body. This is the SINK compose injects into the backends (only when capture is
 *  enabled). Bytes live only in the process ring, never persisted. */
export function recordWireCapture(capture: WireCapture): void {
  ring[head] = capture;
  head = (head + 1) % WIRE_CAPTURE_RING_CAPACITY;
  size = Math.min(size + 1, WIRE_CAPTURE_RING_CAPACITY);
}

const DEFAULT_READ_LIMIT = 50;

/** Read recent captures, newest-first, optionally filtered by chatId/backend. The host-gated debug read. */
export function recentWireCaptures(filter: WireCaptureFilter = {}): WireCapture[] {
  const limit = filter.limit ?? DEFAULT_READ_LIMIT;
  const out: WireCapture[] = [];
  for (let i = 1; i <= size; i += 1) {
    const capture = ring[(head - i + WIRE_CAPTURE_RING_CAPACITY) % WIRE_CAPTURE_RING_CAPACITY];
    if (capture === undefined) {
      continue;
    }
    if (filter.chatId !== undefined && capture.chatId !== filter.chatId) {
      continue;
    }
    if (filter.backend !== undefined && capture.backend !== filter.backend) {
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
  ring.fill(undefined);
  head = 0;
  size = 0;
}
