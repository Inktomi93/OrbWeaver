// The Sandbox — one guest instance = one QuickJSContext (own globals, own memory cap, own interrupt budget).
// P1 delivered the skeleton (boot/teardown, injected-seam realm, per-invocation DoS budget, the async promise
// bridge, `boundHostFn`). P4b-CORE adds the MEMBRANE: the capability-gated host-fn call surface (membrane.ts),
// the invocation-chat-context (a mutable per-invocation `InvocationChat` + its host-minted opaque token), and
// the RESIDENT-HANDLER runtime — `main.js` registers guest tool callbacks at activation; the Sandbox keeps each
// live handler HANDLE (keyed by a minted ref), and `invokeHandler` calls it under the per-invocation budget.
//
// Ownership discipline (the sharp edge quickjs-emscripten demands): EVERY handle the host mints must be
// disposed. Per-invocation handles are disposed at end-of-invocation and counted (`pendingHandles`) so a leak
// is a failing assertion; the realm/handler handles live for the sandbox lifetime and die with `dispose()`.

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { PluginCapability, PluginEventSubscription, PluginHandlerRef, PluginToolRegistration, PluginTransformRegistration } from "@orb/contracts/plugin";
import type { QuickJSContext, QuickJSDeferredPromise, QuickJSHandle, QuickJSWASMModule } from "quickjs-emscripten-core";
import {
  GUEST_MAX_STACK_BYTES,
  HOST_FN_DEADLINE_MS,
  HOST_FN_RESULT_CAP_BYTES,
  PLUGIN_INVOCATION_CPU_MS,
  PLUGIN_INVOKE_ARGS_MAX_BYTES,
  PLUGIN_MEMORY_LIMIT_BYTES,
} from "./budgets.ts";
import type { InFlightCounter, InvocationChat, MembraneRuntime, PluginBridge } from "./membrane.ts";
import { getPluginQuickJS } from "./module.ts";
import type { HostSeams } from "./realm.ts";
import { installRealm, LogRing } from "./realm.ts";

/** Per-instance DoS limits. Both default to the 03 §3 budget constants; a snippet passes a wider wall. */
export interface SandboxLimits {
  /** Per-invocation guest CPU deadline (real wall-time), ms. */
  readonly cpuDeadlineMs: number;
  /** WASM memory cap for the whole instance, bytes. */
  readonly memoryLimitBytes: number;
}

/** The membrane wiring an instance boots with: the granted capability set + the authority-agnostic op bridge
 *  (the DOMAIN built + gated it). Absent ⇒ the determinism-floor-only realm (the P1 spike shape). */
export interface SandboxMembrane {
  readonly grants: ReadonlySet<PluginCapability>;
  readonly bridge: PluginBridge;
  /** The manifest-declared `net.fetch` allowlist (plain-string DATA — NEVER `ANY_HOST`/guest-supplied). Empty
   *  ⇒ every `net.fetch` is refused (fail-closed). */
  readonly netHosts: readonly string[];
}

/** A guest error projected to plain data (never a live handle across the boundary). */
export interface GuestError {
  readonly name: string;
  readonly message: string;
}

/** The result of one guest invocation — errors-as-data, logs drained, no live handles escape. */
export interface EvalOutcome {
  readonly ok: boolean;
  /** JSON-serialized guest return value (present when ok). */
  readonly value?: string;
  /** Present when the guest threw, hit the deadline, or OOM'd — all contained, never a host crash. */
  readonly error?: GuestError;
  readonly logs: readonly string[];
}

const DEFAULT_LIMITS: SandboxLimits = {
  cpuDeadlineMs: PLUGIN_INVOCATION_CPU_MS,
  memoryLimitBytes: PLUGIN_MEMORY_LIMIT_BYTES,
};

