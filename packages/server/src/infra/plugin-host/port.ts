// infra/plugin-host/port — the sandbox-runtime seam impl (`PluginHostPort`). `createPluginHost` returns the
// runtime the composition root injects UP into `domain/plugin`: boot a guest + install the membrane,
// run `main.js` under the invocation budget, collect its tool registrations, keep the instance RESIDENT, invoke
// a collected handler under the per-invocation budget, RETAIN every drained log line in the instance's bounded
// runtime ring (`readLog` — an operator's recent-activity view, in-memory and reset by a restart or a
// deactivate→activate cycle; NOT an audit log of record), tear it down. Infra imports ZERO domain
// (plugin-no-ambient): the returned object is STRUCTURALLY the domain's `PluginHostPort` (compose does the typed
// assignment) and names only `@orb/contracts` + the local skeleton.
//
// TWO log paths, one ring (#806 + the owner's "register plugin logs centrally" ask): (1) the per-instance
// `LogRing` is drained by every invocation AND — because a floated guest continuation logs in a post-settle
// pump, between invocations — picked up as RESIDUE by the next `invoke` (before it runs) and by every `readLog`
// (before it copies), so `plugin.getLog` tells the truth live; (2) every accepted line is ALSO mirrored at push
// time into the process pino stream tagged `{ plugin: <label> }` when the domain supplied a `label` (the
// manifest slug) — the file log and `/api/_debug/logs?q=<slug>` see it the moment the guest writes it, with no
// read in the path. An unlabelled instance (a snippet) mirrors nothing: its lines go back to the caller's REPL.
//
// `createInstance` consumes the membrane wiring (grants + the authority-agnostic `PluginBridge` + the invocation
// chat + the manifest `netHosts` allowlist) and `invoke` drives a resident guest handler — the FULL membrane
// host-fn CALL surface (chat.read / chat.variables.write / chat.surfaceQuickReply / chat.requestTurn /
// worldInfo.upsertEntry / imagery.generatePicture / global_vars / storage.{get,set,delete,list} /
// notifications.post / tools.register / transforms.register / events.on / net.fetch) + the resident-handler
// runtime are LIVE. `transforms.register` + `events.on` COLLECT a `PluginTransformRegistration` /
// `PluginEventSubscription` (the domain wires the band/apply/delivery/unregister); `net.fetch` performs the host
// fetch through the SSRF-guarded `safeFetch` pinned to `netHosts`. quick_reply, notifications, and
// storage.kv are COMPOSED — the bridge closes the pluginId/installer over those ops domain-side.

import { randomUUID } from "node:crypto";
import type { InvocationChat, PluginBridge, PluginCapability, PluginHandlerRef, PluginInstance, PluginInvokeArgs, PluginLogLevel } from "@orb/contracts/plugin";
import { DomainConflictError } from "@orb/kit/errors";
import { getLog, superviseDetached } from "#foundation/observability";
import {
  EVENT_QUEUE_DEPTH,
  PLUGIN_LOG_RING_CHARS,
  PLUGIN_LOG_RING_LINES,
  PLUGIN_MEMORY_LIMIT_BYTES,
  PLUGIN_RESIDENT_RUNTIME_MAX,
  PLUGIN_SNIPPET_RUNTIME_MAX,
  SNIPPET_WALL_MS,
} from "./budgets.ts";
import { getPluginQuickJS } from "./module.ts";
import type { HostSeams, LogMirror } from "./realm.ts";
import { Sandbox } from "./sandbox.ts";

/** The determinism seams every instance's realm binds (the guest's ONLY clock/entropy/id — `test-determinism`).
 *  Injected at compose (production wall-clock/PRNG; a frozen clock in tests). */
export interface PluginHostSeamDeps {
  readonly nowEpochMs: () => number;
  readonly nextRandom: () => number;
  readonly mintId: () => string;
}

/** The createInstance input (structurally the domain's `CreateInstanceInput` — compose bridges the type). The
 *  manifest is already validated/persisted; the runtime consumes `mainJs` + the membrane wiring the domain
 *  built (grants + the pre-gated bridge). `chat` is the activation-run scope (`null` for an installed plugin —
 *  its `main.js` registers handlers, it does not operate on a chat; set for a snippet's single run). */
