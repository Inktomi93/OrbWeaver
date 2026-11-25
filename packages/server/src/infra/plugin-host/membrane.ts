// infra/plugin-host/membrane — the capability-gated host-fn CALL surface. Attaches the
// gated namespaces onto the `orb.host(1)` surface the determinism floor already built (realm.ts). Every gated
// function is bound host-side through ONE async bridge: guest args cross through `marshal.ts` (JSON-safe only), the
// injected `PluginBridge` op runs host-side under the installing/calling principal (the DOMAIN gated the
// invocation-chat-context + folded host-authority into `grants` BEFORE this runtime ever runs — infra never
// sees a Principal or a roster), and the JSON-safe result crosses back through `marshal.ts` too. The bridge is
// authority-AGNOSTIC by construction: it only ever receives an already-admitted `ChatId`.
//
// The three enforcement mechanisms this file owns (04 §P4):
//   1. capability gate — a function whose `PluginCapability` is not in `grants` REJECTS (the guest sees a
//      thrown `PluginCapabilityError`); uniform, so a guest feature-detects via try/catch or `host.grants`.
//   2. opaque handle — `chat.current()` returns the ONE host-minted token for the admitted invocation chat;
//      every chat function validates its handle arg against that token, so a forged/stale handle fails
//      resolution (no read) rather than reaching a different chat.
//   3. self-bound — each host call races a real-time deadline and caps its
//      serialized result AND its guest-supplied ARGUMENTS (`HOST_FN_ARGS_MAX_BYTES` — the inbound mirror; the
//      only prior bound on an argument was the 32 MiB instance heap, retained per call across the ≤32 ceiling);
//      ≤ 32 concurrent host calls per INSTANCE (the reentrancy footgun, 03 §3) — counted over
//      STARTED-AND-UNSETTLED host work, which is what makes the cap a bound on work rather than on promises.
// `tests/server/infra/plugin-host/membrane.int.test.ts` drives each through a real guest: the refused grant, a
// fabricated, raw-id and ended-invocation handle, the inbound argument budget, the deadline, the result cap, the
// in-flight cap and each string argument's refusal of a non-string.

import { randomUUID } from "node:crypto";
import type { ChatTriggerType, DomainTriggerType } from "@orb/contracts/automation";
import { CHAT_TRIGGER_TYPES, DOMAIN_TRIGGER_TYPES, GLOBAL_VARIABLE_KEY_MAX_CHARS, GLOBAL_VARIABLE_VALUE_MAX_BYTES } from "@orb/contracts/automation";
import type { VariablePrecondition } from "@orb/contracts/chat";
import { variablePreconditionsSchema } from "@orb/contracts/chat";
import type { GenerateImageActionArgs } from "@orb/contracts/imagery";
import { generateImageActionArgsSchema } from "@orb/contracts/imagery";
import type { PluginNotificationRecipient } from "@orb/contracts/notifications";
import { PLUGIN_NOTIFICATION_RECIPIENTS } from "@orb/contracts/notifications";
import type {
  HostFunctionRef,
  InvocationChat,
  PluginBridge,
  PluginCapability,
  PluginCommandRegistrationMeta,
  PluginFrameBody,
  PluginInvocationLiveness,
  PluginQuietOptions,
  PluginQuietSchema,
  PluginSuggestedAct,
  PluginSurfaceRegistrationMeta,
  PluginToastLevel,
  PluginToolRegistration,
  PluginTransformRegistration,
  PluginWorldEntryUpsert,
} from "@orb/contracts/plugin";
import {
  HOST_FUNCTION_CAPABILITY,
  PLUGIN_CARD_DATA_FIND_MAX,
  PLUGIN_FRAME_SURFACES_MAX,
  PLUGIN_KV_KEY_MAX_CHARS,
  PLUGIN_KV_VALUE_MAX_BYTES,
  PLUGIN_PUBSUB_NAME_RE,
  PLUGIN_PUBSUB_SUBSCRIPTIONS_MAX,
  PLUGIN_QUIET_IMAGES_MAX,
  PLUGIN_SEARCH_RESULTS_MAX,
  PLUGIN_SURFACE_ID_RE,
  PLUGIN_TIER_REGISTRAR,
  PLUGIN_TOAST_LEVELS,
  PLUGIN_TOOL_NAME_RE,
  PluginCapabilityError,
  PluginHostDeadlineError,
  PluginSuggestedError,
  pluginCommandRegistrationMetaSchema,
  pluginFrameBodySchema,
  pluginSlugSchema,
  pluginSurfaceRegistrationMetaSchema,
  pluginWorldEntryUpsertSchema,
} from "@orb/contracts/plugin";
import { isPlainObject } from "@orb/kit/guards";
import type { CharacterId, SandboxWireId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { QuickJSContext, QuickJSDeferredPromise, QuickJSHandle } from "quickjs-emscripten-core";
import { z } from "zod";
import type { Logger } from "#src/foundation/observability/contract/logging.ts";
import { createDetachedSupervision } from "#src/foundation/observability/tracing.ts";
import {
  HOST_CALLS_IN_FLIGHT_MAX,
  HOST_FN_ARGS_IN_FLIGHT_MAX_BYTES,
  HOST_FN_ARGS_MAX_BYTES,
  HOST_FN_DEADLINE_MS,
  HOST_FN_RESULT_CAP_BYTES,
  PLUGIN_COMMANDS_MAX,
  PLUGIN_QUIET_PROMPT_MAX_CHARS,
  PLUGIN_SURFACES_MAX,
  PLUGIN_TOOL_DESCRIPTION_MAX_CHARS,
  PLUGIN_TOOL_PARAMETERS_MAX_BYTES,
  PLUGIN_TOOLS_MAX,
} from "./budgets.ts";
import type { PluginNetEgress } from "./contract/net-egress.ts";
import type { LocalPluginHostSeams } from "./contract/port.ts";
import { pumpGuestJobs, settleInCpuWindow } from "./cpu-guard.ts";
import type { GuestMarshal, ReadAllowance } from "./marshal.ts";
import { GuestCallFailure, guestJson } from "./marshal.ts";

/** The per-instance concurrent-host-call counter (back-pressure). Lives on the Sandbox (one per context) and is
 *  NEVER reset — it counts host-fn IMPLEMENTATIONS that have STARTED and not yet SETTLED, which is the only
 *  reading under which "≤32 concurrent host calls" is a bound on WORK rather than on promises.
 *
 *  WHY NOT PER-INVOCATION (measured). Two facts make an invocation-scoped counter a
 *  lie: (1) not every domain write can cooperatively cancel — the deadline signals every call, but an impl that
 *  ignores it keeps running host-side, so releasing its slot when the RACE settles would admit 32 fresh
 *  installer-funded calls every `HOST_FN_DEADLINE_MS`, unbounded; and (2) a
 *  reset at invocation start let stragglers from an ENDED invocation decrement a counter the NEXT invocation had
 *  already zeroed, drifting it NEGATIVE (measured: 36 of 40 burst calls admitted against a cap of 32). So the
 *  slot is acquired when the impl starts and released when the IMPL settles, once, and no reset exists.
 *
 *  THE ACCEPTED COST, stated: a bridge op that NEVER settles permanently costs the instance one slot, and 32 of
 *  them wedge that plugin's host calls. That is fail-CLOSED and self-inflicted (the ops are OUR domain code, not
 *  guest-reachable), and it is the direction to fail in — the alternative it replaces failed OPEN. */
export interface InFlightCounter {
  count: number;
  /** The argument bytes the running host work holds, under {@link HOST_FN_ARGS_IN_FLIGHT_MAX_BYTES}. */
  argBytes: number;
  /** Cooperative cancellations for host work that is still running. The Sandbox aborts the set on teardown;
   *  each operation removes its own controller only when the implementation actually settles. Optional only
   *  for direct membrane unit fixtures; every live Sandbox supplies it. */
  readonly controllers?: Set<AbortController>;
  /** Started host implementations as non-rejecting settlement barriers. Teardown joins these before releasing
   *  process admission, so a non-cancellable write remains owned even when it ignores the abort signal. */
  readonly settlements?: Set<Promise<void>>;
}

/** What the Sandbox exposes to the membrane: the granted capability set, the op bridge, the live
 *  invocation-chat accessor + its host-minted opaque token, the per-instance in-flight counter, and the tool
 *  collector (the resident-handler runtime — the Sandbox keeps the guest handler handle, the membrane hands it
 *  over). */
export interface MembraneRuntime {
  /** The Worker root's logger. */
  readonly log: Logger;
  /** The context's marshal; every guest argument and every value handed back crosses through it. */
  readonly marshal: GuestMarshal;
  readonly grants: ReadonlySet<PluginCapability>;
  readonly bridge: PluginBridge;
  readonly currentChat: () => InvocationChat | null;
  /** How many cascade levels deep the command whose host call this is runs, read from that command's own authority, so a
   *  continuation that runs after a later invocation began still answers for its own command. */
  readonly currentCascadeDepth: LocalPluginHostSeams["currentCascadeDepth"];
  readonly currentToken: () => string | null;
  readonly inFlight: InFlightCounter;
  /** Host-call deferreds still in flight (registered on create, deregistered on settle). The Sandbox drains any
   *  remainder before `ctx.dispose()` — an unsettled guest Promise at teardown aborts `JS_FreeRuntime`.
   *
   *  STANDING INVARIANT (the must-drain rule): EVERY host-created guest Promise that can
   *  still be UNSETTLED when its invocation ends MUST be registered here on creation and deregistered on settle,
   *  so the dispose-drain frees it (fire a host call, never await it, end the invocation = a guest-REACHABLE host
   *  crash otherwise). Today `attachAsync` below is the ONLY live constructor of such a promise and it obeys this
   *  (the cap-reject arm settles synchronously, so it deliberately does NOT register). A NEW async host-fn that
   *  calls `ctx.newPromise()` without threading `pending` is the bug this invariant exists to catch. No test
   *  drives a multi-pending dispose drain, and no static check can follow the dataflow; review owns it. */
  readonly pending: Set<QuickJSDeferredPromise>;
  readonly collectTool: (reg: Omit<PluginToolRegistration, "handler">, handler: QuickJSHandle) => void;
  /** Collect a D50 transform registration — the SYNC activation-time mirror of `collectTool`. The
   *  Sandbox keeps the guest `apply` HANDLE alive (keyed by a minted ref) + records a
   *  `PluginTransformRegistration` on the instance. The DOMAIN wires each into the shared prompt-transform
   *  registry at activation (`registerTransform`): it assigns the plugin ORDER BAND (1000+, ABOVE the 0–999
   *  automation band), builds the `PromptTransform` whose `apply` re-enters the guest under the invocation
   *  budget, and unregisters on deactivate. Infra cannot import that domain registry (the cake) — it only
   *  collects; the band + apply-under-budget + unregister live domain-side. */
  readonly collectTransform: (reg: { readonly name: string; readonly point: TransformPoint }, handler: QuickJSHandle) => void;
  /** Collect a DISPLAY transform registration (seam 14) — the sibling of `collectTransform`
   *  with NO external registrar: like a surface, it is read directly off the resident instance by the display
   *  round-trip verb and re-entered through the port's `invoke`. Infra only collects + keeps the handle alive. */
  readonly collectDisplayTransform: (reg: { readonly name: string }, handler: QuickJSHandle) => void;
  /** Collect a MACRO registration. Infra collects the guest-LOCAL name; the DOMAIN
   *  namespaces it `plugin_<slug'>_<name>` from the re-validated manifest at activation, for the same reason it
   *  namespaces a tool: the slug is host knowledge and a guest must not be able to name its own prefix. */
  readonly collectMacro: (reg: { readonly name: string; readonly description: string }, handler: QuickJSHandle) => void;
  /** Collect an event subscription — the SYNC activation-time mirror of `collectTool`. The guest
   *  `handler` HANDLE is kept alive (keyed by a minted ref) + a `PluginEventSubscription` is recorded on the
   *  instance. The DOMAIN wires each onto the automation plugin-subscriber fan-out at activation (`subscribeEvent`):
   *  it delivers matching TF-1-validated `TriggerFact`s (already depth/visibility/declared-gated on the automation
   *  side) into the guest handler under the invocation budget, and unregisters on deactivate. Infra only collects;
   *  the membrane never bypasses the automation-side delivery gates. `type` is validated to the closed Tier-1
   *  taxonomy at THIS boundary (a garbage type is refused at collection, never a dead subscription). */
  readonly collectEvent: (reg: { readonly type: ChatTriggerType | DomainTriggerType }, handler: QuickJSHandle) => void;
  /** Collect a PRIVATE plugin-event subscription (`host.pubsub.on`) — the `collectEvent`
   *  mirror, one plane over. The guest handler HANDLE is kept alive; the DOMAIN wires each onto the
   *  INSTALLER-scoped resident plugin-event bus at activation (`subscribePubsub`), never the automation fan-out.
   *  `emitterSlug`/`name` are validated to bounded grammars at THIS boundary (an unbounded coordinate is an
   *  unbounded bus-map key). */
  readonly collectPubsub: (reg: { readonly emitterSlug: string; readonly name: string }, handler: QuickJSHandle) => void;
  /** Collect a UI surface registration — the SYNC activation-time mirror of `collectTool`
   *  (U1, seam 4). `meta` is the ALREADY-VALIDATED serializable descriptor (`setUi` ran the zod schema — the host
   *  trust boundary); `onAction` is the guest handler HANDLE the Sandbox keeps alive keyed by a minted ref (`null`
   *  = a display-only surface). Unlike tools/transforms/events a surface needs NO external registrar: it is read
   *  directly off the resident instance by `plugin.listSurfaces` and re-entered by `plugin.invokeUiAction`. */
  readonly collectSurface: (
    ...args:
      | [meta: PluginSurfaceRegistrationMeta & { tier: Exclude<PluginSurfaceRegistrationMeta["tier"], "frame"> }, onAction: QuickJSHandle | null]
      | [meta: PluginSurfaceRegistrationMeta & { tier: "frame" }, onAction: null, frame: PluginFrameBody]
  ) => void;
  /** Collect a UI COMMAND registration — the `collectSurface` mirror. `meta` is
   *  the ALREADY-VALIDATED serializable descriptor; `onRun` is the guest handler HANDLE the Sandbox keeps alive
   *  keyed by a minted ref, and it is NON-NULL by construction (a command with nothing to run is a dead menu
   *  row, not a display-only affordance — the membrane refuses one softly before ever calling this). Like a
   *  surface, a command needs no external registrar: `plugin.listCommands` reads it off the resident instance
   *  and `plugin.invokeUiCommand` re-enters it. */
  readonly collectCommand: (meta: PluginCommandRegistrationMeta, onRun: QuickJSHandle) => void;
  /** Append a WARN line to the instance's log ring (drained into the invocation outcome / runtime ring). The ONE
   *  soft-diagnostic seam: `ui.register` uses it to record a refused surface WITHOUT throwing — an invalid surface
   *  spec must not be activation-fatal (a plugin's tools/chips outlive its stale panel). */
  readonly logWarn: (message: string) => void;
  /** Performs `net.fetch`/`net.fetchAsset` against the manifest `netHosts` wall. In the broker Worker it forwards
   *  to the app, which holds the network and its own copy of the allowlist; the membrane only gates the grant. */
  readonly netEgress: PluginNetEgress;
  /** What the instance holds through each capped registration door, built once per sandbox. Every `orb.host` call
   *  builds a fresh surface, so a count kept on the surface would reset for a guest that asks for a second one. */
  readonly holdings: MembraneHoldings;
}

/** The running count at each capped registration door, shared by every surface one sandbox builds. */
export interface MembraneHoldings {
  /** Distinct `ui.register` surface ids, because a repeated id replaces its surface and holds nothing more. */
  readonly surfaceIds: Set<string>;
  frames: number;
  commands: number;
  tools: number;
  subscriptions: number;
}

/** The two fixed points a D50 transform hooks — the ONE home is the contract's `PluginTransformRegistration`
 *  (derived, never re-spelled): `user_input` in SEND, `assembled_dynamic` at end of BUILD. */
type TransformPoint = PluginTransformRegistration["point"];

/** The closed Tier-1 trigger taxonomy (chat + domain buses) an `events.on` type must belong to — DERIVED
 *  from the automation contract's tuples (never re-spelled); plugins get no private event vocabulary. */
const TRIGGER_TYPES: ReadonlySet<string> = new Set([...CHAT_TRIGGER_TYPES, ...DOMAIN_TRIGGER_TYPES]);

/** The capability gate, DERIVED from the ONE contract map (`HOST_FUNCTION_CAPABILITY`) — the membrane reads the
 *  cap→fn lookup at runtime instead of hand-rolling it (derive-don't-redeclare). `ref` is a typed
 *  `HostFunctionRef` (`"namespace.method"`), so a wrong/renamed ref fails `tsc` against the surface AND the map
 *  stays the single source. Throws the TYPED `PluginCapabilityError` so its `.name` crosses the QuickJS boundary
 *  (a guest feature-detects by `e.name === "PluginCapabilityError"`, never a message substring). */
function requireCapability(runtime: MembraneRuntime, ref: HostFunctionRef): void {
  const capability = HOST_FUNCTION_CAPABILITY[ref];
  if (!runtime.grants.has(capability)) {
    throw new PluginCapabilityError(capability);
  }
}

/** The property name a host function is attached under: the last segment of its `namespace.method` ref. */
function hostFunctionName(ref: HostFunctionRef): string {
  return ref.slice(ref.lastIndexOf(".") + 1);
}

/** A guest argument the contract types as a string, refused at the door when it is anything else, with the plain
 *  refusal every other string argument here throws. Coercing it would hand the host a string the guest never passed
 *  (an array's join), and an array crosses the dump by a different path than a top-level string, so one key would
 *  reach the host differently depending on how the guest wrapped it. */
function stringArg(args: readonly unknown[], index: number, fn: HostFunctionRef, what: string): string {
  const value = args[index];
  if (typeof value !== "string") {
    throw new Error(`plugin host: ${fn} requires a ${what} string`);
  }
  return value;
}

/** Adapt the infra-owned AbortSignal to the isomorphic contracts seam. Already-aborted subscriptions fire
 *  synchronously so a provider call cannot slip through between the liveness check and listener install. */
function invocationLiveness(signal: AbortSignal): PluginInvocationLiveness {
  return {
    get aborted(): boolean {
      return signal.aborted;
    },
    onAbort: (listener): (() => void) => {
      if (signal.aborted) {
        listener();
        return (): void => undefined;
      }
      signal.addEventListener("abort", listener, { once: true });
      return (): void => signal.removeEventListener("abort", listener);
    },
  };
}

/** One async host-fn spec — bundled so `attachAsync` stays ≤ 4 params (the per-instance counter threads with
 *  the ref + impl). `ref` names the function and its capability; `attachAsync` refuses an ungranted call before
 *  it reads an argument, so the impl never re-checks it. */
interface AsyncFnSpec {
  readonly ref: HostFunctionRef;
  readonly grants: ReadonlySet<PluginCapability>;
  readonly inFlight: InFlightCounter;
  readonly pending: Set<QuickJSDeferredPromise>;
  readonly log: Logger;
  readonly marshal: GuestMarshal;
  readonly impl: (args: readonly unknown[], signal: AbortSignal) => Promise<unknown>;
  /** The most string, in UTF-16 units, the function's arguments can hold and still be served, when its store keeps
   *  less than {@link HOST_FN_ARGS_MAX_BYTES}: a longer call is refused before it is read. */
  readonly argUnitsMax?: number;
}

function commandHandler(ctx: QuickJSContext, onRun: QuickJSHandle, composerDraft: boolean): QuickJSHandle {
  if (!composerDraft) {
    return onRun;
  }
  // Validate the original guest type before the port's generic string/JSON serialization can erase it. Both steps
  // run in the realm, inside `registerCommand`; a realm failure goes back to the guest unchanged.
  const built = ctx.evalCode(`(handler => async input => {
    const result = await handler(input);
    if (typeof result !== "string") throw "plugin host: a composer draft command must return a string";
    return result;
  })`);
  if (built.error) {
    onRun.dispose();
    throw new GuestCallFailure(built.error);
  }
  using wrapper = built.value;
  const wrapped = ctx.callFunction(wrapper, ctx.undefined, onRun);
  onRun.dispose();
  if (wrapped.error) {
    throw new GuestCallFailure(wrapped.error);
  }
  return wrapped.value;
}

/** Attach every gated namespace onto the surface handle (mutates `surface`; the caller owns disposal of
 *  `surface`). The full set — chat.read (current/listMessages/getVariables), chat.variables.write,
 *  chat.surfaceQuickReply (chat.quick_reply — host-authority gated), worldInfo.upsertEntry,
 *  imagery.generatePicture, chat.requestTurn (turn.trigger — SPEND, host-authority + cascade-depth+1 gated),
 *  global_vars, storage.get/set/compareAndSet/delete/list (storage.kv — plugin-private KV), notifications.post (notify —
 *  participant-only durable notice), llm.quiet (SPEND — a non-canon generation on the installer's summarize
 *  connection, hourly-floored domain-side), tools.register, transforms.register + events.on (SYNC collect — the
 *  domain wires the band/apply/delivery/unregister), net.fetch (SSRF-guarded, manifest-allowlisted, hourly
 *  egress-floored domain-side). Every host fn is
 *  gated at the FUNCTION by its `PluginCapability`; the ops are composed DOMAIN-side (the bridge closes over the
 *  installer/pluginId) so the membrane stays authority-blind. `grants` is guest-readable data so a plugin can
 *  feature-detect. */
export function attachMembrane(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  setGrants(surface, runtime);
  setChat(ctx, surface, runtime);
  setWorldInfo(ctx, surface, runtime);
  setImagery(ctx, surface, runtime);
  setVariables(ctx, surface, runtime);
  setAssets(ctx, surface, runtime);
  setSearch(ctx, surface, runtime);
  setStorage(ctx, surface, runtime);
  setNotifications(ctx, surface, runtime);
  setLlm(ctx, surface, runtime);
  setDatabank(ctx, surface, runtime);
  setCharacter(ctx, surface, runtime);
  setTools(ctx, surface, runtime);
  setTransforms(ctx, surface, runtime);
  setMacros(ctx, surface, runtime);
  setEvents(ctx, surface, runtime);
  setPubsub(ctx, surface, runtime);
  setNet(ctx, surface, runtime);
  setUi(ctx, surface, runtime);
}

/** A guest argument read for a host function, or why it was refused unread. */
type ArgRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reason: string };