function readError(ctx: QuickJSContext, handle: QuickJSHandle): GuestError {
  const dumped: unknown = ctx.dump(handle);
  if (typeof dumped === "object" && dumped !== null) {
    const record = dumped as { name?: unknown; message?: unknown };
    return { name: String(record.name ?? "Error"), message: String(record.message ?? "") };
  }
  return { name: "Error", message: String(dumped) };
}

function serializeGuest(ctx: QuickJSContext, handle: QuickJSHandle): string {
  const dumped: unknown = ctx.dump(handle);
  // A guest STRING return flows back VERBATIM (03 §5 — a tool handler's string IS the result, never
  // re-JSON-stringified: a handler that returns `JSON.stringify(x)` yields exactly that JSON to the model).
  if (typeof dumped === "string") {
    return dumped;
  }
  return dumped === undefined ? "undefined" : JSON.stringify(dumped);
}

/** The mutable per-instance state the membrane reads (shared between the realm-installed host fns and the
 *  Sandbox instance — created before either so both close over the same holders). */
interface ResidentState {
  chat: InvocationChat | null;
  token: string | null;
  readonly inFlight: InFlightCounter;
  readonly tools: PluginToolRegistration[];
  readonly transforms: PluginTransformRegistration[];
  readonly events: PluginEventSubscription[];
  readonly handlers: Map<PluginHandlerRef, QuickJSHandle>;
  /** Host-call deferreds still UNSETTLED (a fire-and-forget guest promise still in flight). MUST be disposed
   *  before `ctx.dispose()` — an unsettled guest Promise left in the heap aborts `JS_FreeRuntime` (03 §3). The
   *  membrane's `attachAsync` registers on create + deregisters on settle; `dispose()` drains the remainder. */
  readonly pending: Set<QuickJSDeferredPromise>;
}

export class Sandbox {
  private outstanding = 0;
  private readonly ctx: QuickJSContext;
  private readonly log: LogRing;
  private readonly limits: SandboxLimits;
  private readonly state: ResidentState;

  private constructor(init: { ctx: QuickJSContext; log: LogRing; limits: SandboxLimits; state: ResidentState }) {
    this.ctx = init.ctx;
    this.log = init.log;
    this.limits = init.limits;
    this.state = init.state;
  }

  /** Boot a fresh guest instance: load the process module, mint an isolated context, cap its memory + stack,
   *  and install the injected-seam realm (+ the membrane, when `membrane` is supplied). Async because the WASM
   *  module loads once per process. */
  static async create(seams: HostSeams, opts: { limits?: Partial<SandboxLimits>; membrane?: SandboxMembrane } = {}): Promise<Sandbox> {
    const mod: QuickJSWASMModule = await getPluginQuickJS();
    const ctx = mod.newContext();
    const resolved: SandboxLimits = { ...DEFAULT_LIMITS, ...opts.limits };
    ctx.runtime.setMemoryLimit(resolved.memoryLimitBytes);
    // MANDATORY (see GUEST_MAX_STACK_BYTES): without an explicit soft stack ceiling a recursive guest crashes
    // the host and leaves the runtime un-disposable. This turns deep recursion into a clean contained RangeError.
    ctx.runtime.setMaxStackSize(GUEST_MAX_STACK_BYTES);
    const log = new LogRing();

    const state: ResidentState = {
      chat: null,
      token: null,
      inFlight: { count: 0 },
      tools: [],
      transforms: [],
      events: [],
      handlers: new Map(),
      pending: new Set(),
    };
    let refCounter = 0;
    const membrane: MembraneRuntime | undefined =
      opts.membrane === undefined
        ? undefined
        : {
            grants: opts.membrane.grants,
            bridge: opts.membrane.bridge,
            netHosts: opts.membrane.netHosts,
            currentChat: (): InvocationChat | null => state.chat,
            currentToken: (): string | null => state.token,
            inFlight: state.inFlight,
            pending: state.pending,
            collectTool: (reg, handler): void => {
              const ref = `plugin-handler-${refCounter++}` as PluginHandlerRef;
              state.handlers.set(ref, handler);
              state.tools.push({ name: reg.name, description: reg.description, parameters: reg.parameters, handler: ref });
            },
            collectTransform: (reg, handler): void => {
              const ref = `plugin-handler-${refCounter++}` as PluginHandlerRef;
              state.handlers.set(ref, handler);
              state.transforms.push({ name: reg.name, point: reg.point, handler: ref });
            },
            collectEvent: (reg, handler): void => {
              const ref = `plugin-handler-${refCounter++}` as PluginHandlerRef;
              state.handlers.set(ref, handler);
              state.events.push({ type: reg.type, handler: ref });
            },
          };
    installRealm(ctx, seams, log, membrane);
    return new Sandbox({ ctx, log, limits: resolved, state });
  }

