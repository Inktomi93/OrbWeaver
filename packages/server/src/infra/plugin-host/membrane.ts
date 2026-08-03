// infra/plugin-host/membrane — the capability-gated host-fn CALL surface (01 §2, P4b-CORE). Attaches the
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
//      serialized result; ≤ 32 concurrent host calls per invocation (the reentrancy footgun, 03 §3).

import type { ChatTriggerType, DomainTriggerType } from "@orb/contracts/automation";
import { CHAT_TRIGGER_TYPES, DOMAIN_TRIGGER_TYPES } from "@orb/contracts/automation";
import type { GenerateImageActionArgs } from "@orb/contracts/imagery";
import type {
  HostFunctionRef,
  InvocationChat,
  PluginBridge,
  PluginCapability,
  PluginTransformRegistration,
  PluginWorldEntryUpsert,
} from "@orb/contracts/plugin";
import { HOST_FUNCTION_CAPABILITY, PluginCapabilityError } from "@orb/contracts/plugin";
import type { VarOp } from "@orb/kit/macro";
import type { QuickJSContext, QuickJSDeferredPromise, QuickJSHandle } from "quickjs-emscripten-core";
import type { SafeFetchOptions } from "../network/egress.ts";
import { safeFetch } from "../network/egress.ts";
import { HOST_CALLS_IN_FLIGHT_MAX, HOST_FN_DEADLINE_MS, HOST_FN_RESULT_CAP_BYTES, PLUGIN_NET_MAX_BYTES } from "./budgets.ts";
import { jsToHandle } from "./marshal.ts";

export type { InvocationChat, PluginBridge } from "@orb/contracts/plugin";

/** The per-instance concurrent-host-call counter (03 §3 back-pressure). Lives on the Sandbox (one per context),
 *  reset between invocations — a rejected call 33 never poisons the next invocation. */
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
   *  STANDING INVARIANT (the must-drain rule — P6 escape review): EVERY host-created guest Promise that can
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
  /** Collect a D50 transform registration (03 §6) — the SYNC activation-time mirror of `collectTool`. The
   *  Sandbox keeps the guest `apply` HANDLE alive (keyed by a minted ref) + records a
   *  `PluginTransformRegistration` on the instance. The DOMAIN wires each into the shared prompt-transform
   *  registry at activation (`registerTransform`): it assigns the plugin ORDER BAND (1000+, ABOVE the 0–999
   *  automation band), builds the `PromptTransform` whose `apply` re-enters the guest under the invocation
   *  budget, and unregisters on deactivate. Infra cannot import that domain registry (the cake) — it only
   *  collects; the band + apply-under-budget + unregister live domain-side. */
  readonly collectTransform: (reg: { readonly name: string; readonly point: TransformPoint }, handler: QuickJSHandle) => void;
  /** Collect an event subscription (03 §2) — the SYNC activation-time mirror of `collectTool`. The guest
   *  `handler` HANDLE is kept alive (keyed by a minted ref) + a `PluginEventSubscription` is recorded on the
   *  instance. The DOMAIN wires each onto the automation plugin-subscriber fan-out at activation (`subscribeEvent`):
   *  it delivers matching TF-1-validated `TriggerFact`s (already depth/visibility/declared-gated on the automation
   *  side) into the guest handler under the invocation budget, and unregisters on deactivate. Infra only collects;
   *  the membrane never bypasses the automation-side delivery gates. `type` is validated to the closed Tier-1
   *  taxonomy at THIS boundary (a garbage type is refused at collection, never a dead subscription). */
  readonly collectEvent: (reg: { readonly type: ChatTriggerType | DomainTriggerType }, handler: QuickJSHandle) => void;
  /** The manifest-declared `net.fetch` allowlist (the SSRF wall — 02 §2). Threaded as plain-string DATA from
   *  the validated manifest (`netHosts`); NEVER `ANY_HOST`, NEVER guest-supplied. Empty ⇒ every fetch is
   *  refused (fail-closed): a `net.fetch` grant with no declared host reaches nothing. */
  readonly netHosts: readonly string[];
}

/** The two fixed points a D50 transform hooks — the ONE home is the contract's `PluginTransformRegistration`
 *  (derived, never re-spelled): `user_input` in SEND, `assembled_dynamic` at end of BUILD. */
