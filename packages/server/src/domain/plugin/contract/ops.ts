// domain/plugin/contract/ops — the injected op bundle the MEMBRANE's host functions call + the
// runtime registrar seams activation hands collected registrations to. This file TYPES these; compose builds the
// bodies (the host-fn wiring + the registry plumbing). Cross-feature op SHAPES are REUSED not
// re-spelled where the shape matches (core/AGENTS.md §5.4 one-home): `worldInfo`/`notifications`/
// `applyVariableOps` are the SAME injected types `domain/automation` already declares — a plugin write
// rides the exact seam an automation action does. `imagery` DIVERGES (declared here): the membrane returns the
// primary image's `{assetId}`, not automation's cost-summary — compose binds it to the `{assetId}`
// front door. Plugin-only reads (`listMessages` → the reduced `PluginMessageView`, `getVariables`)
// + the installing user's global-var KV are declared here. Every op is wired at `entry/compose` (one-directional
// flow); the domain declares only the TYPE.

import type { HistoryFloorSeq } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { GenerateImageActionArgs } from "@orb/contracts/imagery";
import type { NotificationEvent, NotificationType, PluginNotificationRecipient } from "@orb/contracts/notifications";
import type {
  InvocationChat,
  PluginAssetView,
  PluginCharacterView,
  PluginEventSubscription,
  PluginHandlerRef,
  PluginInvokeArgs,
  PluginMacroRegistration,
  PluginMessageView,
  PluginPubsubSubscription,
  PluginQuietOptions,
  PluginSearchHit,
  PluginSuggestedAct,
  PluginToastLevel,
  PluginToolRegistration,
  PluginTransformRegistration,
  PluginWorldBookView,
  PluginWorldEntryView,
} from "@orb/contracts/plugin";
import type { ChatId, PluginId, UserId, WorldBookId } from "@orb/kit/ids";
import type { UserMacroDef } from "@orb/kit/macro";
import type { AutomationOps } from "#domain/automation";
import type { ResolveViewerVisibility } from "#domain/chat";

/** Per-plugin serialization for durable rows, guest state, registrations, and provider contributions. */
export interface PluginLifecycleLanes {
  readonly run: <T>(pluginId: PluginId, job: () => Promise<T>) => Promise<T>;
}

/** The per-handler invoker activation closes over: run the guest callback `handler` with JSON-encoded args
 *  under the invocation budget (the port's `invoke`, curried over the resident instance). `chat` sets the
 *  handler's invocation-chat scope — a resident tool runs in the chat it was called from, with the caller's
 *  read/host authority resolved into `canWrite` by the registrar (`null` = no chat scope). The string in/out is
 *  the JSON-safe membrane boundary; the closure also drives the crash counter. */
export type PluginInvokeHandler = (handler: PluginHandlerRef, argsJson: PluginInvokeArgs, chat: InvocationChat | null) => Promise<string>;

/** The deregistration handle a registrar returns — `deactivate`/`uninstall` calls `unregister` so no ghost
 *  tools/transforms/subscriptions survive a disabled/removed plugin. */
export interface PluginRegistrationHandle {
  readonly unregister: () => void;
}

/** The per-ACTIVATION scope every registrar call carries (the registrar bundle is one process-wide
 *  compose value, but namespacing + the PL-C ceiling are per-plugin). `slug` is the manifest id (DERIVED from
 *  the re-parsed manifest at activation, NEVER guest-supplied) the registrar namespaces `plugin_<slug'>_<name>`
 *  with; `installer` is the resolved installing principal the invocation ceiling runs as (PL-C). */
export interface PluginActivationScope {
  readonly slug: string;
  readonly installer: Principal;
  /** The manifest's cascade opt-in (DERIVED from the re-validated manifest, fail-closed `false` when
   *  absent). The `subscribeEvent` registrar folds it onto the `PluginTriggerSubscriber` so ONE depth guard
   *  serves rules + plugins; a depth ≥ 1 fact reaches this plugin only when it opted in. */
  readonly matchAutomationEvents: boolean;
}

/** The injected cross-feature ops the membrane's host functions run under the installing principal, plus
 *  the runtime registrar seams. TYPED here; wired at `entry/compose`. The write ops REUSE automation's
 *  injected types verbatim (one home — a plugin write is the same seam an automation action uses). */
