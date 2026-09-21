// infra/plugin-host/membrane — the capability-gated host-fn CALL surface. Attaches the
// gated namespaces onto the `orb.host(1)` surface the determinism floor already built (realm.ts). Every gated
// function is bound host-side through ONE async bridge: guest args cross via `ctx.dump` (JSON-safe only), the
// injected `PluginBridge` op runs host-side under the installing/calling principal (the DOMAIN gated the
// invocation-chat-context + folded host-authority into `grants` BEFORE this runtime ever runs — infra never
// sees a Principal or a roster), and the JSON-safe result crosses back via `jsToHandle`. The bridge is
// authority-AGNOSTIC by construction: it only ever receives an already-admitted `ChatId`.
//
// The three enforcement mechanisms this file owns (the escape-suite pins them — 04 §P4):
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

import { randomUUID } from "node:crypto";
import type { ChatTriggerType, DomainTriggerType } from "@orb/contracts/automation";
import { CHAT_TRIGGER_TYPES, DOMAIN_TRIGGER_TYPES } from "@orb/contracts/automation";
import type { VariablePrecondition } from "@orb/contracts/chat";
import { variablePreconditionsSchema } from "@orb/contracts/chat";
import type { GenerateImageActionArgs } from "@orb/contracts/imagery";
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
  PluginTransformRegistration,
  PluginWorldEntryUpsert,
} from "@orb/contracts/plugin";
import {
  HOST_FUNCTION_CAPABILITY,
  PLUGIN_FRAME_SURFACES_MAX,
  PLUGIN_PUBSUB_NAME_RE,
  PLUGIN_PUBSUB_SUBSCRIPTIONS_MAX,
  PLUGIN_QUIET_IMAGES_MAX,
  PLUGIN_SEARCH_RESULTS_MAX,
  PLUGIN_SURFACE_ID_RE,
  PLUGIN_TIER_REGISTRAR,
  PLUGIN_TOAST_LEVELS,
  PLUGIN_TOOL_NAME_RE,
  PluginCapabilityError,
  PluginSuggestedError,
  pluginCommandRegistrationMetaSchema,
  pluginFrameBodySchema,
  pluginSlugSchema,
  pluginSurfaceRegistrationMetaSchema,
} from "@orb/contracts/plugin";
import type { VarOp } from "@orb/kit/macro";
import type { QuickJSContext, QuickJSDeferredPromise, QuickJSHandle } from "quickjs-emscripten-core";
import { z } from "zod";
import { superviseDetached } from "#foundation/observability";
import type { SafeFetchOptions } from "../network/egress.ts";
import { safeFetch } from "../network/egress.ts";
import { isAllowedImageBuffer } from "../network/image-guard.ts";
import {
  HOST_CALLS_IN_FLIGHT_MAX,
  HOST_FN_ARGS_MAX_BYTES,
  HOST_FN_DEADLINE_MS,
  HOST_FN_RESULT_CAP_BYTES,
  PLUGIN_ASSET_MAX_BYTES,
  PLUGIN_DUMP_DEPTH_GUARD,
  PLUGIN_DUMP_NODE_GUARD,
  PLUGIN_NET_MAX_BYTES,
  PLUGIN_QUIET_PROMPT_MAX_CHARS,
} from "./budgets.ts";
import { pumpGuestJobs } from "./cpu-guard.ts";
import { jsToHandle } from "./marshal.ts";

export type { InvocationChat, PluginBridge } from "@orb/contracts/plugin";

/** The per-instance concurrent-host-call counter (back-pressure). Lives on the Sandbox (one per context) and is
 *  NEVER reset — it counts host-fn IMPLEMENTATIONS that have STARTED and not yet SETTLED, which is the only
 *  reading under which "≤32 concurrent host calls" is a bound on WORK rather than on promises.
 *
 *  WHY NOT PER-INVOCATION (the P2-G repair, measured 2026-08-24). Two facts make an invocation-scoped counter a
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
  readonly grants: ReadonlySet<PluginCapability>;
  readonly bridge: PluginBridge;
  readonly currentChat: () => InvocationChat | null;
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
   *  calls `ctx.newPromise()` without threading `pending` is the bug this invariant exists to catch;
   *  the escape suite's multi-pending dispose-drain test + port.test's fire-and-forget cases are its regression
   *  floor (a static gate cannot verify the dataflow — flagged for a review-time follow-up). */
  readonly pending: Set<QuickJSDeferredPromise>;
  readonly collectTool: (
    reg: { readonly name: string; readonly description: string; readonly parameters: Record<string, unknown> },
    handler: QuickJSHandle,
  ) => void;
  /** Collect a D50 transform registration — the SYNC activation-time mirror of `collectTool`. The
   *  Sandbox keeps the guest `apply` HANDLE alive (keyed by a minted ref) + records a
   *  `PluginTransformRegistration` on the instance. The DOMAIN wires each into the shared prompt-transform
   *  registry at activation (`registerTransform`): it assigns the plugin ORDER BAND (1000+, ABOVE the 0–999
   *  automation band), builds the `PromptTransform` whose `apply` re-enters the guest under the invocation
   *  budget, and unregisters on deactivate. Infra cannot import that domain registry (the cake) — it only
   *  collects; the band + apply-under-budget + unregister live domain-side. */
  readonly collectTransform: (reg: { readonly name: string; readonly point: TransformPoint }, handler: QuickJSHandle) => void;
  /** Collect a DISPLAY transform registration (plugin-ui-plane seam 14) — the sibling of `collectTransform`
   *  with NO external registrar: like a surface, it is read directly off the resident instance by the display
   *  round-trip verb and re-entered through the port's `invoke`. Infra only collects + keeps the handle alive. */
  readonly collectDisplayTransform: (reg: { readonly name: string }, handler: QuickJSHandle) => void;
  /** Collect a MACRO registration (plugin-ui-plane §5.15). Infra collects the guest-LOCAL name; the DOMAIN
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
  /** Collect a PRIVATE plugin-event subscription (`host.pubsub.on`, plugin-ui-plane §5a) — the `collectEvent`
   *  mirror, one plane over. The guest handler HANDLE is kept alive; the DOMAIN wires each onto the
   *  INSTALLER-scoped resident plugin-event bus at activation (`subscribePubsub`), never the automation fan-out.
   *  `emitterSlug`/`name` are validated to bounded grammars at THIS boundary (an unbounded coordinate is an
   *  unbounded bus-map key). */
  readonly collectPubsub: (reg: { readonly emitterSlug: string; readonly name: string }, handler: QuickJSHandle) => void;
  /** Collect a UI surface registration — the SYNC activation-time mirror of `collectTool` (plugin-ui-plane #679
   *  U1, seam 4). `meta` is the ALREADY-VALIDATED serializable descriptor (`setUi` ran the zod schema — the host
   *  trust boundary); `onAction` is the guest handler HANDLE the Sandbox keeps alive keyed by a minted ref (`null`
   *  = a display-only surface). Unlike tools/transforms/events a surface needs NO external registrar: it is read
   *  directly off the resident instance by `plugin.listSurfaces` and re-entered by `plugin.invokeUiAction`. */
  readonly collectSurface: (meta: PluginSurfaceRegistrationMeta, onAction: QuickJSHandle | null, frame?: PluginFrameBody) => void;
  /** Collect a UI COMMAND registration — the `collectSurface` mirror (plugin-ui-plane #679 U5, §4.5). `meta` is
   *  the ALREADY-VALIDATED serializable descriptor; `onRun` is the guest handler HANDLE the Sandbox keeps alive
   *  keyed by a minted ref, and it is NON-NULL by construction (a command with nothing to run is a dead menu
   *  row, not a display-only affordance — the membrane refuses one softly before ever calling this). Like a
   *  surface, a command needs no external registrar: `plugin.listCommands` reads it off the resident instance
   *  and `plugin.invokeUiCommand` re-enters it. */
  readonly collectCommand: (meta: PluginCommandRegistrationMeta, onRun: QuickJSHandle) => void;
  /** Append a WARN line to the instance's log ring (drained into the invocation outcome / runtime ring). The ONE
   *  soft-diagnostic seam: `ui.register` uses it to record a refused surface WITHOUT throwing — an invalid surface
   *  spec must not be activation-fatal (a plugin's tools/chips outlive its stale panel, plugin-ui-plane §4.9). */
  readonly logWarn: (message: string) => void;
  /** The manifest-declared `net.fetch` allowlist (the SSRF wall). Threaded as plain-string DATA from
   *  the validated manifest (`netHosts`); NEVER `ANY_HOST`, NEVER guest-supplied. Empty ⇒ every fetch is
   *  refused (fail-closed): a `net.fetch` grant with no declared host reaches nothing. */
  readonly netHosts: readonly string[];
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
 *  the name + impl). */
