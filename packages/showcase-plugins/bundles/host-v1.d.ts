// host-v1.d.ts — the PUBLISHED TypeScript surface of the Orbweaver plugin host, version 1.
//
// COPY THIS FILE next to your `main.js` (and `ui.js`, if you ship one) and any TypeScript-aware editor gives
// you completion and type-checking against the whole host API in plain JavaScript — no build step, no
// package. It is a SCRIPT-kind declaration file on purpose: no imports, no exports, so every name below is
// simply in scope for your project the moment the file exists.
//
// IT IS A MIRROR, NOT A SOURCE. The one true contract lives in the application
// (`@orb/contracts/plugin` — host-v1.ts, manifest.ts, ui.ts); this file re-states it for authors outside the
// repository and is PINNED byte-for-meaning against it by a conformance test
// (`tests/contracts/plugin/host-v1.test-d.ts`) — a drifted mirror fails the application's own build. Two
// deliberate simplifications, both author-invisible: the app's BRANDED ids (`ChatHandle`, asset/character
// ids) appear here as `string` with their semantics documented — a guest never constructs one, only passes
// them back — and internal enforcement-map types are omitted (they gate the HOST side, not yours).
//
// The realm rules these types cannot express, restated because they bite:
//   - Registrations run at ACTIVATION; an UNGRANTED host call THROWS. Feature-detect with
//     `host.grants.includes("…")` before every registration (the guard idiom).
//   - There is no `Date`, no `Math.random`, no timers, no `fetch`, no module loader. Time and entropy are
//     the injected seams below.
//   - Every host call rejects after a 5 s real-time bound; three consecutive crashed invocations
//     auto-disable the plugin.
//   - Handlers must never throw: wrap, log, return.

// ── the global door ─────────────────────────────────────────────────────────────────────────────────────────

/** The one global in both guest realms. `orb.host(1)` in `main.js`; `orb.ui(1)` in `ui.js`. Asking for a
 *  version this host does not serve throws `HostVersionError` (branch on `err.name` — the class NAME crosses
 *  the sandbox boundary intact; messages do not). */
declare const orb: {
  readonly host: (version: 1) => PluginHostV1;
  readonly ui: (version: 1) => PluginUiV1;
};

// ── capabilities (the manifest's closed axis — declaring is ASKING; `host.grants` is what was ANSWERED) ─────

type PluginCapability =
  | "chat.read"
  | "chat.variables.write"
  | "chat.quick_reply"
  | "chat.transform"
  | "worldinfo.read"
  | "worldinfo.write"
  | "global_vars"
  | "storage.kv"
  | "notify"
  | "ui.surface"
  | "ui.frame"
  | "turn.trigger"
  | "imagery.generate"
  | "assets.read"
  | "llm.quiet"
  | "databank.ingest"
  | "search.query"
  | "character.ingest"
  | "character.card_state"
  | "events.subscribe"
  | "plugin_events"
  | "tools.register"
  | "net.fetch"
  | "net.fetch_asset";

// ── shared wire shapes ──────────────────────────────────────────────────────────────────────────────────────

/** An OPAQUE room token, minted per invocation by the host (`chat.current()`), valid only inside the
 *  invocation that minted it. Pass it back to room-scoped calls; never store, compare across calls, or
 *  fabricate one — a forged/stale handle fails resolution at the membrane. */
type ChatHandle = string;

type MessageRole = "system" | "user" | "assistant";

/** What `chat.listMessages` answers: the member-visible transcript projection — no economics, no params, no
 *  prompt internals, clamped to what the INSTALLER may see. */
interface PluginMessageView {
  readonly id: string;
  readonly role: MessageRole;
  readonly authorDisplayName: string;
  readonly characterId: string | null;
  readonly seq: number;
  readonly content: string;
}

/** What `chat.listCharacters` answers: the room's present CHARACTER seats (never humans, never full cards) —
 *  id, resolved display name, avatar asset id. Member-visible room state only, this room only. */
interface PluginCharacterView {
  readonly id: string;
  readonly name: string;
  readonly avatarAssetId: string | null;
}

/** One runtime-variable mutation — the SAME delta vocabulary automation's `set_variable` arm uses. */
type PluginVariableOp =
  | { readonly op: "set"; readonly key: string; readonly value: string }
  | { readonly op: "add"; readonly key: string; readonly value: string }
  | { readonly op: "inc"; readonly key: string }
  | { readonly op: "dec"; readonly key: string }
  | { readonly op: "delete"; readonly key: string };

/** One belief about the CURRENT value of a room variable, attached to `chat.applyVariableOps` to make the
 *  write a compare-and-set. `expected: null` means "I believe this key is unset" (which is NOT the same claim
 *  as the empty string). */
interface PluginVariablePrecondition {
  readonly key: string;
  readonly expected: string | null;
}

/** What `chat.applyVariableOps` answers. `applied` = your ops landed. `stale` = one of your preconditions no
 *  longer held, NOTHING was written, and `actual` carries the live value of each key you named (`null` =
 *  unset) so you can re-derive and try again. A lost race is DATA, not an exception. */
type PluginVariableWriteResult = { readonly outcome: "applied" } | { readonly outcome: "stale"; readonly actual: Record<string, string | null> };

