// The Sandbox — one guest instance = one QuickJSContext (own globals, own memory cap, own interrupt budget).
// It provides the skeleton (boot/teardown, injected-seam realm, per-invocation DoS budget, the async promise
// bridge) and the MEMBRANE: the capability-gated host-fn call surface (membrane.ts),
// the invocation-chat-context (a mutable per-invocation `InvocationChat` + its host-minted opaque token), and
// the RESIDENT-HANDLER runtime — `main.js` registers guest tool callbacks at activation; the Sandbox keeps each
// live handler HANDLE (keyed by a minted ref), and `invokeHandler` calls it under the per-invocation budget.
//
// TWO invocation bounds, do NOT conflate them: the QuickJS interrupt handler bounds guest BYTECODE
// (`cpuDeadlineMs`), and the SETTLEMENT deadline bounds the INVOCATION in real time
// (`cpuDeadlineMs + settleGraceMs`). Only the second can end a guest that has STOPPED executing bytecode —
// `new Promise(() => {})`, an await that never resumes — which the interrupt is structurally blind to. On
// expiry the invocation returns `PluginInvocationEnded` and the hung guest is left INERT (see `endInvocation`).
//
// The BYTECODE bound is not invocation-scoped: it is a context-lifetime interrupt over a mutable window
// (`cpu-guard.ts`), because guest bytecode also runs in the POST-invocation job pumps — `runToSettlement` opens
// the invocation's window, and every pump opens its own. A pump that executed guest code with no handler
// installed was #781, a whole-process DoS.
//
// Ownership discipline (the sharp edge quickjs-emscripten demands): EVERY handle the host mints must be
// disposed. Per-invocation handles are disposed at end-of-invocation and counted (`pendingHandles`) so a leak
// is a failing assertion; the realm/handler handles live for the sandbox lifetime and die with `dispose()`.

import { randomUUID } from "node:crypto";
import type {
  PluginCapability,
  PluginCommandRegistration,
  PluginDisplayTransformRegistration,
  PluginEventSubscription,
  PluginHandlerRef,
  PluginMacroRegistration,
  PluginPubsubSubscription,
  PluginSurfaceRegistration,
  PluginToolRegistration,
  PluginTransformRegistration,
} from "@orb/contracts/plugin";
import type { QuickJSContext, QuickJSDeferredPromise, QuickJSHandle, QuickJSWASMModule, VmCallResult } from "quickjs-emscripten-core";
import { GUEST_MAX_STACK_BYTES, HOST_FN_DEADLINE_MS, PLUGIN_INVOCATION_CPU_MS, PLUGIN_INVOKE_ARGS_MAX_BYTES, PLUGIN_MEMORY_LIMIT_BYTES } from "./budgets.ts";
import { installCpuGuard, openCpuWindow, pumpGuestJobs } from "./cpu-guard.ts";
import type { InFlightCounter, InvocationChat, MembraneRuntime, PluginBridge } from "./membrane.ts";
import { getPluginQuickJS } from "./module.ts";
import type { HostSeams, LogMirror } from "./realm.ts";
import { installRealm, LogRing } from "./realm.ts";

/** Per-instance DoS limits. All default to the shared budget constants; a snippet passes a wider wall. */
export interface SandboxLimits {
  /** Guest CPU window (real wall-time), ms — enforced by the QuickJS interrupt handler, which preempts guest
   *  BYTECODE only. It bounds the invocation AND each post-invocation job pump: one window per span of guest
   *  execution, never a bound on their sum (`cpu-guard.ts`). */
  readonly cpuDeadlineMs: number;
  /** WASM memory cap for the whole instance, bytes. */
  readonly memoryLimitBytes: number;
  /** Grace above {@link cpuDeadlineMs} before the invocation is force-ENDED in real time
   *  (`cpuDeadlineMs + settleGraceMs` = the settlement deadline). This is the bound the interrupt CANNOT
   *  provide: see {@link HOST_FN_DEADLINE_MS} for why it is the host-fn deadline. */
  readonly settleGraceMs: number;
}

/** The `name` an ENDED invocation's error carries — the design's `PluginInvocationEnded` (03 §3), surfaced as
 *  DATA on the outcome (nothing crosses back into the guest: its realm is torn down). The domain's crash policy
 *  sees it as a rejected `invoke`, so a hang finally counts toward the 3-strike auto-disable. */