export interface CreateInstanceInputIn {
  readonly mainJs: string;
  readonly grants: readonly PluginCapability[];
  readonly bridge: PluginBridge;
  readonly chat: InvocationChat | null;
  /** The manifest's declared `net.fetch` allowlist (plain-string DATA the domain forwards from the validated
   *  manifest) — the SSRF wall for `net.fetch`. Omitted ⇒ `[]` (fail-closed: no host reachable). NEVER
   *  guest-supplied, NEVER `ANY_HOST`. */
  readonly netHosts?: readonly string[];
  /** Per-instance DoS budgets (the domain leaves them absent → the shared defaults). `settleGraceMs` is the
   *  grace above `cpuDeadlineMs` before an invocation is force-ENDED in real time; absent ⇒
   *  `HOST_FN_DEADLINE_MS`. */
  readonly budgets?: { readonly cpuDeadlineMs: number; readonly memoryLimitBytes: number; readonly settleGraceMs?: number };
  /** The tag every guest log line carries into the CENTRAL pino stream (`{ plugin: label }`) — plain-string
   *  DATA the domain forwards from the re-validated manifest (its slug; the `netHosts` posture — never
   *  guest-supplied). Absent ⇒ no mirror at all (a snippet has no manifest and its lines go back to the caller);
   *  a label is never invented here. */
  readonly label?: string;
}

/** One log line as the domain reads it (structurally the domain's `PluginLogView`). */
interface PluginLogLineOut {
  readonly level: PluginLogLevel;
  readonly message: string;
  readonly at: number;
}

type CreateInstanceOutcomeOut =
  | { readonly ok: true; readonly instance: PluginInstance }
  | { readonly ok: false; readonly error: string; readonly log: readonly PluginLogLineOut[] };

/** Parse a `[level] message` ring line back into a structured log view; the stamp is the activation clock. */
const LOG_LINE_RE = /^\[(info|warn|error)\]\s(.*)$/su;
function toLog(lines: readonly string[], at: number): PluginLogLineOut[] {
  return lines.map((line) => {
    const match = LOG_LINE_RE.exec(line);
    const level = (match?.[1] ?? "info") as PluginLogLevel;
    return { level, message: match?.[2] ?? line, at };
  });
}