/** A lore-book upsert — attached-book-only, `entryKey`-idempotent (same key updates, never duplicates). */
interface PluginWorldEntryUpsert {
  readonly bookId: string;
  readonly entryKey: string;
  readonly keys: readonly string[];
  readonly contentTemplate: string;
  readonly position: "before" | "after";
}

/** One lore book ATTACHED to the invocation chat (`worldInfo.listBooks`). `id` is what you pass to
 *  `worldInfo.listEntries`. */
interface PluginWorldBookView {
  readonly id: string;
  readonly name: string;
}

/** One entry of an attached book (`worldInfo.listEntries`) — the read symmetry of the upsert: keys +
 *  content + enabled, content host-capped like a message body. */
interface PluginWorldEntryView {
  readonly id: string;
  readonly keys: readonly string[];
  readonly content: string;
  readonly enabled: boolean;
}

/** What `assets.read` answers for an asset in the INSTALLER's OWN CAS. Bytes cross as base64 (there are no
 *  bytes in the realm); an owned asset over 1 MiB returns its metadata with `dataBase64: null` (never a
 *  truncated read — you must not mistake a clipped image for the whole one). A foreign or absent id is the
 *  call answering `null` instead of this shape. */
interface PluginAssetView {
  readonly mime: string;
  readonly sizeBytes: number;
  readonly dataBase64: string | null;
}

/** One ranked hit from `search.documents` — the matched chunk's text plus its document provenance and the
 *  relevance score. Index plumbing (chunk ids, hashes) is deliberately withheld. */
interface PluginSearchHit {
  readonly documentId: string;
  readonly documentName: string;
  readonly content: string;
  readonly score: number;
}

/** The structured-output ask on `llm.quiet` — your JSON Schema, host-validated, run on the installer's
 *  `structured`-role connection. The answer is the model's JSON AS TEXT: parse it, then clamp it (a schema
 *  constrains shape, not sense). */
interface PluginQuietSchema {
  readonly name: string;
  readonly description?: string;
  readonly schema: Record<string, unknown>;
}

/** `llm.quiet`'s optional second argument — both arms independent. `imageAssetIds` (≤ 4) names assets in the
 *  INSTALLER's own CAS for vision-capable models; text-only models ignore them. */
interface PluginQuietOptions {
  readonly schema?: PluginQuietSchema;
  readonly imageAssetIds?: readonly string[];
}

/** The `generate_image` argument vocabulary — the SAME shape automation rules use. NOTE the required fields:
 *  this is the resolved form (`mode`, `n`, `useAvatarReference`, `reuse`, `quiet` are yours to state).
 *  `quiet: false` posts the finished picture to the room; `true` returns only the assetId to you. */
interface GenerateImageActionArgs {
  readonly mode: "free" | "character" | "face" | "scenario" | "background" | "character_multimodal" | "face_multimodal";
  readonly prompt?: string | undefined;
  readonly negative?: string | undefined;
  readonly n: number;
  readonly size?: "square" | "portrait" | "landscape" | undefined;
  readonly subjectCharacterId?: string | undefined;
  readonly useAvatarReference: boolean;
  readonly reuse: "prefer" | "never";
  readonly quiet: boolean;
}

/** Who a plugin notice may reach — the participant-only subset of the notification recipient axis. */
type PluginNotificationRecipient = "host" | "all_members";

// ── events (the closed trigger taxonomy — plugins get no private DOMAIN vocabulary) ─────────────────────────

type ChatTriggerType =
  | "chatOpened"
  | "messageCommitted"
  | "messageEdited"
  | "variantSelected"
  | "turnStarted"
  | "turnCompleted"
  | "turnAborted"
  | "worldInfoActivated"
  | "personaSwitched"
  | "chatCreated"
  | "reactionsChanged"
  | "messageHidden"
  | "messagesDeleted"
  | "chatUpdated"
  | "wiEntryAttached"
  | "wiEntryDetached";

type DomainTriggerType = "character.updated" | "asset.created" | "persona.updated" | "world-info.updated";

/** The fact a subscribed handler receives. Fields are populated PER TRIGGER TYPE — read them behind `?.`
 *  (a `turnCompleted` fact has `turn` and no `message`; a domain fact has `chatId: null`). All ids cross as
 *  plain strings. */
interface PluginTriggerFactPayload {
  readonly chatId: string | null;
  readonly message?:
    | {
        readonly id: string;
        readonly role: MessageRole;
        readonly authorUserId: string | null;
        readonly characterId: string | null;
        readonly seq: number;
        readonly content: string;
      }
    | undefined;
  readonly turn?:
    | {
        readonly intent: string;
        readonly api: string;
        readonly provider: string;
        readonly model: string;
        readonly speakerCharacterId: string | null;
        readonly abortReason?: string | undefined;
        readonly automationDepth: number;
      }
    | undefined;
  readonly worldInfo?: { readonly entryIds: readonly string[] } | undefined;
  readonly reaction?: { readonly messageId: string; readonly variantId: string; readonly emoji: string; readonly added: boolean } | undefined;
  readonly persona?: { readonly from: string | null; readonly to: string | null } | undefined;
  readonly character?: { readonly id: string; readonly contentChanged: boolean } | undefined;
  readonly assetId?: string | undefined;
  readonly personaId?: string | undefined;
  readonly worldBookId?: string | undefined;
}

