// plugin-ui-guest-protocol — the main-thread ↔ Web Worker WIRE for the Tier-C client guest.
// Two closed message unions and the budget constants, in one module both sides import, so the
// worker and its host cannot drift: a new message kind fails `tsc` at the exhaustive dispatch on the other side.
//
// IT LIVES IN `client/src/lib`, NOT in `features/plugin/`, and that is the type-home law rather than taste
// (`no-inline-types`, Spine-TypeScript-and-Patterns §7.4): a client feature's buckets are not a type home, and
// these are exported UNIONS. `src/lib` is where a client-wide contract belongs — the `contribution-contracts.ts`
// precedent — and this one genuinely spans two EXECUTION CONTEXTS, which is about as cross-boundary as a
// client-side shape gets.
//
// EVERYTHING THAT CROSSES IS INERT. Every payload here is a string, a number, or a plain JSON-shaped object —
// structured-clone-safe by construction and, more importantly, DEAD: no functions, no handles, no live
// references. That is the `infra/plugin-host/marshal.ts` "nothing live crosses" law reused at the worker
// boundary, and it is not a formality — a worker boundary would happily clone a Map, a Date, or an ArrayBuffer
// and hand the host something with behaviour attached.
//
// THE TREE IS A STRING, deliberately. The guest publishes `treeJson`, not a tree object: the host re-parses it
// through `pluginSurfaceSpecSchema` before anything mounts, and a pre-parsed object arriving over the wire
// would invite a reader to trust the shape because it "already looks right". A string cannot be mistaken for
// validated data.

import type { PluginLogLevel } from "@orb/contracts/plugin";

/** The budget constants, MIRRORING `packages/server/src/infra/plugin-host/budgets.ts`. They are re-declared
 *  rather than imported because `infra` is server-only and above `contracts` in the cake; the reason each number
 *  is what it is lives in that file's own header and is not re-argued here. What IS argued here is the one place
 *  the client's needs differ from the server's — the separate BOOT budget (`bootCpuMs`). */
export const UI_GUEST_BUDGETS = {
  /** WASM memory cap per guest context, bytes (32 MiB) — `PLUGIN_MEMORY_LIMIT_BYTES`. Over-limit allocation
   *  fails guest-side and is CONTAINED to the instance, which is the property QuickJS-ng-WASM was chosen for. */
  memoryLimitBytes: 33_554_432,
  /** Explicit guest stack ceiling (256 KiB) — `GUEST_MAX_STACK_BYTES`. MANDATORY, not cosmetic: without it a
   *  recursive guest blows the real WASM stack, which surfaces as a HOST-side RangeError and leaves the runtime
   *  un-disposable. Measured on the server; the same engine build runs here. */
  maxStackBytes: 262_144,
  /** Per-EVENT guest CPU budget, ms — the client mirror of `PLUGIN_INVOCATION_CPU_MS`. Enforced by the QuickJS
   *  interrupt handler comparing REAL monotonic time against the deadline; it preempts guest BYTECODE only. */
  eventCpuMs: 1000,
  /** The BOOT budget — evaluating `ui.js` once. Wider than an event because a boot legitimately does more
   *  (build constants, register handlers) and does it exactly once per worker, where an event budget is paid on
   *  every keystroke. The server's snippet wall (`SNIPPET_WALL_MS`) is the same 5 s for the same reason. */
  bootCpuMs: 5000,
  /** Concurrent unsettled host calls per guest — `HOST_CALLS_IN_FLIGHT_MAX`. The SERVER re-checks this per
   *  plugin (`UiHostCallGate`) and its check is the authority; this one exists so a runaway guest is stopped
   *  before it floods the network rather than after. */
  hostCallsInFlightMax: 32,
  /** Per host-call deadline, ms — `HOST_FN_DEADLINE_MS`. A host call is a network round-trip here, so this is
   *  also what stops a guest parking forever on a request the server dropped. */
  hostCallDeadlineMs: 5000,
  /** Log lines retained per guest, and their total volume — `LOG_LINES_PER_INVOCATION` /
   *  `LOG_BYTES_PER_INVOCATION`. A guest cannot flood the host by logging. */
  logLines: 256,
  logChars: 16_384,
} as const;

/** THE WALL-CLOCK DEADLINE the HOST enforces from OUTSIDE the guest — the D46 review's P1-A lesson, inherited
 * from birth (2026-08-24). The interrupt handler above bounds
 *  guest BYTECODE and is structurally blind to a guest that has STOPPED executing (`new Promise(() => {})`, an
 *  await that never resumes); only a timer OUTSIDE the guest — and, here, outside the worker thread entirely —
 *  can end that. It is `eventCpuMs + hostCallDeadlineMs`, the same "CPU budget plus one legitimate host call"
 *  arithmetic the server's settlement wall uses, and for the same reason: the longest a LEGITIMATE guest can sit
 *  without running bytecode is exactly one host call.
 *
 *  On expiry the host `terminate()`s the worker and the surface collapses to null (§4.9). A `terminate()` is the
 *  hard kill a single-threaded interpreter cannot refuse — which is precisely why the interpreter is in a
 *  worker at all. */