// PER-INSTANCE invoke SERIALIZATION (the untrusted-guest concurrency belt — closes a real race, not a phantom).
// One resident sandbox is a SINGLE shared QuickJSContext per plugin instance: the invocation-chat scope, the
// guest heap, and the host-call in-flight counter are ALL shared per instance. `invoke` mutates the shared
// scope (`setInvocationChat`) and then AWAITS into the guest — so two concurrent `invoke`s on the SAME resident
// interleave: A sets chatA and awaits, B then sets chatB while A's guest is mid-flight, and when A resumes and
// reads `chat.current()` (via the membrane's `resolveChat`) it sees chatB — corrupting BOTH `chatId` AND
// `automationDepth`. A clobbered `automationDepth` breaks the loop-prevention belt: a `chat.requestTurn` from an
// event handler stamps `depth+1` (membrane.ts requestTurn), so a corrupted depth lets a plugin launder an
// event→turn→event cascade past `AUTOMATION_DEPTH_HARD_CAP` on an UNTRUSTED boundary (cascade containment is the
// stake). REACHABLE: a single turn bursts several bus events → concurrent `fanOutToPluginSubscribers` →
// concurrent `sub.deliver` on the SAME subscriber → concurrent `invoke` on the SAME resident. All three invoke
// callers (tool-use, the D50 transform apply, the event fan-out) share the ONE resident sandbox, so ONE queue
// per instance is the single correct home. `runSnippet` (fresh disposed sandbox per call) + `createInstance`
// (activation, once) never share a resident, so they need no serialization.
//
// WHAT MAKES THE QUEUE ADVANCE (corrected — the earlier "each item rides cpuDeadlineMs" was FALSE): the
// interrupt handler preempts guest BYTECODE only, so a handler returning `new Promise(() => {})` never
// deadlined — `invokeHandler` never settled, `queueDepth` never decremented, and after EVENT_QUEUE_DEPTH such
// invokes the instance refused everything FOREVER while the row still said `enabled`. The bound that actually
// holds is the Sandbox's INVOCATION SETTLEMENT deadline (`cpuDeadlineMs + settleGraceMs`), which ends a hung
// invocation as `ok:false` → this `run` rejects → the `.finally` arms below advance the tail and decrement.
//
// The queue is a per-instance tail-promise chain: each invoke's `setInvocationChat`→`invokeHandler` pair runs
// to completion (fulfilment OR rejection OR deadline) before the next invoke on the SAME instance begins, so the
// shared scope is never mutated under a mid-flight guest. The chain advances in a `.finally` on both settle
// arms, so a rejected/deadlined invoke cannot wedge the tail (each item is bounded by `invokeHandler`'s
// SETTLEMENT deadline, so a hung guest ENDS and the queue advances). BOUNDED (a DoS
// backstop): at most `EVENT_QUEUE_DEPTH` invokes may be pending (queued or running) per instance — a hostile
// flood of concurrent deliveries must not unbounded-queue and pin the sandbox forever. The N+1 invoke is REFUSED
// with a CONTAINED typed error (never a process abort): the fire-and-forget `deliver` swallows it (the fan-out's
// `deliverIfVisible` try/catch is self-safe), and a tool/transform invoke that overflows surfaces the same
// contained error the registrar's run() already catches as `threw` (errors-as-data to the model).
interface Resident {
  readonly sandbox: Sandbox;
  /** Release the process-wide resident admission exactly once, after this sandbox is torn down. */
  readonly releaseAdmission: () => void;
  /** The RUNTIME log ring — the activation drain PLUS every later invocation's drain, oldest-first, bounded by
   *  `PLUGIN_LOG_RING_LINES` / `PLUGIN_LOG_RING_CHARS` and evicted from the FRONT. It is what `readLog` (and so
   *  `getPluginLog`) answers with, so a host can see what a plugin DID rather than only its activation banner.
   *  Before this it was a snapshot taken once at activation and every per-invocation drain was discarded.
   *  MUTABLE by construction; `readLog` hands back a COPY so a later invoke cannot mutate a prior read.
   *  IN-MEMORY, per instance, `ASSUMES(single-replica)` — see `PLUGIN_LOG_RING_LINES` for the honest posture. */
  readonly log: PluginLogLineOut[];
  /** Retained UTF-16 code units across `log` — the volume half of the ring bound (a line bound alone lets
   *  16 KiB single-liners sit forever; the per-invocation `LogRing` clamp is what keeps ONE line under it). */
  chars: number;
  /** The per-instance invoke tail — the settle of the LAST-queued invoke's scope-set→run pair. The next invoke
   *  chains after it (serialized). Advances on fulfilment AND rejection (a rejected item never wedges the tail).
   *  MUTABLE: each `invoke` reassigns it to its own settle. */
  tail: Promise<void>;
  /** Invokes currently pending (queued OR running) on this instance. The `EVENT_QUEUE_DEPTH` overflow gate reads
   *  it BEFORE chaining; each invoke decrements it in the same `.finally` that advances the tail. */
  queueDepth: number;
  /** Set before deactivation aborts current work. Already-queued invokes see it and refuse before touching the
   *  shared realm; the final queue tail owns deferred teardown + admission release. */
  disposing: boolean;
}

/** A process-wide context-admission counter, shared even if a test or future composition accidentally
 *  constructs more than one host facade. The reservation is taken BEFORE the first await of the path that
 *  mints the context, so simultaneous callers cannot all observe spare capacity and oversubscribe. Returns
 *  the RELEASE (idempotent — a double release must not hand a neighbour a free slot), or `null` when the
 *  pool is exhausted. */
function createAdmission(max: number): () => (() => void) | null {
  let inUse = 0;
  return (): (() => void) | null => {
    if (inUse >= max) {
      return null;
    }
    inUse += 1;
    let released = false;
    return (): void => {
      if (released) {
        return;
      }
      released = true;
      inUse -= 1;
    };
  };
}

/** The RESIDENT pool — held for an instance's whole enabled lifetime, released on activation failure or
 *  teardown. Reserved before the first await in `createInstance` (see above). */