interface AsyncFnSpec {
  readonly name: string;
  readonly inFlight: InFlightCounter;
  readonly pending: Set<QuickJSDeferredPromise>;
  readonly impl: (args: readonly unknown[], signal: AbortSignal) => Promise<unknown>;
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
  setGrants(ctx, surface, runtime.grants);
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

interface DumpWalkFrame {
  readonly handle: QuickJSHandle;
  readonly depth: number;
  readonly owned: boolean;
}

/** Push each own-property value of an object/array HANDLE onto the walk stack at `depth + 1` — a single-level,
 *  non-recursive read (array indices are own props), so it cannot itself overflow the host stack. A non-object
 *  (or `null`, which is also `typeof "object"` but enumerates empty) contributes no children. */
function pushDumpChildren(ctx: QuickJSContext, frame: DumpWalkFrame, frames: DumpWalkFrame[]): void {
  if (ctx.typeof(frame.handle) !== "object") {
    return;
  }
  const names = ctx.getOwnPropertyNames(frame.handle);
  if (names.error) {
    names.error.dispose();
    return;
  }
  for (const nameH of names.value) {
    frames.push({ handle: ctx.getProp(frame.handle, nameH), depth: frame.depth + 1, owned: true });
  }
  names.value.dispose(); // disposes the enumerated key handles (the getProp'd child handles are separate + owned)
}

/** Refuse a guest HANDLE too DEEPLY NESTED to hand to `ctx.dump` safely, WITHOUT materializing it. `ctx.dump`
 *  walks the guest tree on the HOST call stack, and an overflow there does not merely throw — it CORRUPTS the
 *  shared WASM runtime (the dispose-time `list_empty` abort, a crash of every co-resident plugin; see
 *  `budgets.ts`). Guards BOTH the `ui.register` spec (before the additionally-recursive `z.lazy` parse, whose
 *  cliff is tighter still) and every async host-fn ARG (`attachAsync`). This walk uses an EXPLICIT frame stack
 *  (never the host call stack, so the guard itself cannot overflow) and a single-level property enumeration per
 *  node, refusing the moment depth or the visited-node count exceeds its guard. It does NOT re-enforce the precise
 *  downstream caps (the spec's superRefine, the arg-byte budget) — those run safely once a shallow, bounded tree
 *  is guaranteed. The root handle is caller-owned (left alone); every handle THIS opens is disposed here —
 *  including any still queued when it short-circuits. Returns `false` ⇒ the caller refuses (soft for a spec, a
 *  rejected guest promise for an arg). */
function handleSafeToDump(ctx: QuickJSContext, rootH: QuickJSHandle): boolean {
  let visited = 0;
  // Root frame is caller-owned (`owned:false`); every child handle `pushDumpChildren` opens is ours to dispose.
  const frames: DumpWalkFrame[] = [{ handle: rootH, depth: 1, owned: false }];
  try {
    while (frames.length > 0) {
      const frame = frames.pop();
      if (frame === undefined) {
        break;
      }
      visited += 1;
      const overGuard = frame.depth > PLUGIN_DUMP_DEPTH_GUARD || visited > PLUGIN_DUMP_NODE_GUARD;
      if (!overGuard) {
        pushDumpChildren(ctx, frame, frames);
      }
      if (frame.owned) {
        frame.handle.dispose();
      }
      if (overGuard) {
        return false;
      }
    }
    return true;
  } finally {
    // On a short-circuit `return false`, dispose every owned handle still queued (the root is never ours).
    for (const frame of frames) {
      if (frame.owned) {
        frame.handle.dispose();
      }
    }
  }
}

type DumpGuestResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/** The ONE guest-handle materialization doorway. The explicit walk is deliberately inside the helper so a
 *  caller cannot remember the guard but accidentally put it after `ctx.dump`. */
function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle): DumpGuestResult {
  if (!handleSafeToDump(ctx, handle)) {
    return { ok: false };
  }
  return { ok: true, value: ctx.dump(handle) as unknown };
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
 *  deeply nested / too large to hand to `ctx.dump` safely. Shared by both registrars so the deep-nesting belt —
 *  which protects the shared WASM runtime, not merely this call (see {@link handleSafeToDump}) — is applied
 *  identically at both doors. Every handle it opens is disposed here. */
function dumpDefProps(ctx: QuickJSContext, defHandle: QuickJSHandle, names: readonly string[]): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const name of names) {
    using handle = ctx.getProp(defHandle, name);
    const dumped = tryDumpGuestValue(ctx, handle);
    if (!dumped.ok) {
      return;
    }
    out[name] = dumped.value;
  }
  return out;
}

/** A def's metadata, materialized and validated, or the SOFT-refusal reason (§4.9). */
type SurfaceMetaParse = { readonly ok: true; readonly meta: PluginSurfaceRegistrationMeta } | { readonly ok: false; readonly reason: string };

/**
 * Materialize `props` off a guest def, apply `overrides` (HOST-supplied fields the guest may not name), and
 * validate the result at the trust boundary. Shared by both registrars.
 *
 * IT RUNS UNDER A BELT: any throw — a residual `RangeError` the deep-nesting pre-walk did not pre-empt, a
 * marshalling failure — becomes the §4.9 soft refusal, never an activation-fatal throw. `safeParse` catches a
 * `ZodError` but NOT a `RangeError`, so the try/catch is load-bearing, not decoration.
 *
 * `overrides` are applied AFTER the dump, so a field the host supplies (the frame door's `tier`) cannot be
 * shadowed by a guest property of the same name.
 */
function parseSurfaceMeta(
  ctx: QuickJSContext,
  defHandle: QuickJSHandle,
  props: readonly string[],
  overrides: Readonly<Record<string, unknown>>,
): SurfaceMetaParse {
  try {
    const raw = dumpDefProps(ctx, defHandle, props);
    if (raw === undefined) {
      return { ok: false, reason: "metadata is too deeply nested or too large to validate" };
    }
    const parsed = pluginSurfaceRegistrationMetaSchema.safeParse({ ...raw, ...overrides });
    // `prettifyError` carries the PATH (which field failed) — the diagnostic a plugin author needs to fix a
    // stale spec, where a bare `issues[0].message` names none.
    return parsed.success ? { ok: true, meta: parsed.data } : { ok: false, reason: z.prettifyError(parsed.error) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** `ui.register(def)` — SYNC, activation-time (the `tools.register` mirror): validate the serializable metadata
 *  host-side (`pluginSurfaceRegistrationMetaSchema` — the trust boundary), keep the guest `onAction` HANDLE,
 *  collect a surface registration. An INVALID def is logged + SKIPPED, NEVER thrown: a stale panel spec must not
 *  kill the activation that also registered the plugin's tools/events (§4.9). capability: `ui.surface`. */
function newRegisterFn(ctx: QuickJSContext, runtime: MembraneRuntime): QuickJSHandle {
  return ctx.newFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "ui.register");
    if (defHandle === undefined) {
      throw new Error("plugin host: ui.register requires a definition object");
    }
    // `onAction` is NOT scope-owned: on the collect path its ownership TRANSFERS to the Sandbox (kept alive for
    // the instance lifetime); on every other path it is hand-disposed — a `using` would double-free the
    // transferred handle (`Lifetime.dispose` throws on a second call). `refuse` owns that discipline for every
    // early exit, so no arm can forget it.
    const onAction = ctx.getProp(defHandle, "onAction");
    const refuse = (reason: string): QuickJSHandle => {
      onAction.dispose();
      runtime.logWarn(`ui.register refused a surface: ${reason}`);
      return ctx.undefined;
    };
    // Absent props dump as `undefined`, which the schema's optional `spec`/`toolName` accept — and which the
    // U3 `tool-card` biconditional REFUSES for that one anchor.
    const parsed = parseSurfaceMeta(ctx, defHandle, SURFACE_DEF_PROPS, {});
    if (!parsed.ok) {
      return refuse(parsed.reason);
    }
    // THE CAPABILITY FORK (U7). This door is gated on `ui.surface`; the `frame` tier is gated on `ui.frame` and
    // is minted ONLY by `registerFrame`. Without this, a guest holding `ui.surface` alone could take the hatch's
    // tier by naming it and the louder consent line would never have been shown. Read off `PLUGIN_TIER_REGISTRAR`
    // rather than re-spelled as `tier === "frame"`, so a FUTURE tier fails `tsc` at that Record instead of
    // silently defaulting into this door.
    if (PLUGIN_TIER_REGISTRAR[parsed.meta.tier] !== "ui.register") {
      return refuse(`the '${parsed.meta.tier}' tier is registered through host.ui.registerFrame`);
    }
    if (ctx.typeof(onAction) === "function") {
      runtime.collectSurface(parsed.meta, onAction);
    } else {
      // No action handler — a display-only surface. Drop the non-function handle (an absent prop is `undefined`).
      onAction.dispose();
      runtime.collectSurface(parsed.meta, null);
    }
    return ctx.undefined;
  });
}

/** A frame def's BODY, materialized and validated, or the soft-refusal reason. Separate from the meta parse
 *  because the body is the one thing that never enters {@link PluginSurfaceRegistrationMeta} — it must not reach
 *  the projected wire shape (`PluginSurfaceView extends` that meta), so it is validated by its own schema and
 *  handed to `collectSurface` as its own argument. */
type FrameBodyParse = { readonly ok: true; readonly body: PluginFrameBody } | { readonly ok: false; readonly reason: string };