export const PLUGIN_INVOCATION_ENDED = "PluginInvocationEnded";

/** The settlement-race sentinel — a unique symbol so a guest value can never impersonate the deadline arm. */
const ENDED = Symbol("plugin-invocation-ended");

/** The contained outcome every call into an instance whose realm was torn down by an ENDED invocation gets. */
function endedInstanceOutcome(): EvalOutcome {
  return { ok: false, error: { name: PLUGIN_INVOCATION_ENDED, message: "plugin host: this instance was torn down by an ENDED invocation" }, logs: [] };
}

/** The membrane wiring an instance boots with: the granted capability set + the authority-agnostic op bridge
 *  (the DOMAIN built + gated it). Absent ⇒ the determinism-floor-only realm. */
export interface SandboxMembrane {
  readonly grants: ReadonlySet<PluginCapability>;
  readonly bridge: PluginBridge;
  /** The manifest-declared `net.fetch` allowlist (plain-string DATA — NEVER `ANY_HOST`/guest-supplied). Empty
   *  ⇒ every `net.fetch` is refused (fail-closed). */
  readonly netHosts: readonly string[];
}

/** A guest error projected to plain data (never a live handle across the boundary). `line` is the guest
 *  source line the engine attributed the error to, lifted from `stack` (`plugin-guest.js:LINE:COL`) —
 *  present for a compile-time `SyntaxError` (QuickJS always stamps one there) and absent when the dump
 *  carried no `stack` at all. */
export interface GuestError {
  readonly name: string;
  readonly message: string;
  readonly line?: number;
}

/** The guest-source-line pattern in a QuickJS error's `stack` (`"    at plugin-guest.js:2:12\n"`,
 *  measured against the shipped -ng build). */
const GUEST_LINE_RE = /plugin-guest\.js:(\d+):\d+/;

/** Pull the guest source line out of a QuickJS error's `stack`. Returns `undefined` on any shape that
 *  doesn't match rather than guessing — an absent line is a silently omitted field, never a wrong one. */
function extractGuestLine(stack: string): number | undefined {
  const match = GUEST_LINE_RE.exec(stack);
  if (match === null) {
    return;
  }
  const line = Number(match[1]);
  return Number.isFinite(line) ? line : undefined;
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
  settleGraceMs: HOST_FN_DEADLINE_MS,
};

function readError(ctx: QuickJSContext, handle: QuickJSHandle): GuestError {
  const dumped: unknown = ctx.dump(handle);
  if (typeof dumped === "object" && dumped !== null) {
    const record = dumped as { name?: unknown; message?: unknown; stack?: unknown };
    const name = String(record.name ?? "Error");
    const message = String(record.message ?? "");
    const line = typeof record.stack === "string" ? extractGuestLine(record.stack) : undefined;
    return line === undefined ? { name, message } : { name, message, line };
  }
  return { name: "Error", message: String(dumped) };
}

function serializeGuest(ctx: QuickJSContext, handle: QuickJSHandle): string {
  const dumped: unknown = ctx.dump(handle);
  // A guest STRING return flows back VERBATIM (a tool handler's string IS the result, never
  // re-JSON-stringified: a handler that returns `JSON.stringify(x)` yields exactly that JSON to the model).
  if (typeof dumped === "string") {
    return dumped;
  }
  return dumped === undefined ? "undefined" : JSON.stringify(dumped);
}

/** The mutable per-instance state the membrane reads (shared between the realm-installed host fns and the
 *  Sandbox instance — created before either so both close over the same holders). */
/** UPSERT one surface registration by its id (hub v1.3): re-registering an id REPLACES the row — the
 *  mechanism a guest uses to revise its own spec after an async read (the atlas registers its default
 *  synchronously at activation, then re-registers with the kv-persisted SFW toggle once the read lands).
 *  Without this, a duplicate id would project twice through `listSurfaces` and the STALE first row would
 *  win every `find` — a lying surface. A replaced row's handler REF stays in `state.handlers`
 *  (unreachable, disposed with the instance like every resident handle — never double-freed here). */
function upsertSurface(surfaces: PluginSurfaceRegistration[], registration: PluginSurfaceRegistration): void {
  const existing = surfaces.findIndex((candidate) => candidate.id === registration.id);
  if (existing >= 0) {
    surfaces[existing] = registration;
    return;
  }
  surfaces.push(registration);
}