const acquireResidentAdmission = createAdmission(PLUGIN_RESIDENT_RUNTIME_MAX);

/** The TRANSIENT snippet pool — one lease per `runSnippet` call, released after that call's sandbox is torn
 *  down. SEPARATE from the resident pool by design: the two lease lifetimes are incomparable, and sharing a
 *  counter would let long-lived residents starve the console permanently (`PLUGIN_SNIPPET_RUNTIME_MAX`). */
const acquireSnippetAdmission = createAdmission(PLUGIN_SNIPPET_RUNTIME_MAX);

/** Retire a sandbox that failed after it began activation. Guest failure ends the eval, not necessarily the
 *  host work it started: a fire-and-forget transactional write may ignore cancellation and remain in progress.
 *  Keep process admission owned until every actual host implementation settles, then tear down and release. */
async function retireFailedActivation(sandbox: Sandbox, releaseAdmission: () => void): Promise<void> {
  sandbox.cancelHostOperations();
  try {
    await sandbox.settleHostOperations();
  } finally {
    try {
      sandbox.dispose();
    } finally {
      releaseAdmission();
    }
  }
}

/** Append one invocation's drained log lines to a resident's runtime ring, then evict from the FRONT until both
 *  bounds hold again. Oldest-first eviction is the honest choice for "what did it just do?": the newest line is
 *  always present, and an activation banner is the first thing a busy plugin loses. Termination: every iteration
 *  removes one element and the loop is guarded on non-emptiness, so a single line larger than the whole char
 *  budget would empty the ring rather than spin (unreachable in practice — `LogRing` clamps one line to 16 KiB,
 *  well under `PLUGIN_LOG_RING_CHARS`). */
function retainLog(resident: Resident, lines: readonly string[], at: number): void {
  for (const line of toLog(lines, at)) {
    resident.log.push(line);
    resident.chars += line.message.length;
  }
  while (resident.log.length > 0 && (resident.log.length > PLUGIN_LOG_RING_LINES || resident.chars > PLUGIN_LOG_RING_CHARS)) {
    const evicted = resident.log.shift();
    resident.chars -= evicted === undefined ? 0 : evicted.message.length;
  }
}

/** The inline-snippet run's outcome — a transient one-shot, no residency: the drained `[level] msg` log
 *  lines + an `error` iff the snippet threw / hit its 5 s wall. `errorKind`/`errorLine` mirror
 *  `GuestError.line` + the `SyntaxError`-caught-before-any-execution distinction (see `SnippetResult`
 *  for the full "didn't run vs ran empty" rationale). Structurally the domain's `SnippetResult`. */
interface SnippetRunOut {
  readonly logLines: readonly string[];
  readonly error?: string;
  readonly errorKind?: "parse" | "runtime";
  readonly errorLine?: number;
}

/** The push-time tap into the ONE pino stream (file log + the `/api/_debug/logs` ring) for a labelled instance:
 *  the guest's `info`/`warn`/`error` are pino's own level names, so the line lands at the level the guest chose,
 *  tagged `plugin` for `?q=` filtering. `getLog()` resolves the request-scoped child when the push happens inside
 *  a request (a tool call) and the base logger when it happens in a detached pump (a float) — both the same
 *  stream. */
function centralLogMirror(label: string): LogMirror {
  return {
    mirror: (level, message): void => {
      getLog()[level]({ plugin: label }, message);
    },
  };
}

/** The `Sandbox.create` options for a RESIDENT instance: the membrane wiring, the optional budget override, and
 *  the central-log mirror iff the domain supplied a `label` (absent ⇒ no mirror, never an invented tag). */
function residentSandboxOptions(input: CreateInstanceInputIn, grants: ReadonlySet<PluginCapability>): Parameters<typeof Sandbox.create>[1] {
  return {
    membrane: { grants, bridge: input.bridge, netHosts: input.netHosts ?? [] },
    ...(input.budgets !== undefined ? { limits: input.budgets } : {}),
    ...(input.label !== undefined ? { logMirror: centralLogMirror(input.label) } : {}),
  };
}

/** Build the process runtime. One `QuickJSWASMModule` is shared (loaded lazily by `Sandbox.create`); each
 *  instance gets its own `QuickJSContext`. The returned shape is assigned to `PluginHostPort` at compose. */