function parseFrameBody(ctx: QuickJSContext, defHandle: QuickJSHandle): FrameBodyParse {
  try {
    const raw = dumpDefProps(ctx, defHandle, FRAME_BODY_PROPS);
    if (raw === undefined) {
      return { ok: false, reason: "the frame body is too deeply nested or too large to validate" };
    }
    const parsed = pluginFrameBodySchema.safeParse(raw);
    return parsed.success ? { ok: true, body: parsed.data } : { ok: false, reason: z.prettifyError(parsed.error) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** `ui.registerFrame(def)` — the U7 ESCAPE HATCH's door (plugin-ui-plane §6.2). capability: **`ui.frame`**.
 *
 *  Three things make it a different door rather than an argument:
 *   1. THE CAPABILITY. A frame runs the plugin's own code in an isolated document and can beacon over WebRTC
 *      (residual R1, unclosable) — a louder consent line than `ui.surface`'s, and consent is enforced per
 *      FUNCTION here.
 *   2. THE TIER IS OURS. `tier: "frame"` is supplied host-side; the guest cannot name a tier at this door, so
 *      the fork is not reachable from the argument.
 *   3. THE COUNT CAP. A frame BODY is up to 64 KiB held for the instance lifetime and multiplied by
 *      `PLUGIN_RESIDENT_RUNTIME_MAX`; `ui.register` needs no such cap because a spec is already bounded to
 *      32 KiB. The counter is per-CONTEXT (this closure is built once per sandbox), so it bounds ONE plugin
 *      instance, which is the thing whose memory it is protecting.
 *
 *  A frame surface has no `onAction`: its actions ride the postMessage bridge, never a declarative button. */
function newRegisterFrameFn(ctx: QuickJSContext, runtime: MembraneRuntime): QuickJSHandle {
  let registered = 0;
  return ctx.newFunction("registerFrame", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "ui.registerFrame");
    if (defHandle === undefined) {
      throw new Error("plugin host: ui.registerFrame requires a definition object");
    }
    const refuse = (reason: string): QuickJSHandle => {
      runtime.logWarn(`ui.registerFrame refused a surface: ${reason}`);
      return ctx.undefined;
    };
    if (registered >= PLUGIN_FRAME_SURFACES_MAX) {
      return refuse(`at most ${PLUGIN_FRAME_SURFACES_MAX} frame surfaces per plugin`);
    }
    // `tier` is an OVERRIDE, not a read: the guest never names one at this door (see FRAME_DEF_PROPS). The meta
    // parse still applies every shared belt — the id grammar, the title cap, and the anchor × tier admission
    // that refuses `message-footer` permanently (`PLUGIN_ANCHOR_TIERS`).
    const parsed = parseSurfaceMeta(ctx, defHandle, FRAME_DEF_PROPS, { tier: "frame" });
    if (!parsed.ok) {
      return refuse(parsed.reason);
    }
    const body = parseFrameBody(ctx, defHandle);
    if (!body.ok) {
      return refuse(body.reason);
    }
    registered += 1;
    runtime.collectSurface(parsed.meta, null, body.body);
    return ctx.undefined;
  });
}

/** The plugin UI plane's guest-facing namespace. `register`/`setState` are the DECLARATIVE arm (capability
 *  `ui.surface`, U1); `registerFrame` is the U7 escape hatch (capability `ui.frame`) — see the two factories
 *  above for why the hatch is its own door.
 *
 *  `setState(surfaceId, state)` — ASYNC, runtime: publish the whole replacement state through the bridge (the
 *  domain writes the in-memory state row + emits the per-user freshness poke). JSON-safe data only. */
function setUi(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using ui = ctx.newObject();
  using registerFn = newRegisterFn(ctx, runtime);
  ctx.setProp(ui, "register", registerFn);
  using registerFrameFn = newRegisterFrameFn(ctx, runtime);
  ctx.setProp(ui, "registerFrame", registerFrameFn);

  attachAsync(ctx, ui, {
    name: "setState",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "ui.setState");
      const surfaceId = args[0];
      if (typeof surfaceId !== "string") {
        throw new Error("plugin host: ui.setState requires a surfaceId string");
      }
      // Validate the surfaceId against the SAME bounded grammar `ui.register` enforces (the trust boundary): the
      // domain state plane keys on `pluginId:surfaceId`, so an arbitrary/unbounded id would be an arbitrary map
      // key — a fresh one per call is the unbounded-key DoS (#707 Finding B). The RE bounds each key; the store's
      // per-plugin key cap bounds their COUNT.
      if (!PLUGIN_SURFACE_ID_RE.test(surfaceId)) {
        throw new Error("plugin host: ui.setState requires a valid surfaceId (/^[a-z][a-z0-9_]{0,40}$/)");
      }
      // A plain JSON object only — an array / scalar / null is an empty state (fail-safe: no throw). The domain
      // op caps the serialized size; the arg-budget belt already bounded the inbound bytes.
      const raw = args[1];
      const state: Record<string, unknown> = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      // THE OPTIONAL ROOM DIMENSION (row 777). ABSENT (`undefined`/`null`) ⇒ the plugin-wide row every room
      // shares — the U1 shape, unchanged, so every existing guest keeps working byte-for-byte. PRESENT ⇒ it must
      // be the ADMITTED invocation's opaque chat handle, resolved by the SAME `resolveChat` every other
      // room-scoped host fn uses: a forged, stale, or out-of-scope token throws here rather than silently
      // publishing into a room this invocation was never admitted to. Deliberately NOT "coerce a non-string to
      // no-chat": that would turn a typo'd handle into a silent cross-room write to the shared row, which is the
      // failure mode a guest cannot see.
      const chatArg = args[2];
      const chatId = chatArg === undefined || chatArg === null ? null : resolveChat(runtime, chatArg).chatId;
      await runtime.bridge.ui.setState(surfaceId, state, chatId);
      return null;
    },
  });

  // registerCommand — SYNC, activation-time, the `register` mirror (U5, §4.5). Same SOFT-refusal posture: a
  // malformed command must not kill the activation that also registered the plugin's tools, events and panels.
  // Unlike a surface the handler is REQUIRED — a command with no `onRun` is a menu row that does nothing, which
  // is worse than an absent one, so a non-function `onRun` is a refusal rather than a display-only arm.
  using registerCommandFn = ctx.newFunction("registerCommand", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "ui.registerCommand");
    if (defHandle === undefined) {
      throw new Error("plugin host: ui.registerCommand requires a definition object");
    }
    // Same ownership split as `register`: the metadata handles are scope-owned; `onRun`'s ownership TRANSFERS
    // to the Sandbox on the collect path and is hand-disposed on every other, so it is never `using`.
    using nameH = ctx.getProp(defHandle, "name");
    using describeH = ctx.getProp(defHandle, "describe");
    // #791 — the DECLARED typed args (absent ⇒ the U5 opaque-remainder shape). Dumped through the SAME deep-nesting
    // belt as every other guest def value; the schema (enum biconditional, unique names, the arg caps) is what
    // turns a malformed arg into a REGISTRATION refusal rather than a live-value surprise at invoke time.
    using argsH = ctx.getProp(defHandle, "args");
    const onRun = ctx.getProp(defHandle, "onRun");
    let parsed: ReturnType<typeof pluginCommandRegistrationMetaSchema.safeParse>;
    // @orb-waive caught-failure-ownership(err): guest-supplied command metadata that fails to dump/validate is REFUSED registration (onRun handle disposed, warn logged) — a malformed untrusted plugin def can never register a live command, the fail-closed direction. Ends if a dump/parse failure ever returns a live command instead of ctx.undefined.
    try {
      const name = tryDumpGuestValue(ctx, nameH);
      const describe = tryDumpGuestValue(ctx, describeH);
      const args = tryDumpGuestValue(ctx, argsH);
      if (!(name.ok && describe.ok && args.ok)) {
        throw new Error("metadata is too deeply nested or too large to validate");
      }
      parsed = pluginCommandRegistrationMetaSchema.safeParse({ name: name.value, describe: describe.value, args: args.value });
    } catch (err) {
      onRun.dispose();
      runtime.logWarn(`ui.registerCommand refused a command: ${err instanceof Error ? err.message : String(err)}`);
      return ctx.undefined;
    }
    if (!parsed.success) {
      onRun.dispose();
      runtime.logWarn(`ui.registerCommand refused a command: ${z.prettifyError(parsed.error)}`);
      return ctx.undefined;
    }
    if (ctx.typeof(onRun) !== "function") {
      onRun.dispose();
      runtime.logWarn(`ui.registerCommand refused '${parsed.data.name}': onRun must be a function`);
      return ctx.undefined;
    }
    runtime.collectCommand(parsed.data, onRun);
    return ctx.undefined;
  });
  ctx.setProp(ui, "registerCommand", registerCommandFn);

  // toast — ASYNC, runtime. The LEVEL is resolved against the closed house tuple rather than a hand-spelled
  // literal (the `PLUGIN_NOTIFICATION_RECIPIENTS` posture): an unrecognised value degrades to the QUIETEST arm
  // (`info`), so a guest can never widen its own attention footprint by naming a string the host did not admit.
  // The MESSAGE is guest text; the domain stamps the plugin-name prefix, applies the length cap and claims the
  // per-plugin rate floor — infra holds none of those and must not pretend to.
  attachAsync(ctx, ui, {
    name: "toast",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "ui.toast");
      const named = args[0];
      const level: PluginToastLevel = PLUGIN_TOAST_LEVELS.find((member) => member === named) ?? "info";
      const message = args[1];
      if (typeof message !== "string") {
        throw new Error("plugin host: ui.toast requires a message string");
      }
      await runtime.bridge.ui.toast(level, message);
      return null;
    },
  });

  // openDialog — ASYNC, runtime. The id is bounded by the SAME grammar `ui.register` enforces (an unbounded id
  // would be an unbounded outbox key); WHICH dialog it names is resolved DOMAIN-side against the plugin's own
  // registered surfaces when the outbox drains, so infra cannot leak whether a surface exists and a guest
  // cannot open another plugin's dialog (the outbox is keyed by the plugin the guest is).
  attachAsync(ctx, ui, {
    name: "openDialog",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "ui.openDialog");
      const surfaceId = args[0];
      if (typeof surfaceId !== "string" || !PLUGIN_SURFACE_ID_RE.test(surfaceId)) {
        throw new Error("plugin host: ui.openDialog requires a valid surfaceId (/^[a-z][a-z0-9_]{0,40}$/)");
      }
      await runtime.bridge.ui.openDialog(surfaceId);
      return null;
    },
  });

  ctx.setProp(surface, "ui", ui);
}