/** Why an argument the depth guard or the read refused crosses no further. */
const UNREADABLE_ARGUMENT = "too deeply nested or too large to read";

/** What one synchronous host call may copy out of the realm: the inbound cap every async call has too, so a
 *  registration past it is refused before it is read (`marshal.ts`). Every registration schema admits far less. */
function inboundAllowance(): ReadAllowance {
  return { units: HOST_FN_ARGS_MAX_BYTES };
}
const PROMISE_ARGUMENT = "a promise; pass the value it settles to";

/** The ONE guest-handle materialization doorway for a host function's argument or definition value. The read is the
 *  marshal's bounded walk (`marshal.ts`), which refuses a value past the depth or node guard (`budgets.ts`) as it
 *  builds it, so there is no second read for a getter, proxy trap or `toJSON` to answer differently.
 *
 *  Call it only inside a host function built by `marshal.newHostFunction`: a realm failure during the read (the
 *  CPU interrupt, the memory limit, a guest trap that throws) throws {@link GuestCallFailure}, which that function
 *  hands back to the guest. */
function tryDumpGuestValue(marshal: GuestMarshal, handle: QuickJSHandle, allowance: ReadAllowance): ArgRead {
  const read = marshal.fromGuest(handle, allowance);
  switch (read.kind) {
    case "value":
      return { ok: true, value: read.value };
    case "unreadable":
      return { ok: false, reason: UNREADABLE_ARGUMENT };
    case "promise":
      return { ok: false, reason: PROMISE_ARGUMENT };
    case "thrown":
      throw new GuestCallFailure(read.error);
    default: {
      const exhaustive: never = read;
      throw new Error(`plugin host: unknown guest read ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** The props `ui.register` reads off a guest def. Named as data so the materialize step is ONE shared helper
 *  rather than a per-registrar ladder of `getProp`/`tryDumpGuestValue` pairs that can drift apart. */
const SURFACE_DEF_PROPS = ["id", "anchor", "title", "tier", "spec", "toolName"] as const;
/** The META props `ui.registerFrame` reads. NOTE what is absent: `tier`. The frame registrar SUPPLIES the tier
 *  host-side, so a guest cannot name a tier at this door at all — the capability fork is not something the
 *  argument can influence. `spec`/`toolName` are absent for the same reason in reverse: a frame renders a
 *  document, so a spec here would be unread, and the meta schema refuses one outright. */
const FRAME_DEF_PROPS = ["id", "anchor", "title"] as const;
/** The BODY props `ui.registerFrame` reads — kept apart from the meta so the document bytes are handled by the
 *  one code path that knows they must never be projected to a client. */
const FRAME_BODY_PROPS = ["html", "css"] as const;

/** Materialize a fixed list of a def's own props into one plain object, or `undefined` when ANY of them is too
 *  deeply nested or too large to read (see {@link tryDumpGuestValue}). Shared by both registrars so the depth guard
 *  is applied identically at both doors. Every handle it opens is disposed here. */
function dumpDefProps(
  marshal: GuestMarshal,
  defHandle: QuickJSHandle,
  names: readonly string[],
  allowance: ReadAllowance,
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const name of names) {
    using handle = marshal.readGuestProp(defHandle, name);
    const dumped = tryDumpGuestValue(marshal, handle, allowance);
    if (!dumped.ok) {
      return;
    }
    out[name] = dumped.value;
  }
  return out;
}

/** A def's metadata, materialized and validated, or the SOFT-refusal reason (§4.9). */
type SurfaceMetaParse = { readonly ok: true; readonly meta: PluginSurfaceRegistrationMeta } | { readonly ok: false; readonly reason: string };

function isDeclarativeTier(tier: PluginSurfaceRegistrationMeta["tier"]): tier is Exclude<PluginSurfaceRegistrationMeta["tier"], "frame"> {
  return PLUGIN_TIER_REGISTRAR[tier] === "ui.register";
}

/**
 * Materialize `props` off a guest def, apply `overrides` (HOST-supplied fields the guest may not name), and
 * validate the result at the trust boundary. Shared by both registrars.
 *
 * IT RUNS UNDER A BELT: any throw — a residual `RangeError` the bounded read did not pre-empt, a
 * marshalling failure — becomes the §4.9 soft refusal, never an activation-fatal throw. `safeParse` catches a
 * `ZodError` but NOT a `RangeError`, so the try/catch is load-bearing, not decoration.
 *
 * `overrides` are applied AFTER the dump, so a field the host supplies (the frame door's `tier`) cannot be
 * shadowed by a guest property of the same name.
 */
function parseSurfaceMeta(
  marshal: GuestMarshal,
  defHandle: QuickJSHandle,
  {
    props,
    overrides,
    allowance,
  }: { readonly props: readonly string[]; readonly overrides: Readonly<Record<string, unknown>>; readonly allowance: ReadAllowance },
): SurfaceMetaParse {
  try {
    const raw = dumpDefProps(marshal, defHandle, props, allowance);
    if (raw === undefined) {
      return { ok: false, reason: "metadata is too deeply nested or too large to validate" };
    }
    const parsed = pluginSurfaceRegistrationMetaSchema.safeParse({ ...raw, ...overrides });
    // `prettifyError` carries the PATH (which field failed) — the diagnostic a plugin author needs to fix a
    // stale spec, where a bare `issues[0].message` names none.
    return parsed.success ? { ok: true, meta: parsed.data } : { ok: false, reason: z.prettifyError(parsed.error) };
  } catch (err) {
    // The realm's own failure is the guest's, not a malformed def: it goes back to the guest unchanged.
    if (err instanceof GuestCallFailure) {
      throw err;
    }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** `ui.register(def)` — SYNC, activation-time (the `tools.register` mirror): validate the serializable metadata
 *  host-side (`pluginSurfaceRegistrationMetaSchema` — the trust boundary), keep the guest `onAction` HANDLE,
 *  collect a surface registration. An INVALID def is logged + SKIPPED, NEVER thrown: a stale panel spec must not
 *  kill the activation that also registered the plugin's tools/events (§4.9). capability: `ui.surface`. */
function newRegisterFn(ctx: QuickJSContext, runtime: MembraneRuntime): QuickJSHandle {
  const held = runtime.holdings.surfaceIds;
  return runtime.marshal.newHostFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "ui.register");
    if (defHandle === undefined) {
      throw new Error("plugin host: ui.register requires a definition object");
    }
    // Absent props dump as `undefined`, which the schema's optional `spec`/`toolName` accept — and which the
    // U3 `tool-card` biconditional REFUSES for that one anchor. Parsed BEFORE `onAction` is taken, so a realm
    // failure the parse hands back to the guest leaves no handle of ours behind.
    const parsed = parseSurfaceMeta(runtime.marshal, defHandle, { props: SURFACE_DEF_PROPS, overrides: {}, allowance: inboundAllowance() });
    // `onAction` is NOT scope-owned: on the collect path its ownership TRANSFERS to the Sandbox (kept alive for
    // the instance lifetime); on every other path it is hand-disposed — a `using` would double-free the
    // transferred handle (`Lifetime.dispose` throws on a second call). `refuse` owns that discipline for every
    // early exit, so no arm can forget it.
    const onAction = runtime.marshal.readGuestProp(defHandle, "onAction");
    const refuse = (reason: string): QuickJSHandle => {
      onAction.dispose();
      runtime.logWarn(`ui.register refused a surface: ${reason}`);
      return ctx.undefined;
    };
    if (!parsed.ok) {
      return refuse(parsed.reason);
    }
    // THE CAPABILITY FORK (U7). This door is gated on `ui.surface`; the `frame` tier is gated on `ui.frame` and
    // is minted ONLY by `registerFrame`. Without this, a guest holding `ui.surface` alone could take the hatch's
    // tier by naming it and the louder consent line would never have been shown. Read off `PLUGIN_TIER_REGISTRAR`
    // rather than re-spelled as `tier === "frame"`, so a FUTURE tier fails `tsc` at that Record instead of
    // silently defaulting into this door.
    const tier = parsed.meta.tier;
    if (!isDeclarativeTier(tier)) {
      return refuse(`the '${parsed.meta.tier}' tier is registered through host.ui.registerFrame`);
    }
    if (!held.has(parsed.meta.id) && held.size >= PLUGIN_SURFACES_MAX) {
      return refuse(`at most ${PLUGIN_SURFACES_MAX} surfaces per plugin`);
    }
    held.add(parsed.meta.id);
    if (ctx.typeof(onAction) === "function") {
      runtime.collectSurface({ ...parsed.meta, tier }, onAction);
    } else {
      // No action handler — a display-only surface. Drop the non-function handle (an absent prop is `undefined`).
      onAction.dispose();
      runtime.collectSurface({ ...parsed.meta, tier }, null);
    }
    return ctx.undefined;
  });
}

/** A frame def's BODY, materialized and validated, or the soft-refusal reason. Separate from the meta parse
 *  because the body is the one thing that never enters {@link PluginSurfaceRegistrationMeta} — it must not reach
 *  the projected wire shape (`PluginSurfaceView extends` that meta), so it is validated by its own schema and
 *  handed to `collectSurface` as its own argument. */
type FrameBodyParse = { readonly ok: true; readonly body: PluginFrameBody } | { readonly ok: false; readonly reason: string };

function parseFrameBody(marshal: GuestMarshal, defHandle: QuickJSHandle, allowance: ReadAllowance): FrameBodyParse {
  try {
    const raw = dumpDefProps(marshal, defHandle, FRAME_BODY_PROPS, allowance);
    if (raw === undefined) {
      return { ok: false, reason: "the frame body is too deeply nested or too large to validate" };
    }
    const parsed = pluginFrameBodySchema.safeParse(raw);
    return parsed.success ? { ok: true, body: parsed.data } : { ok: false, reason: z.prettifyError(parsed.error) };
  } catch (err) {
    if (err instanceof GuestCallFailure) {
      throw err;
    }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** `ui.registerFrame(def)` — the U7 ESCAPE HATCH's door. capability: **`ui.frame`**.
 *
 *  Three things make it a different door rather than an argument:
 *   1. THE CAPABILITY. A frame runs the plugin's own code in an isolated document and can beacon over WebRTC
 *      (residual R1, unclosable) — a louder consent line than `ui.surface`'s, and consent is enforced per
 *      FUNCTION here.
 *   2. THE TIER IS OURS. `tier: "frame"` is supplied host-side; the guest cannot name a tier at this door, so
 *      the fork is not reachable from the argument.
 *   3. THE COUNT CAP. A frame BODY is up to 64 KiB held for the instance lifetime and multiplied by
 *      the configured broker Worker pool; `ui.register` needs no such cap because a spec is already bounded to
 *      32 KiB. The count lives on {@link MembraneHoldings}, built once per sandbox, so it bounds ONE plugin
 *      instance, which is the thing whose memory it is protecting.
 *
 *  A frame surface has no `onAction`: its actions ride the postMessage bridge, never a declarative button. */
function newRegisterFrameFn(ctx: QuickJSContext, runtime: MembraneRuntime): QuickJSHandle {
  const { holdings } = runtime;
  return runtime.marshal.newHostFunction("registerFrame", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "ui.registerFrame");
    if (defHandle === undefined) {
      throw new Error("plugin host: ui.registerFrame requires a definition object");
    }
    const refuse = (reason: string): QuickJSHandle => {
      runtime.logWarn(`ui.registerFrame refused a surface: ${reason}`);
      return ctx.undefined;
    };
    if (holdings.frames >= PLUGIN_FRAME_SURFACES_MAX) {
      return refuse(`at most ${PLUGIN_FRAME_SURFACES_MAX} frame surfaces per plugin`);
    }
    // `tier` is an OVERRIDE, not a read: the guest never names one at this door (see FRAME_DEF_PROPS). The meta
    // parse still applies every shared belt — the id grammar, the title cap, and the anchor × tier admission
    // that refuses `message-footer` permanently (`PLUGIN_ANCHOR_TIERS`).
    // One allowance for the whole call: the metadata and the body are one definition.
    const allowance = inboundAllowance();
    const parsed = parseSurfaceMeta(runtime.marshal, defHandle, { props: FRAME_DEF_PROPS, overrides: { tier: "frame" }, allowance });
    if (!parsed.ok) {
      return refuse(parsed.reason);
    }
    const body = parseFrameBody(runtime.marshal, defHandle, allowance);
    if (!body.ok) {
      return refuse(body.reason);
    }
    holdings.frames += 1;
    runtime.collectSurface({ ...parsed.meta, tier: "frame" }, null, body.body);
    return ctx.undefined;
  });
}

type CommandMetaParse =
  | { readonly ok: true; readonly meta: z.output<typeof pluginCommandRegistrationMetaSchema> }
  | { readonly ok: false; readonly reason: string };

/** A command definition's metadata, read and validated. The handles it opens are scope-owned. */
function commandMeta(marshal: GuestMarshal, defHandle: QuickJSHandle, allowance: ReadAllowance): CommandMetaParse {
  using nameH = marshal.readGuestProp(defHandle, "name");
  using describeH = marshal.readGuestProp(defHandle, "describe");
  // The DECLARED typed args (absent ⇒ the U5 opaque-remainder shape). Read through the SAME depth guard as every
  // other guest def value; the schema (enum biconditional, unique names, the arg caps) is what turns a malformed arg
  // into a REGISTRATION refusal rather than a live-value surprise at invoke time.
  using argsH = marshal.readGuestProp(defHandle, "args");
  using groupH = marshal.readGuestProp(defHandle, "group");
  using placementsH = marshal.readGuestProp(defHandle, "placements");
  using composerDraftH = marshal.readGuestProp(defHandle, "composerDraft");
  const name = tryDumpGuestValue(marshal, nameH, allowance);
  const describe = tryDumpGuestValue(marshal, describeH, allowance);
  const args = tryDumpGuestValue(marshal, argsH, allowance);
  const group = tryDumpGuestValue(marshal, groupH, allowance);
  const placements = tryDumpGuestValue(marshal, placementsH, allowance);
  const composerDraft = tryDumpGuestValue(marshal, composerDraftH, allowance);
  if (!(name.ok && describe.ok && args.ok && group.ok && placements.ok && composerDraft.ok)) {
    return { ok: false, reason: "metadata is too deeply nested or too large to validate" };
  }
  // The recursive arg schema can throw past `safeParse` on a value the depth guard admits; that is a refusal too.
  try {
    const parsed = pluginCommandRegistrationMetaSchema.safeParse({
      name: name.value,
      describe: describe.value,
      args: args.value,
      group: group.value,
      placements: placements.value,
      composerDraft: composerDraft.value,
    });
    return parsed.success ? { ok: true, meta: parsed.data } : { ok: false, reason: z.prettifyError(parsed.error) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** The plugin UI plane's guest-facing namespace. `register`/`setState` are the DECLARATIVE arm (capability
 *  `ui.surface`, U1); `registerFrame` is the U7 escape hatch (capability `ui.frame`) — see the two factories
 *  above for why the hatch is its own door.
 *
 *  `setState(surfaceId, state)` — ASYNC, runtime: publish the whole replacement state through the bridge (the
 *  domain writes the in-memory state row + emits the per-user freshness poke). JSON-safe data only. */
function setUi(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const { marshal } = runtime;
  using ui = ctx.newObject();
  using registerFn = newRegisterFn(ctx, runtime);
  runtime.marshal.setHostProp(ui, "register", registerFn);
  using registerFrameFn = newRegisterFrameFn(ctx, runtime);
  runtime.marshal.setHostProp(ui, "registerFrame", registerFrameFn);

  attachAsync(ctx, ui, {
    ref: "ui.setState",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const surfaceId = args[0];
      if (typeof surfaceId !== "string") {
        throw new Error("plugin host: ui.setState requires a surfaceId string");
      }
      // Validate the surfaceId against the SAME bounded grammar `ui.register` enforces (the trust boundary): the
      // domain state plane keys on `pluginId:surfaceId`, so an arbitrary/unbounded id would be an arbitrary map
      // key — a fresh one per call is the unbounded-key DoS. The RE bounds each key; the store's
      // per-plugin key cap bounds their COUNT.
      if (!PLUGIN_SURFACE_ID_RE.test(surfaceId)) {
        throw new Error("plugin host: ui.setState requires a valid surfaceId (/^[a-z][a-z0-9_]{0,40}$/)");
      }
      // A plain JSON object only — an array / scalar / null is an empty state (fail-safe: no throw). The domain
      // op caps the serialized size; the arg-budget belt already bounded the inbound bytes.
      const raw = args[1];
      const state: Record<string, unknown> = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      // THE OPTIONAL ROOM DIMENSION. ABSENT (`undefined`/`null`) ⇒ the plugin-wide row every room
      // shares — the U1 shape, unchanged, so every existing guest keeps working byte-for-byte. PRESENT ⇒ it must
      // be the ADMITTED invocation's opaque chat handle, resolved by the SAME `resolveChat` every other
      // room-scoped host fn uses: a forged, stale, or out-of-scope token throws here rather than silently
      // publishing into a room this invocation was never admitted to. Deliberately NOT "coerce a non-string to
      // no-chat": that would turn a typo'd handle into a silent cross-room write to the shared row, which is the
      // failure mode a guest cannot see.
      const chatArg = args[2];
      const chatId = chatArg === undefined || chatArg === null ? null : resolveChat(runtime, chatArg).chatId;
      await runtime.bridge.ui.setState(surfaceId, state, chatId, invocationLiveness(signal));
      return null;
    },
  });

  // registerCommand — SYNC, activation-time, the `register` mirror (U5, §4.5). Same SOFT-refusal posture: a
  // malformed command must not kill the activation that also registered the plugin's tools, events and panels.
  // Unlike a surface the handler is REQUIRED — a command with no `onRun` is a menu row that does nothing, which
  // is worse than an absent one, so a non-function `onRun` is a refusal rather than a display-only arm.
  const { holdings } = runtime;
  using registerCommandFn = marshal.newHostFunction("registerCommand", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "ui.registerCommand");
    if (defHandle === undefined) {
      throw new Error("plugin host: ui.registerCommand requires a definition object");
    }
    if (holdings.commands >= PLUGIN_COMMANDS_MAX) {
      runtime.logWarn(`ui.registerCommand refused a command: at most ${PLUGIN_COMMANDS_MAX} commands per plugin`);
      return ctx.undefined;
    }
    const parsed = commandMeta(marshal, defHandle, inboundAllowance());
    if (!parsed.ok) {
      runtime.logWarn(`ui.registerCommand refused a command: ${parsed.reason}`);
      return ctx.undefined;
    }
    // Taken after the metadata reads, so a realm failure a read hands back to the guest leaves no handle of ours
    // behind; its ownership then TRANSFERS to the Sandbox on the collect path and is hand-disposed otherwise.
    const onRun = marshal.readGuestProp(defHandle, "onRun");
    if (ctx.typeof(onRun) !== "function") {
      onRun.dispose();
      runtime.logWarn(`ui.registerCommand refused '${parsed.meta.name}': onRun must be a function`);
      return ctx.undefined;
    }
    const handler = commandHandler(ctx, onRun, parsed.meta.composerDraft === true);
    holdings.commands += 1;
    runtime.collectCommand(parsed.meta, handler);
    return ctx.undefined;
  });
  runtime.marshal.setHostProp(ui, "registerCommand", registerCommandFn);

  // toast — ASYNC, runtime. The LEVEL is resolved against the closed house tuple rather than a hand-spelled
  // literal (the `PLUGIN_NOTIFICATION_RECIPIENTS` posture): an unrecognised value degrades to the QUIETEST arm
  // (`info`), so a guest can never widen its own attention footprint by naming a string the host did not admit.
  // The MESSAGE is guest text; the domain stamps the plugin-name prefix, applies the length cap and claims the
  // per-plugin rate floor — infra holds none of those and must not pretend to.
  attachAsync(ctx, ui, {
    ref: "ui.toast",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const named = args[0];
      const level: PluginToastLevel = PLUGIN_TOAST_LEVELS.find((member) => member === named) ?? "info";
      const message = args[1];
      if (typeof message !== "string") {
        throw new Error("plugin host: ui.toast requires a message string");
      }
      await runtime.bridge.ui.toast(level, message, invocationLiveness(signal));
      return null;
    },
  });

  // openDialog — ASYNC, runtime. The id is bounded by the SAME grammar `ui.register` enforces (an unbounded id
  // would be an unbounded outbox key); WHICH dialog it names is resolved DOMAIN-side against the plugin's own
  // registered surfaces when the outbox drains, so infra cannot leak whether a surface exists and a guest
  // cannot open another plugin's dialog (the outbox is keyed by the plugin the guest is).
  attachAsync(ctx, ui, {
    ref: "ui.openDialog",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const surfaceId = args[0];
      if (typeof surfaceId !== "string" || !PLUGIN_SURFACE_ID_RE.test(surfaceId)) {
        throw new Error("plugin host: ui.openDialog requires a valid surfaceId (/^[a-z][a-z0-9_]{0,40}$/)");
      }
      await runtime.bridge.ui.openDialog(surfaceId, invocationLiveness(signal));
      return null;
    },
  });

  runtime.marshal.setHostProp(surface, "ui", ui);
}

function setGrants(surface: QuickJSHandle, { grants, marshal }: MembraneRuntime): void {
  using arr = marshal.newHostStrings([...grants]);
  marshal.setHostProp(surface, "grants", arr);
}

/** Resolve a guest-supplied chat-handle arg against the ONE admitted token (opaque-handle enforcement). Throws
 *  a host Error (→ guest promise reject) on absent scope or a forged/stale token — never a wrong-chat read.
 *  Returns the admitted invocation chat. */
function resolveChat(runtime: MembraneRuntime, handleArg: unknown): InvocationChat {
  const chat = runtime.currentChat();
  const token = runtime.currentToken();
  if (chat === null || token === null) {
    throw new Error("plugin host: no chat is in scope for this invocation");
  }
  if (typeof handleArg !== "string" || handleArg !== token) {
    throw new Error("plugin host: invalid chat handle (forged or out-of-scope)");
  }
  return chat;
}

function setChat(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using chat = ctx.newObject();

  // current() — SYNC: return the admitted invocation chat's opaque token. Throws outside a chat scope.
  using currentFn = runtime.marshal.newHostFunction("current", () => {
    requireCapability(runtime, "chat.current");
    const token = runtime.currentToken();
    if (token === null) {
      throw new Error("plugin host: no chat is in scope for this invocation");
    }
    return runtime.marshal.newHostString(token);
  });
  runtime.marshal.setHostProp(chat, "current", currentFn);

  attachAsync(ctx, chat, {
    ref: "chat.listMessages",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const { chatId } = resolveChat(runtime, args[0]);
      const opts = args[1];
      const limit = isPlainObject(opts) && typeof opts["limit"] === "number" ? opts["limit"] : undefined;
      return await runtime.bridge.chat.listMessages(chatId, limit, invocationLiveness(signal));
    },
  });

  attachAsync(ctx, chat, {
    ref: "chat.getVariables",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const { chatId } = resolveChat(runtime, args[0]);
      return await runtime.bridge.chat.getVariables(chatId, invocationLiveness(signal));
    },
  });

  // listCharacters(chat) — the present CHARACTER roster of the ADMITTED chat. The bridge resolves the
  // installer's membership and returns `[]` for a non-member; a forged/stale handle fails `resolveChat` first.
  attachAsync(ctx, chat, {
    ref: "chat.listCharacters",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const { chatId } = resolveChat(runtime, args[0]);
      return await runtime.bridge.chat.listCharacters(chatId, invocationLiveness(signal));
    },
  });

  attachAsync(ctx, chat, {
    ref: "chat.applyVariableOps",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const scope = resolveChat(runtime, args[0]);
      if (!scope.canWrite) {
        // NOT POSTURE 2, deliberately — one of the two `canWrite` arms that stays a flat refusal, and the
        // reason lives here so the next reader finds it beside the code. A variable delta is not a
        // human-weighable act: a card reading "set tension to 5?" cannot be evaluated without knowing what
        // the plugin means by tension. It is also the HIGHEST-FREQUENCY write in the set (a plugin tracking
        // state writes on every event), so making it askable converts a clean refusal into an attention
        // flood against §3-S4's one-visible-card budget. Full reasoning: `@orb/contracts/plugin/suggestion`.
        throw new Error("plugin host: chat.variables.write requires host authority on this chat");
      }
      // Only inert data crosses here: the app's bridge dispatch parses every op before it can reach the delta log.
      // A non-list is refused, never read as no ops: an empty write answers `applied` and the guest would
      // believe a write landed that never happened.
      if (!Array.isArray(args[1])) {
        throw new Error("plugin host: chat.applyVariableOps requires a list of variable ops");
      }
      const ops = args[1] as readonly VarOp[];
      // The OPTIONAL compare-and-set. A malformed precondition would silently WEAKEN the guard it was
      // passed to strengthen, so it is PARSED, and a shape that does not parse is a loud refusal of the call (the
      // forged-handle arm's posture) rather than a write that quietly skipped its own check.
      const expect = parsePreconditions(args[2]);
      // The result is DATA the guest branches on — a lost race must not spend a crash strike (see the
      // `PluginVariableWriteResult` contract). Only the two shapes the contract declares cross back.
      return await runtime.bridge.chat.applyVariableOps(scope.chatId, ops, expect, invocationLiveness(signal));
    },
  });

  attachAsync(ctx, chat, {
    ref: "chat.requestTurn",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const scope = resolveChat(runtime, args[0]);
      if (!scope.canWrite) {
        // POSTURE 2 — the installer holds the grant but not standing authority here, so the act becomes an
        // ASK the room's host confirms (`suggestAct`). It is not a write and it is not a refusal.
        await suggestAct(runtime, scope, { kind: "requestTurn", automationDepth: scope.automationDepth + 1, ...buildTurnHints(args[1]) }, signal);
      }
      // The FUNDER (installer) is closed over DOMAIN-SIDE — the membrane supplies NONE (authority-blind): a plugin
      // can never fund a foreign budget because it cannot name the funder. The child cascade depth = the
      // invocation's context depth + 1; the domain `requestTurn` refuses a value past AUTOMATION_DEPTH_HARD_CAP,
      // so a plugin cannot launder an event→turn→event loop past the ceiling. Spend rides D17 + the per-member
      // turn budget (NOT the automation spend ceiling — the LOW-2 deferral, same class as plugin imagery).
      await runtime.bridge.chat.requestTurn(scope.chatId, scope.automationDepth + 1, buildTurnHints(args[1]), invocationLiveness(signal));
      return null;
    },
  });

  attachAsync(ctx, chat, {
    ref: "chat.surfaceQuickReply",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const scope = resolveChat(runtime, args[0]);
      if (!scope.canWrite) {
        // NOT POSTURE 2, deliberately — the second of the two arms that stays a flat refusal. Surfacing
        // chips writes room-visible state, so host authority is the ceiling; but chips are TRANSIENT display
        // strings with no row, and their entire value is immediacy. An ask the host reads, then approves so
        // that text can appear as a chip, has already shown the host the text: the card IS the chip,
        // delivered late. Full reasoning: `@orb/contracts/plugin/suggestion`.
        throw new Error("plugin host: chat.surfaceQuickReply requires host authority on this chat");
      }
      await runtime.bridge.surfaceQuickReply(scope.chatId, buildQuickReplyChoices(args[1]), invocationLiveness(signal));
      return null;
    },
  });

  runtime.marshal.setHostProp(surface, "chat", chat);
}

/** POSTURE 2, at the ONE place the membrane expresses it (interaction spec §3-S4, the three-posture law:
 *  standing authority ⇒ act; NO standing authority ⇒ a SUGGESTION the host confirms; the fourth posture —
 *  direct execution without standing authority — never exists).
 *
 *  Stash the act through the domain bridge, then ALWAYS throw the typed `PluginSuggestedError`. The throw is
 *  the honest wire, not an error path: `requestTurn` and `upsertEntry` return `void`, so resolving would tell
 *  the guest its act happened, and a plugin that believes it wrote does something else next. `name` crosses
 *  the QuickJS boundary intact (the `PluginCapabilityError` mechanism), so a guest distinguishes "became an
 *  ask" from "refused" without parsing prose.
 *
 *  INFRA STAYS AUTHORITY-BLIND. It reads the `canWrite` the DOMAIN already resolved and forwards an inert
 *  act; it mints no id, renders no question, and never touches the S4 store. If `suggest` itself rejects
 *  (the ask could not be raised), that rejection reaches the guest instead — which is the correct fail
 *  direction: no act, no ask, and the guest is told. */
async function suggestAct(runtime: MembraneRuntime, scope: InvocationChat, act: PluginSuggestedAct, signal: AbortSignal): Promise<never> {
  await runtime.bridge.suggest(scope.chatId, act, invocationLiveness(signal));
  throw new PluginSuggestedError(act.kind);
}

/** Project the guest-supplied quick-reply choices to the JSON-safe `{label, sendText}[]` shape. Non-array input
 *  ⇒ `[]` (fail-safe: an empty surface, never a throw); each entry keeps ONLY string `label`/`sendText`, dropping
 *  a malformed entry (a non-string field yields "" — inert, never a coerced object). The count and length caps
 *  are the rule chips' own, refused in `packages/server/src/domain/automation/verbs/plugin-feedback.ts`. */
function buildQuickReplyChoices(raw: unknown): readonly { readonly label: string; readonly sendText: string }[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry) => {
    const e = (typeof entry === "object" && entry !== null ? entry : {}) as { label?: unknown; sendText?: unknown };
    return {
      label: typeof e.label === "string" ? e.label : "",
      sendText: typeof e.sendText === "string" ? e.sendText : "",
    };
  });
}

/** Parse the guest's OPTIONAL `chat.applyVariableOps` preconditions. `undefined` when the guest passed
 *  none (an unconditional write); a THROW when it passed something that is not a precondition list.
 *
 *  PARSED RATHER THAN PROJECTED, like {@link parseWorldEntry}, and the asymmetry is the point:
 *  `buildTurnHints`/`buildQuickReplyChoices` project junk to a harmless default because a dropped hint only
 *  weakens the GUEST's request, whereas a dropped precondition silently weakens the GUARD — the write would
 *  land unconditionally while the guest believes it was checked, which is the exact lost update the argument
 *  exists to prevent. So a malformed guard is a loud refusal of the call, the same posture a forged chat handle
 *  gets, and it is a programming error in the guest rather than the normal contended-write outcome (which is
 *  data — see the `stale` result). */
function parsePreconditions(raw: unknown): readonly VariablePrecondition[] | undefined {
  if (raw === undefined || raw === null) {
    return;
  }
  const parsed = variablePreconditionsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("plugin host: chat.applyVariableOps `expect` must be an array of { key: string, expected: string | null }");
  }
  return parsed.data;
}

/** Project the guest-supplied `chat.requestTurn` hints to the JSON-safe `{speakerCharacterId?, guided?}` shape.
 *  Only string fields are honored; optional fields stay ABSENT (exactOptionalPropertyTypes), never `undefined`. */
function buildTurnHints(raw: unknown): { readonly speakerCharacterId?: SandboxWireId<CharacterId>; readonly guided?: string } {
  const p = (typeof raw === "object" && raw !== null ? raw : {}) as { speakerCharacterId?: unknown; guided?: unknown };
  const speakerCharacterId = typeof p.speakerCharacterId === "string" ? p.speakerCharacterId : undefined;
  const guided = typeof p.guided === "string" ? p.guided : undefined;
  return {
    ...(speakerCharacterId !== undefined ? { speakerCharacterId } : {}),
    ...(guided !== undefined ? { guided } : {}),
  };
}

/** Parse the guest's lore entry before it becomes a write or an ask, so a host is never asked about a shape the
 *  writer would refuse. A malformed entry is a loud refusal of the call, the {@link parsePreconditions} posture. */
function parseWorldEntry(raw: unknown): PluginWorldEntryUpsert {
  const parsed = pluginWorldEntryUpsertSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("plugin host: worldInfo.upsertEntry requires { bookId, entryKey, keys, contentTemplate }");
  }
  return parsed.data;
}

/** Parse the guest's picture args before they become a spend or an ask, the {@link parseWorldEntry} posture: the
 *  host's card quotes `mode`, so an unparsed string would put guest text in the question. Absent args are the
 *  schema's own defaults. */
function parsePictureArgs(raw: unknown): GenerateImageActionArgs {
  const parsed = generateImageActionArgsSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new Error("plugin host: imagery.generatePicture args do not match the generate_image action");
  }
  return parsed.data;
}

/** worldInfo.upsertEntry — capability worldinfo.write + host authority (room-state writes are host
 *  authority). The guest entry crosses as a JSON object; the authority-agnostic bridge maps it onto the shared
 *  lore writer under the installer. */
function setWorldInfo(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using worldInfo = ctx.newObject();
  // listBooks(chat) — the books ATTACHED to the admitted chat (worldinfo.read). The bridge resolves
  // the installer + member-gates the attachment list; a non-member gets `[]`.
  attachAsync(ctx, worldInfo, {
    ref: "worldInfo.listBooks",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const { chatId } = resolveChat(runtime, args[0]);
      return await runtime.bridge.worldInfo.listBooks(chatId, invocationLiveness(signal));
    },
  });
  // listEntries(chat, bookId) — the entries of ONE attached book (worldinfo.read). The guest supplies
  // the bookId; the bridge applies the ATTACHMENT gate before the read, so a book not attached to THIS chat
  // resolves to `[]`, leak-free. A non-string bookId is refused here rather than serialized into a bad query.
  attachAsync(ctx, worldInfo, {
    ref: "worldInfo.listEntries",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const { chatId } = resolveChat(runtime, args[0]);
      const bookId = args[1];
      if (typeof bookId !== "string") {
        throw new Error("plugin host: worldInfo.listEntries requires a bookId string");
      }
      return await runtime.bridge.worldInfo.listEntries(chatId, bookId, invocationLiveness(signal));
    },
  });
  attachAsync(ctx, worldInfo, {
    ref: "worldInfo.upsertEntry",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const scope = resolveChat(runtime, args[0]);
      const entry = parseWorldEntry(args[1]);
      if (!scope.canWrite) {
        // POSTURE 2 — the ask carries the parsed entry; every domain gate it would have met directly
        // (attachment, the per-plugin entry ceiling, `neutralizeMacros`) is met again when the host confirms,
        // because the confirmed act re-enters through the plugin's OWN bridge.
        await suggestAct(runtime, scope, { kind: "worldInfoUpsert", entry }, signal);
      }
      // The ADMITTED chatId travels with the entry: the guest names the book, the DOMAIN decides whether that
      // book is attached to THIS room (the room's consent) and applies the per-plugin entry cap. Infra can
      // enforce neither — it holds no db — so its job is to hand the domain the scope it admitted, never to let
      // a guest-supplied bookId travel alone.
      await runtime.bridge.worldInfo.upsertEntry(scope.chatId, entry, invocationLiveness(signal));
      return null;
    },
  });
  runtime.marshal.setHostProp(surface, "worldInfo", worldInfo);
}

/** assets.read(assetId) — capability assets.read. The guest supplies ONLY the assetId
 *  string; the bridge closes the installer over the read and reaches the assets domain's OWNER-GATED front door,
 *  so a guest can only read its OWN CAS and a foreign/absent id is the leak-free `null`. NO chat scope, NO host
 *  authority (a read of the installer's own store, the `storage`/`databank` posture). A non-string assetId is
 *  refused here rather than serialized into a bad lookup. */
function setAssets(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using assets = ctx.newObject();
  attachAsync(ctx, assets, {
    ref: "assets.read",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const assetId = args[0];
      if (typeof assetId !== "string") {
        throw new Error("plugin host: assets.read requires an assetId string");
      }
      return await runtime.bridge.assets.read(assetId, invocationLiveness(signal));
    },
  });
  runtime.marshal.setHostProp(surface, "assets", assets);
}

/** search.documents(queryText, opts?) — capability search.query. The guest supplies ONLY the query
 *  string + an optional limit; the bridge closes the installer's ownerId over the search scope, so a guest
 *  searches only its OWN corpus. NO chat scope, NO host authority (a read of the installer's own library, the
 *  `assets`/`databank` posture). The limit is CLAMPED here to `PLUGIN_SEARCH_RESULTS_MAX` (an unbounded page is
 *  an unbounded corpus read per call); a non-string query is refused rather than searched as garbage. */
function setSearch(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using search = ctx.newObject();
  attachAsync(ctx, search, {
    ref: "search.documents",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const queryText = args[0];
      if (typeof queryText !== "string") {
        throw new Error("plugin host: search.documents requires a queryText string");
      }
      const opts = args[1];
      const limit =
        isPlainObject(opts) && typeof opts["limit"] === "number" ? Math.min(Math.max(1, Math.trunc(opts["limit"])), PLUGIN_SEARCH_RESULTS_MAX) : undefined;
      return await runtime.bridge.search.documents(queryText, limit, invocationLiveness(signal));
    },
  });
  runtime.marshal.setHostProp(surface, "search", search);
}

/** imagery.generatePicture — capability imagery.generate + host authority (host-gated). Returns the
 *  primary image's `{assetId}` (the bridge forwards the admitted chat + action args to the front door; compose
 *  re-validates the args + applies the action-arg defaults). v1 SPEND BOUND (honest, docs-are-law): the
 *  generation is funded by the INSTALLER's own credential (compose resolves the installer Principal for
 *  connection + spend attribution), fan-out is clamped to n≤4 (generateImageActionArgsSchema), host calls are
 *  capped at ≤32 concurrent per invocation, and plugin install is admin-only. There is NO per-call
 *  D17 SPEND-CEILING debit on this path — that ceiling is a deliberate deferral (the
 *  same unwired class as turn.trigger). Do not claim a spend ceiling this path does not enforce. */
function setImagery(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using imagery = ctx.newObject();
  attachAsync(ctx, imagery, {
    ref: "imagery.generatePicture",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const scope = resolveChat(runtime, args[0]);
      const pictureArgs = parsePictureArgs(args[1]);
      if (!scope.canWrite) {
        // POSTURE 2 — and the class §3-S4 RULED F4 most wants asked: this is SPEND on the installer, so
        // "should this happen" is a question with a price on it.
        await suggestAct(runtime, scope, { kind: "generatePicture", args: pictureArgs }, signal);
      }
      return await runtime.bridge.imagery.generatePicture(scope.chatId, pictureArgs, invocationLiveness(signal));
    },
  });
  runtime.marshal.setHostProp(surface, "imagery", imagery);
}

function setVariables(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using vars = ctx.newObject();
  attachAsync(ctx, vars, {
    ref: "variables.get",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    argUnitsMax: GLOBAL_VARIABLE_KEY_MAX_CHARS,
    impl: async (args, signal) => await runtime.bridge.variables.get(stringArg(args, 0, "variables.get", "key"), invocationLiveness(signal)),
  });
  attachAsync(ctx, vars, {
    ref: "variables.set",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    argUnitsMax: GLOBAL_VARIABLE_KEY_MAX_CHARS + GLOBAL_VARIABLE_VALUE_MAX_BYTES,
    impl: async (args, signal) => {
      await runtime.bridge.variables.set(stringArg(args, 0, "variables.set", "key"), stringArg(args, 1, "variables.set", "value"), invocationLiveness(signal));
      return null;
    },
  });
  attachAsync(ctx, vars, {
    ref: "variables.delete",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    argUnitsMax: GLOBAL_VARIABLE_KEY_MAX_CHARS,
    impl: async (args, signal) => {
      await runtime.bridge.variables.delete(stringArg(args, 0, "variables.delete", "key"), invocationLiveness(signal));
      return null;
    },
  });
  runtime.marshal.setHostProp(surface, "variables", vars);
}

/** storage.get/set/compareAndSet/delete/list — capability storage.kv. The plugin-PRIVATE KV: the bridge op
 *  is closed DOMAIN-side over the pluginId + installer (owner), so a guest names only the key/prefix and can
 *  NEVER read another plugin's (or owner's) keys. Not host-authority gated (a plugin's own private store is not
 *  room state) — the grant alone suffices. The value/key-size + 256-key caps are enforced by the domain op; a call
 *  whose strings are longer than its key and values together could ever be is refused here, unread. */
function setStorage(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using storage = ctx.newObject();
  attachAsync(ctx, storage, {
    ref: "storage.get",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    argUnitsMax: PLUGIN_KV_KEY_MAX_CHARS,
    impl: async (args, signal) => await runtime.bridge.storage.get(stringArg(args, 0, "storage.get", "key"), invocationLiveness(signal)),
  });
  attachAsync(ctx, storage, {
    ref: "storage.set",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    argUnitsMax: PLUGIN_KV_KEY_MAX_CHARS + PLUGIN_KV_VALUE_MAX_BYTES,
    impl: async (args, signal) => {
      await runtime.bridge.storage.set(stringArg(args, 0, "storage.set", "key"), stringArg(args, 1, "storage.set", "value"), invocationLiveness(signal));
      return null;
    },
  });
  // The ATOMIC arm. The contract types `expected` as `string | null`, `null` meaning "the key must not exist", and
  // an omitted precondition (`undefined`) reads as that same create, the only reading of an absent precondition
  // that is not a silent overwrite. Any other non-string is refused like the key. The result is an object, so a lost
  // race arrives as DATA the guest branches on rather than a throw (three throws auto-disable a plugin, and losing a
  // race is the ordinary outcome this call reports).
  attachAsync(ctx, storage, {
    ref: "storage.compareAndSet",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    argUnitsMax: PLUGIN_KV_KEY_MAX_CHARS + 2 * PLUGIN_KV_VALUE_MAX_BYTES,
    impl: async (args, signal) => {
      const expected = args[1] === null || args[1] === undefined ? null : stringArg(args, 1, "storage.compareAndSet", "expected value");
      const key = stringArg(args, 0, "storage.compareAndSet", "key");
      const next = stringArg(args, 2, "storage.compareAndSet", "next value");
      return await runtime.bridge.storage.compareAndSet(key, expected, next, invocationLiveness(signal));
    },
  });
  attachAsync(ctx, storage, {
    ref: "storage.delete",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    argUnitsMax: PLUGIN_KV_KEY_MAX_CHARS,
    impl: async (args, signal) => {
      await runtime.bridge.storage.delete(stringArg(args, 0, "storage.delete", "key"), invocationLiveness(signal));
      return null;
    },
  });
  attachAsync(ctx, storage, {
    ref: "storage.list",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    argUnitsMax: PLUGIN_KV_KEY_MAX_CHARS,
    impl: async (args, signal) => {
      const prefix = typeof args[0] === "string" ? args[0] : undefined;
      return await runtime.bridge.storage.list(prefix, invocationLiveness(signal));
    },
  });
  runtime.marshal.setHostProp(surface, "storage", storage);
}

/** notifications.post — capability notify. Post a durable participant notice: the guest supplies
 *  the recipient selector (`PLUGIN_NOTIFICATION_RECIPIENTS`) + the message; the bridge closed the pluginId + installer over
 *  the op, which resolves the recipient set DOMAIN-side (host = installer; all_members = the present human roster)
 *  and emits the `automation-notice`. A plugin can never notify a non-participant (the roster is resolved
 *  domain-side from the ADMITTED chat, never guest-supplied). Requires an admitted chat scope; NOT host-authority
 *  gated (a member-visible notice to participants is the read floor, matching the automation `post_notification`
 *  arm's own `host|all_members` recipients — the arm gates the roster, not host authority). The message is
 *  host-capped by the domain op (200 chars).
 *
 *  THE SELECTOR IS RESOLVED AGAINST THE PLUGIN SUBSET TUPLE, not against a hand-spelled literal, and the two
 *  halves of that matter separately. (1) An unrecognised value — junk, or a member of the FULL axis a guest
 *  is not entitled to name (`all_members_except_actor`, which needs a triggering fact this call does not
 *  have) — resolves to `host`, the narrowest recipient set: a guest can never widen its own reach by naming
 *  a string the host did not admit. (2) Reading the tuple rather than re-spelling its members means widening
 *  the guest vocabulary is a one-line edit in `@orb/contracts/notifications` that this site follows
 *  automatically, instead of a downgrade that silently outlives the member it was written against. */
function setNotifications(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using notifications = ctx.newObject();
  attachAsync(ctx, notifications, {
    ref: "notifications.post",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const scope = resolveChat(runtime, args[0]);
      const named = args[1];
      const recipient: PluginNotificationRecipient = PLUGIN_NOTIFICATION_RECIPIENTS.find((member) => member === named) ?? "host";
      const message = typeof args[2] === "string" ? args[2] : "";
      await runtime.bridge.notifications.post(scope.chatId, recipient, message, invocationLiveness(signal));
      return null;
    },
  });
  runtime.marshal.setHostProp(surface, "notifications", notifications);
}

/** llm.quiet — capability llm.quiet. ONE bounded, non-canon generation on the INSTALLER's own resolved
 *  summarize-role connection; the guest supplies ONLY a prompt string and gets raw text back.
 *
 *  NO CHAT SCOPE, NO HOST AUTHORITY — deliberately, and the reasons are different from each other. No chat:
 *  the call carries no room context at all (the bridge op takes a prompt and nothing else), so demanding an
 *  admitted handle would be a ceremony that describes nothing. No host authority: `canWrite` is the ROOM-STATE
 *  write ceiling and this writes no room state — gating on it would claim a protection this call does not need
 *  and does not provide. What DOES bound it is the grant, the length cap below, and the plugin's HOURLY quiet
 *  floor, which the domain bridge claims before it spends. The floor is not optional decoration: without it
 *  the only ceiling would be `HOST_CALLS_IN_FLIGHT_MAX`, which bounds CONCURRENCY and not rate, i.e. 32 at a
 *  time as fast as they settle, forever, on the installer's credential.
 *
 *  The prompt is REFUSED over `PLUGIN_QUIET_PROMPT_MAX_CHARS` rather than truncated — see that constant. */
function setLlm(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using llm = ctx.newObject();
  attachAsync(ctx, llm, {
    ref: "llm.quiet",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const prompt = args[0];
      if (typeof prompt !== "string") {
        throw new Error("plugin host: llm.quiet requires a prompt string");
      }
      if (prompt.length > PLUGIN_QUIET_PROMPT_MAX_CHARS) {
        throw new Error(`plugin host: llm.quiet prompt exceeds the ${PLUGIN_QUIET_PROMPT_MAX_CHARS}-character cap`);
      }
      const { text } = await runtime.bridge.llm.quiet(prompt, buildQuietOptions(args[1]), invocationLiveness(signal));
      return text;
    },
  });
  runtime.marshal.setHostProp(surface, "llm", llm);
}

/** databank.ingest — capability databank.ingest (seam 15). Ingest a text document into
 *  the INSTALLER's OWN databank. NO chat scope + NO host authority — deliberately, the `storage`/`llm` posture:
 *  a library write is the installer's own reach, not room state, so gating on `canWrite` would claim a
 *  protection it does not provide. The installer is closed over DOMAIN-side (the bridge), so a guest supplies
 *  ONLY `{name, text}` and can name no other owner; the domain content-addresses + dedups the text and enqueues
 *  the ingest workload (the indexer auto-runs). The guest gets back its OWN new document id. */
function setDatabank(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using databank = ctx.newObject();
  attachAsync(ctx, databank, {
    ref: "databank.ingest",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const doc = (typeof args[0] === "object" && args[0] !== null ? args[0] : {}) as { name?: unknown; text?: unknown };
      if (typeof doc.name !== "string" || typeof doc.text !== "string") {
        throw new Error("plugin host: databank.ingest requires { name: string, text: string }");
      }
      return await runtime.bridge.databank.ingest({ name: doc.name, text: doc.text }, invocationLiveness(signal));
    },
  });
  runtime.marshal.setHostProp(surface, "databank", databank);
}

/** character.ingest — capability character.ingest (seam 17). Ingest a V2/V3
 *  character CARD (a plain JSON object) into the INSTALLER's OWN library through the ContentChanged-emitting
 *  import funnel. Same owner-scoped, no-chat, no-host posture as {@link setDatabank}. The guest supplies the raw
 *  card object; the domain serializes + validates it through `parseCardJson`, so a non-object arg (an array /
 *  scalar / null) or a card that does not parse is a typed refusal of the CALL, never a partial write. Returns
 *  the new character id + whether it was freshly created (a byte-identical re-ingest deduplicates). */
function setCharacter(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using character = ctx.newObject();
  attachAsync(ctx, character, {
    ref: "character.ingest",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const card = args[0];
      // A card is a JSON OBJECT — an array/scalar/null is not a card and is refused here rather than serialized
      // into a shape `parseCardJson` would reject downstream with a less legible error.
      if (typeof card !== "object" || card === null || Array.isArray(card)) {
        throw new Error("plugin host: character.ingest requires a character-card object");
      }
      return await runtime.bridge.character.ingest(card as Record<string, unknown>, invocationLiveness(signal));
    },
  });

  // ingestAsset(assetId) — capability character.ingest. The guest supplies ONLY an assetId string naming
  // a PNG in the INSTALLER's OWN CAS (e.g. one `net.fetchAsset` just returned); the bridge closes the installer
  // over the op, reads that asset owner-gated (foreign/absent → leak-free rejection) and runs the SAME
  // importCharacter funnel `ingest` does — so the character arrives WITH its embedded avatar. Rides the SAME
  // `character.ingest` grant (identical reach, only the input form differs). A non-string id is refused here.
  attachAsync(ctx, character, {
    ref: "character.ingestAsset",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const assetId = args[0];
      if (typeof assetId !== "string") {
        throw new Error("plugin host: character.ingestAsset requires an assetId string");
      }
      return await runtime.bridge.character.ingestAsset(assetId, invocationLiveness(signal));
    },
  });

  // setCardData(characterId, data) — the D148 per-card state WRITE. The guest supplies ONLY the characterId
  // string + an inert JSON object; the SLUG is stamped host-side (DOMAIN-side, the bridge) and the OWNER-SCOPE +
  // the leak-free NOT_FOUND for a foreign character are the domain's — infra stays authority-blind, forwarding
  // the admitted (validated-shape) payload. `data` must be a plain object (an array/scalar/null is not per-card
  // state and is refused here, the `ingest` posture) so a guest cannot smuggle a scalar into the residual bag.
  attachAsync(ctx, character, {
    ref: "character.setCardData",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const characterId = args[0];
      if (typeof characterId !== "string") {
        throw new Error("plugin host: character.setCardData requires a characterId string");
      }
      const data = args[1];
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error("plugin host: character.setCardData requires a data object");
      }
      await runtime.bridge.character.setCardData(characterId, data as Record<string, unknown>, invocationLiveness(signal));
      return null;
    },
  });

  // getCardData(characterId) — the D148 per-card state READ. Same host-stamped-slug + owner-scope walls as the
  // write; a foreign/absent character rejects leak-free DOMAIN-side. Returns the stored blob or null.
  attachAsync(ctx, character, {
    ref: "character.getCardData",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const characterId = args[0];
      if (typeof characterId !== "string") {
        throw new Error("plugin host: character.getCardData requires a characterId string");
      }
      return await runtime.bridge.character.getCardData(characterId, invocationLiveness(signal));
    },
  });

  // findCardData(values) — the D148 lookup across the installer's own characters. Infra checks only the shape and
  // the cap; the slug and owner scope are the domain's.
  attachAsync(ctx, character, {
    ref: "character.findCardData",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const values: unknown = args[0];
      if (!(Array.isArray(values) && values.every((value): value is string => typeof value === "string"))) {
        throw new Error("plugin host: character.findCardData requires an array of strings");
      }
      if (values.length > PLUGIN_CARD_DATA_FIND_MAX) {
        throw new Error(`plugin host: character.findCardData accepts at most ${PLUGIN_CARD_DATA_FIND_MAX} values`);
      }
      return await runtime.bridge.character.findCardData(values, invocationLiveness(signal));
    },
  });
  runtime.marshal.setHostProp(surface, "character", character);
}

/** Project the guest-supplied `llm.quiet` options bag to the JSON-safe
 *  `PluginQuietOptions` shape. The whole function is the fail-safe projection posture `buildTurnHints` and
 *  `buildQuickReplyChoices` already use: a malformed arm is DROPPED (the call proceeds as a plain quiet
 *  generation) rather than coerced or thrown — a guest typo must not turn a working call into an error, and a
 *  half-understood structured ask must never reach a wire.
 *
 *  What is REFUSED here rather than dropped: nothing. What is BOUNDED here: the image list, clamped to
 *  {@link PLUGIN_QUIET_IMAGES_MAX} (an unbounded list is an unbounded read of the installer's CAS per call).
 *  What is NOT decided here: whether the schema is liftable and whether those assets exist and belong to the
 *  installer — infra holds neither the projection rule's trust boundary nor a CAS, so both are the DOMAIN's. */
function buildQuietOptions(raw: unknown): PluginQuietOptions | undefined {
  if (typeof raw !== "object" || raw === null) {
    return;
  }
  const bag = raw as { schema?: unknown; imageAssetIds?: unknown };
  const schema = buildQuietSchema(bag.schema);
  const ids = Array.isArray(bag.imageAssetIds) ? bag.imageAssetIds.filter((id): id is string => typeof id === "string").slice(0, PLUGIN_QUIET_IMAGES_MAX) : [];
  if (schema === undefined && ids.length === 0) {
    return;
  }
  return {
    ...(schema !== undefined ? { schema } : {}),
    ...(ids.length > 0 ? { imageAssetIds: ids } : {}),
  };
}

/** The structured-output arm of {@link buildQuietOptions}: a `{name, schema}` pair or nothing. `schema` crosses
 *  as the guest's RAW JSON-Schema record — the domain lifts + re-projects it (D79), so no unprojected blob can
 *  reach a wire no matter what a guest writes here. */
function buildQuietSchema(raw: unknown): PluginQuietSchema | undefined {
  if (typeof raw !== "object" || raw === null) {
    return;
  }
  const bag = raw as { name?: unknown; description?: unknown; schema?: unknown };
  if (typeof bag.name !== "string" || typeof bag.schema !== "object" || bag.schema === null || Array.isArray(bag.schema)) {
    return;
  }
  return {
    name: bag.name,
    schema: bag.schema as Record<string, unknown>,
    ...(typeof bag.description === "string" ? { description: bag.description } : {}),
  };
}

function toolDisplayMetadata(
  ctx: QuickJSContext,
  marshal: GuestMarshal,
  defHandle: QuickJSHandle,
  { name, allowance }: { readonly name: string; readonly allowance: ReadAllowance },
): Pick<Parameters<MembraneRuntime["collectTool"]>[0], "displayName" | "replayHistory"> {
  using displayHandle = marshal.readGuestProp(defHandle, "displayName");
  using replayHandle = marshal.readGuestProp(defHandle, "replayHistory");
  const displayType = ctx.typeof(displayHandle);
  const replayType = ctx.typeof(replayHandle);
  if ((displayType !== "string" && displayType !== "undefined") || (replayType !== "boolean" && replayType !== "undefined")) {
    throw new Error("plugin host: tool displayName must be nonempty text and replayHistory must be boolean");
  }
  const display = displayType === "string" ? tryDumpGuestValue(marshal, displayHandle, allowance) : { ok: true, value: name.replaceAll("_", " ") };
  const displayName = display.ok && typeof display.value === "string" ? display.value : "";
  if (displayName.trim().length === 0) {
    throw new Error("plugin host: tool displayName must be nonempty text");
  }
  if (replayType === "undefined") {
    return { displayName };
  }
  const replay = tryDumpGuestValue(marshal, replayHandle, allowance);
  if (!replay.ok || typeof replay.value !== "boolean") {
    throw new Error("plugin host: tool replayHistory could not be read as boolean");
  }
  return { displayName, replayHistory: replay.value };
}

/** A tool definition's metadata, read and bounded. Every handle it opens is scope-owned, so a refusal here leaves no
 *  handle behind and the handler is taken only after it. */
function toolDefinition(
  marshal: GuestMarshal,
  defHandle: QuickJSHandle,
  allowance: ReadAllowance,
): { readonly name: string; readonly description: string; readonly parameters: Record<string, unknown> } {
  // Metadata stays scope-owned; acquire the transferred handler only after every metadata refusal.
  using nameHandle = marshal.readGuestProp(defHandle, "name");
  using descHandle = marshal.readGuestProp(defHandle, "description");
  using paramsHandle = marshal.readGuestProp(defHandle, "parameters");
  const dumpedName = tryDumpGuestValue(marshal, nameHandle, allowance);
  const dumpedDescription = tryDumpGuestValue(marshal, descHandle, allowance);
  const dumpedParameters = tryDumpGuestValue(marshal, paramsHandle, allowance);
  if (!(dumpedName.ok && dumpedDescription.ok && dumpedParameters.ok)) {
    throw new Error("plugin host: tools.register metadata is too deeply nested or too large to read");
  }
  const name = dumpedName.value;
  const description = dumpedDescription.value;
  const parameters = dumpedParameters.value;
  if (typeof name !== "string" || typeof description !== "string" || !isPlainObject(parameters)) {
    throw new Error("plugin host: tools.register definition must be { name, description, parameters, handler }");
  }
  // THE TOOL NAME IS GUEST INPUT AND THIS IS ITS TRUST BOUNDARY. `PLUGIN_TOOL_NAME_RE` is the grammar
  // `host-v1.ts` promises a plugin author and the one a `tool-card` surface's `toolName` is already held to
  // — but this seam used to check `typeof name === "string"` only, so an unbounded, arbitrary-charset guest
  // string was collected, retained for the instance lifetime, and carried into `pluginToolWireName` to
  // become a MODEL-VISIBLE function name. Bounding it HERE keeps the two spellings of one grammar
  // (registration and the card linkage) from admitting different names, and makes a bad name the guest's
  // own contained `tools.register` throw instead of a downstream registrar refusal that fails the whole
  // activation. `PLUGIN_TOOL_NAME_RE`'s LENGTH (not just its charset) is also load-bearing here —
  // it is one half of the wire-mint's byte budget (`manifest.ts` `PLUGIN_TOOL_NAME_LOCAL_MAX`, the other
  // half is the manifest's `slug` cap), so a too-long name is refused right here, at the guest's own call,
  // rather than surfacing as a length failure at the registry two boundaries downstream.
  if (!PLUGIN_TOOL_NAME_RE.test(name)) {
    throw new Error(`plugin host: tools.register name must match ${PLUGIN_TOOL_NAME_RE.source}`);
  }
  if (description.length > PLUGIN_TOOL_DESCRIPTION_MAX_CHARS) {
    throw new Error(`plugin host: tools.register description exceeds ${PLUGIN_TOOL_DESCRIPTION_MAX_CHARS} characters`);
  }
  if (Buffer.byteLength(JSON.stringify(parameters), "utf8") > PLUGIN_TOOL_PARAMETERS_MAX_BYTES) {
    throw new Error(`plugin host: tools.register parameters exceed ${PLUGIN_TOOL_PARAMETERS_MAX_BYTES} bytes`);
  }
  return { name, description, parameters };
}

/** Collect activation-time tools through the capability-gated resident registration path. */
function setTools(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const { marshal } = runtime;
  using tools = ctx.newObject();
  const { holdings } = runtime;
  using registerFn = marshal.newHostFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "tools.register");
    if (defHandle === undefined) {
      throw new Error("plugin host: tools.register requires a definition object");
    }
    if (holdings.tools >= PLUGIN_TOOLS_MAX) {
      throw new Error(`plugin host: tools.register holds at most ${PLUGIN_TOOLS_MAX} tools per plugin`);
    }
    const allowance = inboundAllowance();
    const { name, description, parameters } = toolDefinition(marshal, defHandle, allowance);
    const presentation = toolDisplayMetadata(ctx, marshal, defHandle, { name, allowance });
    // Taken last, so every refusal above leaves no handle of ours; its ownership transfers to the Sandbox below.
    const handler = marshal.readGuestProp(defHandle, "handler");
    if (ctx.typeof(handler) !== "function") {
      handler.dispose();
      throw new Error("plugin host: tools.register handler must be a function");
    }
    holdings.tools += 1;
    runtime.collectTool(
      {
        name,
        description,
        parameters,
        ...presentation,
      },
      handler,
    );
    return ctx.undefined;
  });
  runtime.marshal.setHostProp(tools, "register", registerFn);
  runtime.marshal.setHostProp(surface, "tools", tools);
}

/** transforms.register — SYNC, activation-time, the D50 PromptTransform mirror of tools.register.
 *  Captures the guest `apply` HANDLE for the resident-handler runtime (the Sandbox keeps it alive + mints the
 *  ref) and records `{name, point}`. Capability-gated (chat.transform) through the SAME uniform gate — a
 *  snippet without the grant hits the throw here (no snippet-special path). NOTE the plugin ORDER BAND (1000+)
 *  is NOT a guest input: the guest supplies no `order`, and the DOMAIN registrar assigns the band ABOVE the
 *  0–999 automation band at activation — the membrane cannot bypass it because it cannot express it. */
function setTransforms(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const { marshal } = runtime;
  using transforms = ctx.newObject();
  using registerFn = marshal.newHostFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "transforms.register");
    const allowance = inboundAllowance();
    if (defHandle === undefined) {
      throw new Error("plugin host: transforms.register requires a definition object");
    }
    // Same split as `setTools`: the metadata handles are scope-owned; `apply`'s ownership TRANSFERS to
    // `collectTransform` on success (hand-disposed only on the reject path), so it stays explicit. It is taken
    // after the metadata reads, whose realm failure goes back to the guest.
    using nameHandle = marshal.readGuestProp(defHandle, "name");
    using pointHandle = marshal.readGuestProp(defHandle, "point");
    const dumpedName = tryDumpGuestValue(marshal, nameHandle, allowance);
    const dumpedPoint = tryDumpGuestValue(marshal, pointHandle, allowance);
    const apply = marshal.readGuestProp(defHandle, "apply");
    if (!(dumpedName.ok && dumpedPoint.ok)) {
      apply.dispose();
      throw new Error("plugin host: transforms.register metadata is too deeply nested or too large to read");
    }
    const name = dumpedName.value;
    const point = dumpedPoint.value;
    if (typeof name !== "string" || (point !== "user_input" && point !== "assembled_dynamic")) {
      apply.dispose();
      throw new Error("plugin host: transforms.register definition must be { name, point: 'user_input'|'assembled_dynamic', apply }");
    }
    runtime.collectTransform({ name, point }, apply);
    return ctx.undefined;
  });
  runtime.marshal.setHostProp(transforms, "register", registerFn);

  // registerDisplay — the seam-14 sibling. SYNC, activation-time, the same handle-ownership split; it collects
  // only a NAME (there is no `point` axis: a display transform has exactly one application site, the viewer's
  // own rendered row). Gated by the SAME `chat.transform` capability, so a plugin that may rewrite the prompt
  // may annotate its installer's screen and one that may not, may not.
  using registerDisplayFn = marshal.newHostFunction("registerDisplay", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "transforms.registerDisplay");
    const allowance = inboundAllowance();
    if (defHandle === undefined) {
      throw new Error("plugin host: transforms.registerDisplay requires a definition object");
    }
    using nameHandle = marshal.readGuestProp(defHandle, "name");
    const dumpedName = tryDumpGuestValue(marshal, nameHandle, allowance);
    const apply = marshal.readGuestProp(defHandle, "apply");
    if (!dumpedName.ok) {
      apply.dispose();
      throw new Error("plugin host: transforms.registerDisplay metadata is too deeply nested or too large to read");
    }
    if (typeof dumpedName.value !== "string" || ctx.typeof(apply) !== "function") {
      apply.dispose();
      throw new Error("plugin host: transforms.registerDisplay definition must be { name, apply }");
    }
    runtime.collectDisplayTransform({ name: dumpedName.value }, apply);
    return ctx.undefined;
  });
  runtime.marshal.setHostProp(transforms, "registerDisplay", registerDisplayFn);
  runtime.marshal.setHostProp(surface, "transforms", transforms);
}

/** macros.register — SYNC, activation-time, the macro mirror of `tools.register`.
 *  Collects `{name, description}` + the guest `resolve` HANDLE; the DOMAIN namespaces the name and resolves the
 *  handler ONCE per turn into that turn's macro registry. Capability-gated `chat.transform` through the SAME
 *  uniform gate. Infra assigns no name and evaluates nothing — it only collects, exactly as it does for tools. */
function setMacros(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const { marshal } = runtime;
  using macros = ctx.newObject();
  using registerFn = marshal.newHostFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "macros.register");
    const allowance = inboundAllowance();
    if (defHandle === undefined) {
      throw new Error("plugin host: macros.register requires a definition object");
    }
    // Same ownership split as `setTools`: metadata handles are scope-owned; `resolve`'s ownership TRANSFERS to
    // `collectMacro` on success and is hand-disposed only on the reject path. It is taken after the metadata reads.
    using nameHandle = marshal.readGuestProp(defHandle, "name");
    using descHandle = marshal.readGuestProp(defHandle, "description");
    const dumpedName = tryDumpGuestValue(marshal, nameHandle, allowance);
    const dumpedDescription = tryDumpGuestValue(marshal, descHandle, allowance);
    const resolve = marshal.readGuestProp(defHandle, "resolve");
    if (!(dumpedName.ok && dumpedDescription.ok)) {
      resolve.dispose();
      throw new Error("plugin host: macros.register metadata is too deeply nested or too large to read");
    }
    const name = dumpedName.value;
    const description = dumpedDescription.value;
    if (typeof name !== "string" || typeof description !== "string" || ctx.typeof(resolve) !== "function") {
      resolve.dispose();
      throw new Error("plugin host: macros.register definition must be { name, description, resolve }");
    }
    runtime.collectMacro({ name, description }, resolve);
    return ctx.undefined;
  });
  runtime.marshal.setHostProp(macros, "register", registerFn);
  runtime.marshal.setHostProp(surface, "macros", macros);
}

/** events.on — SYNC, activation-time, the event-subscription mirror of tools.register. `on(type, handler)`:
 *  gate events.subscribe, validate `type` against the closed Tier-1 taxonomy (plugins get no private event
 *  vocabulary), and capture the guest `handler` HANDLE for the resident-subscriber runtime. The handler is a
 *  POSITIONAL arg (auto-disposed after this callback), so it is `dup()`'d before being handed to the Sandbox
 *  (which keeps the dup + disposes it at teardown). The DOMAIN wires the collected subscription onto the
 *  automation fan-out (`subscribeEvent`): delivery is TF-1-validated + depth/visibility/declared-gated on the
 *  automation side — the membrane only collects, never bypasses those gates. INSTALLED plugins only (a snippet
 *  profile omits the grant → the same uniform capability throw, no snippet-special path). */
function setEvents(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const { marshal } = runtime;
  using events = ctx.newObject();
  using onFn = marshal.newHostFunction("on", (typeHandle?: QuickJSHandle, handlerHandle?: QuickJSHandle) => {
    requireCapability(runtime, "events.on");
    const allowance = inboundAllowance();
    if (typeHandle === undefined || handlerHandle === undefined) {
      throw new Error("plugin host: events.on requires (type, handler)");
    }
    const dumpedType = tryDumpGuestValue(marshal, typeHandle, allowance);
    if (!dumpedType.ok) {
      throw new Error("plugin host: events.on type is too deeply nested or too large to read");
    }
    const type = dumpedType.value;
    if (typeof type !== "string" || !TRIGGER_TYPES.has(type)) {
      throw new Error("plugin host: events.on type must be a Tier-1 trigger type (chat/domain taxonomy)");
    }
    if (ctx.typeof(handlerHandle) !== "function") {
      throw new Error("plugin host: events.on handler must be a function");
    }
    // Retain the guest handler ACROSS activation (a resident subscriber) — a positional arg handle is
    // auto-disposed when this callback returns, so `dup()` it and transfer ownership to the Sandbox.
    // `typeHandle`/`handlerHandle` are POSITIONAL ARGS: quickjs-emscripten disposes them itself when this
    // callback returns, so they must NEVER be `using` (a double-free throws in `Lifetime.dispose`).
    runtime.collectEvent({ type: type as ChatTriggerType | DomainTriggerType }, handlerHandle.dup());
    return ctx.undefined;
  });
  runtime.marshal.setHostProp(events, "on", onFn);
  runtime.marshal.setHostProp(surface, "events", events);
}

/** THE PRIVATE PLUGIN-EVENT PLANE (`host.pubsub`). `on` is a SYNC resident subscription
 *  (the `events.on` mirror — collected + wired to the INSTALLER-scoped bus at activation, never the automation
 *  fan-out); `emit` is an ASYNC runtime publish. Both gate `plugin_events`. The forgery wall's boundary half is
 *  HERE: the channel coordinates are validated COLON-FREE — `name` against `PLUGIN_PUBSUB_NAME_RE`, and (for `on`)
 *  the target `emitterSlug` against the manifest slug grammar — because a colon in a coordinate would inject into
 *  the bus's `installer:slug:name` key and could ALIAS a different channel, so it is refused at the trust edge,
 *  not sanitized downstream. The emit side stamps the emitter's OWN slug domain-side (the bridge), so a guest can
 *  publish only on its own channel. */
function setPubsub(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const { marshal } = runtime;
  using pubsub = ctx.newObject();
  const { holdings } = runtime;
  // on(emitterSlug, name, handler) — SYNC collect. A malformed subscription is a SOFT refusal (logged, absent),
  // never activation-fatal (the §4.9 surface-refusal posture): a bad `pubsub.on` must not kill the plugin's
  // tools/panels. The capability refusal above still THROWS (the uniform gate). The handler is a POSITIONAL arg
  // (auto-disposed by quickjs-emscripten on return), so it is `dup()`'d on the COLLECT path and left untouched on
  // every refuse path.
  using onFn = marshal.newHostFunction("on", (slugHandle?: QuickJSHandle, nameHandle?: QuickJSHandle, handlerHandle?: QuickJSHandle) => {
    requireCapability(runtime, "pubsub.on");
    const allowance = inboundAllowance();
    if (slugHandle === undefined || nameHandle === undefined || handlerHandle === undefined) {
      throw new Error("plugin host: pubsub.on requires (emitterSlug, name, handler)");
    }
    const dumpedSlug = tryDumpGuestValue(marshal, slugHandle, allowance);
    const dumpedName = tryDumpGuestValue(marshal, nameHandle, allowance);
    if (!(dumpedSlug.ok && dumpedName.ok)) {
      runtime.logWarn("pubsub.on refused a subscription: a coordinate is too deeply nested or too large to read");
      return ctx.undefined;
    }
    const emitterSlug = dumpedSlug.value;
    const name = dumpedName.value;
    if (typeof emitterSlug !== "string" || !pluginSlugSchema.safeParse(emitterSlug).success || typeof name !== "string" || !PLUGIN_PUBSUB_NAME_RE.test(name)) {
      runtime.logWarn("pubsub.on refused a subscription: emitterSlug/name grammar (must be colon-free bounded idents)");
      return ctx.undefined;
    }
    if (ctx.typeof(handlerHandle) !== "function") {
      runtime.logWarn("pubsub.on refused a subscription: the handler must be a function");
      return ctx.undefined;
    }
    if (holdings.subscriptions >= PLUGIN_PUBSUB_SUBSCRIPTIONS_MAX) {
      runtime.logWarn(`pubsub.on refused: at most ${PLUGIN_PUBSUB_SUBSCRIPTIONS_MAX} subscriptions per plugin`);
      return ctx.undefined;
    }
    holdings.subscriptions += 1;
    runtime.collectPubsub({ emitterSlug, name }, handlerHandle.dup());
    return ctx.undefined;
  });
  runtime.marshal.setHostProp(pubsub, "on", onFn);

  attachAsync(ctx, pubsub, {
    ref: "pubsub.emit",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const name = args[0];
      if (typeof name !== "string" || !PLUGIN_PUBSUB_NAME_RE.test(name)) {
        throw new Error("plugin host: pubsub.emit requires a valid event name (/^[a-z][a-z0-9_]{0,40}$/)");
      }
      // A plain JSON object only — an array/scalar/null is an empty payload (fail-safe, no throw). The domain bus
      // caps the serialized size; the arg-budget belt already bounded the inbound bytes.
      const raw = args[1];
      const data: Record<string, unknown> = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      // The emitter's own slug is stamped DOMAIN-side (the bridge closes it over from the activation manifest),
      // so a guest supplies ONLY name + data and can never publish on another plugin's `plugin:<slug>:<name>`. The
      // deliveries it opens run one deeper than this invocation, which the app checks against the command's authority.
      await runtime.bridge.pubsub.emit(name, data, runtime.currentCascadeDepth() + 1, invocationLiveness(signal));
      return null;
    },
  });
  runtime.marshal.setHostProp(surface, "pubsub", pubsub);
}

/** net.fetch — capability net.fetch; net.fetchAsset — capability net.fetch_asset. The membrane gates the grant and
 *  the URL's type; {@link PluginNetEgress} performs the request through the audited SSRF guard (`safeFetch`, D61)
 *  pinned to the manifest `netHosts`, in the app process. The guest supplies ONLY the URL (+ a GET/POST init for
 *  `fetch`). `fetch` answers `{status, body}`; `fetchAsset` lands a guarded image in the installer's own CAS and
 *  answers only its assetId, so no fetched URL or bytes ever reach the guest realm. */
function setNet(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using net = ctx.newObject();
  attachAsync(ctx, net, {
    ref: "net.fetch",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const url = args[0];
      if (typeof url !== "string") {
        throw new Error("plugin host: net.fetch requires a URL string");
      }
      return await runtime.netEgress.fetch(url, args[1] ?? null, invocationLiveness(signal));
    },
  });
  attachAsync(ctx, net, {
    ref: "net.fetchAsset",
    grants: runtime.grants,
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    log: runtime.log,
    marshal: runtime.marshal,
    impl: async (args, signal) => {
      const url = args[0];
      if (typeof url !== "string") {
        throw new Error("plugin host: net.fetchAsset requires a URL string");
      }
      return await runtime.netEgress.fetchAsset(url, invocationLiveness(signal));
    },
  });
  runtime.marshal.setHostProp(surface, "net", net);
}

function argsOverCap(name: string, cap: number): string {
  return `plugin host: ${name} arguments exceed the ${String(cap)}-byte inbound cap`;
}

function argsPastInFlightRoom(name: string): string {
  return `plugin host: ${name} arguments do not fit the ${String(HOST_FN_ARGS_IN_FLIGHT_MAX_BYTES)} bytes this plugin's running host calls may hold`;
}

/** One host call's arguments read into the host, or why they are refused. Each check runs before the in-flight gate,
 *  so a refused call never charges a slot.
 *
 *  - THE INBOUND LENGTH ALLOWANCE: every string the arguments hold is measured before it is read, against the most the
 *    call can carry or its store can keep, so a call refused for its size has copied nothing out of the realm
 *    (`marshal.ts`). Its bytes are at least its units, so the refusal names the cap as bytes truthfully.
 *  - THE INBOUND DEPTH GUARD: the marshal's bounded walk refuses a too-deep or too-wide argument as it reads it,
 *    because a deeply-nested guest argument handed to the binding's dump would overflow it host-side and corrupt the
 *    WASM runtime (`budgets.ts`).
 *  - THE INBOUND ARG CAP: the mirror of the result cap, on the bytes the read arguments cross as.
 *  - THE IN-FLIGHT ROOM: what the instance's running calls leave of {@link HOST_FN_ARGS_IN_FLIGHT_MAX_BYTES}. The
 *    length allowance is never more than the room, so a call past it is refused before the rest is read, and the
 *    bytes returned are what the caller charges.
 *
 *  Call it inside a host function, as {@link tryDumpGuestValue}. */
function readHostArgs(
  marshal: GuestMarshal,
  name: string,
  argHandles: readonly QuickJSHandle[],
  { argUnitsMax, room }: { readonly argUnitsMax: number; readonly room: number },
): { readonly ok: true; readonly args: readonly unknown[]; readonly bytes: number } | { readonly ok: false; readonly refusal: string } {
  const roomBound = room < argUnitsMax;
  const allowance: ReadAllowance = { units: Math.min(argUnitsMax, room) };
  const args: unknown[] = [];
  for (const handle of argHandles) {
    const dumped = tryDumpGuestValue(marshal, handle, allowance);
    if (!dumped.ok) {
      if (allowance.units >= 0) {
        return { ok: false, refusal: `plugin host: ${name} argument is ${dumped.reason}` };
      }
      return { ok: false, refusal: roomBound ? argsPastInFlightRoom(name) : argsOverCap(name, argUnitsMax) };
    }
    args.push(dumped.value);
  }
  const bytes = argBytes(args, HOST_FN_ARGS_MAX_BYTES);
  if (bytes > HOST_FN_ARGS_MAX_BYTES) {
    return { ok: false, refusal: argsOverCap(name, HOST_FN_ARGS_MAX_BYTES) };
  }
  return bytes > room ? { ok: false, refusal: argsPastInFlightRoom(name) } : { ok: true, args, bytes };
}

/** The serialized bytes of the already-dumped guest arguments, counted until they pass `cap`. An ITERATIVE walk that
 *  SHORT-CIRCUITS the moment the budget is blown — so a hostile payload costs ~`cap` of accounting, not a
 *  second full `JSON.stringify` of the whole graph. Every value is charged its own JSON text, which is the form a
 *  guest string crosses in (`marshal.ts`): a string or key its escaped text with quotes, a scalar its digits, plus
 *  one separator each. The charge is never below what crossed.
 *
 *  WHAT THIS BOUNDS, precisely: everything that crosses into a domain op, and everything RETAINED host-side for
 *  the life of the async impl — which is the amplification (`HOST_CALLS_IN_FLIGHT_MAX` concurrent calls, each
 *  previously free to hold the guest's whole 32 MiB heap, plus whatever the op then did with it: a
 *  `storage.set` writes it, a `net.fetch` body sends it). The TRANSIENT read it measures is bounded before it, by the
 *  length allowance in {@link readHostArgs}; this cap adds the exact byte count, which a length cannot give. */
function argBytes(args: readonly unknown[], cap: number): number {
  let bytes = 0;
  const pending: unknown[] = [...args];
  while (pending.length > 0 && bytes <= cap) {
    bytes += chargeValue(pending.pop(), pending);
  }
  return bytes;
}

/** The comma or colon JSON spends beside each value and key, so a payload of a million empty strings is not
 *  accounted as free. */
const JSON_SEPARATOR_BYTES = 1;
/** The brackets or braces around an array or object. */
const JSON_CONTAINER_BYTES = 2;

/** What JSON writes for a value it cannot hold (undefined, a function, a symbol) in an array. */
const JSON_NULL = "null";

/** The UTF-8 bytes of one scalar or key in JSON, plus its separator. A value JSON cannot hold is charged as the `null`
 *  an array would write for it; a bigint (a top-level guest argument can be one) as its digits. */
function jsonBytes(value: unknown): number {
  let text = JSON_NULL;
  if (typeof value === "bigint") {
    text = value.toString();
  } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    text = JSON.stringify(value);
  }
  return Buffer.byteLength(text, "utf8") + JSON_SEPARATOR_BYTES;
}

/** Charge ONE already-dumped value, PUSHING its children onto `pending` (mutated by design — the walk is
 *  iterative so a deeply-nested guest payload cannot recurse the host stack). */
function chargeValue(value: unknown, pending: unknown[]): number {
  if (Array.isArray(value)) {
    for (const child of value) {
      pending.push(child);
    }
    return JSON_CONTAINER_BYTES + JSON_SEPARATOR_BYTES;
  }
  if (typeof value === "object" && value !== null) {
    let keys = JSON_CONTAINER_BYTES + JSON_SEPARATOR_BYTES;
    for (const [key, child] of Object.entries(value)) {
      keys += jsonBytes(key);
      pending.push(child);
    }
    return keys;
  }
  return jsonBytes(value);
}

/** Settle a host call's guest promise with the value `build` makes, which this releases. Call it inside a span. Building
 *  a host error and running the resolver both call the realm and can fail there: the interrupt past the window, the
 *  guest's heap is full, or the span's window passes in a guest `then` getter the resolve reads. The guest promise
 *  then never settles, so its resolvers and the failure are released here (an unsettled one aborts the engine at
 *  teardown) and the invocation's settlement wall ends what still awaits it. */
function settleGuestPromise(spec: AsyncFnSpec, deferred: QuickJSDeferredPromise, settle: QuickJSDeferredPromise["resolve"], build: () => QuickJSHandle): void {
  try {
    using settled = build();
    settle(settled);
  } catch (error) {
    if (error instanceof GuestCallFailure) {
      error.thrown.dispose();
    }
    deferred.dispose();
    spec.log.warn({ err: error, hostFunction: hostFunctionName(spec.ref) }, "plugin host: the realm could not settle a host call's guest promise");
  }
}

/** Build + attach ONE async host function: guest args via `fromGuest`, the impl races a real-time deadline, the
 *  JSON-safe result crosses back as JSON text, size-capped on that text as it arrives and settled inside a span or
 *  held while the account is spent, and settled guest jobs are pumped inside a span (`cpu-guard.ts` — inside an
 *  invocation both spend its CPU account; the pump runs guest continuations, so it is bounded like an invocation is).
 *  At most `HOST_CALLS_IN_FLIGHT_MAX` host calls per instance are running or awaiting their settlement; one more
 *  rejects (back-pressure).
 *  A thrown/rejected impl (a capability/handle/host-authority refusal, or a bridge error) rejects the guest
 *  promise — errors-as-data, never a host crash.
 *
 *  THE TWO SETTLEMENTS ARE DIFFERENT EVENTS AND THEY RELEASE DIFFERENT THINGS — this is the whole point:
 *   - the RACE settles when the guest's promise resolves/rejects (impl result, or the deadline). That is what
 *     deregisters `pending` (the guest promise is no longer a teardown hazard) and clears the timer.
 *   - the IMPL settles when the actual host work finishes. That — and ONLY that — releases the in-flight slot.
 *  The deadline ABORTS a per-call controller; `net.fetch` and `llm.quiet` carry it to their real I/O doors.
 *  Domain writes that cannot safely cancel may ignore it, so charging the slot to the race would still count
 *  not-yet-timed-out PROMISES rather than real work. The slot therefore remains charged until the impl settles,
 *  and teardown joins those settlements before releasing resident admission. Note what
 *  this does NOT claim to be: a spend CEILING (the D46 amendment retired the plugin spend tier
 *  deliberately). It is a concurrency bound, and it is now true. */
function attachAsync(ctx: QuickJSContext, target: QuickJSHandle, spec: AsyncFnSpec): void {
  const { ref, grants, inFlight, pending, impl, log, marshal, argUnitsMax = HOST_FN_ARGS_MAX_BYTES } = spec;
  const name = hostFunctionName(ref);
  const capability = HOST_FUNCTION_CAPABILITY[ref];
  // The membrane runs in the broker Worker, whose spans reach no debug surface.
  const { superviseDetached } = createDetachedSupervision(log, null);
  using fn = marshal.newHostFunction(name, (...argHandles) => {
    // The positional `argHandles` are quickjs-emscripten's; it disposes them itself.
    //
    // THE CAPABILITY GATE COMES FIRST. An ungranted call is refused before any argument is read, walked or
    // charged and before it takes an in-flight slot, so a plugin without the grant cannot spend host work here.
    if (!grants.has(capability)) {
      return marshal.rejectedWith(new PluginCapabilityError(capability));
    }
    //
    // The reads come before any handle of ours exists: a realm failure during one goes back to the guest as it is.
    // A refusal is an already-rejected promise and registers nothing in `pending`.
    const read = readHostArgs(marshal, name, argHandles, { argUnitsMax, room: HOST_FN_ARGS_IN_FLIGHT_MAX_BYTES - inFlight.argBytes });
    if (!read.ok) {
      return marshal.rejectedWith({ name: "Error", message: read.refusal });
    }
    const { args, bytes } = read;

    // Two counts under one cap: host work still running, and guest promises not yet settled, a settlement held while
    // the account is spent included. The second bounds what held settlements keep in memory to the cap's number of
    // capped results.
    if (inFlight.count >= HOST_CALLS_IN_FLIGHT_MAX || pending.size >= HOST_CALLS_IN_FLIGHT_MAX) {
      return marshal.rejectedWith({ name: "Error", message: `plugin host: too many concurrent host calls (>${HOST_CALLS_IN_FLIGHT_MAX})` });
    }
    // `deferred` is deliberately NOT `using`: its lifetime ESCAPES this scope (its `.handle` is the guest's
    // promise and the Sandbox's `pending` drain owns teardown).
    const deferred = ctx.newPromise();
    inFlight.count += 1;
    // The arguments stay alive for as long as the implementation runs, so their bytes are held until it settles.
    inFlight.argBytes += bytes;
    // Track this UNSETTLED deferred so the Sandbox can drain it if the invocation ends before it settles (a
    // fire-and-forget that outlives its scope): an unsettled guest Promise at `ctx.dispose()` aborts the shared
    // WASM module. Deregistered in the `.finally` once the host call settles (or is dropped by the alive guard).
    pending.add(deferred);

    const controller = new AbortController();
    inFlight.controllers?.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new PluginHostDeadlineError(name, HOST_FN_DEADLINE_MS));
        controller.abort();
      }, HOST_FN_DEADLINE_MS);
      timer.unref();
    });

    // The slot is charged to the IMPL, not to the race (see the header): cooperative abort is not proof that a
    // non-cancellable write stopped, so the slot stays held while the host work is still running. Exactly one
    // release per acquisition, on either settle arm — the counter can therefore never drift negative.
    const running = impl(args, controller.signal);
    let settlement: Promise<void>;
    const releaseSlot = (): void => {
      inFlight.count -= 1;
      inFlight.argBytes -= bytes;
      inFlight.controllers?.delete(controller);
      inFlight.settlements?.delete(settlement);
    };
    // bookkeeping barrier only: both arms release the in-flight slot once. The rejection of `running` is owned by the Promise.race chain below, which routes it to deferred.reject(err) and so to the guest. Ends if this chain becomes the only reader of `running`.
    settlement = running.then(releaseSlot, releaseSlot);
    inFlight.settlements?.add(settlement);

    // Settling runs guest code — the resolve reads `then` on the result, through any getter a guest put on a prototype
    // — so it runs inside a span, bounded by the window and charged, or waits host-side while the account it would
    // spend is spent (D346). The deferred leaves `pending` only once settled or dropped, so a held
    // one is still drained at teardown. The in-flight SLOT is deliberately not released here: see `releaseSlot` above.
    const settleHeld = (settle: () => void): void => {
      // A fire-and-forget guest call can outlive its invocation: the context is disposed (snippet end / deactivate)
      // BEFORE this real-async host call settles. Touching a dead context (deferred/marshal) is a use-after-free that
      // escapes as an unhandled rejection — drop the late result (the guest promise it would resolve no longer exists;
      // leak-proof, the PluginInvocationEnded posture).
      if (!ctx.alive) {
        pending.delete(deferred);
        return;
      }
      settleInCpuWindow(ctx, () => {
        try {
          settle();
        } finally {
          pending.delete(deferred);
        }
      });
    };

    // the rejection arm builds the guest error (name preserved) and calls deferred.reject(err), so the guest promise receives the failure. The !ctx.alive guard in settleHeld drops it on purpose: the guest promise no longer exists and touching a disposed context is a use-after-free. Ends if a disposed context gains a safe late-failure sink.
    void Promise.race([running, timeout])
      .then(
        (result) => {
          // The cap measures the very text that crosses, so it counts what the guest receives. It is taken as the
          // result arrives, so a held settlement keeps at most the capped text, never the raw result.
          const json = guestJson(result);
          const crossing = Buffer.byteLength(json, "utf8") > HOST_FN_RESULT_CAP_BYTES ? null : json;
          settleHeld(() => {
            if (crossing === null) {
              settleGuestPromise(spec, deferred, deferred.reject, () =>
                marshal.newHostError({ name: "Error", message: `${name} host result exceeds ${HOST_FN_RESULT_CAP_BYTES}-byte cap` }),
              );
              return;
            }
            const parsed = marshal.parseIntoGuest(crossing);
            if (parsed.error) {
              settleGuestPromise(spec, deferred, deferred.reject, () => parsed.error);
              return;
            }
            settleGuestPromise(spec, deferred, deferred.resolve, () => parsed.value);
          });
        },
        (reason: unknown) => {
          // Preserve the Error's NAME across the boundary (not just the message) — a typed membrane rejection
          // (`PluginCapabilityError`) must reach the guest with `e.name === "PluginCapabilityError"` so a plugin
          // feature-detects by type, not by a message substring. Nameless/non-Error reasons fall back
          // to a plain `"Error"`. A deadline also carries the bare name of a host function this guest called
          // itself, so it leaks nothing.
          const error = reason instanceof Error ? reason : { name: "Error", message: String(reason) };
          const fields = reason instanceof PluginHostDeadlineError ? { hostFunction: reason.hostFunction } : {};
          settleHeld(() => {
            settleGuestPromise(spec, deferred, deferred.reject, () => marshal.newHostError(error, fields));
          });
        },
      )
      .finally(() => {
        clearTimeout(timer);
      });

    // THE POST-INVOCATION PUMP. When this host call settles LATER than the invocation that fired it,
    // the guest's `.then` continuation runs HERE — bytecode outside any invocation, which until the
    // context-lifetime CPU guard landed executed with NO interrupt handler installed at all: one
    // `h.storage.get(k).then(function () { while (true) {} })` in `main.js` wedged the Node MAIN THREAD
    // permanently. `pumpGuestJobs` runs the pump inside a span and owns the `ctx.alive` guard for the late-settle case
    // (the instance can be torn down before this call lands).
    superviseDetached(`plugin-host:${name}:${randomUUID()}`, "plugin.host.pending-jobs", { hostFunction: name }, () =>
      deferred.settled.then(() => {
        pumpGuestJobs(ctx);
      }),
    );
    return deferred.handle;
  });
  marshal.setHostProp(target, name, fn);
}