type TransformPoint = PluginTransformRegistration["point"];

/** The closed Tier-1 trigger taxonomy (chat + domain buses) an `events.on` type must belong to — DERIVED
 *  from the automation contract's tuples (never re-spelled); plugins get no private event vocabulary (01 §2). */
const TRIGGER_TYPES: ReadonlySet<string> = new Set([...CHAT_TRIGGER_TYPES, ...DOMAIN_TRIGGER_TYPES]);

/** The capability gate, DERIVED from the ONE contract map (`HOST_FUNCTION_CAPABILITY`) — the membrane reads the
 *  cap→fn lookup at runtime instead of hand-rolling it (derive-don't-redeclare, §7.5). `ref` is a typed
 *  `HostFunctionRef` (`"namespace.method"`), so a wrong/renamed ref fails `tsc` against the surface AND the map
 *  stays the single source. Throws the TYPED `PluginCapabilityError` so its `.name` crosses the QuickJS boundary
 *  (a guest feature-detects by `e.name === "PluginCapabilityError"`, never a message substring — 01 §1.3). */
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
 *  participant-only durable notice), tools.register, transforms.register + events.on (SYNC collect — the domain
 *  wires the band/apply/delivery/unregister), net.fetch (SSRF-guarded, manifest-allowlisted). Every host fn is
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
  setTools(ctx, surface, runtime);
  setTransforms(ctx, surface, runtime);
  setEvents(ctx, surface, runtime);
  setNet(ctx, surface, runtime);
}

function setGrants(ctx: QuickJSContext, surface: QuickJSHandle, grants: ReadonlySet<PluginCapability>): void {
  const arr = ctx.newArray();
  let i = 0;
  for (const grant of grants) {
    const s = ctx.newString(grant);
    ctx.setProp(arr, i++, s);
    s.dispose();
  }
  ctx.setProp(surface, "grants", arr);
  arr.dispose();
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
  const chat = ctx.newObject();

  // current() — SYNC: return the admitted invocation chat's opaque token. Throws outside a chat scope.
  const currentFn = ctx.newFunction("current", () => {
    requireCapability(runtime, "chat.current");
    const token = runtime.currentToken();
    if (token === null) {
      throw new Error("plugin host: no chat is in scope for this invocation");
    }
    return ctx.newString(token);
  });
  ctx.setProp(chat, "current", currentFn);
  currentFn.dispose();

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
        // Host authority is the write ceiling (02 §2) — a non-host caller lacks it even with the grant.
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
        // A turn is a host-gated SPEND action (02 §2) — a non-host caller lacks the authority even with the grant.
        throw new Error("plugin host: chat.requestTurn requires host authority on this chat");
      }
      // The FUNDER (installer) is closed over DOMAIN-SIDE — the membrane supplies NONE (authority-blind): a plugin
      // can never fund a foreign budget because it cannot name the funder. The child cascade depth = the
      // invocation's context depth + 1; the domain `requestTurn` refuses a value past AUTOMATION_DEPTH_HARD_CAP,
      // so a plugin cannot launder an event→turn→event loop past the ceiling. Spend rides D17 + the per-member
      // turn budget (NOT the automation §3 spend ceiling — the LOW-2 deferral, same class as plugin imagery).
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
        // Surfacing chips writes room-visible state — host authority is the ceiling (02 §2), the SAME gate the
        // plugin's other chat writes take; a non-host caller lacks it even with the grant.
        throw new Error("plugin host: chat.surfaceQuickReply requires host authority on this chat");
      }
      await runtime.bridge.surfaceQuickReply(scope.chatId, buildQuickReplyChoices(args[1]));
      return null;
    },
  });

  ctx.setProp(surface, "chat", chat);
  chat.dispose();
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

/** worldInfo.upsertEntry — capability worldinfo.write + host authority (02 §2: room-state writes are host
 *  authority). The guest entry crosses as a JSON object; the authority-agnostic bridge maps it onto the shared
 *  lore writer under the installer. */
