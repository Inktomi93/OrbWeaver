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
//   3. self-bound — each host call races a real-time deadline (`boundHostFn`'s posture) and caps its
//      serialized result AND its guest-supplied ARGUMENTS (`HOST_FN_ARGS_MAX_BYTES` — the inbound mirror; the
//      only prior bound on an argument was the 32 MiB instance heap, retained per call across the ≤32 ceiling);
//      ≤ 32 concurrent host calls per INSTANCE (the reentrancy footgun, 03 §3) — counted over
//      STARTED-AND-UNSETTLED host work, which is what makes the cap a bound on work rather than on promises.

import type { ChatTriggerType, DomainTriggerType } from "@orb/contracts/automation";
import { CHAT_TRIGGER_TYPES, DOMAIN_TRIGGER_TYPES } from "@orb/contracts/automation";
import type { GenerateImageActionArgs } from "@orb/contracts/imagery";
import type { PluginNotificationRecipient } from "@orb/contracts/notifications";
import { PLUGIN_NOTIFICATION_RECIPIENTS } from "@orb/contracts/notifications";
import type {
  HostFunctionRef,
  InvocationChat,
  PluginBridge,
  PluginCapability,
  PluginSuggestedAct,
  PluginSurfaceRegistrationMeta,
  PluginTransformRegistration,
  PluginWorldEntryUpsert,
} from "@orb/contracts/plugin";
import {
  HOST_FUNCTION_CAPABILITY,
  PLUGIN_SURFACE_ID_RE,
  PluginCapabilityError,
  PluginSuggestedError,
  pluginSurfaceRegistrationMetaSchema,
} from "@orb/contracts/plugin";
import type { VarOp } from "@orb/kit/macro";
import type { QuickJSContext, QuickJSDeferredPromise, QuickJSHandle } from "quickjs-emscripten-core";
import { z } from "zod";
import type { SafeFetchOptions } from "../network/egress.ts";
import { safeFetch } from "../network/egress.ts";
import {
  HOST_CALLS_IN_FLIGHT_MAX,
  HOST_FN_ARGS_MAX_BYTES,
  HOST_FN_DEADLINE_MS,
  HOST_FN_RESULT_CAP_BYTES,
  PLUGIN_DUMP_DEPTH_GUARD,
  PLUGIN_DUMP_NODE_GUARD,
  PLUGIN_NET_MAX_BYTES,
  PLUGIN_QUIET_PROMPT_MAX_CHARS,
} from "./budgets.ts";
import { jsToHandle } from "./marshal.ts";

export type { InvocationChat, PluginBridge } from "@orb/contracts/plugin";

/** The per-instance concurrent-host-call counter (back-pressure). Lives on the Sandbox (one per context) and is
 *  NEVER reset — it counts host-fn IMPLEMENTATIONS that have STARTED and not yet SETTLED, which is the only
 *  reading under which "≤32 concurrent host calls" is a bound on WORK rather than on promises.
 *
 *  WHY NOT PER-INVOCATION (the P2-G repair, measured 2026-08-24). Two facts make an invocation-scoped counter a
 *  lie: (1) the host-fn deadline (`attachAsync`) BOUNDS a call without CANCELLING it — the losing impl keeps
 *  running host-side, so releasing its slot when the RACE settles admitted 32 fresh installer-funded calls
 *  (`imagery.generatePicture` = GPU/$, `chat.requestTurn`) every `HOST_FN_DEADLINE_MS`, unbounded; and (2) a
 *  reset at invocation start let stragglers from an ENDED invocation decrement a counter the NEXT invocation had
 *  already zeroed, drifting it NEGATIVE (measured: 36 of 40 burst calls admitted against a cap of 32). So the
 *  slot is acquired when the impl starts and released when the IMPL settles, once, and no reset exists.
 *
 *  THE ACCEPTED COST, stated: a bridge op that NEVER settles permanently costs the instance one slot, and 32 of
 *  them wedge that plugin's host calls. That is fail-CLOSED and self-inflicted (the ops are OUR domain code, not
 *  guest-reachable), and it is the direction to fail in — the alternative it replaces failed OPEN. */