export interface PluginHostOps {
  readonly chat: {
    /** Recent canon projected to the REDUCED plugin view (the read floor is "what a member sees").
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
    /** The invocation chat's PRESENT CHARACTER roster, projected to the reduced `PluginCharacterView`
     *  (`chat.listCharacters`, capability `chat.read` — #788 F11). PRINCIPAL-FREE, the `listMessages` posture: the
     *  bridge resolves the installer's membership via `resolveViewerVisibility` FIRST and short-circuits a
     *  non-member to `[]`, so this read is reached only for a member of THIS room and carries no owner filter (a
     *  room's roster is the room's own member-visible state). Wired at compose to the principal-free
     *  `loadPluginCharacters` reader. Reduced to id/name/avatar — never a co-participant's full card. */
    readonly listCharacters: (chatId: ChatId) => Promise<readonly PluginCharacterView[]>;
    /** The standalone runtime-variable write — the SAME delta seam automation's `set_variable` arm rides.
     *  `capability: chat.variables.write`. */
    readonly applyVariableOps: AutomationOps["chat"]["applyVariableOps"];
    /** The autonomous turn seam (`chat.requestTurn`, turn.trigger). Maps onto chat's principal-free
     *  `requestTurn` at compose with `initiator:"plugin"` HARDCODED (a plugin cannot forge a different origin) +
     *  `triggeredBy` = the INSTALLER (attribution and abort ownership — the bridge closes it over the installer,
     *  never guest-supplied). The room host funds the turn and the initiator's membership is gated inside
     *  `requestTurn` (leak-free NOT_FOUND). LOOP SAFETY: the cascade-depth guard bounds a runaway plugin (`automationDepth` is the child depth to stamp,
     *  refused past the hard cap). Returns void to the realm; cost VISIBILITY rides the stats domain. */
    readonly requestTurn: (req: {
      readonly triggeredBy: UserId;
      readonly chatId: ChatId;
      readonly automationDepth: number;
      readonly speakerCharacterId?: string;
      readonly guided?: string;
    }) => Promise<void>;
  };
  /** The `worldinfo.write` capability's THREE ops — the writer plus the two gates 02 §2 specifies alongside it
   *  ("grant + host + book-attached-to-chat + the 64-entry cap"). The grant + host authority are the membrane's;
   *  these two are the domain's, and they are what keep a `worldinfo.write` grant from reaching rooms the plugin
   *  was never admitted to. The automation arm gates both (`arm-executors.ts` — `isBookAttachedToChat` +
   *  `RULE_MAX_ENTRIES_PER_BOOK`); the plugin path gated neither. */
  readonly worldInfo: {
    /** The SHARED, hand-edit-safe world-info writer (the ONE write path) — automation's injected type verbatim. */
    readonly upsertEntries: AutomationOps["worldInfo"]["upsertEntries"];
    /** Is the guest-named book attached to the ADMITTED chat? The attachment IS the room's consent to that
     *  book's prompt content, so a plugin invoked in chat X may not write a book attached only to chat Y (both
     *  can be owned by the same installer, which is all the shared writer's ownership gate can see). Wired at
     *  compose to world-info's own member-gated `listForChat` front door. */
    readonly isBookAttachedToChat: (ownerId: UserId, chatId: ChatId, bookId: WorldBookId) => Promise<boolean>;
    /** The book's existing entry TITLES, for the per-plugin entry ceiling (a looping guest fills a book
     *  otherwise). Wired at compose to world-info's owner-gated `listEntryIndex`. */
    readonly listEntryTitles: (ownerId: UserId, bookId: WorldBookId) => Promise<readonly string[]>;
    /** The `worldinfo.read` READ half (#788 F12): the books ATTACHED to the invocation chat, reduced to
     *  `PluginWorldBookView`. Wired at compose to world-info's member-gated `listForChat` under the installer's
     *  Principal — so a non-member/kicked caller gets `[]` and only books attached to THIS room are ever named.
     *  Owner-scoped by construction: the installer's own attached books. */
    readonly listBooksForChat: (ownerId: UserId, chatId: ChatId) => Promise<readonly PluginWorldBookView[]>;
    /** The `worldinfo.read` entry read (#788 F12): the entries of ONE book, reduced to `PluginWorldEntryView`.
     *  Wired at compose to world-info's OWNER-gated `listEntries`. The ATTACHMENT gate is applied by the bridge
     *  BEFORE this op (the write path's own `isBookAttachedToChat`), so a `bookId` not attached to the invocation
     *  chat never reaches here — this op reads only an already-attachment-verified, installer-owned book. */
    readonly listEntries: (ownerId: UserId, bookId: WorldBookId) => Promise<readonly PluginWorldEntryView[]>;
  };
  /** The `assets.read` capability's READ op (#788 seam-11 read half). Read one asset from the INSTALLER's OWN
   *  CAS — wired at compose to the assets domain's OWNER-GATED `readOwnedAssetBytes` under the installer's
   *  Principal (resolved by ROW READ, so a `UserId` arriving here carries no authority). Owner-scoped by
   *  construction: a guest names only the id and can read only its own. A foreign/absent id is the leak-free
   *  `null` (the compose wiring collapses the domain's not-found to `null` — indistinguishable, no existence
   *  oracle); an owned asset over the read cap returns metadata with `dataBase64: null`. */
  readonly assets: {
    // @orb-waive brand-in-name-position(assetId): the guest's untrusted wire string, owner-scope-gated by the domain read, cast at compose — branding here would claim a validation this boundary has not performed.
    readonly read: (req: { readonly installerUserId: UserId; readonly assetId: string }) => Promise<PluginAssetView | null>;
    /** The `net.fetch_asset` capability's CAS-WRITE op (#798). Write ALREADY-FETCHED-AND-VALIDATED image bytes
     *  into the INSTALLER's OWN CAS — wired at compose to the assets domain's `store` under the installer's own
     *  Principal (resolved by ROW READ, so a `UserId` here carries no authority; the store re-verifies the mime
     *  against the magic bytes). Infra performed the fetch + the SSRF egress wall + the remote-image guard and
     *  hands ONLY the validated bytes + the SNIFFED mime down — the bytes cross THIS seam but never the guest
     *  realm. Owner-scoped by construction (the bridge closes the installer over it; a guest names no owner).
     *  Returns the new (or content-addressed-deduped) asset id.
     *
     *  It also RECORDS the fetch in `plugin_assets` (#802), which is why this op needs the `pluginId` the read
     *  half does not: the stored blob has no other referencing row anywhere (the surface that displays it is a
     *  JSON state blob), so without that link the asset-GC ref registry cannot see it and the scheduled sweep
     *  reaps a live cover one grace window later. The pluginId costs no new refusal — the same call already
     *  claims the per-plugin `admitAssetEgress` belt, which requires an installed plugin. */
    readonly storeFetched: (req: {
      readonly pluginId: PluginId;
      readonly installerUserId: UserId;
      readonly bytes: Uint8Array;
      readonly mime: string;
    }) => Promise<{
      // @orb-waive brand-in-name-position(assetId): the injected-op result id for the installer's own new asset, minted under the installer by the CAS store and handed back to the guest as inert text. Ends if the bridge starts parsing to brands at the membrane.
      readonly assetId: string;
    }>;
  };
  /** The `search.query` capability's READ op (#788 F1). Semantic document search over the INSTALLER's OWN
   *  corpus — wired at compose to search's `documents` with `scope: { ownerId: installerUserId }`, so a guest
   *  searches only its own library (owner-scoped by construction — a guest names only the query + limit). The
   *  limit is clamped to `PLUGIN_SEARCH_RESULTS_MAX` at the membrane. Returns ranked reduced hits (content
   *  host-capped). No principal resolve — the ownerId in the scope IS the owner gate. */
  readonly search: {
    readonly documents: (req: { readonly installerUserId: UserId; readonly queryText: string; readonly limit?: number }) => Promise<readonly PluginSearchHit[]>;
  };
  /** The plugin-PRIVATE KV plane (`storage.*`; the `plugin_kv` table) — per plugin × installing
   *  owner. DIVERGES from automation (no automation analog): every op is keyed by BOTH `pluginId` AND `ownerId`
   *  (the denormalized guard column), so plugin A can never read plugin B's keys and no cross-owner read is
   *  possible even were a pluginId reused. `capability: storage.kv`. The bridge closes `pluginId`+`ownerId` over
   *  these. The value/key-size caps are DDL CHECKs; the 256-key ceiling is STATED here (the compose op owns
   *  the number) and ENFORCED inside the write statement itself — a count subquery on the INSERT, never a
   *  read this layer acts on, because two UI-proxyable writers raced that gap. Wired at compose to
   *  `persistence/plugin-kv`. */
  readonly storage: {
    readonly get: (pluginId: PluginId, ownerId: UserId, key: string) => Promise<string | null>;
    readonly set: (pluginId: PluginId, ownerId: UserId, key: string, value: string) => Promise<void>;
    /** The ATOMIC arm (#1442) — `set` with a precondition on the current value (`null` = the key must be
     *  absent). Same caps, same scope; the predicate rides the write, so it is safe under the concurrency
     *  `set` is not. */
    readonly compareAndSet: (
      pluginId: PluginId,
      ownerId: UserId,
      entry: { readonly key: string; readonly expected: string | null; readonly next: string },
    ) => Promise<{ applied: boolean; current: string | null }>;
    readonly delete: (pluginId: PluginId, ownerId: UserId, key: string) => Promise<void>;
    readonly list: (pluginId: PluginId, ownerId: UserId, prefix: string | undefined) => Promise<readonly string[]>;
  };
  /** The durable unified-inbox seam — TWO consumers:
   *   - `emit` is the raw `emit(NotificationEvent)` the crash policy fires for the ids-only `plugin-disabled`
   *     member ("the owner is notified") — a fully-formed event, no recipient resolution. Wired at compose
   *     to the durable-first `notifications.record`+publish (the automation `emitNotification` precedent).
   *   - `post` is the `notify` CAPABILITY (`notifications.post`; the SAME `automation-notice` durable path a
   *     `post_notification` arm uses). It DIVERGES from `emit`: a plugin has no rule and cannot mint
   *     ids/resolve a roster, so it takes the ADMITTED chat + the recipient selector + the message and resolves the
   *     recipient set DOMAIN-side (host = the installer; all_members = the present human members — participants
   *     ONLY, a plugin can never notify a non-participant), stamping the notice `source:{kind:"plugin",pluginId}`.
   *     Its selector is the PLUGIN SUBSET of the recipient axis (`PLUGIN_NOTIFICATION_RECIPIENTS`): the
   *     actor-excluding member resolves against a TRIGGERING FACT, and a guest `notify` call has none, so the
   *     member is unrepresentable on this seam rather than silently collapsing to `all_members`.
   *  `emit` capability: NONE (a host-internal crash notice); `post` capability: `notify`. Both wired at compose. */
  readonly notifications: {
    readonly emit: (event: NotificationEvent) => Promise<void>;
    /** The STANDING-ASK TRIO (#1041) the consent prompt drives — a standing ask is a claim that stays true,
     *  so it has three moves an episodic event does not, and the CALLER picks by what actually changed:
     *   - `emitStanding` — the ask GREW: record the event as the recipient's ONE live row of its type
     *     (any active row of that type is superseded in the same batch) and re-badge. New information.
     *   - `refreshStanding` — the ask SHRANK: correct the SAME row's payload in place (`seq`/`readAt`
     *     untouched), so answering nine asks one at a time never re-badges the bell nine times.
     *   - `retractStanding` — the ask is GONE: withdraw the row. There is no zero-count event to record.
     *  All three are no-ops for a reader who dismissed the row (no active row of the type), which is the
     *  settled state, not a reason to resurrect it. Wired at compose to `notifications.record`
     *  (`supersedeActiveOfSameType`) / `notifications.refreshStanding` / `notifications.retract`, each +
     *  the per-user bus publish. Capability: NONE — host-internal, never reachable from a guest. */
    readonly emitStanding: (event: NotificationEvent) => Promise<void>;
    readonly refreshStanding: (event: NotificationEvent) => Promise<void>;
    readonly retractStanding: (req: { readonly recipientUserId: UserId; readonly type: NotificationType }) => Promise<void>;
    readonly post: (req: {
      readonly pluginId: PluginId;
      readonly installerUserId: UserId;
      readonly chatId: ChatId;
      readonly recipient: PluginNotificationRecipient;
      readonly message: string;
    }) => Promise<void>;
  };
  /** Surface transient quick-reply chips (`surfaceQuickReply`; the automation-bus `quickReplySurfaced`
   *  event). Rides the SAME frame-free emit seam automation's `surface_quick_reply` arm does
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
  /** The `/imagine` engine. `capability: imagery.generate`. The membrane's `generatePicture` returns
   *  the primary image's `assetId` — the guest never sees the cost. Compose binds this to the
   *  `{assetId}`-bearing imagery front door; `authorUserId` resolves to the installer's Principal at compose
   *  (connection). Cost VISIBILITY rides the stats domain off the imagery write itself. */
  readonly imagery: {
    readonly generatePicture: (req: { readonly authorUserId: UserId; readonly chatId: ChatId; readonly args: GenerateImageActionArgs }) => Promise<{
      // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, branded only after the host parses it; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
      readonly assetId: string;
    }>;
  };
  /** The QUIET (non-canon) generation seam. `capability: llm.quiet` — SPEND. Wired at compose to the
   *  INSTALLER's resolved `summarize`-role connection through `bindRoleClients` (the D79 quiet-turn seam and
   *  the exact path `/autobg`'s `summarizeQuiet` already takes — that op's own header calls itself the
   *  extensible shape for future quiet-LLM arms, and this is one; it is not re-spelled here because the
   *  automation op is chat-and-author scoped while this one takes an installer and no chat).
   *
   *  IT WRITES NOTHING, by construction and on purpose: no message, no bus event, no canon, no turn slot. That
   *  is what keeps `llm.quiet` on the class-1 side of the membrane wall — the guest receives text and must do
   *  something else with it through a capability it was separately granted.
   *
   *  The `systemPrompt` is HOST-authored (compose): a guest supplies only `prompt`, so it cannot install a
   *  persona, a tool posture, or a claim of authority into the system slot. `text` is `""` on an empty/failed
   *  generation (the `summarizeQuiet` convention — the caller treats "" as "no answer"). Cost never crosses
   *  the realm boundary; cost VISIBILITY rides the stats domain off the generation itself. */
  readonly llm: {
    /** `opts` is the U6 widening (plugin-ui-plane §5.16/§5.32) — the guest's RAW structured-output schema and
     *  the asset ids it wants attached. Both are resolved at COMPOSE, and both resolutions are the reason the
     *  raw bag travels this far rather than being pre-digested: the schema must go through the ONE projection
     *  rule (`liftJsonSchema` → `projectJsonSchema`, D79) which no domain owns, and the image bytes come from
     *  the INSTALLER's own CAS through the owner-gated asset read. An unliftable schema or an asset the
     *  installer does not own is a typed refusal of the CALL — never a silent drop, and never the plugin. */
    readonly quiet: (req: {
      readonly installerUserId: UserId;
      readonly prompt: string;
      readonly signal: AbortSignal;
      readonly opts?: PluginQuietOptions;
    }) => Promise<{ readonly text: string }>;
  };
  /** The installing user's per-user global KV — fetchOwned under the installer, so cross-user reads are
   *  structurally impossible. `capability: global_vars`. */
  readonly variables: {
    readonly get: (ownerId: UserId, key: string) => Promise<string | null>;
    readonly set: (ownerId: UserId, key: string, value: string) => Promise<void>;
    readonly delete: (ownerId: UserId, key: string) => Promise<void>;
  };
  /** S4 posture 2 — the shared suggestion inbox, as the plugin domain reaches it. `raise` stashes an ask when
   *  the installer lacks host authority on the invocation chat; `voidForPlugin` clears a plugin's pending asks
   *  when it is deactivated or uninstalled. Both wired at compose to the ONE `SuggestionStore` automation
   *  owns — a plugin ask and a rule ask are the same question to a host and belong in the same place. */
  readonly suggestions: {
    readonly raise: RaisePluginSuggestion;
    readonly voidForPlugin: VoidPluginSuggestions;
  };
  /** The declarative UI-surface state seam (`host.ui.setState`, capability `ui.surface` — plugin-ui-plane #679
   *  U1; the chatId dimension is row 777). `setState` publishes a surface's whole replacement state: the compose
   *  op writes the per-(pluginId, surfaceId, chatId?) in-memory state row (the S4-suggestion-store precedent —
   *  respawn wipes; durable state is the plugin's own `storage.kv` job) and emits the per-user
   *  `pluginSurfaceStateChanged` freshness poke so the INSTALLER's own client refetches. Keyed by `pluginId` AND
   *  `installerUserId` (the store guard + the emit channel) AND the optional `chatId`; the first two are closed
   *  over the installer domain-side — a guest names only the surfaceId, the state, and (through an ADMITTED
   *  opaque handle the membrane resolves) its room. A named bag rather than five positionals: the
   *  `notifications.post` / `imagery.generatePicture` precedent above — a seam that gains a dimension must not
   *  gain arity. The read half (`plugin.getSurfaceState`) lands with U1's read verbs. Wired at compose. */
  readonly ui: {
    readonly setState: (req: {
      readonly pluginId: PluginId;
      readonly installerUserId: UserId;
      readonly surfaceId: string;
      /** `null` = the plugin-wide row every room shares; a chat id = that room's own row (row 777). ALREADY
       *  ADMITTED — the membrane resolved the guest's opaque handle against the invocation's one token, so the
       *  domain never re-derives which rooms a guest may name. */
      readonly chatId: ChatId | null;
      readonly state: Record<string, unknown>;
    }) => Promise<void>;
    /** `host.ui.toast` (U5, §4.5a) — stash a HOST-MEDIATED toast in the plugin's bounded UI outbox. Takes the
     *  whole {@link PluginIdentity} because the outbox stamps the plugin NAME as the attribution prefix (a guest
     *  supplies only the body — a guest-named prefix is the impersonation the label exists to prevent) and keys
     *  the per-plugin rate floor by the id. THROWS on the floor refusal, which the membrane surfaces as a
     *  rejected guest promise. Wired at compose to `createPluginUiOutbox`'s store. */
    readonly toast: (plugin: PluginIdentity, level: PluginToastLevel, message: string) => Promise<void>;
    /** `host.ui.openDialog` (U5, §4.5a) — record an ask to open one of THIS plugin's registered `dialog`
     *  surfaces. It records an id, never a claim that the surface exists: the draining verb resolves it against
     *  the resident instance, so an unknown id costs nothing and a cross-plugin open is not expressible. */
    readonly openDialog: (pluginId: PluginId, surfaceId: string) => Promise<void>;
  };
  /** The `databank.ingest` capability's write op (plugin-ui-plane #679 U8 seam 15). Ingest a text document
   *  into the INSTALLER's OWN databank — wired at compose to databank's `createFromText` under the installer's
   *  Principal (resolved by ROW READ, so a `UserId` arriving here carries no authority), which content-addresses
   *  + dedups the text and ENQUEUES the ingest workload (the indexer auto-runs). Owner-scoped by construction:
   *  the bridge closes the installer over this, a guest names only the document. Returns the new document id. */
  readonly databank: {
    // @orb-waive brand-in-name-position(documentId): the injected-op result id for the installer's own new document; the domain minted it under the installer, and it crosses back to the guest as inert text. Ends if the bridge starts parsing to brands at the membrane.
    readonly ingest: (req: { readonly installerUserId: UserId; readonly name: string; readonly text: string }) => Promise<{ readonly documentId: string }>;
  };
  /** The `character.ingest` capability's write op (plugin-ui-plane #679 U8 seam 17). Ingest a V2/V3 character
   *  CARD into the INSTALLER's OWN library — wired at compose to a per-installer `importCharacter` (the
   *  ContentChanged-emitting import path: byte-identical dedup, book/regex relink, and `character.create`'s own
   *  `contentChanged:true` emit drives the indexer). Owner-scoped by construction. `card` is the raw JSON-safe
   *  card object; compose serializes it to bytes and runs the SAME funnel a file upload takes. Returns the new
   *  character id + whether it was freshly created (`false` = a byte-identical re-ingest deduped by importHash). */
  readonly character: {
    readonly ingest: (req: {
      readonly installerUserId: UserId;
      readonly card: Record<string, unknown>;
      /** The CALLING plugin's own manifest id, closed over by the bridge (never guest-supplied) — the
       *  unspoofable identity `importedFrom` provenance mints from when the card carries no filename
       *  (#1702). `null` for the (currently unreachable — no snippet grant profile carries this capability)
       *  transient-snippet path. */
      readonly pluginId: PluginId | null;
    }) => Promise<{
      // @orb-waive brand-in-name-position(characterId): the injected-op result id for the installer's own new character, minted under the installer and handed back to the guest as inert text. Ends if the bridge starts parsing to brands at the membrane.
      readonly characterId: string;
      readonly created: boolean;
    }>;
    /** The remote-image "summon with art" op (`character.ingestAsset`, capability `character.ingest` — #798).
     *  Read a PNG asset from the INSTALLER's OWN CAS (owner-gated `readOwnedAssetBytes` — a foreign/absent id
     *  rejects leak-free) and run the SAME `importCharacter` funnel a file upload takes over those bytes, so the
     *  created character arrives WITH its embedded avatar (the plain `card`-JSON path cannot carry it). Same
     *  owner-scoped, no-chat, no-host posture as `ingest`; rides its SAME grant. Wired at compose to a
     *  per-installer `ingestCharacterAsset`. Returns the new character id + whether it was freshly created. */
    readonly ingestAsset: (req: {
      readonly installerUserId: UserId;
      // @orb-waive brand-in-name-position(assetId): the guest's untrusted wire string, owner-scope-gated by the CAS read, cast at compose — branding here would claim a validation this boundary has not performed.
      readonly assetId: string;
      /** See `ingest`'s `pluginId` — the same provenance identity, for the PNG-carrying arm. */
      readonly pluginId: PluginId | null;
    }) => Promise<{
      // @orb-waive brand-in-name-position(characterId): the injected-op result id for the installer's own new character, minted under the installer and handed back to the guest as inert text. Ends if the bridge starts parsing to brands at the membrane.
      readonly characterId: string;
      readonly created: boolean;
    }>;
    /** The `character.card_state` capability's WRITE op (D148). Merge this plugin's per-card state under the
     *  reserved `plugin_<slug>` key on the INSTALLER-OWNED character — wired at compose to character's
     *  `writePluginCardData` (an atomic owner-scoped `json_set` of that ONE key; sibling plugin keys stay
     *  byte-identical). BOTH un-forgeable coordinates are closed over DOMAIN-side: `installerUserId` (the
     *  owner-scope predicate — a foreign character is the leak-free NOT_FOUND the compose wiring raises) and
     *  `slug` (the emitter's own manifest slug the bridge stamped — a guest names no slug, so it can target only
     *  its own key). A guest supplies ONLY the `characterId` + inert `data`. METADATA, not content: the merge
     *  does NOT recompute `contentHash` or re-index (D148 clause d). Owner-scoped by construction — no principal
     *  resolve (the `storage.kv` posture, not the `ingest` import funnel). Returns void; the compose wiring maps a
     *  not-found (installer does not own the character) to the leak-free `PluginNotFoundError`. The
     *  `characterId` is the guest's untrusted wire string (owner-scope-gated at the persistence predicate, cast
     *  at compose), so it stays a bare `string` under the foreign-id exemption marker below. */
    readonly setCardData: (req: {
      readonly installerUserId: UserId;
      readonly slug: string;
      // @orb-waive brand-in-name-position(characterId): the guest's untrusted wire string, owner-scope-gated at the persistence predicate, cast at compose — branding here would claim a validation this boundary has not performed.
      readonly characterId: string;
      readonly data: Record<string, unknown>;
    }) => Promise<void>;
    /** The `character.card_state` capability's READ op (D148). Read this plugin's per-card state
     *  (`plugin_<slug>`) from the INSTALLER-OWNED character — wired at compose to character's `readPluginCardData`
     *  under the same owner-scope + host-stamped-slug walls. Returns the stored blob, or `null` when this plugin
     *  has written none on that owned character; the compose wiring maps a not-found (foreign/absent character) to
     *  the leak-free `PluginNotFoundError`. The `characterId` is the guest's untrusted wire string (owner-scope-gated
     *  at the persistence predicate, cast at compose), so it stays a bare `string` under the foreign-id exemption
     *  marker below. */
    readonly getCardData: (req: {
      readonly installerUserId: UserId;
      readonly slug: string;
      // @orb-waive brand-in-name-position(characterId): the guest's untrusted wire string, owner-scope-gated at the persistence predicate, cast at compose — branding here would claim a validation this boundary has not performed.
      readonly characterId: string;
    }) => Promise<Record<string, unknown> | null>;
  };
  /** The `plugin_events` capability's EMIT op (plugin-ui-plane §5a). Publish a private event on the
   *  INSTALLER-scoped resident plugin-event bus, on the channel `plugin:<emitterSlug>:<name>`. The `installerUserId`
   *  + `emitterSlug` are closed over DOMAIN-side (both un-forgeable — the bridge stamps the emitter's own slug), so
   *  a guest names only `name` + `data`. Wired at compose to the process-wide `PluginEventBus.emit`. Returns void:
   *  delivery to subscribers is fire-and-forget under the invocation budget. It NEVER reaches a domain/chat bus and
   *  the delivered payload is `{name, data}`, never a `TriggerFact` — the forgery wall. */
  readonly pubsub: {
    readonly emit: (req: {
      readonly installerUserId: UserId;
      readonly emitterSlug: string;
      readonly name: string;
      readonly data: Record<string, unknown>;
    }) => Promise<void>;
  };
  /** The runtime registrar seams (PL-A tool-use, D50 transform, event subscribe). Each takes a collected
   *  registration + the per-handler invoker + the per-activation {@link PluginActivationScope} (slug for
   *  namespacing, installer for the PL-C ceiling) and returns an `unregister` handle. `registerTool` is wired
   *  at compose (the tool-use runtime registrar bridge); `registerTransform`/`subscribeEvent` ride the same way,
   *  their realm namespaces `transforms.register`/`events.on` routed through the automation transform-apply /
   *  event-delivery pipelines. */
  readonly registrar: {
    readonly registerTool: (reg: PluginToolRegistration, invoke: PluginInvokeHandler, scope: PluginActivationScope) => PluginRegistrationHandle;
    readonly registerTransform: (reg: PluginTransformRegistration, invoke: PluginInvokeHandler, scope: PluginActivationScope) => PluginRegistrationHandle;
    /** Wire the plugin's COLLECTED macros into the process-wide plugin-macro registry (plugin-ui-plane §5.15).
     *  Handed the WHOLE set (not one macro) for the same reason `subscribeEvent` is: one plugin's macros are
     *  registered, ceilinged and unregistered together, and the per-turn read wants them as a unit. The
     *  registrar assigns the `plugin_<slug'>_<name>` namespace from `scope.slug` — never the guest's spelling. */
    readonly registerMacros: (
      macros: readonly PluginMacroRegistration[],
      invoke: PluginInvokeHandler,
      scope: PluginActivationScope,
    ) => PluginRegistrationHandle;
    /** Wire the plugin's COLLECTED event subscriptions onto the automation fan-out as ONE `PluginTriggerSubscriber`
     *  per instance (aggregating every `events.on(type,…)` — declaredEvents = the union of the collected types,
     *  the deliver closure routes each fact to the matching handler[s]). Handed the WHOLE collection (not one
     *  subscription) so a single subscriber owns one visibility read + one field-cap per fact. */
    readonly subscribeEvent: (
      subscriptions: readonly PluginEventSubscription[],
      invoke: PluginInvokeHandler,
      scope: PluginActivationScope,
    ) => PluginRegistrationHandle;
    /** Wire the plugin's COLLECTED private-event subscriptions onto the INSTALLER-scoped resident plugin-event bus
     *  (plugin-ui-plane §5a). The `subscribeEvent` shape exactly, one plane over — handed the WHOLE collection so
     *  one plugin's subscriptions register + unregister together, keyed by `(installer, subscriberSlug)` for the
     *  deactivate sweep. Wired at compose to `PluginEventBus.register`; the bus fans an emit to the matching
     *  handlers via `invoke`, never onto the automation fan-out. */
    readonly subscribePubsub: (
      subscriptions: readonly PluginPubsubSubscription[],
      invoke: PluginInvokeHandler,
      scope: PluginActivationScope,
    ) => PluginRegistrationHandle;
  };
}