function setWorldInfo(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const worldInfo = ctx.newObject();
  attachAsync(ctx, worldInfo, {
    name: "upsertEntry",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "worldInfo.upsertEntry");
      const scope = resolveChat(runtime, args[0]);
      if (!scope.canWrite) {
        throw new Error("plugin host: worldInfo.upsertEntry requires host authority on this chat");
      }
      await runtime.bridge.worldInfo.upsertEntry(args[1] as PluginWorldEntryUpsert);
      return null;
    },
  });
  ctx.setProp(surface, "worldInfo", worldInfo);
  worldInfo.dispose();
}

/** imagery.generatePicture — capability imagery.generate + host authority (02 §2: host-gated). Returns the
 *  primary image's `{assetId}` (the bridge forwards the admitted chat + action args to the front door; compose
 *  re-validates the args + applies the action-arg defaults). v1 SPEND BOUND (honest, docs-are-law): the
 *  generation is funded by the INSTALLER's own credential (compose resolves the installer Principal for
 *  connection + spend attribution), fan-out is clamped to n≤4 (generateImageActionArgsSchema), host calls are
 *  capped at ≤32 concurrent per invocation, and plugin install is admin-only. There is NO per-call
 *  D17/automation_budgets SPEND-CEILING debit on this path — that ceiling is a deliberate P4b-tail deferral (the
 *  same unwired class as turn.trigger). Do not claim a spend ceiling this path does not enforce. */
function setImagery(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const imagery = ctx.newObject();
  attachAsync(ctx, imagery, {
    name: "generatePicture",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "imagery.generatePicture");
      const scope = resolveChat(runtime, args[0]);
      if (!scope.canWrite) {
        throw new Error("plugin host: imagery.generatePicture requires host authority on this chat");
      }
      return await runtime.bridge.imagery.generatePicture(scope.chatId, (args[1] ?? {}) as GenerateImageActionArgs);
    },
  });
  ctx.setProp(surface, "imagery", imagery);
  imagery.dispose();
}

function setVariables(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const vars = ctx.newObject();
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
  vars.dispose();
}

/** storage.get/set/delete/list — capability storage.kv. The plugin-PRIVATE KV (01 §2 / 02 §3): the bridge op
 *  is closed DOMAIN-side over the pluginId + installer (owner), so a guest names only the key/prefix and can
 *  NEVER read another plugin's (or owner's) keys. Not host-authority gated (a plugin's own private store is not
 *  room state) — the grant alone suffices. The value/key-size + 256-key caps are enforced by the domain op. */
function setStorage(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const storage = ctx.newObject();
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
  storage.dispose();
}

/** notifications.post — capability notify. Post a durable participant notice (01 §2 / 03 §1.5): the guest supplies
 *  the recipient selector (`"host"|"all_members"`) + the message; the bridge closed the pluginId + installer over
 *  the op, which resolves the recipient set DOMAIN-side (host = installer; all_members = the present human roster)
 *  and emits the `automation-notice`. A plugin can never notify a non-participant (the roster is resolved
 *  domain-side from the ADMITTED chat, never guest-supplied). Requires an admitted chat scope; NOT host-authority
 *  gated (a member-visible notice to participants is the read floor, matching the automation `post_notification`
 *  arm's own `host|all_members` recipients — the arm gates the roster, not host authority). The message is
 *  host-capped by the domain op (200 chars, 03 §1.5). */
function setNotifications(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const notifications = ctx.newObject();
  attachAsync(ctx, notifications, {
    name: "post",
    inFlight: runtime.inFlight,
    pending: runtime.pending,
    impl: async (args) => {
      requireCapability(runtime, "notifications.post");
      const scope = resolveChat(runtime, args[0]);
      const recipient = args[1] === "all_members" ? "all_members" : "host";
      const message = typeof args[2] === "string" ? args[2] : "";
      await runtime.bridge.notifications.post(scope.chatId, recipient, message);
      return null;
    },
  });
  ctx.setProp(surface, "notifications", notifications);
  notifications.dispose();
}

/** tools.register — SYNC, activation-time (03 §5). Captures the guest handler HANDLE for the resident-handler
 *  runtime (the Sandbox keeps it alive + mints the ref); collects `{name, description, parameters}`. A snippet
 *  (no tools.register grant) hits the capability throw here — the "no registration from a transient snippet"
 *  rule enforced through the SAME gate, no snippet-special path. */
