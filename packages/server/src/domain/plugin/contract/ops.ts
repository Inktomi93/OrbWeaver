// domain/plugin/contract/ops — the injected op bundle the MEMBRANE's host functions call (01 §2) + the
// runtime registrar seams activation hands collected registrations to. P3 TYPES these; P4 composes the bodies
// (the host-fn wiring + the registry plumbing — the P3/P4 cut). Cross-feature op SHAPES are REUSED not
// re-spelled where the shape matches (core/AGENTS.md §5.4 one-home): `worldInfo`/`notifications`/
// `applyVariableOps` are the SAME injected types `domain/automation` already declares (04 §4) — a plugin write
// rides the exact seam an automation action does. `imagery` DIVERGES (declared here): the membrane returns the
// primary image's `{assetId}` (01 §2), not automation's cost-summary — compose binds it to the `{assetId}`
// front door. Plugin-only reads (`listMessages` → the reduced `PluginMessageView`, `getVariables`)
// + the installing user's global-var KV are declared here. Every op is wired at `entry/compose` (one-directional
// flow); the domain declares only the TYPE.

import type { HistoryFloorSeq } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { GenerateImageActionArgs } from "@orb/contracts/imagery";
import type { NotificationEvent, NotificationRecipient } from "@orb/contracts/notifications";
import type {
  InvocationChat,
  PluginEventSubscription,
  PluginHandlerRef,
  PluginMessageView,
  PluginToolRegistration,
  PluginTransformRegistration,
} from "@orb/contracts/plugin";
import type { ChatId, PluginId, UserId } from "@orb/kit/ids";
import type { AutomationOps } from "#domain/automation";
import type { ResolveViewerVisibility } from "#domain/chat";

/** The per-handler invoker activation closes over: run the guest callback `handler` with JSON-encoded args
 *  under the §3 invocation budget (the port's `invoke`, curried over the resident instance). `chat` sets the
 *  handler's invocation-chat scope — a resident tool runs in the chat it was called from, with the caller's
 *  read/host authority resolved into `canWrite` by the registrar (`null` = no chat scope). The string in/out is
 *  the JSON-safe membrane boundary; the closure also drives the crash counter (03 §4). */
export type PluginInvokeHandler = (handler: PluginHandlerRef, argsJson: string, chat: InvocationChat | null) => Promise<string>;

/** The deregistration handle a registrar returns — `deactivate`/`uninstall` calls `unregister` so no ghost
 *  tools/transforms/subscriptions survive a disabled/removed plugin (03 §5). */
export interface PluginRegistrationHandle {
  readonly unregister: () => void;
}

/** The per-ACTIVATION scope every registrar call carries (P4 — the registrar bundle is one process-wide
 *  compose value, but namespacing + the PL-C ceiling are per-plugin). `slug` is the manifest id (DERIVED from
 *  the re-parsed manifest at activation, NEVER guest-supplied) the registrar namespaces `plugin_<slug'>_<name>`
 *  with; `installer` is the resolved installing principal the invocation ceiling runs as (PL-C). */
export interface PluginActivationScope {
  readonly slug: string;
  readonly installer: Principal;
  /** The manifest's cascade opt-in (03 §2 — DERIVED from the re-validated manifest, fail-closed `false` when
   *  absent). The `subscribeEvent` registrar folds it onto the `PluginTriggerSubscriber` so ONE depth guard
   *  serves rules + plugins; a depth ≥ 1 fact reaches this plugin only when it opted in. */
  readonly matchAutomationEvents: boolean;
}

/** The injected cross-feature ops the membrane's host functions run under the installing principal (01 §2), plus
 *  the runtime registrar seams. TYPED here; wired at `entry/compose` (P4). The write ops REUSE automation's
 *  injected types verbatim (one home — a plugin write is the same seam an automation action uses). */