/** The process-wide plugin-macro registry. One instance minted at compose (the `pluginSubscribers` /
 *  `surfaceState` precedent) — the plugin domain WRITES it at activation and chat READS it per turn through
 *  an injected op, so neither domain imports the other. */
export interface PluginMacroRegistry {
  /** Register one plugin's whole collected macro set for `installer`. Returns the deregistration handle
   *  activation stores (deactivate/uninstall calls it, so a disabled plugin's macros vanish from the next
   *  turn). Re-registering the same plugin REPLACES its prior set (an upgrade re-activates). */
  readonly register: (req: {
    readonly installer: UserId;
    /** The manifest slug — UNIQUE PER INSTALLING OWNER (`manifest.ts`'s own contract), which is exactly the
     *  key an installer-scoped registry needs. It is also what the namespace is built from, so keying on it
     *  keeps "which entry owns `plugin_oracle_*`" answerable without a second identifier. */
    readonly slug: string;
    readonly macros: readonly PluginMacroRegistration[];
    readonly invoke: PluginInvokeHandler;
  }) => PluginRegistrationHandle;
  /** Resolve every macro `authorUserId`'s enabled plugins registered, as kit `UserMacroDef`s ready to hand to
   *  `buildTurnUserMacros`. `[]` when that author has none — the byte-identical arm chat's turn path leans on. */
  readonly resolveForTurn: (authorUserId: UserId, chatId: ChatId) => Promise<readonly UserMacroDef[]>;
}