  /** Handles minted-but-not-yet-disposed by this sandbox's invocations. MUST be 0 between invocations — the
   *  dispose-discipline assertion (04 P1). Excludes the resident handler handles (they live for the instance
   *  lifetime by design). */
  get pendingHandles(): number {
    return this.outstanding;
  }

  /** True while the underlying context is alive (false after dispose). */
  get alive(): boolean {
    return this.ctx.alive;
  }

  /** The tool registrations `main.js` collected at activation (03 §5) — the domain hands each to its registrar. */
  get collectedTools(): readonly PluginToolRegistration[] {
    return this.state.tools;
  }

  /** The D50 transform registrations `main.js` collected at activation (03 §6) — the domain wires each into the
   *  shared prompt-transform registry (assigning the 1000+ plugin band, building the apply, unregistering on
   *  deactivate). The guest `apply` handles live in `handlers` (disposed at teardown alongside tool handlers). */
  get collectedTransforms(): readonly PluginTransformRegistration[] {
    return this.state.transforms;
  }

  /** The event subscriptions `main.js` collected at activation (03 §2) — the domain wires each onto the
   *  automation plugin-subscriber fan-out (delivery + unregister). The guest handler handles live in `handlers`
   *  (disposed at teardown alongside tool/transform handlers). */
  get collectedEvents(): readonly PluginEventSubscription[] {
    return this.state.events;
  }

  /** Admit an invocation chat (mints a fresh opaque handle token) or clear the scope (`null`). Called before
   *  each resident handler invoke + once for a snippet run; the DOMAIN pre-gated the chat's read authority and
   *  set `canWrite` from the host-authority check. */
  setInvocationChat(chat: InvocationChat | null): void {
    this.state.chat = chat;
    // The opaque handle token is a SECURITY token — minted from a dedicated CSPRNG (node:crypto randomUUID),
    // NOT the guest id seam (`seams.mintId` backs the guest-callable `orb.host(1).ids.mint()`). A security token
    // and an injectable/guest-facing id source have OPPOSITE requirements: a future seeded/deterministic `mintId`
    // (a test seam, a "reproducible ids" mode) must never make a handle token predictable (INFO-3). Non-load-
    // bearing today (single chat per invocation), but the boundary is the point.
    this.state.token = chat === null ? null : randomUUID();
  }

  private take(handle: QuickJSHandle): QuickJSHandle {
    this.outstanding += 1;
    return handle;
  }

  private drop(handle: QuickJSHandle): void {
    handle.dispose();
    this.outstanding -= 1;
  }