type PluginTriggerFact =
  | (PluginTriggerFactPayload & { readonly bus: "chat"; readonly type: ChatTriggerType })
  | (PluginTriggerFactPayload & { readonly bus: "domain"; readonly type: DomainTriggerType });

// ── prompt/display transforms ───────────────────────────────────────────────────────────────────────────────

/** Where a prompt transform hooks: the member's outgoing draft, or the assembled prompt's dynamic half. */
type PromptTransformPoint = "user_input" | "assembled_dynamic";

/** A transform's answer: the rewritten draft, or a deliberate ABORT of the generation (`abort` is the
 *  author-facing reason, ≤ 200 chars). A throw or a deadline overrun is neither — it is a SKIP. */
type PromptTransformOutcome = string | { readonly abort: string };

// ── the declarative UI vocabulary (`ui.surface`) ────────────────────────────────────────────────────────────

/** Where a surface may mount. `dialog` mounts nowhere by itself — it opens via `ui.openDialog`, only as the
 *  outcome of a round-trip the person just made. `message-footer` is static-only decoration under EVERY
 *  committed row (≤ 8 nodes, depth ≤ 2, no bindings, no interactive/bulk/prose kinds). */
type PluginSurfaceAnchor = "settings" | "chat-flank" | "chat-settings-section" | "tool-card" | "message-footer" | "page" | "dialog";

/** Who computes the pixels: `static` (this spec + published state), `scripted` (your `ui.js` publishes
 *  trees), `frame` (your own document — registered through `ui.registerFrame`, its own capability). */
type PluginSurfaceTier = "static" | "scripted" | "frame";

type PluginGapToken = "tight" | "field" | "row" | "block" | "section";
type PluginTextVoice = "body" | "gloss" | "label";
type PluginBadgeIntent = "neutral" | "info" | "success" | "warning" | "danger";
/** A button's weight. `primary` (#818) is honoured ONLY at the `page` and `dialog` anchors and only ONCE per
 *  surface — the FIRST one in document order wins; every later one, and every `primary` at any other anchor,
 *  renders at the neutral weight and is logged to the browser console. Your spec is never REFUSED for it. */
type PluginButtonVariant = "neutral" | "outline" | "primary";
type PluginImageAspect = "square" | "portrait" | "landscape";
type PluginPageStageKind = "browse" | "detail";
type PluginToastLevel = "info" | "success" | "warn" | "error";

/** A late-bound value: resolved by the renderer against the surface's published state (`ui.setState`). A
 *  missing path renders nothing (or the node's fallback) — never an error. */
interface PluginStateBinding {
  readonly $state: string;
}
type PluginBoundString = string | PluginStateBinding;
type PluginBoundNumber = number | PluginStateBinding;
type PluginBoundBoolean = boolean | PluginStateBinding;
/** The curated glyph vocabulary an `icon` node may name. Chrome-identity, consent/trust and identity glyphs
 *  are deliberately absent — a plugin cannot dress its content in the app's own trust iconography. */
type PluginIconName =
  | "star"
  | "heart"
  | "flame"
  | "sparkles"
  | "award"
  | "crown"
  | "gem"
  | "bookmark"
  | "download"
  | "eye"
  | "clock"
  | "hash"
  | "tag"
  | "users"
  | "chartColumn"
  | "images"
  | "fileText"
  | "bookOpen"
  | "scroll"
  | "library"
  | "drama"
  | "swords"
  | "leaf"
  | "globe"
  | "compass"
  | "map"
  | "check"
  | "info"
  | "circleAlert"
  | "alertTriangle"
  | "search"
  | "externalLink"
  | "chevronRight"
  | "arrowLeft"
  | "x";

interface PluginStackNode {
  readonly kind: "stack";
  readonly gap?: PluginGapToken | undefined;
  readonly children: readonly PluginSurfaceNode[];
}
interface PluginRowNode {
  readonly kind: "row";
  readonly gap?: PluginGapToken | undefined;
  readonly children: readonly PluginSurfaceNode[];
}
interface PluginSectionNode {
  readonly kind: "section";
  readonly kicker: string;
  readonly children: readonly PluginSurfaceNode[];
}
interface PluginTextNode {
  readonly kind: "text";
  readonly value: PluginBoundString;
  readonly voice?: PluginTextVoice | undefined;
}
interface PluginBadgeNode {
  readonly kind: "badge";
  readonly text: PluginBoundString;
  readonly intent?: PluginBadgeIntent | undefined;
}
interface PluginMeterNode {
  readonly kind: "meter";
  readonly value: PluginBoundNumber;
  readonly max?: number | undefined;
  readonly label?: string | undefined;
}
interface PluginKeyValueRow {
  readonly key: string;
  readonly value: PluginBoundString;
}
/** A fact sheet. Exactly one of `rows` (declared — values may still bind) / `rowsFrom` (bound: the row
 *  set itself is published state, `[{key, value}]` plain strings — for a sheet whose cardinality is data,
 *  like a per-provider stat list; validated + clamped at resolve). */
interface PluginKeyValueNode {
  readonly kind: "keyValue";
  readonly rows?: readonly PluginKeyValueRow[] | undefined;
  readonly rowsFrom?: PluginStateBinding | undefined;
}
interface PluginListNode {
  readonly kind: "list";
  readonly items: readonly PluginBoundString[];
}
/** An image is an asset in the INSTALLER's own CAS — a URL is unspellable (the exfil wall). Exactly one of
 *  `assetId` (declared) / `assetFrom` (bound: the id lives in published state, format-checked at resolve;
 *  an id the installer does not own paints the placeholder, never a foreign blob). */