/** The process-wide PRIVATE plugin-event bus (plugin-ui-plane §5a) — ONE instance minted at compose (the
 *  `PluginMacroRegistry` / surface-state precedent), `ASSUMES(single-replica)`, respawn wipes. It IS the forgery
 *  wall's home, and the wall is structural: it is keyed by the INSTALLING PRINCIPAL, so an emit can only ever
 *  reach the SAME installer's subscribers; it has NO domain/chat-bus sink at all (the only thing an emit does is
 *  fan out to resident SIBLING handlers via `invoke`); and it carries no automation vocabulary, so nothing it
 *  delivers is a `TriggerFact`. The domain WRITES it at activation (`register`) and the emit op READS it (`emit`);
 *  the FACTORY lives in `substrate/plugin-event-bus.ts` (the SnippetGate/NotifyFloor convention — seam TYPE here). */
export interface PluginEventBus {
  /** Register one plugin's WHOLE collected subscription set for `installer`, keyed by `(installer, subscriberSlug)`
   *  so `deactivate`/`uninstall`'s `unregister` drops exactly this plugin's subscriptions. Returns the handle. */
  readonly register: (req: {
    readonly installer: UserId;
    readonly subscriberSlug: string;
    readonly subscriptions: readonly PluginPubsubSubscription[];
    readonly invoke: PluginInvokeHandler;
  }) => PluginRegistrationHandle;
  /** Publish `data` on `plugin:<emitterSlug>:<name>` for `installer` — fan out to every SAME-installer subscriber
   *  of that EXACT channel, delivering `{name, data}` (never a TriggerFact) through its `invoke`. A cross-installer
   *  or cross-channel subscriber is never reached (the key is installer + emitterSlug + name). Fire-and-forget. */
  readonly emit: (req: { readonly installer: UserId; readonly emitterSlug: string; readonly name: string; readonly data: Record<string, unknown> }) => void;
}