function setTools(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const tools = ctx.newObject();
  const registerFn = ctx.newFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "tools.register");
    if (defHandle === undefined) {
      throw new Error("plugin host: tools.register requires a definition object");
    }
    const nameHandle = ctx.getProp(defHandle, "name");
    const descHandle = ctx.getProp(defHandle, "description");
    const paramsHandle = ctx.getProp(defHandle, "parameters");
    const handler = ctx.getProp(defHandle, "handler"); // KEPT alive by the Sandbox (never disposed here)
    try {
      const name = ctx.dump(nameHandle) as unknown;
      const description = ctx.dump(descHandle) as unknown;
      const parameters = ctx.dump(paramsHandle) as unknown;
      if (typeof name !== "string" || typeof description !== "string" || typeof parameters !== "object" || parameters === null) {
        handler.dispose();
        throw new Error("plugin host: tools.register definition must be { name, description, parameters, handler }");
      }
      runtime.collectTool({ name, description, parameters: parameters as Record<string, unknown> }, handler);
    } finally {
      nameHandle.dispose();
      descHandle.dispose();
      paramsHandle.dispose();
    }
    return ctx.undefined;
  });
  ctx.setProp(tools, "register", registerFn);
  registerFn.dispose();
  ctx.setProp(surface, "tools", tools);
  tools.dispose();
}

/** transforms.register — SYNC, activation-time (03 §6), the D50 PromptTransform mirror of tools.register.
 *  Captures the guest `apply` HANDLE for the resident-handler runtime (the Sandbox keeps it alive + mints the
 *  ref) and records `{name, point}`. Capability-gated (chat.transform) through the SAME uniform gate — a
 *  snippet without the grant hits the throw here (no snippet-special path). NOTE the plugin ORDER BAND (1000+)
 *  is NOT a guest input: the guest supplies no `order`, and the DOMAIN registrar assigns the band ABOVE the
 *  0–999 automation band at activation — the membrane cannot bypass it because it cannot express it. */
function setTransforms(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const transforms = ctx.newObject();
  const registerFn = ctx.newFunction("register", (defHandle?: QuickJSHandle) => {
    requireCapability(runtime, "transforms.register");
    if (defHandle === undefined) {
      throw new Error("plugin host: transforms.register requires a definition object");
    }
    const nameHandle = ctx.getProp(defHandle, "name");
    const pointHandle = ctx.getProp(defHandle, "point");
    const apply = ctx.getProp(defHandle, "apply"); // KEPT alive by the Sandbox (never disposed here on success)
    try {
      const name = ctx.dump(nameHandle) as unknown;
      const point = ctx.dump(pointHandle) as unknown;
      if (typeof name !== "string" || (point !== "user_input" && point !== "assembled_dynamic")) {
        apply.dispose();
        throw new Error("plugin host: transforms.register definition must be { name, point: 'user_input'|'assembled_dynamic', apply }");
      }
      runtime.collectTransform({ name, point }, apply);
    } finally {
      nameHandle.dispose();
      pointHandle.dispose();
    }
    return ctx.undefined;
  });
  ctx.setProp(transforms, "register", registerFn);
  registerFn.dispose();
  ctx.setProp(surface, "transforms", transforms);
  transforms.dispose();
}

/** events.on — SYNC, activation-time (03 §2), the event-subscription mirror of tools.register. `on(type, handler)`:
 *  gate events.subscribe, validate `type` against the closed Tier-1 taxonomy (plugins get no private event
 *  vocabulary), and capture the guest `handler` HANDLE for the resident-subscriber runtime. The handler is a
 *  POSITIONAL arg (auto-disposed after this callback), so it is `dup()`'d before being handed to the Sandbox
 *  (which keeps the dup + disposes it at teardown). The DOMAIN wires the collected subscription onto the
 *  automation fan-out (`subscribeEvent`): delivery is TF-1-validated + depth/visibility/declared-gated on the
 *  automation side — the membrane only collects, never bypasses those gates. INSTALLED plugins only (a snippet
 *  profile omits the grant → the same uniform capability throw, no snippet-special path). */
function setEvents(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const events = ctx.newObject();
  const onFn = ctx.newFunction("on", (typeHandle?: QuickJSHandle, handlerHandle?: QuickJSHandle) => {
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
    runtime.collectEvent({ type: type as ChatTriggerType | DomainTriggerType }, handlerHandle.dup());
    return ctx.undefined;
  });
  ctx.setProp(events, "on", onFn);
  onFn.dispose();
  ctx.setProp(surface, "events", events);
  events.dispose();
}