interface ResidentState {
  chat: InvocationChat | null;
  token: string | null;
  /** Concurrent STARTED-AND-UNSETTLED host-fn impls for this INSTANCE (never reset between invocations — host
   *  work outlives its invocation, so an invocation-scoped count is not a count of work). See `InFlightCounter`. */
  readonly inFlight: InFlightCounter;
  readonly tools: PluginToolRegistration[];
  readonly transforms: PluginTransformRegistration[];
  readonly events: PluginEventSubscription[];
  readonly pubsub: PluginPubsubSubscription[];
  readonly surfaces: PluginSurfaceRegistration[];
  readonly commands: PluginCommandRegistration[];
  readonly displayTransforms: PluginDisplayTransformRegistration[];
  readonly macros: PluginMacroRegistration[];
  readonly handlers: Map<PluginHandlerRef, QuickJSHandle>;
  /** Host-call deferreds still UNSETTLED (a fire-and-forget guest promise still in flight). MUST be disposed
   *  before `ctx.dispose()` — an unsettled guest Promise left in the heap aborts `JS_FreeRuntime`. The
   *  membrane's `attachAsync` registers on create + deregisters on settle; `dispose()` drains the remainder. */
  readonly pending: Set<QuickJSDeferredPromise>;
}

export class Sandbox implements Disposable {
  private outstanding = 0;
  private readonly ctx: QuickJSContext;
  private readonly log: LogRing;
  private readonly limits: SandboxLimits;
  private readonly state: ResidentState;
  /** The realm's PRISTINE `JSON.parse`, captured before any guest code ran — the inbound args channel
   *  (`parseArgs`). Held for the instance lifetime, disposed with the context. */
  private readonly jsonParse: QuickJSHandle;

  private constructor(init: { ctx: QuickJSContext; log: LogRing; limits: SandboxLimits; state: ResidentState; jsonParse: QuickJSHandle }) {
    this.ctx = init.ctx;
    this.log = init.log;
    this.limits = init.limits;
    this.state = init.state;
    this.jsonParse = init.jsonParse;
  }

  /** Boot a fresh guest instance: load the process module, mint an isolated context, cap its memory + stack,
   *  and install the injected-seam realm (+ the membrane, when `membrane` is supplied). Async because the WASM
   *  module loads once per process. */
  static async create(seams: HostSeams, opts: { limits?: Partial<SandboxLimits>; membrane?: SandboxMembrane; logMirror?: LogMirror } = {}): Promise<Sandbox> {
    const mod: QuickJSWASMModule = await getPluginQuickJS();
    const ctx = mod.newContext();
    const resolved: SandboxLimits = { ...DEFAULT_LIMITS, ...opts.limits };
    ctx.runtime.setMemoryLimit(resolved.memoryLimitBytes);
    // MANDATORY (see GUEST_MAX_STACK_BYTES): without an explicit soft stack ceiling a recursive guest crashes
    // the host and leaves the runtime un-disposable. This turns deep recursion into a clean contained RangeError.
    ctx.runtime.setMaxStackSize(GUEST_MAX_STACK_BYTES);
    // The guest-CPU interrupt, installed BEFORE any guest source can run and kept for the context's lifetime.
    // It is INERT until a span opens a window — but it must be in place before the first pump, because a pump
    // is precisely where an un-installed handler let guest bytecode run unbounded (#781).
    installCpuGuard(ctx, resolved.cpuDeadlineMs);
    // ONE ring for the instance's lifetime — the invocation AND every post-settle job pump push into it, and
    // `drain()` is destructive, so nothing here ever resets it (#806). The optional mirror is the port's
    // per-line tap into the central log (`LogMirror`); absent ⇒ the ring alone.
    const log = new LogRing(opts.logMirror);

    const state: ResidentState = {
      chat: null,
      token: null,
      inFlight: { count: 0, controllers: new Set(), settlements: new Set() },
      tools: [],
      transforms: [],
      events: [],
      pubsub: [],
      surfaces: [],
      commands: [],
      displayTransforms: [],
      macros: [],
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
            collectPubsub: (reg, handler): void => {
              const ref = `plugin-handler-${refCounter++}` as PluginHandlerRef;
              state.handlers.set(ref, handler);
              state.pubsub.push({ emitterSlug: reg.emitterSlug, name: reg.name, handler: ref });
            },
            collectDisplayTransform: (reg, handler): void => {
              const ref = `plugin-handler-${refCounter++}` as PluginHandlerRef;
              state.handlers.set(ref, handler);
              state.displayTransforms.push({ name: reg.name, handler: ref });
            },
            collectMacro: (reg, handler): void => {
              const ref = `plugin-handler-${refCounter++}` as PluginHandlerRef;
              state.handlers.set(ref, handler);
              state.macros.push({ name: reg.name, description: reg.description, handler: ref });
            },
            collectSurface: (meta, onAction, frame): void => {
              // U7: `frame` is the frame-tier DOCUMENT BODY. It rides the registration and NOT the meta, so it
              // stays server-side — `PluginSurfaceView extends PluginSurfaceRegistrationMeta`, and a body on the
              // meta would ship every frame document to the client through `listSurfaces`.
              const body = frame === undefined ? {} : { frame };
              if (onAction === null) {
                upsertSurface(state.surfaces, { ...meta, ...body });
                return;
              }
              const ref = `plugin-handler-${refCounter++}` as PluginHandlerRef;
              state.handlers.set(ref, onAction);
              upsertSurface(state.surfaces, { ...meta, ...body, onAction: ref });
            },
            collectCommand: (meta, onRun): void => {
              const ref = `plugin-handler-${refCounter++}` as PluginHandlerRef;
              state.handlers.set(ref, onRun);
              state.commands.push({ ...meta, onRun: ref });
            },
            logWarn: (message): void => {
              log.push("warn", message);
            },
          };
    installRealm(ctx, seams, log, membrane);
    // Capture `JSON.parse` HERE — after the realm is installed and BEFORE any guest source runs. The inbound
    // args channel calls this handle, so a guest that later reassigns `JSON.parse` (or deletes `JSON`) cannot
    // interpose on the host's marshalling of the next invocation's arguments.
    using jsonNamespace = ctx.getProp(ctx.global, "JSON");
    const jsonParse = ctx.getProp(jsonNamespace, "parse");
    return new Sandbox({ ctx, log, limits: resolved, state, jsonParse });
  }