/** WHO a bridge is built for. The bridge was keyed by `pluginId` alone until posture 2 needed to render a
 *  host-facing question — and a card that does not say WHICH plugin is asking is a card a host cannot answer
 *  responsibly (a plugin ask is the one class whose requester is not a rule the host wrote themselves). The
 *  name is DERIVED from the re-validated manifest at activation, never guest-runtime-supplied. */
export interface PluginIdentity {
  readonly id: PluginId;
  readonly name: string;
  /** The manifest SLUG (unique per installing owner) — DERIVED from the re-validated manifest at activation,
   *  never guest-runtime-supplied. It is the emitter's un-forgeable identity on the private plugin-event plane
   *  (`host.pubsub.emit` publishes on `plugin:<slug>:<name>`, plugin-ui-plane §5a). Empty on the two paths that
   *  never emit — a confirmed S4 act and a snippet — for the same reason `name` is empty there. */
  readonly slug: string;
}

/** POSTURE 2 — raise a plugin's ask into the SHARED S4 inbox. Declared HERE (the consumer declares the type)
 *  and wired at compose to `domain/automation`'s raiser: plugin never imports a sibling domain, and there is
 *  deliberately no second proposal system — one store, one TTL, one sweep, one card surface, one host answer.
 *
 *  It takes the plugin's identity + installer because the STORE holds them: they are what the confirm re-check
 *  re-reads (still installed? installer still hosts?) and what the executor rebuilds the bridge from. The
 *  guest supplies only the act. */