function setGrants(ctx: QuickJSContext, surface: QuickJSHandle, grants: ReadonlySet<PluginCapability>): void {
  using arr = ctx.newArray();
  let i = 0;
  for (const grant of grants) {
    using s = ctx.newString(grant);
    ctx.setProp(arr, i++, s);
  }
  ctx.setProp(surface, "grants", arr);
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
  using currentFn = ctx.newFunction("current", () => {
    requireCapability(runtime, "chat.current");
    const token = runtime.currentToken();
    if (token === null) {
      throw new Error("plugin host: no chat is in scope for this invocation");
    }
    return ctx.newString(token);
  });
  ctx.setProp(chat, "current", currentFn);

  attachAsync(ctx, chat, {
    name: "listMessages",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "chat.listMessages");
      const { chatId } = resolveChat(runtime, args[0]);
      const opts = args[1] as { limit?: unknown } | undefined;
      const limit = typeof opts?.limit === "number" ? opts.limit : undefined;
      return await runtime.bridge.chat.listMessages(chatId, limit);
    },
  });

  attachAsync(ctx, chat, {
    name: "getVariables",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "chat.getVariables");
      const { chatId } = resolveChat(runtime, args[0]);
      return await runtime.bridge.chat.getVariables(chatId);
    },
  });

  // listCharacters(chat) — the present CHARACTER roster of the ADMITTED chat (#788 F11). The bridge resolves the
  // installer's membership and returns `[]` for a non-member; a forged/stale handle fails `resolveChat` first.
  attachAsync(ctx, chat, {
    name: "listCharacters",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "chat.listCharacters");
      const { chatId } = resolveChat(runtime, args[0]);
      return await runtime.bridge.chat.listCharacters(chatId);
    },
  });

  attachAsync(ctx, chat, {
    name: "applyVariableOps",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "chat.applyVariableOps");
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
      const ops = Array.isArray(args[1]) ? (args[1] as readonly VarOp[]) : [];
      // The OPTIONAL compare-and-set (#1555). Unlike `ops` — which the domain's own `applyVarOp` rejects
      // member-by-member — a malformed precondition would silently WEAKEN the guard it was passed to
      // strengthen, so it is PARSED, and a shape that does not parse is a loud refusal of the call (the
      // forged-handle arm's posture) rather than a write that quietly skipped its own check.
      const expect = parsePreconditions(args[2]);
      // The result is DATA the guest branches on — a lost race must not spend a crash strike (see the
      // `PluginVariableWriteResult` contract). Only the two shapes the contract declares cross back.
      return await runtime.bridge.chat.applyVariableOps(scope.chatId, ops, expect);
    },
  });

  attachAsync(ctx, chat, {
    name: "requestTurn",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "chat.requestTurn");
      const scope = resolveChat(runtime, args[0]);
      if (!scope.canWrite) {
        // POSTURE 2 — the installer holds the grant but not standing authority here, so the act becomes an
        // ASK the room's host confirms (`suggestAct`). It is not a write and it is not a refusal.
        await suggestAct(runtime, scope, { kind: "requestTurn", automationDepth: scope.automationDepth + 1, ...buildTurnHints(args[1]) });
      }
      // The FUNDER (installer) is closed over DOMAIN-SIDE — the membrane supplies NONE (authority-blind): a plugin
      // can never fund a foreign budget because it cannot name the funder. The child cascade depth = the
      // invocation's context depth + 1; the domain `requestTurn` refuses a value past AUTOMATION_DEPTH_HARD_CAP,
      // so a plugin cannot launder an event→turn→event loop past the ceiling. Spend rides D17 + the per-member
      // turn budget (NOT the automation spend ceiling — the LOW-2 deferral, same class as plugin imagery).
      await runtime.bridge.chat.requestTurn(scope.chatId, scope.automationDepth + 1, buildTurnHints(args[1]));
      return null;
    },
  });

  attachAsync(ctx, chat, {
    name: "surfaceQuickReply",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "chat.surfaceQuickReply");
      const scope = resolveChat(runtime, args[0]);
      if (!scope.canWrite) {
        // NOT POSTURE 2, deliberately — the second of the two arms that stays a flat refusal. Surfacing
        // chips writes room-visible state, so host authority is the ceiling; but chips are TRANSIENT display
        // strings with no row, and their entire value is immediacy. An ask the host reads, then approves so
        // that text can appear as a chip, has already shown the host the text: the card IS the chip,
        // delivered late. Full reasoning: `@orb/contracts/plugin/suggestion`.
        throw new Error("plugin host: chat.surfaceQuickReply requires host authority on this chat");
      }
      await runtime.bridge.surfaceQuickReply(scope.chatId, buildQuickReplyChoices(args[1]));
      return null;
    },
  });

  ctx.setProp(surface, "chat", chat);
}

/** POSTURE 2, at the ONE place the membrane expresses it (interaction spec §3-S4, the #14 three-posture law:
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
async function suggestAct(runtime: MembraneRuntime, scope: InvocationChat, act: PluginSuggestedAct): Promise<never> {
  await runtime.bridge.suggest(scope.chatId, act);
  throw new PluginSuggestedError(act.kind);
}

/** Project the guest-supplied quick-reply choices to the JSON-safe `{label, sendText}[]` shape. Non-array input
 *  ⇒ `[]` (fail-safe: an empty surface, never a throw); each entry keeps ONLY string `label`/`sendText`, dropping
 *  a malformed entry (a non-string field yields "" — inert, never a coerced object). The host-side caps
 *  (count/length) live in the domain op the bridge calls. */
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

/** Parse the guest's OPTIONAL `chat.applyVariableOps` preconditions (#1555). `undefined` when the guest passed
 *  none (an unconditional write); a THROW when it passed something that is not a precondition list.
 *
 *  THE ONLY GUEST INPUT ON THIS SURFACE THAT IS PARSED RATHER THAN PROJECTED, and the asymmetry is the point:
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
function buildTurnHints(raw: unknown): { readonly speakerCharacterId?: string; readonly guided?: string } {
  const p = (typeof raw === "object" && raw !== null ? raw : {}) as { speakerCharacterId?: unknown; guided?: unknown };
  const speakerCharacterId = typeof p.speakerCharacterId === "string" ? p.speakerCharacterId : undefined;
  const guided = typeof p.guided === "string" ? p.guided : undefined;
  return {
    ...(speakerCharacterId !== undefined ? { speakerCharacterId } : {}),
    ...(guided !== undefined ? { guided } : {}),
  };
}

/** worldInfo.upsertEntry — capability worldinfo.write + host authority (room-state writes are host
 *  authority). The guest entry crosses as a JSON object; the authority-agnostic bridge maps it onto the shared
 *  lore writer under the installer. */
function setWorldInfo(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using worldInfo = ctx.newObject();
  // listBooks(chat) — the books ATTACHED to the admitted chat (#788 F12, worldinfo.read). The bridge resolves
  // the installer + member-gates the attachment list; a non-member gets `[]`.
  attachAsync(ctx, worldInfo, {
    name: "listBooks",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "worldInfo.listBooks");
      const { chatId } = resolveChat(runtime, args[0]);
      return await runtime.bridge.worldInfo.listBooks(chatId);
    },
  });
  // listEntries(chat, bookId) — the entries of ONE attached book (#788 F12, worldinfo.read). The guest supplies
  // the bookId; the bridge applies the ATTACHMENT gate before the read, so a book not attached to THIS chat
  // resolves to `[]`, leak-free. A non-string bookId is refused here rather than serialized into a bad query.
  attachAsync(ctx, worldInfo, {
    name: "listEntries",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "worldInfo.listEntries");
      const { chatId } = resolveChat(runtime, args[0]);
      const bookId = args[1];
      if (typeof bookId !== "string") {
        throw new Error("plugin host: worldInfo.listEntries requires a bookId string");
      }
      return await runtime.bridge.worldInfo.listEntries(chatId, bookId);
    },
  });
  attachAsync(ctx, worldInfo, {
    name: "upsertEntry",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "worldInfo.upsertEntry");
      const scope = resolveChat(runtime, args[0]);
      if (!scope.canWrite) {
        // POSTURE 2 — the ask carries the guest's entry VERBATIM; every domain gate it would have met
        // directly (attachment, the per-plugin entry ceiling, `neutralizeMacros`) is met again when the host
        // confirms, because the confirmed act re-enters through the plugin's OWN bridge.
        await suggestAct(runtime, scope, { kind: "worldInfoUpsert", entry: args[1] as PluginWorldEntryUpsert });
      }
      // The ADMITTED chatId travels with the entry: the guest names the book, the DOMAIN decides whether that
      // book is attached to THIS room (the room's consent) and applies the per-plugin entry cap. Infra can
      // enforce neither — it holds no db — so its job is to hand the domain the scope it admitted, never to let
      // a guest-supplied bookId travel alone.
      await runtime.bridge.worldInfo.upsertEntry(scope.chatId, args[1] as PluginWorldEntryUpsert);
      return null;
    },
  });
  ctx.setProp(surface, "worldInfo", worldInfo);
}

/** assets.read(assetId) — capability assets.read (#788 seam-11 read half). The guest supplies ONLY the assetId
 *  string; the bridge closes the installer over the read and reaches the assets domain's OWNER-GATED front door,
 *  so a guest can only read its OWN CAS and a foreign/absent id is the leak-free `null`. NO chat scope, NO host
 *  authority (a read of the installer's own store, the `storage`/`databank` posture). A non-string assetId is
 *  refused here rather than serialized into a bad lookup. */
function setAssets(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using assets = ctx.newObject();
  attachAsync(ctx, assets, {
    name: "read",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "assets.read");
      const assetId = args[0];
      if (typeof assetId !== "string") {
        throw new Error("plugin host: assets.read requires an assetId string");
      }
      return await runtime.bridge.assets.read(assetId);
    },
  });
  ctx.setProp(surface, "assets", assets);
}

/** search.documents(queryText, opts?) — capability search.query (#788 F1). The guest supplies ONLY the query
 *  string + an optional limit; the bridge closes the installer's ownerId over the search scope, so a guest
 *  searches only its OWN corpus. NO chat scope, NO host authority (a read of the installer's own library, the
 *  `assets`/`databank` posture). The limit is CLAMPED here to `PLUGIN_SEARCH_RESULTS_MAX` (an unbounded page is
 *  an unbounded corpus read per call); a non-string query is refused rather than searched as garbage. */
function setSearch(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using search = ctx.newObject();
  attachAsync(ctx, search, {
    name: "documents",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "search.documents");
      const queryText = args[0];
      if (typeof queryText !== "string") {
        throw new Error("plugin host: search.documents requires a queryText string");
      }
      const opts = args[1] as { limit?: unknown } | undefined;
      const limit = typeof opts?.limit === "number" ? Math.min(Math.max(1, Math.trunc(opts.limit)), PLUGIN_SEARCH_RESULTS_MAX) : undefined;
      return await runtime.bridge.search.documents(queryText, limit);
    },
  });
  ctx.setProp(surface, "search", search);
}