  /** Handles minted-but-not-yet-disposed by this sandbox's invocations. MUST be 0 between invocations — the
   *  dispose-discipline assertion. Excludes the resident handler handles (they live for the instance
   *  lifetime by design). */
  get pendingHandles(): number {
    return this.outstanding;
  }

  /** Every guest log line pushed since the last drain — the lines a FLOATED continuation wrote between
   *  invocations (a post-settle pump runs guest bytecode, and that bytecode logs). Destructive, like every
   *  drain: the port retains what this returns in the instance's runtime ring, so `readLog` and the next
   *  `invoke` can each pick the residue up exactly once (#806). Safe on a dead context — the ring is host
   *  memory, not a QuickJS handle. */
  drainLog(): readonly string[] {
    return this.log.drain();
  }

  /** True while the underlying context is alive (false after dispose). */
  get alive(): boolean {
    return this.ctx.alive;
  }

  /** The tool registrations `main.js` collected at activation — the domain hands each to its registrar. */
  get collectedTools(): readonly PluginToolRegistration[] {
    return this.state.tools;
  }

  /** The D50 transform registrations `main.js` collected at activation — the domain wires each into the
   *  shared prompt-transform registry (assigning the 1000+ plugin band, building the apply, unregistering on
   *  deactivate). The guest `apply` handles live in `handlers` (disposed at teardown alongside tool handlers). */
  get collectedTransforms(): readonly PluginTransformRegistration[] {
    return this.state.transforms;
  }

  /** The event subscriptions `main.js` collected at activation — the domain wires each onto the
   *  automation plugin-subscriber fan-out (delivery + unregister). The guest handler handles live in `handlers`
   *  (disposed at teardown alongside tool/transform handlers). */
  get collectedEvents(): readonly PluginEventSubscription[] {
    return this.state.events;
  }

  /** The PRIVATE plugin-event subscriptions `main.js` collected at activation (plugin-ui-plane §5a) — the domain
   *  wires each onto the INSTALLER-scoped resident plugin-event bus (delivery + unregister), never the automation
   *  fan-out. The guest handler handles live in `handlers` (disposed at teardown alongside every other handler). */
  get collectedPubsub(): readonly PluginPubsubSubscription[] {
    return this.state.pubsub;
  }

