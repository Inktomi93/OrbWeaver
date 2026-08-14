// infra/plugin-host/port — the sandbox-runtime seam impl (`PluginHostPort`). `createPluginHost` returns the
// runtime the composition root injects UP into `domain/plugin`: boot a guest + install the membrane,
// run `main.js` under the invocation budget, collect its tool registrations, keep the instance RESIDENT, invoke
// a collected handler under the per-invocation budget, snapshot the log, tear it down. Infra imports ZERO domain
// (plugin-no-ambient): the returned object is STRUCTURALLY the domain's `PluginHostPort` (compose does the typed
// assignment) and names only `@orb/contracts` + the local skeleton.
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

import type { InvocationChat, PluginBridge, PluginCapability, PluginHandlerRef, PluginInstance, PluginLogLevel } from "@orb/contracts/plugin";
import { EVENT_QUEUE_DEPTH, PLUGIN_MEMORY_LIMIT_BYTES, SNIPPET_WALL_MS } from "./budgets.ts";
import { getPluginQuickJS } from "./module.ts";
import type { HostSeams } from "./realm.ts";
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
  readonly budgets?: { readonly cpuDeadlineMs: number; readonly memoryLimitBytes: number };
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
// guest heap, and the per-invocation in-flight counter are ALL shared per instance. `invoke` mutates the shared
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
// The queue is a per-instance tail-promise chain: each invoke's `setInvocationChat`→`invokeHandler` pair runs
// to completion (fulfilment OR rejection OR deadline) before the next invoke on the SAME instance begins, so the
// shared scope is never mutated under a mid-flight guest. The chain advances in a `.finally` on both settle
// arms, so a rejected/deadlined invoke cannot wedge the tail (each item still carries the per-invoke
// `cpuDeadlineMs` inside `invokeHandler`, so a hung guest deadlines and the queue advances). BOUNDED (a DoS
// backstop): at most `EVENT_QUEUE_DEPTH` invokes may be pending (queued or running) per instance — a hostile
// flood of concurrent deliveries must not unbounded-queue and pin the sandbox forever. The N+1 invoke is REFUSED
// with a CONTAINED typed error (never a process abort): the fire-and-forget `deliver` swallows it (the fan-out's
// `deliverIfVisible` try/catch is self-safe), and a tool/transform invoke that overflows surfaces the same
// contained error the registrar's run() already catches as `threw` (errors-as-data to the model).
interface Resident {
  readonly sandbox: Sandbox;
  readonly log: readonly PluginLogLineOut[];
  /** The per-instance invoke tail — the settle of the LAST-queued invoke's scope-set→run pair. The next invoke
   *  chains after it (serialized). Advances on fulfilment AND rejection (a rejected item never wedges the tail).
   *  MUTABLE: each `invoke` reassigns it to its own settle. */
  tail: Promise<void>;
  /** Invokes currently pending (queued OR running) on this instance. The `EVENT_QUEUE_DEPTH` overflow gate reads
   *  it BEFORE chaining; each invoke decrements it in the same `.finally` that advances the tail. */
  queueDepth: number;
}

/** The inline-snippet run's outcome — a transient one-shot, no residency: the drained `[level] msg` log
 *  lines + an `error` iff the snippet threw / hit its 5 s wall. Structurally the domain's `SnippetResult`. */
interface SnippetRunOut {
  readonly logLines: readonly string[];
  readonly error?: string;
}

/** Build the process runtime. One `QuickJSWASMModule` is shared (loaded lazily by `Sandbox.create`); each
 *  instance gets its own `QuickJSContext`. The returned shape is assigned to `PluginHostPort` at compose. */
export function createPluginHost(seams: PluginHostSeamDeps): {
  readonly createInstance: (input: CreateInstanceInputIn) => Promise<CreateInstanceOutcomeOut>;
  readonly invoke: (instance: PluginInstance, handler: PluginHandlerRef, argsJson: string, chat?: InvocationChat | null) => Promise<string>;
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
      // Keep the WASM-module load failure surface here rather than mid-eval.
      await getPluginQuickJS();
      const grants = new Set(input.grants);
      const sandbox = await Sandbox.create(hostSeams, {
        membrane: { grants, bridge: input.bridge, netHosts: input.netHosts ?? [] },
        ...(input.budgets !== undefined ? { limits: input.budgets } : {}),
      });
      // The activation run's chat scope (the membrane resolves `current()` against it); `null` for an installed
      // plugin's registration-only `main.js`.
      sandbox.setInvocationChat(input.chat);
      const at = seams.nowEpochMs();
      const outcome = await sandbox.evalGuest(input.mainJs);
      if (!outcome.ok) {
        sandbox.dispose();
        return { ok: false, error: outcome.error?.message ?? "activation failed", log: toLog(outcome.logs, at) };
      }
      // The collected tool + transform + event registrations — the domain hands each to its runtime
      // registrar (tools → tool-use registry; transforms → the shared prompt-transform registry, band-assigned
      // domain-side; events → the automation plugin-subscriber fan-out).
      const instance: PluginInstance = {
        tools: [...sandbox.collectedTools],
        transforms: [...sandbox.collectedTransforms],
        events: [...sandbox.collectedEvents],
      };
      runtimes.set(instance, { sandbox, log: toLog(outcome.logs, at), tail: Promise.resolve(), queueDepth: 0 });
      return { ok: true, instance };
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
        resident.sandbox.setInvocationChat(chat ?? null);
        const outcome = await resident.sandbox.invokeHandler(handler, argsJson);
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
      await getPluginQuickJS();
      // SCOPE-OWNED (`using`): a snippet sandbox is never resident, so its teardown IS "end of this call" — the
      // Sandbox's `[Symbol.dispose]` is the `finally` that used to be here. It also now covers the previously
      // UNCOVERED window between create and the `try` (`setInvocationChat` throwing leaked the whole context).
      using sandbox = await Sandbox.create(hostSeams, {
        // A snippet has no manifest → no declared net hosts (its profile also omits net.fetch); `[]` fail-closes.
        membrane: { grants: new Set(input.grants), bridge: input.bridge, netHosts: [] },
        limits: { cpuDeadlineMs: SNIPPET_WALL_MS, memoryLimitBytes: PLUGIN_MEMORY_LIMIT_BYTES },
      });
      sandbox.setInvocationChat(input.chat);
      const outcome = await sandbox.evalGuest(input.code);
      return outcome.ok ? { logLines: outcome.logs } : { logLines: outcome.logs, error: outcome.error?.message ?? "snippet failed" };
    },

    readLog: (instance): readonly PluginLogLineOut[] => runtimes.get(instance)?.log ?? [],

    dispose: (instance): void => {
      runtimes.get(instance)?.sandbox.dispose();
      runtimes.delete(instance);
    },
  };
}