export interface InFlightCounter {
  count: number;
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
   *  (the cap-reject arm settles synchronously, so it deliberately does NOT register). The one carve-out is the
   *  standalone `boundHostFn` primitive (sandbox.ts) — it owns no `pending` set and is UNUSED by the live port;
   *  its own header documents that a caller disposing while it is in flight must drain manually. A NEW async
   *  host-fn that calls `ctx.newPromise()` without threading `pending` is the bug this invariant exists to catch;
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
  /** Collect an event subscription — the SYNC activation-time mirror of `collectTool`. The guest
   *  `handler` HANDLE is kept alive (keyed by a minted ref) + a `PluginEventSubscription` is recorded on the
   *  instance. The DOMAIN wires each onto the automation plugin-subscriber fan-out at activation (`subscribeEvent`):
   *  it delivers matching TF-1-validated `TriggerFact`s (already depth/visibility/declared-gated on the automation
   *  side) into the guest handler under the invocation budget, and unregisters on deactivate. Infra only collects;
   *  the membrane never bypasses the automation-side delivery gates. `type` is validated to the closed Tier-1
   *  taxonomy at THIS boundary (a garbage type is refused at collection, never a dead subscription). */
  readonly collectEvent: (reg: { readonly type: ChatTriggerType | DomainTriggerType }, handler: QuickJSHandle) => void;
  /** Collect a UI surface registration — the SYNC activation-time mirror of `collectTool` (plugin-ui-plane #679
   *  U1, seam 4). `meta` is the ALREADY-VALIDATED serializable descriptor (`setUi` ran the zod schema — the host
   *  trust boundary); `onAction` is the guest handler HANDLE the Sandbox keeps alive keyed by a minted ref (`null`
   *  = a display-only surface). Unlike tools/transforms/events a surface needs NO external registrar: it is read
   *  directly off the resident instance by `plugin.listSurfaces` and re-entered by `plugin.invokeUiAction`. */
  readonly collectSurface: (meta: PluginSurfaceRegistrationMeta, onAction: QuickJSHandle | null) => void;
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

/** One async host-fn spec — bundled so `attachAsync` stays ≤ 4 params (the per-instance counter threads with
 *  the name + impl). */
interface AsyncFnSpec {
  readonly name: string;
  readonly inFlight: InFlightCounter;
  readonly pending: Set<QuickJSDeferredPromise>;
  readonly impl: (args: readonly unknown[]) => Promise<unknown>;
}

/** Attach every gated namespace onto the surface handle (mutates `surface`; the caller owns disposal of
 *  `surface`). The full set — chat.read (current/listMessages/getVariables), chat.variables.write,
 *  chat.surfaceQuickReply (chat.quick_reply — host-authority gated), worldInfo.upsertEntry,
 *  imagery.generatePicture, chat.requestTurn (turn.trigger — SPEND, host-authority + cascade-depth+1 gated),
 *  global_vars, storage.get/set/delete/list (storage.kv — plugin-private KV), notifications.post (notify —
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
  setStorage(ctx, surface, runtime);
  setNotifications(ctx, surface, runtime);
  setLlm(ctx, surface, runtime);
  setTools(ctx, surface, runtime);
  setTransforms(ctx, surface, runtime);
  setEvents(ctx, surface, runtime);
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

/** The DECLARATIVE UI plane (plugin-ui-plane #679 U1). Two host fns, both capability `ui.surface`:
 *   - `register(def)` — SYNC, activation-time (the `tools.register` mirror): validate the serializable metadata
 *     host-side (`pluginSurfaceRegistrationMetaSchema` — the trust boundary), keep the guest `onAction` HANDLE,
 *     collect a surface registration. An INVALID def is logged + SKIPPED, NEVER thrown: a stale panel spec must
 *     not kill the activation that also registered the plugin's tools/events (§4.9). This is the ONE membrane
 *     collector that refuses softly rather than throwing.
 *   - `setState(surfaceId, state)` — ASYNC, runtime: publish the whole replacement state through the bridge
 *     (the domain writes the in-memory state row + emits the per-user freshness poke). JSON-safe data only. */
function setUi(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  using ui = ctx.newObject();
  using registerFn = ctx.newFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "ui.register");
    if (defHandle === undefined) {
      throw new Error("plugin host: ui.register requires a definition object");
    }
    // The metadata handles are scope-owned (`using`). `onAction` is NOT: on the collect path its ownership
    // TRANSFERS to the Sandbox (kept alive for the instance lifetime); on every other path it is hand-disposed
    // here — a `using` would double-free the transferred handle (`Lifetime.dispose` throws on a second call).
    using idH = ctx.getProp(defHandle, "id");
    using anchorH = ctx.getProp(defHandle, "anchor");
    using titleH = ctx.getProp(defHandle, "title");
    using tierH = ctx.getProp(defHandle, "tier");
    using specH = ctx.getProp(defHandle, "spec");
    const onAction = ctx.getProp(defHandle, "onAction");
    // DoS PRE-WALK (#707 Finding A): refuse a spec too deeply nested to `ctx.dump` + recursively parse BEFORE
    // either walks it on the host stack. Without this, a ~2000-deep tree throws a `RangeError` past `safeParse`
    // (activation-fatal, defeating §4.9) and a ~3000-deep tree overflows `ctx.dump` and corrupts the shared
    // runtime. `spec` absent ⇒ `typeof "undefined"`, nothing to walk (a scripted-tier surface has no spec).
    if (ctx.typeof(specH) !== "undefined" && !handleSafeToDump(ctx, specH)) {
      onAction.dispose();
      runtime.logWarn("ui.register refused a surface: spec is too deeply nested or too large to validate");
      return ctx.undefined;
    }
    // The materialize + parse runs under a BELT: ANY throw (a residual `RangeError` the pre-walk did not pre-empt,
    // a marshalling failure) becomes the §4.9 SOFT refusal, never an activation-fatal throw. `safeParse` catches
    // `ZodError` but NOT a `RangeError`, so the try/catch is load-bearing, not decoration.
    // `spec` absent ⇒ `ctx.dump` yields `undefined`, which the schema's optional `spec` accepts.
    let parsed: ReturnType<typeof pluginSurfaceRegistrationMetaSchema.safeParse>;
    try {
      const meta = {
        id: ctx.dump(idH) as unknown,
        anchor: ctx.dump(anchorH) as unknown,
        title: ctx.dump(titleH) as unknown,
        tier: ctx.dump(tierH) as unknown,
        spec: ctx.dump(specH) as unknown,
      };
      parsed = pluginSurfaceRegistrationMetaSchema.safeParse(meta);
    } catch (err) {
      onAction.dispose();
      runtime.logWarn(`ui.register refused a surface: ${err instanceof Error ? err.message : String(err)}`);
      return ctx.undefined;
    }
    if (!parsed.success) {
      // SOFT refusal: the surface is absent + a log line explains why; activation continues (§4.9).
      // `prettifyError` carries the PATH (which field failed) — the diagnostic a plugin author needs to fix a
      // stale spec, where a bare `issues[0].message` names none.
      onAction.dispose();
      runtime.logWarn(`ui.register refused a surface: ${z.prettifyError(parsed.error)}`);
      return ctx.undefined;
    }
    if (ctx.typeof(onAction) === "function") {
      runtime.collectSurface(parsed.data, onAction);
    } else {
      // No action handler — a display-only surface. Drop the non-function handle (an absent prop is `undefined`).
      onAction.dispose();
      runtime.collectSurface(parsed.data, null);
    }
    return ctx.undefined;
  });
  ctx.setProp(ui, "register", registerFn);

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
      await runtime.bridge.ui.setState(surfaceId, state);
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
      await runtime.bridge.chat.applyVariableOps(scope.chatId, ops);
      return null;
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