  /** The UI surfaces `main.js` registered at activation (plugin-ui-plane #679 U1) — read directly by
   *  `plugin.listSurfaces`; each surface's `onAction` handle lives in `handlers` (disposed at teardown alongside
   *  tool/transform/event handlers). No external registrar: a surface is instance-resident data, not a process
   *  registry entry. */
  get collectedSurfaces(): readonly PluginSurfaceRegistration[] {
    return this.state.surfaces;
  }

  /** The UI COMMANDS `main.js` registered at activation (plugin-ui-plane #679 U5) — read directly by
   *  `plugin.listCommands` (which the `/plugin` dispatcher and the Plugins chrome menu both fan off); each
   *  command's `onRun` handle lives in `handlers` (disposed at teardown alongside every other resident handler).
   *  No external registrar, for the same reason a surface has none: a command is instance-resident data. */
  get collectedCommands(): readonly PluginCommandRegistration[] {
    return this.state.commands;
  }

  /** The DISPLAY transforms `main.js` registered at activation (plugin-ui-plane seam 14) — read directly by the
   *  display round-trip verb, like `collectedSurfaces`; each `apply` handle lives in `handlers`. No external
   *  registrar: a display transform is instance-resident data, not a process registry entry. */
  get collectedDisplayTransforms(): readonly PluginDisplayTransformRegistration[] {
    return this.state.displayTransforms;
  }

  /** The macros `main.js` registered at activation (plugin-ui-plane §5.15) — the domain namespaces each name
   *  and re-enters its `resolve` handle once per turn. Names here are GUEST-LOCAL (un-namespaced): infra holds
   *  no manifest slug and never invents one. */
  get collectedMacros(): readonly PluginMacroRegistration[] {
    return this.state.macros;
  }

  /** Admit an invocation chat (mints a fresh opaque handle token) or clear the scope (`null`). Called before
   *  each resident handler invoke + once for a snippet run; the DOMAIN pre-gated the chat's read authority and
   *  set `canWrite` from the host-authority check.
   *
   *  RETURNS the minted token (`null` for a cleared scope) so the caller can put it in the invocation's ARGUMENT
   *  object — the row-777 `onAction({…, chat})` shape. It is handed to exactly one place, `port.invoke`'s
   *  args-builder application, which drops it into a string that goes straight into the guest; it is never
   *  returned to a domain, never logged, and never stored. That is the same containment the token already had:
   *  only the guest and the membrane's `resolveChat` compare it. */
  setInvocationChat(chat: InvocationChat | null): string | null {
    this.state.chat = chat;
    // The opaque handle token is a SECURITY token — minted from a dedicated CSPRNG (node:crypto randomUUID),
    // NOT the guest id seam (`seams.mintId` backs the guest-callable `orb.host(1).ids.mint()`). A security token
    // and an injectable/guest-facing id source have OPPOSITE requirements: a future seeded/deterministic `mintId`
    // (a test seam, a "reproducible ids" mode) must never make a handle token predictable (INFO-3). Non-load-
    // bearing today (single chat per invocation), but the boundary is the point.
    this.state.token = chat === null ? null : randomUUID();
    return this.state.token;
  }

  private take(handle: QuickJSHandle): QuickJSHandle {
    this.outstanding += 1;
    return handle;
  }

  private drop(handle: QuickJSHandle): void {
    handle.dispose();
    this.outstanding -= 1;
  }

  /** Race a guest settlement against the invocation's REAL-TIME settlement deadline. The interrupt handler
   *  bounds guest BYTECODE; this bounds the INVOCATION — the two are not the same bound, and only this one can
   *  end a guest that has stopped executing (a never-settling promise, a fire-and-forget await). The timer is
   *  `unref`'d (it must never hold the process open) and cleared on the settle arm. */
  private raceSettlement(native: Promise<VmCallResult<QuickJSHandle>>): Promise<VmCallResult<QuickJSHandle> | typeof ENDED> {
    const wallMs = this.limits.cpuDeadlineMs + this.limits.settleGraceMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wall = new Promise<typeof ENDED>((resolve) => {
      timer = setTimeout(() => resolve(ENDED), wallMs);
      timer.unref();
    });
    return Promise.race([native, wall]).finally(() => clearTimeout(timer));
  }