/** imagery.generatePicture — capability imagery.generate + host authority (host-gated). Returns the
 *  primary image's `{assetId}` (the bridge forwards the admitted chat + action args to the front door; compose
 *  re-validates the args + applies the action-arg defaults). v1 SPEND BOUND (honest, docs-are-law): the
 *  generation is funded by the INSTALLER's own credential (compose resolves the installer Principal for
 *  connection + spend attribution), fan-out is clamped to n≤4 (generateImageActionArgsSchema), host calls are
 *  capped at ≤32 concurrent per invocation, and plugin install is admin-only. There is NO per-call
 *  D17/automation_budgets SPEND-CEILING debit on this path — that ceiling is a deliberate deferral (the
 *  same unwired class as turn.trigger). Do not claim a spend ceiling this path does not enforce. */
function setImagery(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using imagery = ctx.newObject();
  attachAsync(ctx, imagery, {
    name: "generatePicture",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "imagery.generatePicture");
      const scope = resolveChat(runtime, args[0]);
      if (!scope.canWrite) {
        // POSTURE 2 — and the class §3-S4 RULED F4 most wants asked: this is SPEND on the installer, so
        // "should this happen" is a question with a price on it.
        await suggestAct(runtime, scope, { kind: "generatePicture", args: (args[1] ?? {}) as GenerateImageActionArgs });
      }
      return await runtime.bridge.imagery.generatePicture(scope.chatId, (args[1] ?? {}) as GenerateImageActionArgs);
    },
  });
  ctx.setProp(surface, "imagery", imagery);
}

function setVariables(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using vars = ctx.newObject();
  attachAsync(ctx, vars, {
    name: "get",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "variables.get");
      return await runtime.bridge.variables.get(String(args[0]));
    },
  });
  attachAsync(ctx, vars, {
    name: "set",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "variables.set");
      await runtime.bridge.variables.set(String(args[0]), String(args[1]));
      return null;
    },
  });
  attachAsync(ctx, vars, {
    name: "delete",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "variables.delete");
      await runtime.bridge.variables.delete(String(args[0]));
      return null;
    },
  });
  ctx.setProp(surface, "variables", vars);
}

/** storage.get/set/compareAndSet/delete/list — capability storage.kv. The plugin-PRIVATE KV: the bridge op
 *  is closed DOMAIN-side over the pluginId + installer (owner), so a guest names only the key/prefix and can
 *  NEVER read another plugin's (or owner's) keys. Not host-authority gated (a plugin's own private store is not
 *  room state) — the grant alone suffices. The value/key-size + 256-key caps are enforced by the domain op. */
function setStorage(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using storage = ctx.newObject();
  attachAsync(ctx, storage, {
    name: "get",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "storage.get");
      return await runtime.bridge.storage.get(String(args[0]));
    },
  });
  attachAsync(ctx, storage, {
    name: "set",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "storage.set");
      await runtime.bridge.storage.set(String(args[0]), String(args[1]));
      return null;
    },
  });
  // The ATOMIC arm (#1442). `expected` is `null` for "the key must not exist", and anything that is not a
  // STRING dumps to that null — a guest passing `undefined` means "create", which is the only reading of an
  // absent precondition that is not a silent overwrite. The result is an object, so a lost race arrives as
  // DATA the guest branches on rather than a throw (three throws auto-disable a plugin, and losing a race is
  // the ordinary outcome this call reports).
  attachAsync(ctx, storage, {
    name: "compareAndSet",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "storage.compareAndSet");
      const expected = typeof args[1] === "string" ? args[1] : null;
      return await runtime.bridge.storage.compareAndSet(String(args[0]), expected, String(args[2]));
    },
  });
  attachAsync(ctx, storage, {
    name: "delete",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "storage.delete");
      await runtime.bridge.storage.delete(String(args[0]));
      return null;
    },
  });
  attachAsync(ctx, storage, {
    name: "list",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "storage.list");
      const prefix = typeof args[0] === "string" ? args[0] : undefined;
      return await runtime.bridge.storage.list(prefix);
    },
  });
  ctx.setProp(surface, "storage", storage);
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
    name: "post",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "notifications.post");
      const scope = resolveChat(runtime, args[0]);
      const named = args[1];
      const recipient: PluginNotificationRecipient = PLUGIN_NOTIFICATION_RECIPIENTS.find((member) => member === named) ?? "host";
      const message = typeof args[2] === "string" ? args[2] : "";
      await runtime.bridge.notifications.post(scope.chatId, recipient, message);
      return null;
    },
  });
  ctx.setProp(surface, "notifications", notifications);
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
    name: "quiet",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args, signal) => {
      requireCapability(runtime, "llm.quiet");
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
  ctx.setProp(surface, "llm", llm);
}

/** databank.ingest — capability databank.ingest (plugin-ui-plane §5.33/seam 15). Ingest a text document into
 *  the INSTALLER's OWN databank. NO chat scope + NO host authority — deliberately, the `storage`/`llm` posture:
 *  a library write is the installer's own reach, not room state, so gating on `canWrite` would claim a
 *  protection it does not provide. The installer is closed over DOMAIN-side (the bridge), so a guest supplies
 *  ONLY `{name, text}` and can name no other owner; the domain content-addresses + dedups the text and enqueues
 *  the ingest workload (the indexer auto-runs). The guest gets back its OWN new document id. */
function setDatabank(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using databank = ctx.newObject();
  attachAsync(ctx, databank, {
    name: "ingest",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "databank.ingest");
      const doc = (typeof args[0] === "object" && args[0] !== null ? args[0] : {}) as { name?: unknown; text?: unknown };
      if (typeof doc.name !== "string" || typeof doc.text !== "string") {
        throw new Error("plugin host: databank.ingest requires { name: string, text: string }");
      }
      return await runtime.bridge.databank.ingest({ name: doc.name, text: doc.text });
    },
  });
  ctx.setProp(surface, "databank", databank);
}

/** character.ingest — capability character.ingest (plugin-ui-plane §5 row 20 / seam 17). Ingest a V2/V3
 *  character CARD (a plain JSON object) into the INSTALLER's OWN library through the ContentChanged-emitting
 *  import funnel. Same owner-scoped, no-chat, no-host posture as {@link setDatabank}. The guest supplies the raw
 *  card object; the domain serializes + validates it through `parseCardJson`, so a non-object arg (an array /
 *  scalar / null) or a card that does not parse is a typed refusal of the CALL, never a partial write. Returns
 *  the new character id + whether it was freshly created (a byte-identical re-ingest deduplicates). */
function setCharacter(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using character = ctx.newObject();
  attachAsync(ctx, character, {
    name: "ingest",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "character.ingest");
      const card = args[0];
      // A card is a JSON OBJECT — an array/scalar/null is not a card and is refused here rather than serialized
      // into a shape `parseCardJson` would reject downstream with a less legible error.
      if (typeof card !== "object" || card === null || Array.isArray(card)) {
        throw new Error("plugin host: character.ingest requires a character-card object");
      }
      return await runtime.bridge.character.ingest(card as Record<string, unknown>);
    },
  });

  // ingestAsset(assetId) — capability character.ingest (#798). The guest supplies ONLY an assetId string naming
  // a PNG in the INSTALLER's OWN CAS (e.g. one `net.fetchAsset` just returned); the bridge closes the installer
  // over the op, reads that asset owner-gated (foreign/absent → leak-free rejection) and runs the SAME
  // importCharacter funnel `ingest` does — so the character arrives WITH its embedded avatar. Rides the SAME
  // `character.ingest` grant (identical reach, only the input form differs). A non-string id is refused here.
  attachAsync(ctx, character, {
    name: "ingestAsset",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "character.ingestAsset");
      const assetId = args[0];
      if (typeof assetId !== "string") {
        throw new Error("plugin host: character.ingestAsset requires an assetId string");
      }
      return await runtime.bridge.character.ingestAsset(assetId);
    },
  });

  // setCardData(characterId, data) — the D148 per-card state WRITE. The guest supplies ONLY the characterId
  // string + an inert JSON object; the SLUG is stamped host-side (DOMAIN-side, the bridge) and the OWNER-SCOPE +
  // the leak-free NOT_FOUND for a foreign character are the domain's — infra stays authority-blind, forwarding
  // the admitted (validated-shape) payload. `data` must be a plain object (an array/scalar/null is not per-card
  // state and is refused here, the `ingest` posture) so a guest cannot smuggle a scalar into the residual bag.
  attachAsync(ctx, character, {
    name: "setCardData",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "character.setCardData");
      const characterId = args[0];
      if (typeof characterId !== "string") {
        throw new Error("plugin host: character.setCardData requires a characterId string");
      }
      const data = args[1];
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error("plugin host: character.setCardData requires a data object");
      }
      await runtime.bridge.character.setCardData(characterId, data as Record<string, unknown>);
      return null;
    },
  });

  // getCardData(characterId) — the D148 per-card state READ. Same host-stamped-slug + owner-scope walls as the
  // write; a foreign/absent character rejects leak-free DOMAIN-side. Returns the stored blob or null.
  attachAsync(ctx, character, {
    name: "getCardData",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "character.getCardData");
      const characterId = args[0];
      if (typeof characterId !== "string") {
        throw new Error("plugin host: character.getCardData requires a characterId string");
      }
      return await runtime.bridge.character.getCardData(characterId);
    },
  });
  ctx.setProp(surface, "character", character);
}

/** Project the guest-supplied `llm.quiet` options bag (U6 — plugin-ui-plane §5.16/§5.32) to the JSON-safe
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

/** tools.register — SYNC, activation-time. Captures the guest handler HANDLE for the resident-handler
 *  runtime (the Sandbox keeps it alive + mints the ref); collects `{name, description, parameters}`. A snippet
 *  (no tools.register grant) hits the capability throw here — the "no registration from a transient snippet"
 *  rule enforced through the SAME gate, no snippet-special path. */