interface PluginImageNode {
  readonly kind: "image";
  readonly assetId?: string | undefined;
  readonly assetFrom?: PluginStateBinding | undefined;
  readonly alt?: string | undefined;
  readonly aspect?: PluginImageAspect | undefined;
}
interface PluginMarkdownNode {
  readonly kind: "markdown";
  readonly value: PluginBoundString;
}
interface PluginTextFieldNode {
  readonly kind: "textField";
  readonly name: string;
  readonly label: string;
  readonly value?: string | undefined;
  readonly placeholder?: string | undefined;
}
interface PluginNumberFieldNode {
  readonly kind: "numberField";
  readonly name: string;
  readonly label: string;
  readonly value?: number | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
}
interface PluginToggleNode {
  readonly kind: "toggle";
  readonly name: string;
  readonly label: string;
  readonly value?: boolean | undefined;
  /** LIVE toggle: the flip fires this action immediately (the fresh value rides the round-trip). */
  readonly actionId?: string | undefined;
}
interface PluginSelectOption {
  readonly value: string;
  readonly label: string;
}
/** Exactly one of `options` (declared, registration-fixed) / `optionsFrom` (bound: the option set is
 *  published state, `[{value, label}]` — for a menu whose vocabulary is data, like a per-hub sort list;
 *  validated + clamped at resolve). A select naming `actionId` is LIVE: a pick fires it immediately. */
interface PluginSelectNode {
  readonly kind: "select";
  readonly name: string;
  readonly label: string;
  readonly options?: readonly PluginSelectOption[] | undefined;
  readonly optionsFrom?: PluginStateBinding | undefined;
  readonly value?: string | undefined;
  readonly actionId?: string | undefined;
}
/** A glyph from the curated set. `label` ABSENT = decorative (aria-hidden, the house default for an icon
 *  beside text); naming one claims the glyph is the only thing saying this and gives it an accessible name. */
interface PluginIconNode {
  readonly kind: "icon";
  readonly name: PluginIconName;
  readonly label?: string | undefined;
}
/** The ONE-OF-N segmented strip — the page's own axis, every option visible (max 8; a bigger vocabulary is a
 *  `select`). Same option arms as `select`: exactly one of `options`/`optionsFrom`. A pick fires `actionId`
 *  immediately. It is NOT a tab panel container: what a pick changes is whatever you republish. */
interface PluginTabsNode {
  readonly kind: "tabs";
  readonly name: string;
  readonly label: string;
  readonly options?: readonly PluginSelectOption[] | undefined;
  readonly optionsFrom?: PluginStateBinding | undefined;
  readonly value?: string | undefined;
  readonly actionId?: string | undefined;
}
interface PluginSliderNode {
  readonly kind: "slider";
  readonly name: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step?: number | undefined;
  readonly value?: number | undefined;
}
interface PluginButtonNode {
  readonly kind: "button";
  readonly actionId: string;
  readonly label: string;
  readonly variant?: PluginButtonVariant | undefined;
}
/** Destructive confirms ride the HOUSE dialog, plugin-attributed — you cannot draw your own. */
interface PluginConfirmButtonNode {
  readonly kind: "confirmButton";
  readonly actionId: string;
  readonly label: string;
  readonly confirmTitle: string;
  readonly confirmBody?: string | undefined;
}
/** One DECLARED grid tile. `actionId` makes the tile a round-trip (`values.tile` = its id). */
interface PluginGridTile {
  readonly id: string;
  readonly title: PluginBoundString;
  readonly subtitle?: PluginBoundString | undefined;
  readonly badge?: PluginBoundString | undefined;
  readonly assetId?: string | undefined;
  readonly alt?: string | undefined;
  readonly actionId?: string | undefined;
}
/** One BOUND grid tile as you publish it in state (the `tilesFrom` arm) — plain strings, no per-tile action
 *  (the grid-level `tileAction` owns the round-trip). Entries are validated at resolve; malformed ones are
 *  dropped; the count clamps to 64. */
interface PluginBoundGridTile {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly badge?: string | undefined;
  readonly assetId?: string | undefined;
  readonly alt?: string | undefined;
}
/** The media-forward tile grid. Exactly one of `tiles` (declared — the set is spec structure) /
 *  `tilesFrom` (bound — the set is published state, so its COUNT is data: search results, growing albums). */
interface PluginGridNode {
  readonly kind: "grid";
  readonly tiles?: readonly PluginGridTile[] | undefined;
  readonly tilesFrom?: PluginStateBinding | undefined;
  readonly tileAction?: string | undefined;
  readonly aspect?: PluginImageAspect | undefined;
  readonly empty?: string | undefined;
  /** TRUE ⇒ the grid renders a shape- and aspect-matched SKELETON instead of tiles or the empty line. Publish
   *  `true` before you float the wire work and `false` with the results — the loading arm outranks both. */
  readonly loading?: PluginBoundBoolean | undefined;
}
interface PluginPageStage {
  readonly id: string;
  readonly kind: PluginPageStageKind;
  readonly title?: PluginBoundString | undefined;
  readonly hero?: { readonly assetId?: string | undefined; readonly assetFrom?: PluginStateBinding | undefined; readonly alt?: string | undefined } | undefined;
  readonly body: PluginSurfaceNode;
}
/** The page arrangement: declared stages, one active — and `active` is a BINDING, so stage navigation is
 *  ordinary published state and survives leaving the section. An `active` naming no stage shows the first. */