export type RaisePluginSuggestion = (req: {
  readonly plugin: PluginIdentity;
  readonly installerUserId: UserId;
  readonly chatId: ChatId;
  readonly act: PluginSuggestedAct;
}) => void;

/** VOID every pending ask of one plugin — the deactivate/uninstall sweep. Wired at compose to the shared
 *  store's `voidPlugin`. The confirm-time liveness re-check is what makes a stale card SAFE; this is what
 *  makes it disappear. */
export type VoidPluginSuggestions = (pluginId: PluginId) => void;

/** The per-plugin HOURLY call floor for the two capabilities whose per-call bounds do not add up to a rate
 *  (`net.fetch` egress, `llm.quiet` spend) — `substrate/rate-floor.ts` implements it, one instance per
 *  capability, minted at compose beside the notify floor. `admit` THROWS when the plugin is over its ceiling. */
export interface PluginRateFloor {
  /** CHECK-AND-CLAIM one call for `pluginId` in the current hour. Deliberately ONE synchronous step, for the
   *  same reason {@link NotifyFloor.admit} is: the membrane admits up to 32 concurrent host calls per
   *  instance, so a check that awaited before recording would let a burst observe the pre-burst count. */
  readonly admit: (pluginId: PluginId) => void;
}

/** The process-wide BELTS every plugin bridge closes over — bundled rather than passed as four positional
 *  params (the `AsyncFnSpec` precedent: a seam that keeps gaining belts should not keep gaining arity, and a
 *  named bag makes "which belt did this bridge get" answerable at a glance). All three are minted ONCE at
 *  compose (the resident-registry posture) and shared by every activation. */