function setTools(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using tools = ctx.newObject();
  using registerFn = ctx.newFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "tools.register");
    if (defHandle === undefined) {
      throw new Error("plugin host: tools.register requires a definition object");
    }
    // The three METADATA handles are scope-owned (`using` — this is the try/finally that was here). `handler`
    // is NOT: its ownership TRANSFERS to `collectTool` on the success path (the Sandbox keeps it alive for the
    // instance lifetime) and is hand-disposed only on the reject path, so a `using` would double-free it —
    // `Lifetime.dispose()` asserts alive and THROWS on a second call.
    using nameHandle = ctx.getProp(defHandle, "name");
    using descHandle = ctx.getProp(defHandle, "description");
    using paramsHandle = ctx.getProp(defHandle, "parameters");
    const handler = ctx.getProp(defHandle, "handler");
    const dumpedName = tryDumpGuestValue(ctx, nameHandle);
    const dumpedDescription = tryDumpGuestValue(ctx, descHandle);
    const dumpedParameters = tryDumpGuestValue(ctx, paramsHandle);
    if (!(dumpedName.ok && dumpedDescription.ok && dumpedParameters.ok)) {
      handler.dispose();
      throw new Error("plugin host: tools.register metadata is too deeply nested");
    }
    const name = dumpedName.value;
    const description = dumpedDescription.value;
    const parameters = dumpedParameters.value;
    if (typeof name !== "string" || typeof description !== "string" || typeof parameters !== "object" || parameters === null) {
      handler.dispose();
      throw new Error("plugin host: tools.register definition must be { name, description, parameters, handler }");
    }
    // THE TOOL NAME IS GUEST INPUT AND THIS IS ITS TRUST BOUNDARY. `PLUGIN_TOOL_NAME_RE` is the grammar
    // `host-v1.ts` promises a plugin author and the one a `tool-card` surface's `toolName` is already held to
    // — but this seam used to check `typeof name === "string"` only, so an unbounded, arbitrary-charset guest
    // string was collected, retained for the instance lifetime, and carried into `pluginToolWireName` to
    // become a MODEL-VISIBLE function name. Bounding it HERE keeps the two spellings of one grammar
    // (registration and the card linkage) from admitting different names, and makes a bad name the guest's
    // own contained `tools.register` throw instead of a downstream registrar refusal that fails the whole
    // activation. #1803: `PLUGIN_TOOL_NAME_RE`'s LENGTH (not just its charset) is also load-bearing here —
    // it is one half of the wire-mint's byte budget (`manifest.ts` `PLUGIN_TOOL_NAME_LOCAL_MAX`, the other
    // half is the manifest's `slug` cap), so a too-long name is refused right here, at the guest's own call,
    // rather than surfacing as a length failure at the registry two boundaries downstream.
    if (!PLUGIN_TOOL_NAME_RE.test(name)) {
      handler.dispose();
      throw new Error(`plugin host: tools.register name must match ${PLUGIN_TOOL_NAME_RE.source}`);
    }
    runtime.collectTool({ name, description, parameters: parameters as Record<string, unknown> }, handler);
    return ctx.undefined;
  });
  ctx.setProp(tools, "register", registerFn);
  ctx.setProp(surface, "tools", tools);
}

/** transforms.register — SYNC, activation-time, the D50 PromptTransform mirror of tools.register.
 *  Captures the guest `apply` HANDLE for the resident-handler runtime (the Sandbox keeps it alive + mints the
 *  ref) and records `{name, point}`. Capability-gated (chat.transform) through the SAME uniform gate — a
 *  snippet without the grant hits the throw here (no snippet-special path). NOTE the plugin ORDER BAND (1000+)
 *  is NOT a guest input: the guest supplies no `order`, and the DOMAIN registrar assigns the band ABOVE the
 *  0–999 automation band at activation — the membrane cannot bypass it because it cannot express it. */
function setTransforms(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using transforms = ctx.newObject();
  using registerFn = ctx.newFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "transforms.register");
    if (defHandle === undefined) {
      throw new Error("plugin host: transforms.register requires a definition object");
    }
    // Same split as `setTools`: the metadata handles are scope-owned; `apply`'s ownership TRANSFERS to
    // `collectTransform` on success (hand-disposed only on the reject path), so it stays explicit.
    using nameHandle = ctx.getProp(defHandle, "name");
    using pointHandle = ctx.getProp(defHandle, "point");
    const apply = ctx.getProp(defHandle, "apply");
    const dumpedName = tryDumpGuestValue(ctx, nameHandle);
    const dumpedPoint = tryDumpGuestValue(ctx, pointHandle);
    if (!(dumpedName.ok && dumpedPoint.ok)) {
      apply.dispose();
      throw new Error("plugin host: transforms.register metadata is too deeply nested");
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
  ctx.setProp(transforms, "register", registerFn);

  // registerDisplay — the seam-14 sibling. SYNC, activation-time, the same handle-ownership split; it collects
  // only a NAME (there is no `point` axis: a display transform has exactly one application site, the viewer's
  // own rendered row). Gated by the SAME `chat.transform` capability, so a plugin that may rewrite the prompt
  // may annotate its installer's screen and one that may not, may not.
  using registerDisplayFn = ctx.newFunction("registerDisplay", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "transforms.registerDisplay");
    if (defHandle === undefined) {
      throw new Error("plugin host: transforms.registerDisplay requires a definition object");
    }
    using nameHandle = ctx.getProp(defHandle, "name");
    const apply = ctx.getProp(defHandle, "apply");
    const dumpedName = tryDumpGuestValue(ctx, nameHandle);
    if (!dumpedName.ok) {
      apply.dispose();
      throw new Error("plugin host: transforms.registerDisplay metadata is too deeply nested");
    }
    if (typeof dumpedName.value !== "string" || ctx.typeof(apply) !== "function") {
      apply.dispose();
      throw new Error("plugin host: transforms.registerDisplay definition must be { name, apply }");
    }
    runtime.collectDisplayTransform({ name: dumpedName.value }, apply);
    return ctx.undefined;
  });
  ctx.setProp(transforms, "registerDisplay", registerDisplayFn);
  ctx.setProp(surface, "transforms", transforms);
}

/** macros.register — SYNC, activation-time, the macro mirror of `tools.register` (plugin-ui-plane §5.15).
 *  Collects `{name, description}` + the guest `resolve` HANDLE; the DOMAIN namespaces the name and resolves the
 *  handler ONCE per turn into that turn's macro registry. Capability-gated `chat.transform` through the SAME
 *  uniform gate. Infra assigns no name and evaluates nothing — it only collects, exactly as it does for tools. */
function setMacros(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using macros = ctx.newObject();
  using registerFn = ctx.newFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "macros.register");
    if (defHandle === undefined) {
      throw new Error("plugin host: macros.register requires a definition object");
    }
    // Same ownership split as `setTools`: metadata handles are scope-owned; `resolve`'s ownership TRANSFERS to
    // `collectMacro` on success and is hand-disposed only on the reject path.
    using nameHandle = ctx.getProp(defHandle, "name");
    using descHandle = ctx.getProp(defHandle, "description");
    const resolve = ctx.getProp(defHandle, "resolve");
    const dumpedName = tryDumpGuestValue(ctx, nameHandle);
    const dumpedDescription = tryDumpGuestValue(ctx, descHandle);
    if (!(dumpedName.ok && dumpedDescription.ok)) {
      resolve.dispose();
      throw new Error("plugin host: macros.register metadata is too deeply nested");
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
  ctx.setProp(macros, "register", registerFn);
  ctx.setProp(surface, "macros", macros);
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
  using events = ctx.newObject();
  using onFn = ctx.newFunction("on", (typeHandle?: QuickJSHandle, handlerHandle?: QuickJSHandle) => {
    requireCapability(runtime, "events.on");
    if (typeHandle === undefined || handlerHandle === undefined) {
      throw new Error("plugin host: events.on requires (type, handler)");
    }
    const dumpedType = tryDumpGuestValue(ctx, typeHandle);
    if (!dumpedType.ok) {
      throw new Error("plugin host: events.on type is too deeply nested");
    }
    const type = dumpedType.value;
    if (typeof type !== "string" || !TRIGGER_TYPES.has(type)) {
      throw new Error("plugin host: events.on type must be a Tier-1 trigger type (chat/domain taxonomy)");
    }
    // Retain the guest handler ACROSS activation (a resident subscriber) — a positional arg handle is
    // auto-disposed when this callback returns, so `dup()` it and transfer ownership to the Sandbox.
    // `typeHandle`/`handlerHandle` are POSITIONAL ARGS: quickjs-emscripten disposes them itself when this
    // callback returns, so they must NEVER be `using` (a double-free throws in `Lifetime.dispose`).
    runtime.collectEvent({ type: type as ChatTriggerType | DomainTriggerType }, handlerHandle.dup());
    return ctx.undefined;
  });
  ctx.setProp(events, "on", onFn);
  ctx.setProp(surface, "events", events);
}

/** THE PRIVATE PLUGIN-EVENT PLANE (`host.pubsub`, plugin-ui-plane §5a). `on` is a SYNC resident subscription
 *  (the `events.on` mirror — collected + wired to the INSTALLER-scoped bus at activation, never the automation
 *  fan-out); `emit` is an ASYNC runtime publish. Both gate `plugin_events`. The forgery wall's boundary half is
 *  HERE: the channel coordinates are validated COLON-FREE — `name` against `PLUGIN_PUBSUB_NAME_RE`, and (for `on`)
 *  the target `emitterSlug` against the manifest slug grammar — because a colon in a coordinate would inject into
 *  the bus's `installer:slug:name` key and could ALIAS a different channel, so it is refused at the trust edge,
 *  not sanitized downstream. The emit side stamps the emitter's OWN slug domain-side (the bridge), so a guest can
 *  publish only on its own channel. */