interface PluginMasterDetailNode {
  readonly kind: "masterDetail";
  readonly stages: readonly PluginPageStage[];
  readonly active?: PluginBoundString | undefined;
}
/** The page's ONE prominent query (at most one per spec). `filters` renders as a collapsed disclosure. */
interface PluginSearchBarNode {
  readonly kind: "searchBar";
  readonly name: string;
  readonly label: string;
  readonly placeholder?: string | undefined;
  readonly value?: string | undefined;
  readonly actionId?: string | undefined;
  readonly filters?: readonly PluginSurfaceNode[] | undefined;
  readonly filtersLabel?: string | undefined;
}

/** The closed node union. Global caps per spec: 32 KiB serialized, 256 nodes, depth 8, every string bounded.
 *  What it deliberately CANNOT express: HTML/CSS, host chrome, modals, focus theft, any write channel. */
type PluginSurfaceNode =
  | PluginStackNode
  | PluginRowNode
  | PluginSectionNode
  | PluginTextNode
  | PluginBadgeNode
  | PluginMeterNode
  | PluginKeyValueNode
  | PluginListNode
  | PluginImageNode
  | PluginMarkdownNode
  | PluginTextFieldNode
  | PluginNumberFieldNode
  | PluginToggleNode
  | PluginSelectNode
  | PluginSliderNode
  | PluginButtonNode
  | PluginConfirmButtonNode
  | PluginGridNode
  | PluginMasterDetailNode
  | PluginSearchBarNode
  | PluginIconNode
  | PluginTabsNode;

type PluginSurfaceSpec = PluginSurfaceNode;

/** One declared command argument (#791 typed args). `enumValues` iff `type === "enum"`. The platform
 *  collects, autocompletes and validates on both client surfaces AND re-validates at the membrane; your
 *  `onRun` sees only well-typed, in-enum, required-present values. */
interface PluginCommandArgSpec {
  readonly name: string;
  readonly type: "string" | "number" | "enum" | "boolean";
  readonly required?: boolean | undefined;
  readonly describe?: string | undefined;
  readonly enumValues?: readonly string[] | undefined;
}
type PluginCommandArgValue = string | number | boolean;

// ── the server-guest surface (`orb.host(1)` in main.js) ─────────────────────────────────────────────────────

interface PluginHostV1 {
  readonly version: 1;
  /** The capabilities actually GRANTED (⊆ your manifest's declarations). THE feature-detection surface —
   *  check before every registration; an ungranted call throws. */
  readonly grants: readonly PluginCapability[];

  /** The ONLY time source in the realm (there is no `Date` — `new Date()` throws). */
  readonly clock: { nowEpochMs: () => number };
  /** The ONLY entropy source ([0,1) — `Math.random` throws). */
  readonly random: { next: () => number };
  /** Opaque unique ids (not TypeIDs). */
  readonly ids: { mint: () => string };