/** net.fetch — capability net.fetch. The host performs the fetch through the AUDITED SSRF guard (`safeFetch`,
 *  D61 B5a) pinned to the manifest-declared `netHosts` allowlist (the wall — NEVER `ANY_HOST`, NEVER a
 *  guest-supplied host). The guest supplies ONLY the URL + a GET/POST init; the host list is fixed data. Every
 *  hop re-validates https + the allowlist + private-range denial, so an off-allowlist redirect / private IP /
 *  scheme downgrade is refused. The response crosses back as JSON-safe primitives — `{status, body}` (body =
 *  the UTF-8-decoded, byte-capped response text); no live `Response` object crosses the marshalling boundary.
 *  Bounded by `safeFetch`'s own caps (PLUGIN_NET_MAX_BYTES body + the 5 s host deadline). */
function setNet(ctx: QuickJSContext, surface: QuickJSHandle, runtime: MembraneRuntime): void {
  const net = ctx.newObject();
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
      const res = await safeFetch(url, buildNetOptions(runtime.netHosts, args[1]));
      const body = NET_TEXT_DECODER.decode(await res.bytes());
      return { status: res.status, body };
    },
  });
  ctx.setProp(surface, "net", net);
  net.dispose();
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

/** Build + attach ONE async host function: guest args via `ctx.dump`, the impl races a real-time deadline, the
 *  JSON-safe result crosses back via `jsToHandle` (size-capped), and settled guest jobs are pumped (bounded by
 *  the invocation deadline). ≤ 32 concurrent host calls per invocation — call 33 rejects (03 §3 back-pressure).
 *  A thrown/rejected impl (a capability/handle/host-authority refusal, or a bridge error) rejects the guest
 *  promise — errors-as-data, never a host crash. */
function attachAsync(ctx: QuickJSContext, target: QuickJSHandle, spec: AsyncFnSpec): void {
  const { name, inFlight, pending, impl } = spec;
  const fn = ctx.newFunction(name, (...argHandles) => {
    const args = argHandles.map((handle) => ctx.dump(handle) as unknown);
    const deferred = ctx.newPromise();

    if (inFlight.count >= HOST_CALLS_IN_FLIGHT_MAX) {
      const err = ctx.newError(`plugin host: too many concurrent host calls (>${HOST_CALLS_IN_FLIGHT_MAX})`);
      deferred.reject(err);
      err.dispose();
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

    void Promise.race([impl(args), timeout])
      .then(
        (result) => {
          // A fire-and-forget guest call can outlive its invocation: the context is disposed (snippet end /
          // deactivate) BEFORE this real-async host call settles. Touching a dead context (deferred/jsToHandle)
          // is a use-after-free that escapes as an unhandled rejection — drop the late result (the guest promise
          // it would resolve no longer exists; leak-proof, the 03 §3 PluginInvocationEnded posture).
          if (!ctx.alive) {
            return;
          }
          const json = JSON.stringify(result ?? null);
          if (Buffer.byteLength(json, "utf8") > HOST_FN_RESULT_CAP_BYTES) {
            const err = ctx.newError(`${name} host result exceeds ${HOST_FN_RESULT_CAP_BYTES}-byte cap`);
            deferred.reject(err);
            err.dispose();
            return;
          }
          const handle = jsToHandle(ctx, result ?? null);
          deferred.resolve(handle);
          handle.dispose();
        },
        (reason: unknown) => {
          if (!ctx.alive) {
            return;
          }
          // Preserve the Error's NAME across the boundary (not just the message) — a typed membrane rejection
          // (`PluginCapabilityError`) must reach the guest with `e.name === "PluginCapabilityError"` so a plugin
          // feature-detects by type (01 §1.3), not by a message substring. Nameless/non-Error reasons fall back
          // to a plain `"Error"`.
          const err = reason instanceof Error ? ctx.newError({ name: reason.name, message: reason.message }) : ctx.newError(String(reason));
          deferred.reject(err);
          err.dispose();
        },
      )
      .finally(() => {
        inFlight.count -= 1;
        // Settled (or dropped by the alive guard after a post-dispose drain) — no longer a teardown hazard.
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
  fn.dispose();
}