  /** End a HUNG invocation (`PluginInvocationEnded`, 03 §3): free the guest promise handle, drop the
   *  invocation's unsettled host-call deferreds, and report the failure as data. What each step is for:
   *
   *  (1) `drop(handle)` — MANDATORY, not hygiene. The abandoned guest promise handle is host-owned; leaving it
   *      alive means the eventual `ctx.dispose()` aborts the SHARED WASM module
   *      (`Assertion failed: list_empty(&rt->gc_obj_list)` — MEASURED against this exact path), which would
   *      take every OTHER plugin's context in the process with it. The naive "abandon the promise and dispose
   *      the context" IS a guest-reachable host crash; this line is why it isn't.
   *  (2) `drainPending()` — closes the SLEEPER-CONTINUATION class. The guest may be parked on a host call whose
   *      deferred settles after the invocation ended; resuming then would run this invocation's continuation
   *      inside the NEXT invocation's chat scope (it would read that invocation's `chat.current()`), the exact
   *      shared-scope confusion the per-instance FIFO exists to prevent. Disposing the deferreds frees their
   *      resolvers, so the membrane's late settle no-ops (`QuickJSDeferredPromise.resolve` is
   *      `resolveHandle.alive`-guarded) and the parked continuation can never resume.
   *
   *  The CONTEXT deliberately survives. A resident instance is ONE context shared by every tool/transform/event
   *  handler, so tearing it down over one hung handler would kill the whole plugin with no re-activation path
   *  (03 §4's lazy re-activate is unbuilt) — and it buys nothing: (1)+(2) already leave the hung guest inert,
   *  and its heap garbage is bounded by the instance's 32 MiB cap (a repeat hanger OOMs contained). The stranded
   *  CONTEXT the review measured is the snippet path's, and there the caller's `using` frees it the moment this
   *  outcome returns. The rejection also reaches `recordCrash`, so a repeat hanger auto-disables at 3 strikes. */
  private endInvocation(handle: QuickJSHandle): EvalOutcome {
    const logs = this.log.drain();
    const wallMs = this.limits.cpuDeadlineMs + this.limits.settleGraceMs;
    this.drop(handle);
    this.abortHostOperations();
    this.drainPending();
    return {
      ok: false,
      error: { name: PLUGIN_INVOCATION_ENDED, message: `plugin host: invocation ended — it did not settle within its ${wallMs}ms wall` },
      logs,
    };
  }

  /** Dispose every host-call deferred still UNSETTLED and forget them. Shared by the ended-invocation path and
   *  teardown: an unsettled guest Promise still holding host resolvers at `ctx.dispose()` aborts the shared
   *  WASM module, and a late host settle against a disposed deferred is a no-op by construction. */
  private drainPending(): void {
    for (const deferred of this.state.pending) {
      deferred.dispose();
    }
    this.state.pending.clear();
  }

  /** Signal every still-running cooperative host operation. Controllers remain registered until their actual
   *  implementations settle, so the per-instance in-flight count and process ownership stay truthful even for
   *  a non-cancellable domain write that ignores the signal. */
  private abortHostOperations(): void {
    for (const controller of this.state.inFlight.controllers ?? []) {
      controller.abort();
    }
  }

  /** Begin cooperative teardown without freeing the QuickJS context underneath an active invocation. The port
   *  calls this first, waits for its per-instance FIFO tail, then calls {@link dispose}. */
  cancelHostOperations(): void {
    this.abortHostOperations();
  }

  /** Number of host implementations that have started but not actually settled. */
  get pendingHostOperations(): number {
    return this.state.inFlight.settlements?.size ?? 0;
  }

  /** Join the currently-owned host implementations. Every barrier is non-rejecting; rejection was already
   *  projected through the guest promise and still releases its in-flight slot. */
  async settleHostOperations(): Promise<void> {
    const settlements = this.state.inFlight.settlements;
    if (settlements === undefined) {
      return;
    }
    await Promise.all([...settlements]);
  }