  /** Always granted; rate-limited host-side; lands in your plugin's log view (Settings → Plugins). */
  readonly log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };

  /** Token-count ESTIMATION over your own text — free (no capability), synchronous, deterministic: the same
   *  estimator the host budgets prompts with, available in BOTH realms at native latency. An estimate, not
   *  the model's tokenizer — treat it as a budgeting heuristic, not an exact count. */
  readonly tokens: {
    count: (text: string) => number;
  };

  readonly chat: {
    /** The invocation's admitted room. THROWS outside a chat scope (a domain fact, the chrome menu on a
     *  non-chat screen) — the honest answer, not a synthesized room. capability: chat.read */
    current: () => ChatHandle;
    /** Recent canon, oldest→newest, ≤ 50 (default 20), clamped to the installer's visibility.
     *  capability: chat.read */
    listMessages: (chat: ChatHandle, opts?: { limit?: number }) => Promise<readonly PluginMessageView[]>;
    /** The room's runtime variable fold (read). capability: chat.read */
    getVariables: (chat: ChatHandle) => Promise<Record<string, string>>;
    /** The room's present CHARACTER roster (never humans, never full cards) — this room only, member-gated:
     *  a room you are not in answers `[]`, not an error. capability: chat.read */
    listCharacters: (chat: ChatHandle) => Promise<readonly PluginCharacterView[]>;
    /** Room-state write, HOST AUTHORITY required (flat refusal elsewhere). capability: chat.variables.write
     *  Pass `expect` to make it a COMPARE-AND-SET: the ops land only while every named key still reads the
     *  value you believe it holds (`null` = you believe it is unset). A belief that no longer holds writes
     *  NOTHING and answers `{ outcome: "stale", actual }` — data to branch on, never a throw — with the live
     *  value of each key, so a read → compute → write (ticking a counter, advancing a clock) can retry instead
     *  of losing its update to a writer on the other side of the invoke queue. Omit `expect` and the write is
     *  unconditional, which can only ever answer `applied`. */
    applyVariableOps: (
      chat: ChatHandle,
      ops: readonly PluginVariableOp[],
      expect?: readonly PluginVariablePrecondition[],
    ) => Promise<PluginVariableWriteResult>;
    /** Quick-reply chips (≤ 4), always compose-mode, host authority required. capability: chat.quick_reply */
    surfaceQuickReply: (chat: ChatHandle, choices: readonly { label: string; sendText: string }[]) => Promise<void>;
    /** Ask for an autonomous turn — SPEND, budget-gated; without host authority it becomes a confirm card
     *  and throws `PluginSuggestedError` ("it became a question"). capability: turn.trigger */
    requestTurn: (chat: ChatHandle, p?: { speakerCharacterId?: string; guided?: string }) => Promise<void>;
  };

  readonly worldInfo: {
    /** The books attached to THIS room, member-gated (a room you are not in answers `[]`).
     *  capability: worldinfo.read */
    listBooks: (chat: ChatHandle) => Promise<readonly PluginWorldBookView[]>;
    /** One attached book's entries. A `bookId` not attached to this room (or not yours to see) answers `[]`
     *  — indistinguishable from an empty book, by design (no existence oracle). capability: worldinfo.read */
    listEntries: (chat: ChatHandle, bookId: string) => Promise<readonly PluginWorldEntryView[]>;
    /** Attached-book-only, `entryKey`-idempotent, 64 entries/book/plugin; without host authority it becomes
     *  a confirm card (`PluginSuggestedError`). capability: worldinfo.write */
    upsertEntry: (chat: ChatHandle, e: PluginWorldEntryUpsert) => Promise<void>;
  };

  readonly assets: {
    /** Read back one asset from the INSTALLER's OWN CAS — e.g. the id `imagery.generatePicture` just
     *  returned. A foreign or absent id answers `null` (leak-free, no existence oracle); an owned asset over
     *  1 MiB answers its metadata with `dataBase64: null`. capability: assets.read */
    read: (assetId: string) => Promise<PluginAssetView | null>;
  };

  readonly search: {
    /** Semantic search over the INSTALLER's OWN indexed corpus (their databank shelves — including what your
     *  `databank.ingest` wrote). Ranked hits, ≤ 20 per call (default 10). No chat scope needed.
     *  capability: search.query */
    documents: (queryText: string, opts?: { limit?: number }) => Promise<readonly PluginSearchHit[]>;
  };

  /** The installing user's global `{{getglobalvar}}` namespace. capability: global_vars */
  readonly variables: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };

  /** Your plugin-PRIVATE KV (per plugin × installer): ≤ 256 keys, ≤ 64 KiB per value. capability: storage.kv */
  readonly storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: (prefix?: string) => Promise<readonly string[]>;
    /** ATOMIC compare-and-set. Writes `next` only while the key still holds `expected` — pass `null` for
     *  `expected` to mean "the key must not exist yet". Resolves `{ applied, current }`: `applied` is whether
     *  YOUR write landed, and `current` is what the key holds now, which on a refusal is the value that beat
     *  you and is therefore your next `expected`. Losing the race is DATA, never a throw. Same `storage.kv`
     *  grant and the same ceilings as `set`.
     *
     *  USE THIS, NOT `get` + `set`, FOR ANY VALUE YOU DERIVE FROM ITS OWN PREVIOUS VALUE — counters, tallies,
     *  running scores, session records. Your handlers run CONCURRENTLY inside one process: a message event, a
     *  tool call and a surface action can each be awaiting a host call between your read and your write, and
     *  the last `set` silently wins, discarding the others. You cannot fix that guest-side — there are no
     *  timers, no randomness and no locks in here — so the retry is a plain bounded loop with no waiting:
     *
     *      async function bump(key) \{
     *        for (let attempt = 0; attempt \< 5; attempt += 1) \{
     *          const current = await host.storage.get(key);
     *          const next = String((Number(current) || 0) + 1);
     *          const result = await host.storage.compareAndSet(key, current, next);
     *          if (result.applied) return next;
     *        \}
     *        return null; // contended past the bound — decide what that means for YOUR plugin
     *      \}
     *
     *  (After the first attempt you can skip the `get` and feed `result.current` back in as `expected`.) */
    compareAndSet: (key: string, expected: string | null, next: string) => Promise<{ applied: boolean; current: string | null }>;
  };

  readonly notifications: {
    /** The DURABLE notice channel — participants only, 200-char cap, 60 s per-room cooldown.
     *  capability: notify */
    post: (chat: ChatHandle, recipient: PluginNotificationRecipient, message: string) => Promise<void>;
  };

  readonly imagery: {
    /** SPEND. Same ceilings and args as the automation `generate_image` arm; without host authority it
     *  becomes a confirm card. `quiet:false` posts the picture to the room. capability: imagery.generate */
    generatePicture: (chat: ChatHandle, p: GenerateImageActionArgs) => Promise<{ assetId: string }>;
  };

  readonly llm: {
    /** SPEND — one bounded, non-canon generation on the installer's own connection (30/hour per plugin).
     *  No chat scope needed; writes nothing; you get a string. `opts.schema` = structured output;
     *  `opts.imageAssetIds` = vision inputs from the installer's own CAS. capability: llm.quiet */
    quiet: (prompt: string, opts?: PluginQuietOptions) => Promise<string>;
  };

  readonly databank: {
    /** A canon write into the INSTALLER's OWN databank (indexed automatically, content-hash deduped). No
     *  chat scope, no host authority — your shelves are yours. capability: databank.ingest */
    ingest: (doc: { name: string; text: string }) => Promise<{ documentId: string }>;
  };

  readonly character: {
    /** Import a V2/V3 card (plain JSON) into the installer's OWN library — the same funnel a file upload
     *  takes (validation, dedup by importHash: `created:false` = byte-identical re-ingest).
     *  capability: character.ingest */
    ingest: (card: Record<string, unknown>) => Promise<{ characterId: string; created: boolean }>;
    /** Import a character from a PNG ASSET you already have in the installer's CAS (e.g. one `net.fetchAsset`
     *  just returned) — the SAME funnel `ingest` uses, but a PNG carries its embedded avatar through, so the
     *  character arrives WITH its art (the JSON `ingest` path cannot). A foreign/absent id rejects leak-free.
     *  capability: character.ingest */
    ingestAsset: (assetId: string) => Promise<{ characterId: string; created: boolean }>;
    /** Store YOUR plugin's own blob on one of the installer's OWN characters, under the reserved
     *  `data.extensions.plugin_<your-slug>` key (host-stamped — you cannot name another plugin's). Portable:
     *  survives export→import. A foreign/absent character rejects leak-free.
     *  capability: character.card_state */
    setCardData: (characterId: string, data: Record<string, unknown>) => Promise<void>;
    /** Read back your own per-card blob, or `null` when you have written none. capability: character.card_state */
    getCardData: (characterId: string) => Promise<Record<string, unknown> | null>;
  };

  readonly events: {
    /** Subscribe to the closed trigger taxonomy. Delivery is pre-filtered to what the INSTALLER may see, and
     *  to human-caused (depth-0) facts unless the manifest opts into `matchAutomationEvents`.
     *  capability: events.subscribe */
    on: (type: ChatTriggerType | DomainTriggerType, handler: (fact: PluginTriggerFact) => void | Promise<void>) => void;
  };

  /** The PRIVATE event plane between the SAME installer's plugins — `plugin:<slug>:<name>` channels. Never a
   *  domain event, never automation, never another user. capability: plugin_events */
  readonly pubsub: {
    /** Publish on YOUR channel (slug host-stamped). Emitting to nobody is free. Payload ≤ 16 KiB. */
    emit: (name: string, data: Record<string, unknown>) => Promise<void>;
    /** Listen to one of the installer's plugins by slug. A slug not installed simply never fires. The
     *  handler runs with NO chat scope — put everything it needs in the payload. */
    on: (emitterSlug: string, name: string, handler: (event: { name: string; data: Record<string, unknown> }) => void | Promise<void>) => void;
  };

  readonly tools: {
    /** Register a model-callable tool. Your `name` is prefixed to `plugin_<slug'>_<name>`; `parameters` is
     *  raw JSON Schema (host-validated); the returned STRING is what the model reads, verbatim.
     *  capability: tools.register */
    register: (def: { name: string; description: string; parameters: Record<string, unknown>; handler: (args: unknown) => Promise<string> }) => void;
  };

  readonly transforms: {
    /** A PROMPT transform: rewrites text on its way to the model. 250 ms deadline, skip-on-failure, rooms
     *  the installer hosts only. `input.env.vars` arrives synchronously — no host call needed inside the
     *  deadline. capability: chat.transform */
    register: (def: {
      name: string;
      point: PromptTransformPoint;
      apply: (input: { draft: string; env: { chatId: string; vars: Record<string, string> } }) => Promise<PromptTransformOutcome>;
    }) => void;
    /** A DISPLAY transform: rewrites what the INSTALLER'S OWN SCREEN shows — after their macros and display
     *  regex, before markdown. No canon, no other viewer, skip-on-failure. capability: chat.transform */
    registerDisplay: (def: { name: string; apply: (input: { text: string; env: { chatId: string; messageId: string } }) => Promise<string> }) => void;
  };

  readonly macros: {
    /** A VALUE macro — `{{plugin_<slug'>_<name>}}`. No arguments (the engine is synchronous; your `resolve`
     *  runs once per turn and its answer is the substitution); degrades to "" on throw/overrun.
     *  capability: chat.transform */
    register: (def: { name: string; description: string; resolve: () => Promise<string> }) => void;
  };

  readonly net: {
    /** Host-performed fetch: allowlisted to your manifest's `netHosts` ONLY, GET/POST, 5 s deadline, 1 MiB
     *  response cap, SSRF-guarded, 360/hour per plugin. The body is text — there are no bytes in the realm.
     *  capability: net.fetch */
    fetch: (url: string, init?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; body: string }>;
    /** Download a remote IMAGE into the installer's OWN storage and get back an assetId — allowlisted to your
     *  manifest's `netHosts` ONLY (the same hosts; its OWN art-sized 1200/hour belt, so covers never starve
     *  your `fetch` budget), SSRF-guarded, and
     *  image-validated (magic bytes, not the server's Content-Type; dimension/size caps; 5 MiB). You never see
     *  the bytes or a URL — only the assetId, which you can render in an `image`/`hero` node or hand to
     *  `character.ingestAsset`. Rejects on a non-image, an oversize download, or a blocked host.
     *  capability: net.fetch_asset */
    fetchAsset: (url: string) => Promise<{ assetId: string }>;
  };

  /** The declarative UI plane — see the authoring guide's "The UI plane" and the oracle-deck example.
   *  capability: ui.surface (all of it), except `registerFrame` — capability: ui.frame. */
  readonly ui: {
    /** Register a surface at activation (resident — rebuilt on re-activation, dropped on disable). An
     *  invalid spec is a registration refusal (logged, surface absent), never activation-fatal. */
    register: (def: {
      id: string;
      anchor: PluginSurfaceAnchor;
      title: string;
      tier: PluginSurfaceTier;
      spec?: PluginSurfaceSpec;
      onAction?: (a: { actionId: string; values: Record<string, string>; chat: ChatHandle | null }) => void | Promise<void>;
    }) => void;
    /** Publish the state your spec's `{ $state }` bindings resolve against (≤ 16 KiB, replaces whole).
     *  With `chat`: a PER-ROOM row (only that room sees it); without: one plugin-wide row. */
    setState: (surfaceId: string, state: Record<string, unknown>, chat?: ChatHandle) => Promise<void>;
    /** Register a command: `/plugin <slug> <name> …`, the Plugins wand menu, and the palette. Declare typed
     *  `args` (≤ 16) and `values` arrives validated; the raw remainder always arrives as `args`. Inside a
     *  room the command's invocation carries that room — reach it via `chat.current()`. */
    registerCommand: (def: {
      name: string;
      describe: string;
      args?: readonly PluginCommandArgSpec[];
      onRun: (a: { args: string; values: Record<string, PluginCommandArgValue> }) => void | Promise<void>;
    }) => void;
    /** A transient house toast, prefixed with your plugin's name (host-stamped), ≤ 200 chars, rate-floored
     *  (10 s per plugin). Delivered on the round-trip the person just made — the durable channel is
     *  `notifications.post`. */
    toast: (level: PluginToastLevel, message: string) => Promise<void>;
    /** Open one of YOUR OWN registered `dialog` surfaces — only ever as the outcome of a round-trip the
     *  person initiated (a spontaneous modal is unspellable). An unknown id is dropped. */
    openDialog: (surfaceId: string) => Promise<void>;
    /** THE ESCAPE HATCH — your own document (html + css, verbatim) in an isolated frame: opaque origin, no
     *  network, no host calls, ≤ 64 000/16 000 chars, ≤ 8 frames. Anchors: settings, chat-flank, tool-card.
     *  See the pocket-arcade example. capability: ui.frame */
    registerFrame: (def: { id: string; anchor: PluginSurfaceAnchor; title: string; html: string; css?: string }) => void;
  };
}