  /** Drive one guest computation (an eval or a resident-handler call) under the per-invocation budget: pump the
   *  promise bridge to settlement, project the result to a string, contain any throw/deadline/OOM as `ok:false`.
   *  Shared by `evalGuest` + `invokeHandler`. */
  private async runToSettlement(produce: () => ReturnType<QuickJSContext["evalCode"]>): Promise<EvalOutcome> {
    this.log.reset();
    this.state.inFlight.count = 0;
    // The DoS deadline reads a MONOTONIC real clock (performance.now), NOT the guest's injected seam: the
    // interrupt must fire in real time regardless of a frozen test clock. It preempts guest BYTECODE only —
    // host calls self-bound separately (membrane's attachAsync).
    const startMs = performance.now();
    this.ctx.runtime.setInterruptHandler(() => performance.now() - startMs > this.limits.cpuDeadlineMs);
    try {
      const result = produce();
      if (result.error) {
        const error = readError(this.ctx, result.error);
        result.error.dispose();
        return { ok: false, error, logs: this.log.drain() };
      }
      const handle = this.take(result.value);
      const native = this.ctx.resolvePromise(handle);
      this.ctx.runtime.executePendingJobs();
      const settled = await native;
      this.drop(handle);

      if (settled.error) {
        const wrapped = this.take(settled.error);
        const error = readError(this.ctx, settled.error);
        this.drop(wrapped);
        return { ok: false, error, logs: this.log.drain() };
      }
      const wrapped = this.take(settled.value);
      const value = serializeGuest(this.ctx, settled.value);
      this.drop(wrapped);
      return { ok: true, value, logs: this.log.drain() };
    } finally {
      this.ctx.runtime.removeInterruptHandler();
    }
  }

  /** Run guest source under the per-invocation budget (activation `main.js` / a snippet). Deadline / OOM / throw
   *  all return `ok:false` with `error` — the host PROCESS is never fatal on guest behavior (03 §4). */
  async evalGuest(code: string): Promise<EvalOutcome> {
    return await this.runToSettlement(() => this.ctx.evalCode(code, "plugin-guest.js"));
  }

  /** Invoke a resident guest handler (a collected tool/transform/event callback) with JSON-encoded args, under
   *  the invocation budget. The handler's string return IS the tool result (03 §5); a throw/deadline is contained
   *  as `ok:false`. The caller sets the invocation chat first (`setInvocationChat`). The `argsJson` is bounded by
   *  `PLUGIN_INVOKE_ARGS_MAX_BYTES` at THIS guest-inbound seam — a TF-1 event fact has no content cap, so an
   *  oversized delivery fails CONTAINED before it ever reaches the guest heap (the domain field-caps the fact
   *  content separately; this is the coarse whole-payload DoS backstop). */
  async invokeHandler(ref: PluginHandlerRef, argsJson: string): Promise<EvalOutcome> {
    const handler = this.state.handlers.get(ref);
    if (handler === undefined) {
      return { ok: false, error: { name: "Error", message: `plugin host: unknown handler ref ${ref}` }, logs: [] };
    }
    if (Buffer.byteLength(argsJson, "utf8") > PLUGIN_INVOKE_ARGS_MAX_BYTES) {
      return { ok: false, error: { name: "Error", message: `plugin host: handler args exceed ${PLUGIN_INVOKE_ARGS_MAX_BYTES}-byte inbound cap` }, logs: [] };
    }
    return await this.runToSettlement(() => {
      const argHandle = this.parseJsonToHandle(argsJson);
      try {
        return this.ctx.callFunction(handler, this.ctx.undefined, argHandle);
      } finally {
        argHandle.dispose();
      }
    });
  }

  /** Parse a JSON string into a guest handle via the guest's own `JSON.parse` (kept inside the realm — no host
   *  marshaller needed for the single args object; a malformed string yields `undefined`). */
  private parseJsonToHandle(json: string): QuickJSHandle {
    const parseResult = this.ctx.evalCode(`(${json})`, "plugin-args.js");
    if (parseResult.error) {
      parseResult.error.dispose();
      return this.ctx.undefined;
    }
    return parseResult.value;
  }

