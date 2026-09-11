// ui-guest.worker — the Tier-C CLIENT GUEST (plugin-ui-plane #679 U4, §4.6). One Web Worker per enabled
// scripted plugin, holding ONE QuickJS-WASM context that runs that plugin's `ui.js`. It is the client mirror of
// `infra/plugin-host`'s Sandbox, and every structural decision here is that file's, re-derived for the browser
// rather than re-invented:
//
//  * ONE CONTEXT per guest, with an explicit memory cap AND an explicit stack ceiling. The stack ceiling is
//    MANDATORY (`GUEST_MAX_STACK_BYTES`, measured on the server): without it a recursive guest blows the real
//    WASM stack, which surfaces as a HOST-side RangeError and leaves the runtime un-disposable.
//  * REALM-STRIPPED. `Date`, `Math.random` and `performance` are overwritten with throwing stubs, and `orb.ui`
//    is the only thing installed. The realm ALLOW-LIST is asserted as a CLOSED SET by the F3 pin (#784) in
//    `tests/client/features/plugin/components/plugin-scripted-surface.ct.tsx` — the same ratchet the server realm
//    carries (`tests/server/infra/plugin-host/realm.test.ts`): "absent from a bare context" is not a property
//    this file may assume, because that assumption is exactly how `performance` shipped live on the server.
//  * SYNC variant + manual job pumping. An `await` chain cannot outlive its budget, because the host pumps
//    `executePendingJobs()` under an interrupt handler reading REAL monotonic time.
//  * NOTHING LIVE CROSSES. Host results arrive as JSON strings and are handed to the realm's PRISTINE
//    `JSON.parse` (captured before any guest code ran, so a guest cannot interpose on the next payload).
//
// WHAT THIS WORKER DELIBERATELY DOES NOT HAVE: the DOM (a worker has none), the network (see below), and any
// authority. Its only wire is a `hostCall` message the MAIN THREAD relays to one re-gated tRPC proc.
//
// THE THREAD'S NETWORK CAPABILITY IS DELETED, and it is worth being precise about why, because a worker's
// `fetch` is not the guest's: the guest realm is a QuickJS context with no I/O at all, so a plugin cannot reach
// it. The deletion closes the OTHER hole — this worker's own module scope. If a future edit to THIS file (or a
// bundler-injected helper) reached for the network, a plugin's data could leave the box through a door with no
// allow-list, no SSRF guard and no egress belt. Removing the capability from the thread makes that a
// build-time impossibility rather than a code-review promise. It happens AFTER the WASM module is loaded,
// because the emscripten loader fetches the `.wasm` itself.

import baseVariant from "@jitl/quickjs-ng-wasmfile-release-sync";
// The `.wasm` as a bundled ASSET URL. Without this the variant's own loader builds a URL from
// `import.meta.url` at RUNTIME, which works in dev (vite serves node_modules) and silently 404s in a production
// build (nothing told the bundler to emit the file) — a scripted surface that works for every developer and for
// no user. `?url` yields the emitted asset's hashed URL, and `newVariant`'s `wasmLocation` is the
// upstream-sanctioned way to point the loader at it. The suffix is NOT optional here — probed 2026-08-28:
// `assetsInclude: ["**/*.wasm"]` plus a plain specifier does NOT win, vite still runs its `?init` wasm
// transform and the worker bundle fails to build. It is also why `.dependency-cruiser.cjs` excludes
// `?`-suffixed asset requests from its graph (see the note there).
import wasmUrl from "@jitl/quickjs-ng-wasmfile-release-sync/wasm?url";
import type { QuickJSContext, QuickJSHandle, QuickJSWASMModule } from "quickjs-emscripten-core";
import { newQuickJSWASMModuleFromVariant, newVariant } from "quickjs-emscripten-core";
import type { UiGuestBootMessage, UiGuestEventMessage, UiGuestInbound } from "#lib";
import { UI_GUEST_BUDGETS } from "#lib";
// This module DRIVES; `ui-guest-realm` BUILDS — the same split `sandbox.ts` and `realm.ts` draw on the server.
import type { GuestState } from "./ui-guest-realm.ts";
import { callJsonParse, installRealm, LogRing, makeSeams, post } from "./ui-guest-realm.ts";

const variant = newVariant(baseVariant, { wasmLocation: wasmUrl });

/** Every network affordance this THREAD has. Removed once the WASM is loaded — see the file header. */
const NETWORK_GLOBALS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"] as const;

let guest: GuestState | null = null;
let modulePromise: Promise<QuickJSWASMModule> | undefined;

/** Memoized WASM module load — ONE instantiation per worker, exactly as `module.ts` does per process. */
function loadModule(): Promise<QuickJSWASMModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(variant);
  return modulePromise;
}

/** Project a guest error handle to plain data. Nothing live crosses back; a dump is a plain JS value. */
function readError(ctx: QuickJSContext, handle: QuickJSHandle): string {
  const dumped: unknown = ctx.dump(handle);
  if (typeof dumped === "object" && dumped !== null) {
    const record = dumped as { name?: unknown; message?: unknown };
    return `${String(record.name ?? "Error")}: ${String(record.message ?? "")}`;
  }
  return String(dumped);
}

/** Run a guest computation to settlement under a CPU budget: install the interrupt handler against REAL
 *  monotonic time, pump the job queue, and contain any throw / deadline / OOM as a message. The client mirror of
 *  `Sandbox.runToSettlement`, minus the settlement race — out here the HOST's wall-clock timer plus
 *  `terminate()` is the outer bound, and it is a stronger one than any in-thread deadline can be (a single
 *  interpreter thread cannot preempt itself once it stops running bytecode; another thread killing it can). */