  /** Drive one guest computation (an eval or a resident-handler call) under the per-invocation budget: pump the
   *  promise bridge to settlement, project the result to a string, contain any throw/deadline/OOM as `ok:false`.
   *  Shared by `evalGuest` + `invokeHandler`. */
  private async runToSettlement(produce: () => ReturnType<QuickJSContext["evalCode"]>): Promise<EvalOutcome> {
    if (!this.ctx.alive) {
      // A prior invocation hit its settlement wall and took the realm with it (see `endInvocation`). Report the
      // same contained failure rather than touching a dead context — the caller's FIFO advances, the crash
      // policy counts it, and the plugin auto-disables at the threshold.
      return endedInstanceOutcome();
    }
    // NOTE what is deliberately NOT reset here — TWO things, for the same reason (host work and guest bytecode
    // both outlive an invocation):
    //  • `this.log`. It used to be `reset()` on this line, which DESTROYED every line a floated continuation had
    //    pushed since the previous drain (a post-settle pump runs guest bytecode, and that bytecode logs) —
    //    the one piece of evidence a parked hub search left behind read as "the guest never logged" (#806).
    //    `drain()` is destructive now, so an invocation's outcome still carries exactly its own lines, and
    //    the residue is picked up by the port (`drainLog`) before the next run / on the next read instead.
    //  • `state.inFlight`. It counts host-fn IMPLEMENTATIONS that have started and not settled, and those OUTLIVE
    //    an invocation (the host-fn deadline bounds a call without signalling cancellation cannot tear a
    //    transactional write in two, so some impls may still run). Zeroing it here let a straggler's release
    //    decrement a counter this invocation had already reset — the counter drifted NEGATIVE and admitted more
    //    than `HOST_CALLS_IN_FLIGHT_MAX` concurrent host calls (measured 2026-08-24: 36 of a 40-call burst
    //    admitted). The counter is per-INSTANCE and self-healing by construction (one release per acquisition);
    //    see `InFlightCounter` in membrane.ts for the full P2-G reasoning.
    // The DoS deadline reads a MONOTONIC real clock (performance.now), NOT the guest's injected seam: the
    // interrupt must fire in real time regardless of a frozen test clock. It preempts guest BYTECODE only —
    // host calls self-bound separately (membrane's attachAsync), and the whole invocation is bounded by the
    // settlement race below (the interrupt cannot see a guest that has stopped executing). The handler itself
    // is installed for the CONTEXT's lifetime (`cpu-guard.ts`); this only opens THIS invocation's window, so
    // the post-invocation job pumps — which used to run guest bytecode with no handler at all (#781) — are
    // bounded by the same mechanism instead of by nothing.
    const closeCpuWindow = openCpuWindow(this.ctx);
    try {
      const result = produce();
      if (result.error) {
        const error = readError(this.ctx, result.error);
        result.error.dispose();
        return { ok: false, error, logs: this.log.drain() };
      }
      const handle = this.take(result.value);
      const native = this.ctx.resolvePromise(handle);
      pumpGuestJobs(this.ctx);
      const settled = await this.raceSettlement(native);
      if (settled === ENDED) {
        return this.endInvocation(handle);
      }
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
      // Restore the enclosing window (`Infinity` at the top level) rather than removing the handler: the
      // handler is the CONTEXT's, and a later pump reopens its own window off it. Unguarded on purpose — this
      // touches no runtime, only the guard's own state, so a dead context is harmless here too.
      closeCpuWindow();
    }
  }

  /** Run guest source under the per-invocation budget (activation `main.js` / a snippet). Deadline / OOM / throw
   *  all return `ok:false` with `error` — the host PROCESS is never fatal on guest behavior. */
  async evalGuest(code: string): Promise<EvalOutcome> {
    return await this.runToSettlement(() => this.ctx.evalCode(code, "plugin-guest.js"));
  }

  /** Invoke a resident guest handler (a collected tool/transform/event callback) with JSON-encoded args, under
   *  the invocation budget. The handler's string return IS the tool result; a throw/deadline is contained
   *  as `ok:false`. The caller sets the invocation chat first (`setInvocationChat`). The `argsJson` is bounded by
   *  `PLUGIN_INVOKE_ARGS_MAX_BYTES` at THIS guest-inbound seam — a TF-1 event fact has no content cap, so an
   *  oversized delivery fails CONTAINED before it ever reaches the guest heap (the domain field-caps the fact
   *  content separately; this is the coarse whole-payload DoS backstop). */
  async invokeHandler(ref: PluginHandlerRef, argsJson: string): Promise<EvalOutcome> {
    if (!this.ctx.alive) {
      // Checked BEFORE the ref lookup so a torn-down instance reports WHY (an ended invocation) instead of the
      // misleading "unknown handler ref" a cleared handler map would produce.
      return endedInstanceOutcome();
    }
    const handler = this.state.handlers.get(ref);
    if (handler === undefined) {
      return { ok: false, error: { name: "Error", message: `plugin host: unknown handler ref ${ref}` }, logs: [] };
    }
    if (Buffer.byteLength(argsJson, "utf8") > PLUGIN_INVOKE_ARGS_MAX_BYTES) {
      return { ok: false, error: { name: "Error", message: `plugin host: handler args exceed ${PLUGIN_INVOKE_ARGS_MAX_BYTES}-byte inbound cap` }, logs: [] };
    }
    const parsed = this.parseArgs(argsJson);
    if (typeof parsed === "string") {
      // A CONTAINED refusal, before the guest is touched: the caller's payload is not a JSON document, so the
      // JSON-only contract of this channel is broken and there is nothing safe to hand over.
      return { ok: false, error: { name: "Error", message: parsed }, logs: [] };
    }
    using argHandle = parsed;
    return await this.runToSettlement(() => this.ctx.callFunction(handler, this.ctx.undefined, argHandle));
  }