export interface PluginHostOps {
  readonly chat: {
    /** Recent canon projected to the REDUCED plugin view (01 §2 — the read floor is "what a member sees").
     *  `capability: chat.read`.
     *
     *  `floorSeq` is REQUIRED, not optional, and is the D16 canon floor of the human this read runs for — the
     *  read returns only `messages.seq >= floorSeq`. It is required BY TYPE because the admission that reaches
     *  this op resolves membership only (`can(installer,"read",chat)` / `loadPresentRole`), and membership
     *  alone is not visibility: a `from-join`-clamped member is admitted to their room yet may not read its
     *  pre-join rows. A caller therefore cannot obtain the value without asking chat's `resolveViewerVisibility`
     *  first — {@link buildPluginBridge} is that caller, and a non-member short-circuits to `[]` there.
     *
     *  `readsHidden` is the SECOND half of the same viewer verdict (parity-plus §3.6 / D106): `true` when the
     *  human this read runs for is the chat HOST (they read hidden-class spans — the reveal plane), `false` for a
     *  member (hidden `<lie>`/`<ofilter>` spans are STRIPPED from the body before it crosses the realm boundary —
     *  the plugin realm is a member-reachable surface, so an unstripped body would launder a GM-plane secret to a
     *  non-host member's snippet). REQUIRED BY TYPE for the same reason as `floorSeq`: the only source is chat's
     *  `resolveViewerVisibility` (its `role`), so a caller cannot obtain it without the visibility resolve. */
    readonly listMessages: (
      chatId: ChatId,
      opts: { readonly limit?: number; readonly floorSeq: HistoryFloorSeq; readonly readsHidden: boolean },
    ) => Promise<readonly PluginMessageView[]>;
    /** THE cross-domain viewer-visibility op (chat's `resolveViewerVisibility`, compose-wired) — the bridge
     *  resolves the INSTALLER's membership + history floor with it before any canon read crosses the realm
     *  boundary. `null` = not a present member ⇒ the guest sees nothing. The TYPE is chat's (type-only
     *  cross-domain import); plugin never re-derives membership or the floor. */
    readonly resolveViewerVisibility: ResolveViewerVisibility;
    /** The chat's current runtime variable fold cache (read) — `capability: chat.read`. The CURRENT fold is
     *  room-state, not transcript (every member plays against it and post-join turns render it into text via
     *  `{{getvar}}`), so it is NOT floor-clamped — the read-visibility ruling's activity plane. */
    readonly getVariables: (chatId: ChatId) => Promise<Record<string, string>>;
    /** The standalone runtime-variable write — the SAME delta seam automation's `set_variable` arm rides (03
     *  §1.1). `capability: chat.variables.write`. */
    readonly applyVariableOps: AutomationOps["chat"]["applyVariableOps"];
    /** The autonomous turn seam (01 §2 `chat.requestTurn`, turn.trigger). Maps onto chat's principal-free
     *  `requestTurn` at compose with `initiator:"plugin"` HARDCODED (a plugin cannot forge a different origin) +
     *  `funderUserId` = the INSTALLER (funding attribution / D17 by-proxy subject — the bridge closes it over the
     *  installer, never guest-supplied). The funding box is resolved from the room host and the funder's
     *  membership is gated inside `requestTurn` (leak-free NOT_FOUND). LOOP SAFETY: the engine's per-member turn
     *  RATE budget + the cascade-depth guard bound a runaway plugin (`automationDepth` is the child depth to stamp,
     *  refused past the hard cap). Returns void to the realm; cost VISIBILITY rides the stats domain. */
    readonly requestTurn: (req: {
      readonly funderUserId: UserId;
      readonly chatId: ChatId;
      readonly automationDepth: number;
      readonly speakerCharacterId?: string;
      readonly guided?: string;
    }) => Promise<void>;
  };
  /** The SHARED, hand-edit-safe world-info writer (the ONE write path — 03 §1.3). `capability: worldinfo.write`. */
  readonly worldInfo: AutomationOps["worldInfo"];
  /** The plugin-PRIVATE KV plane (01 §2 `storage.*`; the `plugin_kv` table, 02 §3) — per plugin × installing
   *  owner. DIVERGES from automation (no automation analog): every op is keyed by BOTH `pluginId` AND `ownerId`
   *  (the denormalized guard column), so plugin A can never read plugin B's keys and no cross-owner read is
   *  possible even were a pluginId reused. `capability: storage.kv`. The bridge closes `pluginId`+`ownerId` over
   *  these; the value/key-size + 256-key caps are enforced HERE (the compose op), off the persistence's
   *  `countKeys`. Wired at compose to `persistence/plugin-kv`. */
  readonly storage: {
    readonly get: (pluginId: PluginId, ownerId: UserId, key: string) => Promise<string | null>;
    readonly set: (pluginId: PluginId, ownerId: UserId, key: string, value: string) => Promise<void>;
    readonly delete: (pluginId: PluginId, ownerId: UserId, key: string) => Promise<void>;
    readonly list: (pluginId: PluginId, ownerId: UserId, prefix: string | undefined) => Promise<readonly string[]>;
  };
  /** The durable unified-inbox seam — TWO consumers:
   *   - `emit` is the raw `emit(NotificationEvent)` the crash policy fires for the ids-only `plugin-disabled`
   *     member (03 §4 "the owner is notified") — a fully-formed event, no recipient resolution. Wired at compose
   *     to the durable-first `notifications.record`+publish (the automation `emitNotification` precedent).
   *   - `post` is the `notify` CAPABILITY (01 §2 `notifications.post`; the SAME `automation-notice` durable path a
   *     `post_notification` arm uses — 03 §1.5). It DIVERGES from `emit`: a plugin has no rule and cannot mint
   *     ids/resolve a roster, so it takes the ADMITTED chat + the recipient selector + the message and resolves the
   *     recipient set DOMAIN-side (host = the installer; all_members = the present human members — participants
   *     ONLY, a plugin can never notify a non-participant), stamping the notice `source:{kind:"plugin",pluginId}`.
   *  `emit` capability: NONE (a host-internal crash notice); `post` capability: `notify`. Both wired at compose. */
  readonly notifications: {
    readonly emit: (event: NotificationEvent) => Promise<void>;
    readonly post: (req: {
      readonly pluginId: PluginId;
      readonly installerUserId: UserId;
      readonly chatId: ChatId;
      readonly recipient: NotificationRecipient;
      readonly message: string;
    }) => Promise<void>;
  };
  /** Surface transient quick-reply chips (01 §2 `surfaceQuickReply`; the automation-bus `quickReplySurfaced`
   *  event — 03 §1.4). Rides the SAME frame-free emit seam automation's `surface_quick_reply` arm does
   *  (`publishAutomationEvent`, composed UP — infra never imports transport), stamping the emit
   *  `source:{kind:"plugin",pluginId}`. Host-authority is gated UPSTREAM in the membrane (`InvocationChat.canWrite`).
   *  `capability: chat.quick_reply`. Wired at compose. */
  readonly quickReply: {
    readonly surface: (req: {
      readonly pluginId: PluginId;
      readonly chatId: ChatId;
      readonly choices: readonly { readonly label: string; readonly sendText: string }[];
    }) => Promise<void>;
  };
  /** The `/imagine` engine (03 §1.7). `capability: imagery.generate`. The membrane's `generatePicture` returns
   *  the primary image's `assetId` (01 §2) — the guest never sees the cost. Compose binds this to the
   *  `{assetId}`-bearing imagery front door; `authorUserId` resolves to the installer's Principal at compose
   *  (connection). Cost VISIBILITY rides the stats domain off the imagery write itself. */
  readonly imagery: {
    readonly generatePicture: (req: {
      readonly authorUserId: UserId;
      readonly chatId: ChatId;
      readonly args: GenerateImageActionArgs;
    }) => Promise<{ readonly assetId: string }>;
  };
  /** The installing user's per-user global KV (02 §4) — fetchOwned under the installer, so cross-user reads are
   *  structurally impossible. `capability: global_vars`. */
  readonly variables: {
    readonly get: (ownerId: UserId, key: string) => Promise<string | null>;
    readonly set: (ownerId: UserId, key: string, value: string) => Promise<void>;
    readonly delete: (ownerId: UserId, key: string) => Promise<void>;
  };
  /** The runtime registrar seams (PL-A tool-use, D50 transform, event subscribe). Each takes a collected
   *  registration + the per-handler invoker + the per-activation {@link PluginActivationScope} (slug for
   *  namespacing, installer for the PL-C ceiling) and returns an `unregister` handle. `registerTool` is wired
   *  at compose (P4 — the tool-use runtime registrar bridge); `registerTransform`/`subscribeEvent` ride P4b
   *  (their realm namespaces `transforms.register`/`events.on` are unexposed until the transform-apply /
   *  event-delivery pipelines land — automation A5–A7), so they are unreachable this slice and pinned so. */
  readonly registrar: {
    readonly registerTool: (reg: PluginToolRegistration, invoke: PluginInvokeHandler, scope: PluginActivationScope) => PluginRegistrationHandle;
    readonly registerTransform: (reg: PluginTransformRegistration, invoke: PluginInvokeHandler, scope: PluginActivationScope) => PluginRegistrationHandle;
    /** Wire the plugin's COLLECTED event subscriptions onto the automation fan-out as ONE `PluginTriggerSubscriber`
     *  per instance (aggregating every `events.on(type,…)` — declaredEvents = the union of the collected types,
     *  the deliver closure routes each fact to the matching handler[s]). Handed the WHOLE collection (not one
     *  subscription) so a single subscriber owns one visibility read + one field-cap per fact. */
    readonly subscribeEvent: (
      subscriptions: readonly PluginEventSubscription[],
      invoke: PluginInvokeHandler,
      scope: PluginActivationScope,
    ) => PluginRegistrationHandle;
  };
}