async function runToSettlement(state: GuestState, cpuMs: number, produce: () => ReturnType<QuickJSContext["evalCode"]>): Promise<string | null> {
  const { ctx } = state;
  // `performance.now()` — the WORKER's, not the guest's (whose is a throwing stub). The DoS deadline must read
  // a real monotonic clock so a frozen guest clock can never disable the kill.
  const startMs = performance.now();
  ctx.runtime.setInterruptHandler(() => performance.now() - startMs > cpuMs);
  // @orb-waive caught-failure-ownership(err): the failure message is returned to the caller
  // (boot/deliver both post it back over the wire) — fully propagated, never swallowed. Ends if a caller
  // stops forwarding this return value.
  try {
    const result = produce();
    if (result.error) {
      const message = readError(ctx, result.error);
      result.error.dispose();
      return message;
    }
    const handle = result.value;
    const native = ctx.resolvePromise(handle);
    ctx.runtime.executePendingJobs();
    const settled = await native;
    handle.dispose();
    if (settled.error) {
      const message = readError(ctx, settled.error);
      settled.error.dispose();
      return message;
    }
    settled.value.dispose();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  } finally {
    ctx.runtime.removeInterruptHandler();
  }
}

async function boot(message: UiGuestBootMessage): Promise<void> {
  const module = await loadModule();
  // The WASM is loaded; the thread no longer needs a network and must not keep one (file header).
  for (const name of NETWORK_GLOBALS) {
    Reflect.deleteProperty(globalThis, name);
  }
  const ctx = module.newContext();
  ctx.runtime.setMemoryLimit(UI_GUEST_BUDGETS.memoryLimitBytes);
  // MANDATORY — see the budget constant. Without it deep recursion is a host crash, not a contained RangeError.
  ctx.runtime.setMaxStackSize(UI_GUEST_BUDGETS.maxStackBytes);
  const log = new LogRing();

  installRealm({ ctx, current: (): GuestState => state, grants: message.grants, log, seams: makeSeams(message) });
  // Capture `JSON.parse` HERE — after the realm, BEFORE any guest source runs — so a guest that later reassigns
  // `JSON.parse` cannot interpose on the host's marshalling of the next result.
  using jsonNamespace = ctx.getProp(ctx.global, "JSON");
  const jsonParse = ctx.getProp(jsonNamespace, "parse");

  const state: GuestState = {
    ctx,
    log,
    jsonParse,
    handler: null,
    pending: new Map(),
    surfaceIds: new Set(message.surfaceIds),
    nextCallId: 1,
    inFlight: 0,
  };
  guest = state;

  const failure = await runToSettlement(state, UI_GUEST_BUDGETS.bootCpuMs, () => ctx.evalCode(message.source, "plugin-ui.js"));
  post(failure === null ? { kind: "ready", ok: true } : { kind: "ready", ok: false, message: failure });
}

async function deliver(message: UiGuestEventMessage): Promise<void> {
  const state = guest;
  if (state === null || state.handler === null) {
    // No handler is NOT a failure: a guest may render once and never listen (a readout). Settling `ok:true`
    // keeps the host's wall-clock timer honest — a silent drop would look exactly like a hang.
    post({ kind: "settled", ok: true });
    return;
  }
  const argsJson = JSON.stringify({ surfaceId: message.surfaceId, event: message.event, values: message.values });
  using arg = callJsonParse(state.ctx, state.jsonParse, argsJson);
  const handler = state.handler;
  const failure = await runToSettlement(state, UI_GUEST_BUDGETS.eventCpuMs, () => state.ctx.callFunction(handler, state.ctx.undefined, arg));
  post(failure === null ? { kind: "settled", ok: true } : { kind: "settled", ok: false, message: failure });
}

/** Settle a host call the guest is parked on. A late result for a torn-down guest, or a callId nobody is
 *  waiting on, is DROPPED — never thrown: the host may have terminated and respawned between the two. */
function settleHostCall(message: Extract<UiGuestInbound, { kind: "hostResult" }>): void {
  const state = guest;
  const waiting = state?.pending.get(message.callId);
  // `guest` is `GuestState | null` (never `undefined`), so the null arm alone covers "no live guest"; `waiting`
  // is the meaningful drop (a late/unknown callId the map has no entry for).
  if (state === null || waiting === undefined) {
    return;
  }
  state.pending.delete(message.callId);
  state.inFlight -= 1;
  if (message.ok) {
    waiting.resolve(message.resultJson);
    return;
  }
  waiting.reject(message.message);
}

globalThis.onmessage = (event: MessageEvent<UiGuestInbound>): void => {
  const message = event.data;
  if (message.kind === "boot") {
    // @orb-waive caught-failure-ownership(boot): the failure message is posted back as a
    // `ready:false` outbound message — fully propagated, never swallowed. Ends if that post call is removed.
    void boot(message).catch((err: unknown) => {
      post({ kind: "ready", ok: false, message: err instanceof Error ? err.message : String(err) });
    });
    return;
  }
  if (message.kind === "event") {
    // @orb-waive caught-failure-ownership(deliver): the failure message is posted back as a
    // `settled:false` outbound message — fully propagated, never swallowed. Ends if that post call is removed.
    void deliver(message).catch((err: unknown) => {
      post({ kind: "settled", ok: false, message: err instanceof Error ? err.message : String(err) });
    });
    return;
  }
  settleHostCall(message);
};