// ── the browser-guest surface (`orb.ui(1)` in ui.js — Tier C, `tier: "scripted"` surfaces) ──────────────────

/** What a scripted surface's event handler receives: the surface it happened on, the interaction, and the
 *  whole current form draft (so a handler reads one consistent bag). */
interface PluginUiEvent {
  readonly surfaceId: string;
  readonly event: { readonly type: "action"; readonly actionId: string } | { readonly type: "field"; readonly name: string; readonly value: string };
  readonly values: Record<string, string>;
}

/** The `ui.js` realm: compute trees locally, at native latency. Same determinism law as the server guest
 *  (no Date, no Math.random); a hung handler is terminated from outside and the surface collapses to null.
 *  The three rules that keep a scripted surface alive: render something immediately, never block, and batch
 *  host calls at startup (each one is a real network round-trip). */
interface PluginUiV1 {
  readonly version: 1;
  /** Display-only feature detection — the server re-gates every relayed call against the stored grant. */
  readonly grants: readonly string[];
  readonly clock: { nowEpochMs: () => number };
  readonly random: { next: () => number };
  readonly log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  /** The SAME free token-count estimator as `orb.host(1).tokens` — computed locally in this realm, no
   *  round-trip, no capability. */
  readonly tokens: {
    count: (text: string) => number;
  };
  /** Publish a WHOLE tree (same vocabulary as a static spec) for one of YOUR registered scripted surfaces.
   *  Retained-mode: the app diffs; a render for a surface you did not register is dropped with a log line. */
  render: (surfaceId: string, tree: PluginSurfaceSpec) => void;
  /** ONE handler per guest; a second call replaces the first. Events arrive locally — no network. */
  onEvent: (handler: (event: PluginUiEvent) => void | Promise<void>) => void;
  /** The relayed READ-ONLY-ish host subset — exactly these nine, each re-gated server-side per call. No
   *  fetch, no writes, no registrations: effects belong to your server half (`main.js`). */
  readonly host: {
    readonly chat: {
      listMessages: (chat: ChatHandle, opts?: { limit?: number }) => Promise<readonly PluginMessageView[]>;
      getVariables: (chat: ChatHandle) => Promise<Record<string, string>>;
    };
    readonly variables: {
      get: (key: string) => Promise<string | null>;
      set: (key: string, value: string) => Promise<void>;
      delete: (key: string) => Promise<void>;
    };
    readonly storage: {
      get: (key: string) => Promise<string | null>;
      set: (key: string, value: string) => Promise<void>;
      delete: (key: string) => Promise<void>;
      list: (prefix?: string) => Promise<readonly string[]>;
    };
  };
}