/** storage.get/set/delete/list — capability storage.kv. The plugin-PRIVATE KV: the bridge op
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
    impl: async (args) => {
      requireCapability(runtime, "llm.quiet");
      const prompt = args[0];
      if (typeof prompt !== "string") {
        throw new Error("plugin host: llm.quiet requires a prompt string");
      }
      if (prompt.length > PLUGIN_QUIET_PROMPT_MAX_CHARS) {
        throw new Error(`plugin host: llm.quiet prompt exceeds the ${PLUGIN_QUIET_PROMPT_MAX_CHARS}-character cap`);
      }
      const { text } = await runtime.bridge.llm.quiet(prompt);
      return text;
    },
  });
  ctx.setProp(surface, "llm", llm);
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
    const name = ctx.dump(nameHandle) as unknown;
    const description = ctx.dump(descHandle) as unknown;
    const parameters = ctx.dump(paramsHandle) as unknown;
    if (typeof name !== "string" || typeof description !== "string" || typeof parameters !== "object" || parameters === null) {
      handler.dispose();
      throw new Error("plugin host: tools.register definition must be { name, description, parameters, handler }");
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
    const name = ctx.dump(nameHandle) as unknown;
    const point = ctx.dump(pointHandle) as unknown;
    if (typeof name !== "string" || (point !== "user_input" && point !== "assembled_dynamic")) {
      apply.dispose();
      throw new Error("plugin host: transforms.register definition must be { name, point: 'user_input'|'assembled_dynamic', apply }");
    }
    runtime.collectTransform({ name, point }, apply);
    return ctx.undefined;
  });
  ctx.setProp(transforms, "register", registerFn);
  ctx.setProp(surface, "transforms", transforms);
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
    const type = ctx.dump(typeHandle) as unknown;
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
    impl: async (args) => {
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
      const res = await safeFetch(url, buildNetOptions(runtime.netHosts, args[1]));
      const body = NET_TEXT_DECODER.decode(await res.bytes());
      return { status: res.status, body };
    },
  });
  ctx.setProp(surface, "net", net);
}

/** UTF-8 decoder for the net.fetch body (stateless without `{stream}`, so one shared instance is safe). */
const NET_TEXT_DECODER = new TextDecoder();