export const UI_GUEST_WALL_MS = UI_GUEST_BUDGETS.eventCpuMs + UI_GUEST_BUDGETS.hostCallDeadlineMs;

/** The BOOT wall — the same arithmetic over the boot budget. A `ui.js` that never finishes evaluating is the
 *  first hang a hostile (or merely broken) plugin can produce, and it must not hold a worker forever. */
export const UI_GUEST_BOOT_WALL_MS = UI_GUEST_BUDGETS.bootCpuMs + UI_GUEST_BUDGETS.hostCallDeadlineMs;

// ── HOST → GUEST ─────────────────────────────────────────────────────────────────────────────────────────────

/** Boot the guest: install the realm and evaluate `ui.js` once. `grants` is the plugin's granted capability
 *  list as the server reported it — DISPLAY-ONLY inside the guest (it is what `orb.ui(1).grants` feature-detects
 *  against), never an authority: every host call is re-gated server-side against the stored row. */
export interface UiGuestBootMessage {
  readonly kind: "boot";
  readonly source: string;
  readonly grants: readonly string[];
  /** The surfaces this worker's plugin registered at the `scripted` tier — the guest renders into these ids and
   *  a `render` naming any other id is dropped by the host (a guest cannot paint a surface it does not own). */
  readonly surfaceIds: readonly string[];
  /** THE INJECTED CLOCK ORIGIN — the host's wall clock at spawn, in epoch ms. The guest's `clock.nowEpochMs()`
   *  is this plus the worker's own MONOTONIC elapsed time, which is what makes it a SEAM rather than ambient
   *  now: the guest cannot reach `Date` (the realm stubs it), the worker never reads one, and the single
   *  reading that exists came from the host — exactly the shape `HostSeams` gives the server guest. */
  readonly clockEpochMs: number;
  /** THE INJECTED ENTROPY SEED — the guest's `random.next()` is a seeded generator over this, never
   *  `Math.random`. Same determinism law as the server realm (two runs under identical seams are identical),
   *  and the same reason: an ambient entropy source defeats the injected one before it defeats anything else. */
  readonly randomSeed: number;
}

/** Deliver a UI event INTO the guest — the whole point of Tier C: a keystroke or a click is handled locally, at
 *  native latency, with no network in the path. */
export interface UiGuestEventMessage {
  readonly kind: "event";
  readonly surfaceId: string;
  /** `action` = a button/confirmButton fired; `field` = a form value changed. */
  readonly event: { readonly type: "action"; readonly actionId: string } | { readonly type: "field"; readonly name: string; readonly value: string };
  /** The whole current form draft, so a handler reads a consistent bag rather than reconstructing one. */
  readonly values: Record<string, string>;
}

/** Settle a host call the guest made. `ok:false` carries a message the guest sees as a rejection. */
export type UiGuestHostResultMessage =
  | { readonly kind: "hostResult"; readonly callId: number; readonly ok: true; readonly resultJson: string }
  | { readonly kind: "hostResult"; readonly callId: number; readonly ok: false; readonly message: string };

export type UiGuestInbound = UiGuestBootMessage | UiGuestEventMessage | UiGuestHostResultMessage;

// ── GUEST → HOST ─────────────────────────────────────────────────────────────────────────────────────────────

/** The guest published a whole TREE for one of its surfaces (retained-mode: it publishes state, never a patch).
 *  `treeJson` is re-validated host-side before it mounts — the worker boundary is not a validation. */
export interface UiGuestRenderMessage {
  readonly kind: "render";
  readonly surfaceId: string;
  readonly treeJson: string;
}

/** The guest asked for a host call. The HOST decides whether it goes to the network — it holds the in-flight
 *  count and the surface's room — and the server re-gates it regardless. */
export interface UiGuestHostCallMessage {
  readonly kind: "hostCall";
  readonly callId: number;
  readonly fn: string;
  readonly argsJson: string;
}

/** A guest log line, already ring-bounded worker-side. */
export interface UiGuestLogMessage {
  readonly kind: "log";
  /** The ONE log-level axis — `@orb/contracts/plugin`'s `PLUGIN_LOG_LEVELS`, derived rather than re-spelled.
   *  A guest's `orb.ui(1).log.warn(…)` and a server guest's `orb.host(1).log.warn(…)` are the same severity
   *  vocabulary, and a plugin author who learned one has learned the other. */
  readonly level: PluginLogLevel;
  readonly message: string;
}

/** The guest finished BOOTING (`ok:false` = its `ui.js` threw, hit the boot budget, or OOM'd — all contained,
 *  and all the same outcome to the host: the surface collapses and the crash counter hears about it). */
export type UiGuestReadyMessage = { readonly kind: "ready"; readonly ok: true } | { readonly kind: "ready"; readonly ok: false; readonly message: string };

/** One event finished (or failed) inside the guest. The host uses this to clear its wall-clock timer — an event
 *  that never settles is exactly what the timer exists to catch. */
export type UiGuestSettledMessage =
  | { readonly kind: "settled"; readonly ok: true }
  | { readonly kind: "settled"; readonly ok: false; readonly message: string };

export type UiGuestOutbound = UiGuestRenderMessage | UiGuestHostCallMessage | UiGuestLogMessage | UiGuestReadyMessage | UiGuestSettledMessage;