export function createPluginHost(seams: PluginHostSeamDeps): {
  readonly createInstance: (input: CreateInstanceInputIn) => Promise<CreateInstanceOutcomeOut>;
  readonly invoke: (instance: PluginInstance, handler: PluginHandlerRef, argsJson: PluginInvokeArgs, chat?: InvocationChat | null) => Promise<string>;
  readonly runSnippet: (input: {
    readonly code: string;
    readonly grants: readonly PluginCapability[];
    readonly bridge: PluginBridge;
    readonly chat: InvocationChat;
  }) => Promise<SnippetRunOut>;
  readonly readLog: (instance: PluginInstance) => readonly PluginLogLineOut[];
  readonly dispose: (instance: PluginInstance) => void;
} {
  const runtimes = new Map<PluginInstance, Resident>();
  const hostSeams: HostSeams = { nowEpochMs: seams.nowEpochMs, nextRandom: seams.nextRandom, mintId: seams.mintId };

  return {
    createInstance: async (input): Promise<CreateInstanceOutcomeOut> => {
      const releaseAdmission = acquireResidentAdmission();
      if (releaseAdmission === null) {
        return {
          ok: false,
          error: `plugin host: resident runtime capacity (${PLUGIN_RESIDENT_RUNTIME_MAX}) exhausted — activation refused`,
          log: [],
        };
      }
      let sandbox: Sandbox | undefined;
      try {
        // Keep the WASM-module load failure surface here rather than mid-eval.
        await getPluginQuickJS();
        const grants = new Set(input.grants);
        sandbox = await Sandbox.create(hostSeams, residentSandboxOptions(input, grants));
        // The activation run's chat scope (the membrane resolves `current()` against it); `null` for an installed
        // plugin's registration-only `main.js`.
        sandbox.setInvocationChat(input.chat);
        const at = seams.nowEpochMs();
        const outcome = await sandbox.evalGuest(input.mainJs);
        if (!outcome.ok) {
          const failedSandbox = sandbox;
          sandbox = undefined;
          await retireFailedActivation(failedSandbox, releaseAdmission);
          return { ok: false, error: outcome.error?.message ?? "activation failed", log: toLog(outcome.logs, at) };
        }
        // The collected tool + transform + event registrations — the domain hands each to its runtime
        // registrar (tools → tool-use registry; transforms → the shared prompt-transform registry, band-assigned
        // domain-side; events → the automation plugin-subscriber fan-out).
        const instance: PluginInstance = {
          tools: [...sandbox.collectedTools],
          transforms: [...sandbox.collectedTransforms],
          events: [...sandbox.collectedEvents],
          pubsub: [...sandbox.collectedPubsub],
          surfaces: [...sandbox.collectedSurfaces],
          commands: [...sandbox.collectedCommands],
          displayTransforms: [...sandbox.collectedDisplayTransforms],
          macros: [...sandbox.collectedMacros],
        };
        const resident: Resident = { sandbox, releaseAdmission, log: [], chars: 0, tail: Promise.resolve(), queueDepth: 0, disposing: false };
        retainLog(resident, outcome.logs, at);
        runtimes.set(instance, resident);
        return { ok: true, instance };
      } catch (error) {
        if (sandbox === undefined) {
          releaseAdmission();
        } else {
          await retireFailedActivation(sandbox, releaseAdmission);
        }
        throw error;
      }
    },

    invoke: async (instance, handler, argsJson, chat): Promise<string> => {
      const resident = runtimes.get(instance);
      if (resident === undefined) {
        throw new Error("plugin host: invoke on an unknown/disposed instance");
      }
      // BOUNDED FIFO overflow gate — read BEFORE chaining onto the tail (the flood backstop). A hostile burst of
      // concurrent deliveries must not unbounded-queue and pin the sandbox; the N+1 pending invoke is a CONTAINED
      // typed refusal (the fan-out's deliver swallows it; a tool/transform invoke surfaces it as `threw`).
      if (resident.queueDepth >= EVENT_QUEUE_DEPTH) {
        throw new Error(`plugin host: invoke queue full (>${EVENT_QUEUE_DEPTH} pending) — invocation refused`);
      }
      resident.queueDepth += 1;
      // Chain this invoke's scope-set→run pair AFTER the previous invoke settles, so `setInvocationChat` never
      // mutates the shared scope while a prior guest is mid-flight. `.then` runs the pair whether the prior invoke
      // FULFILLED or REJECTED (the tail catches its own rejection below, so a prior failure never poisons the
      // chain). The result promise this call returns is the run's own settle, NOT the shared tail.
      const run = resident.tail.then(async (): Promise<string> => {
        if (resident.disposing) {
          throw new Error("plugin host: invocation refused because the instance is disposing");
        }
        // The token is minted HERE, inside the serialized queue slot, and consumed on the very next line — so an
        // args builder always sees the handle of the scope this invoke just set, never a neighbour's (the
        // per-instance FIFO is what makes that true; see the SERIALIZATION note above).
        // RESIDUE FIRST (#806): whatever a floated continuation logged since the last pickup is retained BEFORE
        // this invocation runs, so it reads in push order ahead of this run's own lines instead of being lost.
        // Inside the serialized slot on purpose — the same ring the guest is about to push into.
        retainLog(resident, resident.sandbox.drainLog(), seams.nowEpochMs());
        const chatHandle = resident.sandbox.setInvocationChat(chat ?? null);
        const outcome = await resident.sandbox.invokeHandler(handler, typeof argsJson === "string" ? argsJson : argsJson(chatHandle));
        // RETAIN this invocation's drained lines (both arms — a crashing handler's last words are the ones an
        // operator most wants). The stamp is the injected clock at drain time, the same seam activation uses.
        retainLog(resident, outcome.logs, seams.nowEpochMs());
        if (!outcome.ok) {
          // A handler throw/deadline is contained data; the domain's crash policy classifies it. Re-throw
          // so the registrar's run() catches it as `threw` (errors-as-data to the model).
          throw new Error(outcome.error?.message ?? "plugin handler failed");
        }
        return outcome.value ?? "";
      });
      // Advance the tail on BOTH settle arms (a rejected/deadlined invoke cannot wedge the chain). The tail is a
      // `void`-typed barrier that never rejects — it swallows this run's outcome so the NEXT invoke's `.then`
      // always fires; the caller's own `run` promise still carries the real result/rejection.
      // @orb-waive caught-failure-ownership(run): the comment above is the contract — the tail is a `void`-typed BARRIER that must never reject, or one deadlined invoke wedges the chain for every later one. Both arms do the identical bookkeeping on purpose, and the caller still gets the real outcome from `return await run` on the next line. Ends if the tail becomes the only reader of `run`.
      resident.tail = run.then(
        () => {
          resident.queueDepth -= 1;
        },
        () => {
          resident.queueDepth -= 1;
        },
      );
      return await run;
    },

    runSnippet: async (input): Promise<SnippetRunOut> => {
      // A transient one-shot: fresh instance, the 5 s snippet wall, run once as the caller, dispose —
      // NEVER resident (no registry entry, no `invoke` reachable after). `events`/`tools`/`transforms`
      // registration is refused by the SAME capability gate (the snippet profile omits those grants).
      // PROCESS ADMISSION FIRST — before the WASM module load and before any context is minted. A snippet
      // mints the same 32 MiB context an activation does, and the domain's `SnippetGate` bounds one USER's
      // concurrency, not the process's: without this lease, N members multiplied straight through the
      // ceiling `createInstance` holds. Its own pool, never the residents' — see `PLUGIN_SNIPPET_RUNTIME_MAX`.
      const releaseAdmission = acquireSnippetAdmission();
      if (releaseAdmission === null) {
        // A THROW, not a `SnippetRunOut`: the run never started, and every field of that shape (`logLines`,
        // `errorKind: parse|runtime`) is a statement about a run that DID. `DomainConflictError` maps to
        // CONFLICT at the transport ladder — the same retryable-the-moment-a-slot-frees class the domain's
        // per-user `PluginSnippetBusyError` already uses, so the console surfaces it through the path it
        // already has. `@orb/kit` is DOWN the cake; infra names no domain here.
        throw new DomainConflictError(`the plugin host is running its maximum of ${PLUGIN_SNIPPET_RUNTIME_MAX} snippets — wait a moment and run it again`);
      }
      try {
        await getPluginQuickJS();
        // SCOPE-OWNED (`using`): a snippet sandbox is never resident, so its teardown IS "end of this block" —
        // the Sandbox's `[Symbol.dispose]` is the `finally` that used to be here. It also now covers the
        // previously UNCOVERED window between create and the `try` (`setInvocationChat` throwing leaked the
        // whole context). The admission release sits in the `finally` of the ENCLOSING try on purpose: a
        // `using` disposes at the end of ITS block, which is this `try`, so the lease is returned strictly
        // AFTER the context it accounts for is gone — never while a torn-down-but-not-yet-freed one lingers.
        using sandbox = await Sandbox.create(hostSeams, {
          // A snippet has no manifest → no declared net hosts (its profile also omits net.fetch); `[]` fail-closes.
          membrane: { grants: new Set(input.grants), bridge: input.bridge, netHosts: [] },
          limits: { cpuDeadlineMs: SNIPPET_WALL_MS, memoryLimitBytes: PLUGIN_MEMORY_LIMIT_BYTES },
        });
        sandbox.setInvocationChat(input.chat);
        const outcome = await sandbox.evalGuest(input.code);
        if (outcome.ok) {
          return { logLines: outcome.logs };
        }
        // A "parse" outcome means the guest source never started executing — a QuickJS `SyntaxError` caught
        // synchronously before the first job pump (`Sandbox.runToSettlement`'s `result.error` branch). Anything
        // else threw or hit the wall MID-run, which is a genuinely different fact for the console to report.
        const errorKind: "parse" | "runtime" = outcome.error?.name === "SyntaxError" ? "parse" : "runtime";
        return {
          logLines: outcome.logs,
          error: outcome.error?.message ?? "snippet failed",
          errorKind,
          ...(outcome.error?.line === undefined ? {} : { errorLine: outcome.error.line }),
        };
      } finally {
        releaseAdmission();
      }
    },

    // A COPY, not the live ring: the ring is mutated by every later invoke, and a caller holding the array
    // would silently watch its "snapshot" change under it (the domain's `getPluginLog` slices this result).
    // The residue pickup FIRST (#806): the lines a float logged since the last pickup are retained here, so the
    // read surfaces them with no later invocation needed. Stamped at pickup (the ring's `at` was always the
    // drain clock, never the push clock — unchanged posture). A read racing a mid-flight invocation may retain
    // that invocation's so-far lines itself; its outcome then carries only the rest — same resident ring either
    // way, no loss and no duplication (drains are synchronous and destructive).
    readLog: (instance): readonly PluginLogLineOut[] => {
      const resident = runtimes.get(instance);
      if (resident === undefined) {
        return [];
      }
      retainLog(resident, resident.sandbox.drainLog(), seams.nowEpochMs());
      return [...resident.log];
    },

    dispose: (instance): void => {
      const resident = runtimes.get(instance);
      if (resident === undefined) {
        return;
      }
      resident.disposing = true;
      runtimes.delete(instance);
      resident.sandbox.cancelHostOperations();
      const finish = (): void => {
        try {
          resident.sandbox.dispose();
        } finally {
          resident.releaseAdmission();
        }
      };
      if (resident.queueDepth === 0 && resident.sandbox.pendingHostOperations === 0) {
        finish();
        return;
      }
      // Do not tear QuickJS down underneath an active `resolvePromise`: cancellation lets the running invoke
      // reject through the normal guest-promise path, queued invokes refuse on `disposing`, then the final tail
      // releases the context and admission. The detached join is supervised so cleanup failure is observable.
      superviseDetached(`plugin-host:dispose:${randomUUID()}`, "plugin.host.dispose", {}, () =>
        // `.finally(finish)` runs cleanup on BOTH settle arms (exactly once — teardown always happens) AND
        // propagates a `settleHostOperations()` rejection through to `superviseDetached`, so a real cleanup
        // failure reaches the trace/log sink. `.then(finish, finish)` would swallow the rejection (finish
        // returns void, resolving the supervised promise), making the "cleanup failure is observable" claim above
        // false.
        resident.tail.then(() => resident.sandbox.settleHostOperations()).finally(finish),
      );
    },
  };
}