  /** Tear down the instance — disposes every resident handler handle, then the context (and all realm handles).
   *  Idempotent-safe: guarded on `alive`. WASM memory is reclaimed; the process module stays loaded. */
  dispose(): void {
    // Drain host-call deferreds still UNSETTLED (a guest fire-and-forget that outlived its invocation) BEFORE
    // tearing down the context. An unsettled guest Promise left in the heap makes `JS_FreeRuntime` ABORT the
    // shared WASM module (`list_empty(&rt->gc_obj_list)`) — a guest-REACHABLE host crash (fire a host call, never
    // await it, end the invocation). Disposing the deferred frees its promise + resolver handles so teardown is
    // clean; a late host-side settle is separately dropped by the `ctx.alive` guard in the membrane (attachAsync).
    for (const deferred of this.state.pending) {
      deferred.dispose();
    }
    this.state.pending.clear();
    for (const handle of this.state.handlers.values()) {
      handle.dispose();
    }
    this.state.handlers.clear();
    if (this.ctx.alive) {
      this.ctx.dispose();
    }
  }
}

function capResult(value: string, capBytes: number, name: string): string {
  if (Buffer.byteLength(value, "utf8") > capBytes) {
    throw new Error(`${name} host result exceeds ${capBytes}-byte cap`);
  }
  return value;
}

/** Build a host function that self-bounds (03 §3 "the interrupt does NOT preempt a blocking host call"). Args
 *  cross as JSON-safe strings; a sync impl marshals immediately, an async impl bridges through a deferred
 *  promise RACED against a real-time deadline and its result is size-capped. Retained from the P1 spike as the
 *  string-in/string-out primitive; the membrane's `attachAsync` is the object-marshalling generalization.
 *
 *  DISPOSE CONTRACT (async impl): the returned guest promise (the internal deferred) must SETTLE before the
 *  context is torn down — an unsettled guest Promise at `ctx.dispose()` aborts the shared WASM module
 *  (`list_empty(&rt->gc_obj_list)`), a guest-reachable host crash. This standalone primitive does NOT own a
 *  teardown registry (unlike the live membrane, where the `Sandbox` tracks + drains pending deferreds), so a
 *  caller that disposes a context while a `boundHostFn` async call is still in flight MUST drain it first. The
 *  `!ctx.alive` guard below only contains the SEPARATE late-settle use-after-free (a settle that lands after a
 *  clean teardown); it does not make dispose-while-pending safe on its own. */
export function boundHostFn(
  ctx: QuickJSContext,
  name: string,
  impl: (args: readonly string[]) => Promise<string> | string,
  opts: { deadlineMs?: number; resultCapBytes?: number } = {},
): QuickJSHandle {
  const deadlineMs = opts.deadlineMs ?? HOST_FN_DEADLINE_MS;
  const capBytes = opts.resultCapBytes ?? HOST_FN_RESULT_CAP_BYTES;

  return ctx.newFunction(name, (...argHandles) => {
    const args = argHandles.map((handle) => ctx.getString(handle));
    const out = impl(args);

    if (typeof out === "string") {
      return ctx.newString(capResult(out, capBytes, name));
    }

    const deferred = ctx.newPromise();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} exceeded ${deadlineMs}ms host bound`)), deadlineMs);
      timer.unref();
    });
    void Promise.race([out, timeout])
      .then(
        (settled) => {
          // A fire-and-forget guest call can outlive its invocation: the context is disposed (snippet end /
          // deactivate) BEFORE this real-async host call settles. Touching a dead context (deferred/newString)
          // is a use-after-free that escapes as an unhandled rejection — drop the late result. Guard-equivalent
          // to the membrane's `attachAsync` (the LIVE path); this primitive is exported so a future async host-fn
          // built on it inherits the same containment (LOW-1).
          if (!ctx.alive) {
            return;
          }
          const handle = ctx.newString(capResult(settled, capBytes, name));
          deferred.resolve(handle);
          handle.dispose();
        },
        (reason: unknown) => {
          if (!ctx.alive) {
            return;
          }
          const message = reason instanceof Error ? reason.message : String(reason);
          const handle = ctx.newError(message);
          deferred.reject(handle);
          handle.dispose();
        },
      )
      .finally(() => clearTimeout(timer));
    void deferred.settled.then(() => {
      if (ctx.alive) {
        ctx.runtime.executePendingJobs();
      }
    });
    return deferred.handle;
  });
}