export interface PluginBelts {
  /** The `notify` capability's 60 s per-(plugin, chat) cooldown (02 §2). */
  readonly notify: NotifyFloor;
  /** The `net.fetch` hourly egress ceiling — the only bound on egress RATE (the D46 review's tracked finding). */
  readonly egress: PluginRateFloor;
  /** The `net.fetchAsset` hourly ceiling — SPLIT from `egress` (#801) so an art grid's honest cover spend
   *  (~30 per fresh browse page) can never starve text egress; the GET-to-allowlist channel prices
   *  differently from `net.fetch`'s POST-capable one. */
  readonly assetEgress: PluginRateFloor;
  /** The `llm.quiet` hourly generation ceiling — the only bound on how much of the installer's credential a
   *  granted plugin may spend over time. */
  readonly quietLlm: PluginRateFloor;
}

export interface NotifyFloor {
  /** CHECK-AND-CLAIM for one (plugin, chat): throws when the previous notice is younger than the floor,
   *  otherwise records this post and returns. Deliberately ONE synchronous step — a check that returned a
   *  verdict and let the caller await the write before recording would let two concurrent invocations both
   *  pass (the membrane admits up to 32 concurrent host calls per instance). */
  readonly admit: (pluginId: PluginId, chatId: ChatId) => void;
}