  /** Marshal the caller's `argsJson` into a guest handle by CALLING the realm's pristine `JSON.parse` on it —
   *  the payload crosses as a string VALUE, never as source. Returns the handle, or a refusal message.
   *
   *  WHY NOT `evalCode("(" + json + ")")` (what this replaces). That spelling was safe only by the goodwill of
   *  its three callers (all `JSON.stringify` output — swept 2026-08-24: the tool-args, transform-draft and
   *  event-fact producers), and it was wrong in three ways the moment one of them drifted:
   *   1. INJECTION SHAPE — a non-JSON payload EXECUTES in the guest realm with that plugin's grants. Measured:
   *      `(globalThis.x = 1, {})` set the guest global and the handler ran on the object literal.
   *   2. SILENT — malformed input yielded `ctx.undefined`, so the handler was invoked with NO arguments and
   *      nothing anywhere said so. A caller bug read as an empty tool call.
   *   3. NOT JSON SEMANTICS — an object LITERAL treats `__proto__` as the prototype setter, so a payload with
   *      that key handed the guest an object whose PROTOTYPE carried the attacker's values instead of an own
   *      property. `JSON.parse` defines it as an own key (the mirror of the guest→host rule the escape suite
   *      already pins).
   *  The parse runs inside the guest, so its cost is bounded by the instance's own memory + stack caps
   *  (a pathological nesting depth is a contained guest `RangeError`, reported here as the refusal). */
  private parseArgs(json: string): QuickJSHandle | string {
    using arg = this.ctx.newString(json);
    const result = this.ctx.callFunction(this.jsonParse, this.ctx.undefined, arg);
    if (result.error) {
      const detail = readError(this.ctx, result.error);
      result.error.dispose();
      return `plugin host: handler args must be a JSON document (${detail.message})`;
    }
    return result.value;
  }

  /** Tear down the instance — disposes every resident handler handle, then the context (and all realm handles).
   *  Idempotent-safe: guarded on `alive`. WASM memory is reclaimed; the process module stays loaded. */
  dispose(): void {
    // Drain host-call deferreds still UNSETTLED (a guest fire-and-forget that outlived its invocation) BEFORE
    // tearing down the context. An unsettled guest Promise left in the heap makes `JS_FreeRuntime` ABORT the
    // shared WASM module (`list_empty(&rt->gc_obj_list)`) — a guest-REACHABLE host crash (fire a host call, never
    // await it, end the invocation). Disposing the deferred frees its promise + resolver handles so teardown is
    // clean; a late host-side settle is separately dropped by the `ctx.alive` guard in the membrane (attachAsync).
    this.abortHostOperations();
    this.drainPending();
    for (const handle of this.state.handlers.values()) {
      handle.dispose();
    }
    this.state.handlers.clear();
    if (this.ctx.alive) {
      // BEFORE the context: a handle disposed after `ctx.dispose()` is a use-after-free, and gating both on
      // `alive` is what keeps this method re-entrant (`[Symbol.dispose]` + an explicit `dispose()`).
      this.jsonParse.dispose();
      this.ctx.dispose();
    }
  }

  /** `Disposable` so a NON-resident sandbox (the snippet one-shot) can be a `using` declaration — the teardown
   *  above is the only thing it does, and it is re-entrant (the drained sets are cleared, the ctx teardown is
   *  `alive`-guarded). A RESIDENT sandbox is explicitly NOT scope-owned: `createInstance` hands ownership to the
   *  `runtimes` registry and `PluginHostPort.dispose(instance)` frees it, so that path keeps the hand call. */
  [Symbol.dispose](): void {
    this.dispose();
  }
}