function setPubsub(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using pubsub = ctx.newObject();
  let subscribed = 0;
  // on(emitterSlug, name, handler) — SYNC collect. A malformed subscription is a SOFT refusal (logged, absent),
  // never activation-fatal (the §4.9 surface-refusal posture): a bad `pubsub.on` must not kill the plugin's
  // tools/panels. The capability refusal above still THROWS (the uniform gate). The handler is a POSITIONAL arg
  // (auto-disposed by quickjs-emscripten on return), so it is `dup()`'d on the COLLECT path and left untouched on
  // every refuse path.
  using onFn = ctx.newFunction("on", (slugHandle?: QuickJSHandle, nameHandle?: QuickJSHandle, handlerHandle?: QuickJSHandle) => {
    requireCapability(runtime, "pubsub.on");
    if (slugHandle === undefined || nameHandle === undefined || handlerHandle === undefined) {
      throw new Error("plugin host: pubsub.on requires (emitterSlug, name, handler)");
    }
    const dumpedSlug = tryDumpGuestValue(ctx, slugHandle);
    const dumpedName = tryDumpGuestValue(ctx, nameHandle);
    if (!(dumpedSlug.ok && dumpedName.ok)) {
      runtime.logWarn("pubsub.on refused a subscription: a coordinate is too deeply nested");
      return ctx.undefined;
    }
    const emitterSlug = dumpedSlug.value;
    const name = dumpedName.value;
    if (typeof emitterSlug !== "string" || !pluginSlugSchema.safeParse(emitterSlug).success || typeof name !== "string" || !PLUGIN_PUBSUB_NAME_RE.test(name)) {
      runtime.logWarn("pubsub.on refused a subscription: emitterSlug/name grammar (must be colon-free bounded idents)");
      return ctx.undefined;
    }
    if (subscribed >= PLUGIN_PUBSUB_SUBSCRIPTIONS_MAX) {
      runtime.logWarn(`pubsub.on refused: at most ${PLUGIN_PUBSUB_SUBSCRIPTIONS_MAX} subscriptions per plugin`);
      return ctx.undefined;
    }
    subscribed += 1;
    runtime.collectPubsub({ emitterSlug, name }, handlerHandle.dup());
    return ctx.undefined;
  });
  ctx.setProp(pubsub, "on", onFn);

  attachAsync(ctx, pubsub, {
    name: "emit",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "pubsub.emit");
      const name = args[0];
      if (typeof name !== "string" || !PLUGIN_PUBSUB_NAME_RE.test(name)) {
        throw new Error("plugin host: pubsub.emit requires a valid event name (/^[a-z][a-z0-9_]{0,40}$/)");
      }
      // A plain JSON object only — an array/scalar/null is an empty payload (fail-safe, no throw). The domain bus
      // caps the serialized size; the arg-budget belt already bounded the inbound bytes.
      const raw = args[1];
      const data: Record<string, unknown> = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      // The emitter's own slug is stamped DOMAIN-side (the bridge closes it over from the activation manifest),
      // so a guest supplies ONLY name + data and can never publish on another plugin's `plugin:<slug>:<name>`.
      await runtime.bridge.pubsub.emit(name, data);
      return null;
    },
  });
  ctx.setProp(surface, "pubsub", pubsub);
}

/** net.fetch — capability net.fetch. The host performs the fetch through the AUDITED SSRF guard (`safeFetch`,
 *  D61) pinned to the manifest-declared `netHosts` allowlist (the wall — NEVER `ANY_HOST`, NEVER a
 *  guest-supplied host). The guest supplies ONLY the URL + a GET/POST init; the host list is fixed data. Every
 *  hop re-validates https + the allowlist + private-range denial, so an off-allowlist redirect / private IP /
 *  scheme downgrade is refused. The response crosses back as JSON-safe primitives — `{status, body}` (body =
 *  the UTF-8-decoded, byte-capped response text); no live `Response` object crosses the marshalling boundary.
 *  Bounded by `safeFetch`'s own caps (PLUGIN_NET_MAX_BYTES body + the 5 s host deadline). */
function setNet(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using net = ctx.newObject();
  attachAsync(ctx, net, {
    name: "fetch",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args, signal) => {
      requireCapability(runtime, "net.fetch");
      const url = args[0];
      if (typeof url !== "string") {
        throw new Error("plugin host: net.fetch requires a URL string");
      }
      // THE HOURLY EGRESS FLOOR — claimed BEFORE the fetch and before the first await, so the check-and-claim
      // is atomic against the ≤32 concurrent host calls this membrane admits. The belt itself is domain state
      // (per installed plugin); infra only calls the closure the bridge handed it, and stays authority-blind.
      // `safeFetch` bounds each REQUEST and the manifest bounds the DESTINATIONS; this is the only thing that
      // bounds the RATE (the D46 review's tracked finding — see `PluginBridge.admitEgress`).
      runtime.bridge.admitEgress();
      const res = await safeFetch(url, buildNetOptions(runtime.netHosts, args[1], signal));
      const body = NET_TEXT_DECODER.decode(await res.bytes());
      return { status: res.status, body };
    },
  });

  // fetchAsset — capability net.fetch_asset (#798). Download a REMOTE IMAGE into the INSTALLER's OWN CAS and
  // return an assetId. The whole point is that NO URL and NO BYTES ever reach the guest realm: the host GETs the
  // url through the SAME audited SSRF guard + manifest allowlist `net.fetch` uses (never ANY_HOST, never a
  // guest-supplied host), validates the downloaded bytes with the remote-image guard (magic bytes — the remote
  // Content-Type is never trusted — plus the dimension/pixel decompression-bomb caps), then hands the domain
  // ONLY the validated bytes + the SNIFFED mime to write into the installer's own CAS. The guest gets back an
  // assetId string. Egress REACH delta zero: it claims its OWN hourly belt (`admitAssetEgress`, #801 — split
  // from `net.fetch`'s so an art grid can't starve text egress) and reaches only the manifest hosts, so it
  // adds a CAS-write, not egress reach.
  attachAsync(ctx, net, {
    name: "fetchAsset",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args, signal) => {
      requireCapability(runtime, "net.fetchAsset");
      const url = args[0];
      if (typeof url !== "string") {
        throw new Error("plugin host: net.fetchAsset requires a URL string");
      }
      // Its OWN hourly belt (#801 — split from `net.fetch`'s so covers never starve text egress), claimed
      // BEFORE the fetch and the first await (atomic against the ≤32 concurrent host calls) — egress REACH
      // delta still zero (same allowlist, GET-only), keyed by a pluginId infra never sees.
      runtime.bridge.admitAssetEgress();
      const res = await safeFetch(url, buildAssetFetchOptions(runtime.netHosts, signal));
      if (res.status < HTTP_OK_MIN || res.status >= HTTP_OK_MAX) {
        res.dispose?.(); // drop the non-2xx body + close the pinned Agent before throwing
        throw new Error(`plugin host: net.fetchAsset got a non-2xx response (HTTP ${res.status})`);
      }
      const bytes = await res.bytes();
      // The remote-image guard: magic-byte sniff (NEVER the remote Content-Type) + dimension/pixel bomb caps.
      // Throws `ImageRejectedError` on a non-image / oversize / over-dimension body → a guest promise rejection.
      // The SNIFFED mime (from the magic bytes) is what the CAS write records — never the header the server sent.
      // The ASSET byte cap, not net.fetch's (#801): these bytes never cross into the guest, so the marshalling
      // result cap that sizes PLUGIN_NET_MAX_BYTES does not apply here.
      const sniffed = isAllowedImageBuffer(bytes, { maxBytes: PLUGIN_ASSET_MAX_BYTES });
      return await runtime.bridge.assets.storeFetched(bytes, sniffed.mime);
    },
  });
  ctx.setProp(surface, "net", net);
}

/** The 2xx status window `net.fetchAsset` requires (a non-2xx has no asset to return). */
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 300;

/** UTF-8 decoder for the net.fetch body (stateless without `{stream}`, so one shared instance is safe). */
const NET_TEXT_DECODER = new TextDecoder();

/** Assemble the `SafeFetchOptions` from the manifest allowlist + the (already JSON-dumped) guest init. Only
 *  GET/POST, a string→string header map, and a string body are honored — any other shape is DROPPED (fail-safe:
 *  an unrecognized method defaults to GET, never an arbitrary verb). `allowedHosts` is the manifest wall; the
 *  guest cannot widen it. Optional fields stay ABSENT (exactOptionalPropertyTypes), not `undefined`. */
function buildNetOptions(netHosts: readonly string[], rawInit: unknown, signal: AbortSignal): SafeFetchOptions {
  const init = (typeof rawInit === "object" && rawInit !== null ? rawInit : {}) as {
    method?: unknown;
    headers?: unknown;
    body?: unknown;
  };
  const method = init.method === "POST" || init.method === "GET" ? init.method : undefined;
  const headers = isStringRecord(init.headers) ? init.headers : undefined;
  const body = typeof init.body === "string" ? init.body : undefined;
  return {
    allowedHosts: netHosts,
    maxBytes: PLUGIN_NET_MAX_BYTES,
    deadlineMs: HOST_FN_DEADLINE_MS,
    signal,
    ...(method !== undefined ? { method } : {}),
    ...(headers !== undefined ? { headers } : {}),
    ...(body !== undefined ? { body } : {}),
  };
}

/** The `net.fetchAsset` fetch options (#798): a plain GET pinned to the manifest allowlist (never `ANY_HOST`,
 *  never a guest-supplied host), the ASSET byte cap (`PLUGIN_ASSET_MAX_BYTES`, #801 — real hub art outgrows
 *  the wire cap and these bytes never enter the guest) + the same host deadline `net.fetch` carries. No guest
 *  init at all — no method, no headers, no body — so the attack surface is exactly "download this allowlisted
 *  image". The scheme/allowlist/private-range/redirect walls all live inside `safeFetch`, re-run per hop. */
function buildAssetFetchOptions(netHosts: readonly string[], signal: AbortSignal): SafeFetchOptions {
  return {
    allowedHosts: netHosts,
    method: "GET",
    maxBytes: PLUGIN_ASSET_MAX_BYTES,
    deadlineMs: HOST_FN_DEADLINE_MS,
    signal,
  };
}

/** True iff every own value is a string (a guest header map crosses as inert dumped data — reject a
 *  non-string-valued shape rather than coerce it). */
function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.values(value).every((v) => typeof v === "string");
}