/** The per-USER ceiling on concurrently-running inline snippets. `runSnippet` is the one plugin path with no
 *  installed row behind it (so no per-plugin belt can bound it), and each call mints a whole fresh
 *  `QuickJSContext` (32 MiB ceiling) held for up to the
 *  snippet's settlement wall — so the bound that matters is how many a single user may hold AT ONCE, which no
 *  request-rate bucket can express. */
/** The per-plugin CONCURRENCY belt on `plugin.uiHostCall` (plugin-ui-plane #679 U4) — the Tier-C sibling of
 *  {@link SnippetGate}. The transport's per-user rate bucket bounds calls per WINDOW and structurally cannot
 *  bound how many are RUNNING, which is the number that matters when each in-flight call holds a real domain op
 *  and the caller is a surface that can re-render at animation rate. Implemented by
 *  `substrate/ui-host-call-gate.ts` (the seam TYPE in contract, the factory in substrate — the same split
 *  `SnippetGate` and `NotifyFloor` already use). */
export interface UiHostCallGate {
  /** CHECK-AND-CLAIM one slot, returning its RELEASE (the caller must call it in a `finally`). THROWS when the
   *  plugin is already at the ceiling. ONE synchronous step, for the same reason {@link NotifyFloor.admit} is:
   *  a claim that awaited anything between the check and the record would let a burst of concurrent calls all
   *  observe the pre-burst count and pass. */
  readonly admit: (pluginId: PluginId) => () => void;
}

export interface SnippetGate {
  /** CHECK-AND-CLAIM one slot for `userId`, returning its RELEASE (the caller must call it in a `finally`).
   *  Throws `PluginSnippetBusyError` when the user is already at the ceiling. ONE synchronous step for the same
   *  reason `NotifyFloor.admit` is: a claim that awaited anything between the check and the record would let a
   *  burst of concurrent calls all observe the pre-burst count. */
  readonly admit: (userId: UserId) => () => void;
}