/** Assemble the `SafeFetchOptions` from the manifest allowlist + the (already JSON-dumped) guest init. Only
 *  GET/POST, a string→string header map, and a string body are honored — any other shape is DROPPED (fail-safe:
 *  an unrecognized method defaults to GET, never an arbitrary verb). `allowedHosts` is the manifest wall; the
 *  guest cannot widen it. Optional fields stay ABSENT (exactOptionalPropertyTypes), not `undefined`. */
function buildNetOptions(netHosts: readonly string[], rawInit: unknown): SafeFetchOptions {
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
    ...(method !== undefined ? { method } : {}),
    ...(headers !== undefined ? { headers } : {}),
    ...(body !== undefined ? { body } : {}),
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
 *  JSON-safe result crosses back via `jsToHandle` (size-capped), and settled guest jobs are pumped (bounded by
 *  the invocation deadline). ≤ 32 concurrent host calls per instance — call 33 rejects (back-pressure).
 *  A thrown/rejected impl (a capability/handle/host-authority refusal, or a bridge error) rejects the guest
 *  promise — errors-as-data, never a host crash.
 *
 *  THE TWO SETTLEMENTS ARE DIFFERENT EVENTS AND THEY RELEASE DIFFERENT THINGS — this is the whole of P2-G:
 *   - the RACE settles when the guest's promise resolves/rejects (impl result, or the deadline). That is what
 *     deregisters `pending` (the guest promise is no longer a teardown hazard) and clears the timer.
 *   - the IMPL settles when the actual host work finishes. That — and ONLY that — releases the in-flight slot.
 *  The deadline does not abort the impl (nothing here can: the bridge ops are domain calls, and half of them
 *  are writes that must not be torn in two), so charging the slot to the race meant the cap counted
 *  not-yet-timed-out PROMISES. `imagery.generatePicture` outlives the 5 s bound by design; under the old
 *  accounting a guest could therefore hold unbounded concurrent GPU spend while the cap read "32". Note what
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
    for (const handle of argHandles) {
      if (!handleSafeToDump(ctx, handle)) {
        using err = ctx.newError(`plugin host: ${name} argument is too deeply nested`);
        deferred.reject(err);
        return deferred.handle;
      }
    }
    const args = argHandles.map((handle) => ctx.dump(handle) as unknown);

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

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} exceeded ${HOST_FN_DEADLINE_MS}ms host bound`)), HOST_FN_DEADLINE_MS);
      timer.unref();
    });

    // The slot is charged to the IMPL, not to the race (see the header): a deadline that bounds without
    // cancelling must not hand the slot back while the host work it bounds is still running. Exactly one
    // release per acquisition, on either settle arm — the counter can therefore never drift negative.
    const running = impl(args);
    const releaseSlot = (): void => {
      inFlight.count -= 1;
    };
    void running.then(releaseSlot, releaseSlot);

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

    void deferred.settled.then(() => {
      if (ctx.alive) {
        ctx.runtime.executePendingJobs();
      }
    });
    return deferred.handle;
  });
  ctx.setProp(target, name, fn);
}