/** True once the already-dumped guest arguments exceed `cap` serialized bytes. An ITERATIVE walk that
 *  SHORT-CIRCUITS the moment the budget is blown — so a hostile payload costs ~`cap` of accounting, not a
 *  second full `JSON.stringify` of the whole graph. Scalars are charged a flat 8 (their JSON text is short and
 *  their real cost is the slot, not the digits); strings and keys are charged their UTF-8 bytes plus the
 *  punctuation JSON would spend on them, so the number tracks the serialized size it is named for.
 *
 *  WHAT THIS BOUNDS, precisely: everything that crosses into a domain op, and everything RETAINED host-side for
 *  the life of the async impl — which is the amplification (`HOST_CALLS_IN_FLIGHT_MAX` concurrent calls, each
 *  previously free to hold the guest's whole 32 MiB heap, plus whatever the op then did with it: a
 *  `storage.set` writes it, a `net.fetch` body sends it). What it does NOT bound is the TRANSIENT `ctx.dump`
 *  materialization it must measure — one at a time per context, and already bounded by the instance memory cap.
 *  Do not read this cap as a bound on peak host memory; it is a bound on retained and forwarded bytes. */
function exceedsArgBudget(args: readonly unknown[], cap: number): boolean {
  let bytes = 0;
  const pending: unknown[] = [...args];
  while (pending.length > 0 && bytes <= cap) {
    bytes += chargeValue(pending.pop(), pending);
  }
  return bytes > cap;
}

/** The JSON punctuation charged per value and per key (quotes / comma / colon) — the framing a serializer
 *  spends, so a payload of a million empty strings is not accounted as free. */
const JSON_FRAMING_BYTES = 4;
/** Flat charge for a scalar (number / boolean / null / undefined): its serialized text is short and bounded. */
const SCALAR_ARG_BYTES = 8;

/** Charge ONE already-dumped value, PUSHING its children onto `pending` (mutated by design — the walk is
 *  iterative so a deeply-nested guest payload cannot recurse the host stack). */
function chargeValue(value: unknown, pending: unknown[]): number {
  if (typeof value === "string") {
    return Buffer.byteLength(value, "utf8") + JSON_FRAMING_BYTES;
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      pending.push(child);
    }
    return JSON_FRAMING_BYTES + value.length;
  }
  if (typeof value === "object" && value !== null) {
    let keys = JSON_FRAMING_BYTES;
    for (const [key, child] of Object.entries(value)) {
      keys += Buffer.byteLength(key, "utf8") + JSON_FRAMING_BYTES;
      pending.push(child);
    }
    return keys;
  }
  return SCALAR_ARG_BYTES;
}

/** Build + attach ONE async host function: guest args via `ctx.dump`, the impl races a real-time deadline, the
 *  JSON-safe result crosses back via `jsToHandle` (size-capped), and settled guest jobs are pumped under their
 *  own guest-CPU window (`cpu-guard.ts` — the pump runs guest continuations, so it is bounded like an
 *  invocation is). ≤ 32 concurrent host calls per instance — call 33 rejects (back-pressure).
 *  A thrown/rejected impl (a capability/handle/host-authority refusal, or a bridge error) rejects the guest
 *  promise — errors-as-data, never a host crash.
 *
 *  THE TWO SETTLEMENTS ARE DIFFERENT EVENTS AND THEY RELEASE DIFFERENT THINGS — this is the whole of P2-G:
 *   - the RACE settles when the guest's promise resolves/rejects (impl result, or the deadline). That is what
 *     deregisters `pending` (the guest promise is no longer a teardown hazard) and clears the timer.
 *   - the IMPL settles when the actual host work finishes. That — and ONLY that — releases the in-flight slot.
 *  The deadline ABORTS a per-call controller; `net.fetch` and `llm.quiet` carry it to their real I/O doors.
 *  Domain writes that cannot safely cancel may ignore it, so charging the slot to the race would still count
 *  not-yet-timed-out PROMISES rather than real work. The slot therefore remains charged until the impl settles,
 *  and teardown joins those settlements before releasing resident admission. Note what
 *  this does NOT claim to be: a spend CEILING (the D46 2026-07-24 amendment retired the plugin spend tier
 *  deliberately). It is a concurrency bound, and it is now true. */
function attachAsync(ctx: QuickJSContext, target: QuickJSHandle, spec: AsyncFnSpec): void {
  const { name, inFlight, pending, impl } = spec;
  using fn = ctx.newFunction(name, (...argHandles) => {
    // `deferred` is deliberately NOT `using`: its lifetime ESCAPES this scope (its `.handle` is the guest's
    // promise and the Sandbox's `pending` drain owns teardown). Same for the positional `argHandles`,
    // which quickjs-emscripten disposes itself.
    const deferred = ctx.newPromise();

    // THE INBOUND DEPTH GUARD — checked BEFORE `ctx.dump` materializes the args, because a deeply-nested guest
    // arg overflows `ctx.dump` HOST-side and CORRUPTS the shared WASM runtime (the `list_empty` dispose abort, a
    // crash of every co-resident plugin), which is NOT a contained refusal (#707 Finding C — reachable from any
    // async host fn with any grant). Refuse as guest errors-as-data; settles synchronously, so no `pending`.
    const args: unknown[] = [];
    for (const handle of argHandles) {
      const dumped = tryDumpGuestValue(ctx, handle);
      if (!dumped.ok) {
        using err = ctx.newError(`plugin host: ${name} argument is too deeply nested`);
        deferred.reject(err);
        return deferred.handle;
      }
      args.push(dumped.value);
    }

    // THE INBOUND ARG CAP — the mirror of the result cap below, checked BEFORE the in-flight gate so a refused
    // call never charges a slot. Both refusal arms settle synchronously, so neither registers in `pending`.
    if (exceedsArgBudget(args, HOST_FN_ARGS_MAX_BYTES)) {
      using err = ctx.newError(`plugin host: ${name} arguments exceed the ${HOST_FN_ARGS_MAX_BYTES}-byte inbound cap`);
      deferred.reject(err);
      return deferred.handle;
    }

    if (inFlight.count >= HOST_CALLS_IN_FLIGHT_MAX) {
      using err = ctx.newError(`plugin host: too many concurrent host calls (>${HOST_CALLS_IN_FLIGHT_MAX})`);
      deferred.reject(err);
      return deferred.handle;
    }
    inFlight.count += 1;
    // Track this UNSETTLED deferred so the Sandbox can drain it if the invocation ends before it settles (a
    // fire-and-forget that outlives its scope): an unsettled guest Promise at `ctx.dispose()` aborts the shared
    // WASM module. Deregistered in the `.finally` once the host call settles (or is dropped by the alive guard).
    pending.add(deferred);

    const controller = new AbortController();
    inFlight.controllers?.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${name} exceeded ${HOST_FN_DEADLINE_MS}ms host bound`));
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
      inFlight.controllers?.delete(controller);
      inFlight.settlements?.delete(settlement);
    };
    // @orb-waive caught-failure-ownership(running): BOOKKEEPING ONLY — this chain exists so teardown can await in-flight work, and both arms deliberately do the same thing (exactly one release per acquisition, so the counter cannot drift). The REJECTION of `running` is owned by the sibling race chain below, which routes it to `deferred.reject` and thence to the guest. Ends if this chain becomes the only reader of `running`.
    settlement = running.then(releaseSlot, releaseSlot);
    inFlight.settlements?.add(settlement);

    // @orb-waive caught-failure-ownership(Promise.race): the GUEST owns it — the rejection arm below reaches `deferred.reject(err)`, preserving the Error's NAME so a plugin can feature-detect by type. The one path that DROPS is the `!ctx.alive` guard, and dropping there is required: the guest promise this would settle no longer exists, so touching the disposed context is a use-after-free that escapes as an unhandled rejection. Ends if a disposed context gains a safe late-failure sink.
    void Promise.race([running, timeout])
      .then(
        (result) => {
          // A fire-and-forget guest call can outlive its invocation: the context is disposed (snippet end /
          // deactivate) BEFORE this real-async host call settles. Touching a dead context (deferred/jsToHandle)
          // is a use-after-free that escapes as an unhandled rejection — drop the late result (the guest promise
          // it would resolve no longer exists; leak-proof, the PluginInvocationEnded posture).
          if (!ctx.alive) {
            return;
          }
          const json = JSON.stringify(result ?? null);
          if (Buffer.byteLength(json, "utf8") > HOST_FN_RESULT_CAP_BYTES) {
            using err = ctx.newError(`${name} host result exceeds ${HOST_FN_RESULT_CAP_BYTES}-byte cap`);
            deferred.reject(err);
            return;
          }
          using handle = jsToHandle(ctx, result ?? null);
          deferred.resolve(handle);
        },
        (reason: unknown) => {
          if (!ctx.alive) {
            return;
          }
          // Preserve the Error's NAME across the boundary (not just the message) — a typed membrane rejection
          // (`PluginCapabilityError`) must reach the guest with `e.name === "PluginCapabilityError"` so a plugin
          // feature-detects by type, not by a message substring. Nameless/non-Error reasons fall back
          // to a plain `"Error"`.
          using err = reason instanceof Error ? ctx.newError({ name: reason.name, message: reason.message }) : ctx.newError(String(reason));
          deferred.reject(err);
        },
      )
      .finally(() => {
        // The GUEST promise settled (or was dropped by the alive guard after a post-dispose drain) — no longer a
        // teardown hazard. The in-flight SLOT is deliberately not released here: see `releaseSlot` above.
        pending.delete(deferred);
        clearTimeout(timer);
      });

    // THE POST-INVOCATION PUMP (#781). When this host call settles LATER than the invocation that fired it,
    // the guest's `.then` continuation runs HERE — bytecode outside any invocation, which until the
    // context-lifetime CPU guard landed executed with NO interrupt handler installed at all: one
    // `h.storage.get(k).then(function () { while (true) {} })` in `main.js` wedged the Node MAIN THREAD
    // permanently. `pumpGuestJobs` opens a fresh CPU window around the pump and owns the `ctx.alive` guard for
    // the late-settle case (the instance can be torn down before this call lands).
    superviseDetached(`plugin-host:${name}:${randomUUID()}`, "plugin.host.pending-jobs", { hostFunction: name }, () =>
      deferred.settled.then(() => {
        pumpGuestJobs(ctx);
      }),
    );
    return deferred.handle;
  });
  ctx.setProp(target, name, fn);
}
