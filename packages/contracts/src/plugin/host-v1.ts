// @orb/contracts/plugin — the `PluginHostV1` membrane surface in full. The ONE typed
// thing a guest sees: the frozen, versioned, capability-gated surface it receives from `orb.host(1)` — the
// antithesis of ST's `getContext()` god-object. Only JSON-safe primitives and OPAQUE HANDLES cross the
// boundary; every host function is gated at the FUNCTION (not the namespace) by a `PluginCapability`, and the
// clock/PRNG/id sources are injected (determinism is enforced, not requested — `test-determinism`). This file
// is pure wire vocabulary (types + the capability→function completeness map); the runtime that implements it is
// `infra/plugin-host`, wired at compose with the `domain/plugin` op bundle — infra never imports a domain.

import type { Branded } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { EntryPosition } from "@orb/kit/world-info";
import type { ChatTriggerType, DomainTriggerType, TriggerFact } from "#automation";
import type { PromptTransformOutcome, PromptTransformPoint, VariablePrecondition, VariableWriteResult } from "#chat";
import type { GenerateImageActionArgs } from "#imagery";
import type { PluginNotificationRecipient } from "#notifications";
import type { PluginCapability } from "./manifest.ts";
import type { PluginCommandArgSpec, PluginCommandArgValue, PluginSurfaceAnchor, PluginSurfaceSpec, PluginSurfaceTier, PluginToastLevel } from "./ui.ts";

// ── Opaque handles (branded strings; minted host-side; forged values fail resolution) ──────────────────────
export type ChatHandle = Branded<"PluginChatHandle">;

/** The `host.log` severity axis — the ONE home for the plugin log levels: the membrane surface exposes
 *  `log.{info,warn,error}`, the `domain/plugin` `PluginLogView` derives its `level` from this, and the
 *  `infra/plugin-host` log ring speaks it. Declared once here (the wire vocab home) so no consumer re-spells it. */
export const PLUGIN_LOG_LEVELS = ["info", "warn", "error"] as const;
export type PluginLogLevel = (typeof PLUGIN_LOG_LEVELS)[number];

/** A REDUCED `MessageView` projection: the read floor is "what a member sees in the transcript" — no economics,
 *  no params, no `promptSnapshot`/`rawRequest` (those carry other participants' prompt internals + credential-
 *  adjacent request metadata; operator-tier, never plugin-tier). */
export interface PluginMessageView {
  readonly id: string;
  readonly role: MessageRole;
  // @view-server-only: the PluginHostV1 membrane is the GUEST's surface — its reader is the plugin sandbox (infra/plugin-host), never packages/client. Ends if a host UI surface starts rendering guest message projections.
  readonly authorDisplayName: string;
  // @orb-waive brand-in-name-position(characterId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, branded only after the host parses it; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
  readonly characterId: string | null;
  readonly seq: number;
  readonly content: string;
}

/** A REDUCED roster projection (`chat.listCharacters`, #788 F11 — the ST `context.characters` parity arm). The read
 *  floor is what EVERY member already sees in the transcript: a character seat's id, its resolved display name,
 *  and its avatar asset id. Deliberately NOT the full card — a member plugin reading another participant's
 *  description/personality/scenario would be a leak of a co-participant's private character definition; the roster
 *  is the invocation chat's present CHARACTER seats only, member-visible, D16-clamped by the same viewer verdict
 *  `listMessages` resolves. Human seats are excluded (this is the CHARACTER roster). */
export interface PluginCharacterView {
  // `id`/`avatarAssetId` are guest-wire DTO fields (inert text a guest may key off or pass to `assets.read`), but
  // neither NAME is the lowerCamel of a kit brand (`characterId`/`assetId` are; these are not), so the
  // brand-in-name gate does not flag them and no foreign-id exemption is owed (a marker on a non-brand position
  // is itself stale-RED).
  readonly id: string;
  readonly name: string;
  readonly avatarAssetId: string | null;
}

/** The same `set`/`add`/`inc`/`dec`/`delete` op vocabulary the delta model defines — the ONE home is the kit
 *  `VarOp` (aliased, never re-spelled); a guest write rides the SAME delta seam actions use. */
export type PluginVariableOp = VarOp;

/** The OPTIONAL compare-and-set half of a guest variable write (#1555) — the ONE home is
 *  `@orb/contracts/chat`'s {@link VariablePrecondition}, aliased here the way {@link PluginVariableOp} aliases
 *  the kit op. A guest that read a value, computed from it and wants the write to land only if nothing moved
 *  underneath passes its belief; the shape is deliberately NOT an op member (see the one home for why). */
type PluginVariablePrecondition = VariablePrecondition;

/** What `chat.applyVariableOps` answers (#1555) — `@orb/contracts/chat`'s {@link VariableWriteResult}, aliased.
 *  A lost race is DATA the guest branches on (`outcome === "stale"` + the live values), never a throw: an
 *  uncaught throw here would spend one of the three crash strikes that auto-disable a plugin, and losing a
 *  contended write is a normal outcome, not a fault. */
type PluginVariableWriteResult = VariableWriteResult;

/** Mirror of the `insert_world_info_entry` action's entry fields — attached-book-only, entryKey-
 *  updatable, host-side idempotent. */
export interface PluginWorldEntryUpsert {
  readonly bookId: string;
  readonly entryKey: string;
  readonly keys: readonly string[];
  readonly contentTemplate: string;
  readonly position: EntryPosition;
}

/** A REDUCED world-book projection (`worldInfo.listBooks`, #788 F12). The room's own lore books — those ATTACHED
 *  to the invocation chat, member-visible. `id` is what the guest passes back to `worldInfo.listEntries`. */
export interface PluginWorldBookView {
  // `id` is a guest-wire DTO field (inert text the guest keys `listEntries` off); its name is not a kit brand
  // lowerCamel (`worldBookId` is), so the brand-in-name gate does not flag it and no marker is owed.
  readonly id: string;
  readonly name: string;
}

/** A REDUCED world-entry projection (`worldInfo.listEntries`, #788 F12) — the read symmetry of
 *  `PluginWorldEntryUpsert`: the keys + content of ONE entry in an attached book, for the lore-indexing class
 *  (the vectors extension consumes exactly these). Content is host-capped like `PluginMessageView.content`. */
export interface PluginWorldEntryView {
  // `id` is a guest-wire DTO field (inert text); its name is not a kit brand lowerCamel (`worldEntryId` is), so
  // the brand-in-name gate does not flag it and no marker is owed.
  readonly id: string;
  readonly keys: readonly string[];
  readonly content: string;
  readonly enabled: boolean;
}

/** The most bytes one `assets.read` call returns (#788 seam-11 read half). A bounded read of the installer's own
 *  CAS: the membrane already caps a serialized RESULT (`HOST_FN_RESULT_CAP_BYTES`), and base64 inflates ~4/3, so
 *  the byte ceiling here is the honest pre-encode bound — an asset over it is a typed refusal of the CALL, not a
 *  truncated read (a guest must not mistake a clipped image for the whole one). 1 MiB mirrors `net.fetch`'s
 *  response cap: the two "read external/own bytes into the guest" surfaces carry the same bound. */
export const PLUGIN_ASSET_READ_MAX_BYTES = 1_048_576;

/** What `assets.read` hands back for an asset in the INSTALLER's OWN CAS (#788 seam-11 read half). Bytes as
 *  base64 (the membrane boundary is JSON-safe — a `Uint8Array` cannot cross it) + the mime + the pre-encode byte
 *  size. A foreign/absent asset is the leak-free `null` the read returns instead of this — indistinguishable, no
 *  existence oracle. */
export interface PluginAssetView {
  readonly mime: string;
  // @view-server-only: same membrane — `assets.read` answers the GUEST, and the host UI reads assets through the gallery/asset views instead.
  readonly sizeBytes: number;
  /** The asset's bytes, base64-encoded. Present only when `sizeBytes ≤ PLUGIN_ASSET_READ_MAX_BYTES`; an
   *  over-cap owned asset returns its metadata with `dataBase64: null`, so a guest still learns its own asset
   *  exists + how big it is without the membrane carrying an over-budget blob. */
  // @view-server-only: same membrane — base64 bytes exist because the guest boundary is JSON-safe; our client reads blobs by hash off the blob route, never as base64.
  readonly dataBase64: string | null;
}

/** The most results one `search.documents` call returns (#788 F1). A guest-supplied limit is clamped to this;
 *  an unbounded page is an unbounded read of the installer's corpus per call (the `listMessages` limit posture). */
export const PLUGIN_SEARCH_RESULTS_MAX = 20;

/** One ranked hit from `search.documents` (#788 F1 — the first-party retrieval read). A REDUCED
 *  `DocumentChunkHit`: the document's id + name, the matched chunk's content (host-capped), and the relevance
 *  score. Chunk internals (chunkId/idx/contentHash) are withheld — a guest wants the text + provenance, not the
 *  index plumbing. */
export interface PluginSearchHit {
  // @orb-waive brand-in-name-position(documentId): the plugin SANDBOX wire DTO — a host-resolved document id handed to the guest as inert text; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
  readonly documentId: string;
  readonly documentName: string;
  readonly content: string;
  readonly score: number;
}

/** The most images one `llm.quiet` call may attach. Four is the
 *  `generateImageActionArgsSchema` fan-out clamp read from the other direction — a caption pass looks at a
 *  handful of pictures, and an unbounded list is an unbounded read of the installer's CAS per call. */
export const PLUGIN_QUIET_IMAGES_MAX = 4;

/** The structured-output ask on `llm.quiet` (the xgrammar lever). `schema` is a RAW
 *  JSON Schema in the `LIFTABLE_JSON_SCHEMA` subset (`@orb/kit/json-schema`), the SAME untrusted-blob posture
 *  `tools.register`'s `parameters` carries: the host lifts it to zod and re-projects it through the ONE
 *  projection rule, so a guest can never hand a wire an unprojected schema (D79). An unliftable schema is a
 *  typed refusal of the CALL, not of the plugin. */
export interface PluginQuietSchema {
  /** The schema name the wire carries (OpenAI `json_schema.name`). */
  readonly name: string;
  readonly description?: string;
  /** JSON Schema — validated + projected host-side. */
  readonly schema: Record<string, unknown>;
}

/** The optional second argument of `llm.quiet` — the U6 widening, both arms optional and independent (a
 *  captioning call passes images and no schema; a structured call the reverse; both together is legal). */
export interface PluginQuietOptions {
  /** Present ⇒ a schema-CONSTRAINED generation on the `structured` role; the result is the model's JSON text. */
  readonly schema?: PluginQuietSchema;
  /** Assets in the INSTALLER's own CAS to attach to the user turn — at most {@link PLUGIN_QUIET_IMAGES_MAX}.
   *  UNBRANDED by the same rule the rest of this file follows: a guest's JSON is untrusted until the DOMAIN
   *  resolves it (here, through the owner-gated CAS read), and branding the wire type would claim a validation
   *  this boundary has not performed. Vision-capable families attach them; text-only families ignore them. */
  readonly imageAssetIds?: readonly string[];
}

// ── The surface ────────────────────────────────────────────────────────────────────────────────────────────
export interface PluginHostV1 {
  readonly version: 1;
  /** The capabilities actually GRANTED (⊆ manifest.capabilities). Feature-detection surface. */
  readonly grants: readonly PluginCapability[];

  // Determinism — the ONLY time/entropy/id sources in the guest realm (README law).
  readonly clock: { nowEpochMs: () => number }; // injected clock (test-determinism)
  readonly random: { next: () => number }; // injected PRNG, [0,1)
  readonly ids: { mint: () => string }; // injected id factory (opaque uniqueness, NOT TypeIDs)

  readonly log: {
    // capability: none (always granted); rate-limited host-side; surfaces in the plugin's log view
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };

  /** Token-count ESTIMATION over the guest's OWN text (#788 F13, the ST `getTokenCountAsync` parity arm). A FREE
   *  namespace — capability: none (always granted) — and that is the correct classification, not a shortcut: it is
   *  the kit `estimateTokens` engine (`@orb/kit/tokens`, the SAME estimator `clampToTokenBudget`/`splitToTokenBudget`
   *  build on), a PURE deterministic function of the input string with ZERO reach — no tenant data, no DB, no I/O,
   *  no spend, no effect, no owner scope. A capability exists to let a person weigh a REACH; this has none, so a
   *  consent row would be meaningless noise. It sits in the free band beside `log` (the precedent: a zero-reach
   *  utility, "always granted"). SYNC like `clock`/`ids` (the estimator is synchronous), and because it is
   *  isomorphic kit it is computed LOCALLY in BOTH realms — the server guest (`orb.host(1)`) and the client Tier-C
   *  guest (`orb.ui(1)`) each estimate host-side with no round-trip, so it is reachable at native latency on both
   *  without a bridge op or a proxy-tuple entry. */
  readonly tokens: {
    count: (text: string) => number;
  };

  readonly chat: {
    /** Resolve the invocation's chat. Throws outside a chat scope. capability: chat.read */
    current: () => ChatHandle;
    /** Recent canon, oldest→newest, selected variants joined (D26), content capped 16 KiB/message.
     *  capability: chat.read */
    listMessages: (chat: ChatHandle, opts?: { limit?: number /* ≤ 50, default 20 */ }) => Promise<readonly PluginMessageView[]>;
    /** The runtime variable fold cache (read) — capability: chat.read */
    getVariables: (chat: ChatHandle) => Promise<Record<string, string>>;
    /** The invocation chat's present CHARACTER roster, reduced to {@link PluginCharacterView} (id/name/avatar —
     *  #788 F11, the ST `context.characters` parity arm). SCOPED TO THIS ROOM: the characters seated in the chat
     *  this invocation was admitted to, never a global "all your characters" list and never a character from a
     *  chat the caller isn't in — a non-member resolves to `[]` (the `listMessages` viewer choke, member-gated).
     *  capability: chat.read */
    listCharacters: (chat: ChatHandle) => Promise<readonly PluginCharacterView[]>;
    /** Variable writes ride the SAME delta seam actions use — capability: chat.variables.write.
     *  `expect` is the optional compare-and-set: the ops land only while EVERY precondition still holds against
     *  the live fold, and a violated one refuses the whole call AS DATA (`{ outcome: "stale", actual }`) without
     *  writing anything, so a read → compute → write guest (a clock tick, a counter) can retry against `actual`
     *  instead of silently losing its update to a writer on the other side of the invoke queue. Omit `expect`
     *  for an unconditional write — it can only answer `applied`. */
    applyVariableOps: (
      chat: ChatHandle,
      ops: readonly PluginVariableOp[],
      expect?: readonly PluginVariablePrecondition[],
    ) => Promise<PluginVariableWriteResult>;
    /** Surface quick-reply chips (the automation bus event) — capability: chat.quick_reply */
    surfaceQuickReply: (chat: ChatHandle, choices: readonly { label: string; sendText: string }[]) => Promise<void>;
    /** Request an autonomous turn — capability: turn.trigger. Budget/consent-gated EXACTLY like the
     *  trigger_turn action: counts against the chat's fire-rate cap, carries
     *  initiator:"plugin" + automationDepth, and hits D17 unchanged. */
    requestTurn: (chat: ChatHandle, p?: { speakerCharacterId?: string; guided?: string }) => Promise<void>;
  };

  readonly worldInfo: {
    /** The books ATTACHED to the invocation chat, reduced to {@link PluginWorldBookView} (#788 F12). SCOPED TO
     *  THIS ROOM: only books attached to the chat this invocation was admitted to (the write path's own
     *  `isBookAttachedToChat` gate, one plane over), member-gated — a non-member resolves to `[]`. Owner-scoped by
     *  construction (the bridge resolves the installer's Principal). capability: worldinfo.read */
    listBooks: (chat: ChatHandle) => Promise<readonly PluginWorldBookView[]>;
    /** The entries of ONE attached book, reduced to {@link PluginWorldEntryView} (#788 F12 — the read symmetry of
     *  `upsertEntry`). Leak-free: a `bookId` not attached to THIS chat (or not owned) resolves to `[]`,
     *  indistinguishable from an attached-but-empty book — no existence oracle for another room's or owner's
     *  books. capability: worldinfo.read */
    listEntries: (chat: ChatHandle, bookId: string) => Promise<readonly PluginWorldEntryView[]>;
    /** Same op + idempotency semantics as the insert_world_info_entry action — attached-book-only,
     *  entryKey-updatable, 64-entries-per-owner cap. capability: worldinfo.write */
    upsertEntry: (chat: ChatHandle, e: PluginWorldEntryUpsert) => Promise<void>;
  };

  readonly assets: {
    /** Read back one asset from the INSTALLER's OWN CAS (#788 seam-11 read half). The guest names an `assetId`
     *  (e.g. one `imagery.generatePicture` just returned); the host resolves the installer's Principal and reads
     *  through the assets domain's OWNER-GATED front door, so a guest can only ever read its own. A foreign or
     *  absent id is the leak-free `null` — indistinguishable, no existence oracle for another owner's CAS. An
     *  owned asset over {@link PLUGIN_ASSET_READ_MAX_BYTES} returns its metadata with `dataBase64: null` (never a
     *  truncated read). capability: assets.read */
    // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, owner-scope-gated by the domain read, never branded here. Ends if the bridge starts parsing to brands at the membrane.
    read: (assetId: string) => Promise<PluginAssetView | null>;
  };

  readonly search: {
    /** Semantic document search over the INSTALLER's OWN indexed corpus (#788 F1 — the first-party RAG parity
     *  arm the vectors extension hand-rolls). The guest supplies only the query text; the host closes the
     *  installer's `ownerId` over the search scope, so a guest can search no other owner's library — a read of
     *  the installer's own data, owner-scoped by construction. Results are ranked {@link PluginSearchHit}s,
     *  clamped to {@link PLUGIN_SEARCH_RESULTS_MAX}. capability: search.query */
    documents: (queryText: string, opts?: { limit?: number /* ≤ PLUGIN_SEARCH_RESULTS_MAX, default 10 */ }) => Promise<readonly PluginSearchHit[]>;
  };

  readonly variables: {
    /** The INSTALLING PRINCIPAL's per-user global KV — reads/writes are fetchOwned under that
     *  principal. capability: global_vars */
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };

  readonly storage: {
    /** Plugin-PRIVATE KV (per plugin × installing owner — the plugin_kv table). Distinct from
     *  `variables` (the USER's namespace, shared with macros/CEL). capability: storage.kv */
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>; // ≤ 64 KiB value, ≤ 256 keys/plugin
    delete: (key: string) => Promise<void>;
    list: (prefix?: string) => Promise<readonly string[]>;
    /** ATOMIC compare-and-set — write `next` only if the key still holds `expected` (`null` = "the key must
     *  not exist"). Resolves `{ applied, current }`: `applied` says whether YOUR write is the one that landed,
     *  and `current` is what the key holds afterwards — on a refusal that is the value which beat you, and
     *  therefore your next `expected`, so a retry costs no extra read. Same `storage.kv` grant, same owner
     *  scope, same ceilings as `set`: it IS `set` with a precondition, never a wider reach. The predicate is
     *  the VALUE itself, not a version counter — a counter only guards the writers that remember to bump it,
     *  and here the row's whole content is its value.
     *
     *  A LOST RACE IS DATA, NOT AN ERROR: `applied: false` resolves, it never rejects. Three throws
     *  auto-disable a plugin, and losing a race is the ordinary case this call exists to report.
     *
     *  WHY IT EXISTS (#1442). `get` → compute → `set` is not atomic, and a plugin's own handlers race INSIDE
     *  ONE PROCESS — two chat events, a tool call and a surface action can all be in flight at once, each
     *  awaiting a host call between the read and the write, so the second write silently discards the first's
     *  increment. A guest CANNOT solve this itself: the sandbox has no timers, no randomness and no shared
     *  lock, so there is no backoff to write and nothing to synchronize on. The fix has to be a host
     *  primitive. The guest idiom is a BOUNDED retry — read, compute, `compareAndSet`, and on a refusal feed
     *  `current` straight back in as the next `expected`, a fixed small number of times — which needs no clock
     *  and no jitter because the loop waits on nothing. Every counter, tally and session record in the shipped
     *  examples uses it; copy that shape. */
    compareAndSet: (key: string, expected: string | null, next: string) => Promise<{ applied: boolean; current: string | null }>;
  };

  readonly notifications: {
    /** capability: notify — the automation-notice path with recipient rules (participants only,
     *  200-char cap, cooldown floor). The selector is the PLUGIN SUBSET of the recipient axis: a guest call
     *  carries no triggering fact, so the actor-excluding member has no actor to exclude and is
     *  unrepresentable here rather than silently downgraded (`PLUGIN_NOTIFICATION_RECIPIENTS`). */
    post: (chat: ChatHandle, recipient: PluginNotificationRecipient, message: string) => Promise<void>;
  };

  readonly imagery: {
    /** capability: imagery.generate — SPEND class, same ceilings as generate_image. Args = the SAME
     *  GenerateImageActionArgs shape the action arm imports — one vocabulary across
     *  rule, tool, and plugin. */
    // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, branded only after the host parses it; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    generatePicture: (chat: ChatHandle, p: GenerateImageActionArgs) => Promise<{ assetId: string }>;
  };

  readonly llm: {
    /** ONE bounded, non-canon generation on the INSTALLING PRINCIPAL's own resolved `summarize`-role
     *  connection — the guest's prompt in, raw text out. capability: llm.quiet — SPEND class.
     *
     *  IT IS CLASS 1 (outside the room) BY CONSTRUCTION, and that is what makes it addable at all: it commits
     *  no message, emits no bus event, touches no canon and takes no turn slot. The class-1 membrane wall
     *  ("read/variables/quick-reply/requestTurn/worldInfo/storage, no message write") is untouched — this
     *  namespace cannot express a write, and the guest gets a string it must do something else with.
     *
     *  WHAT BOUNDS IT, precisely, because a spend surface that lists no bounds has none: (1) the grant;
     *  (2) an hourly per-plugin call floor claimed host-side BEFORE the generation (the domain's rate floor —
     *  the ≤32-in-flight cap bounds CONCURRENCY, never a rate, so it is not a spend bound and must not be read
     *  as one); (3) a prompt-length cap at the membrane; (4) the side-gen sampling ladder's `quiet_generate`
     *  floor for the output budget. It is deliberately NOT host-authority gated — it writes no room state, and
     *  gating it on host would be a ceiling that does not describe what the call does.
     *
     *  The FUNDER is the installer and is closed over host-side; a guest cannot name a different one, exactly
     *  as with `chat.requestTurn`. No chat scope is required (the call carries no room context at all).
     *
     *  THE U6 WIDENING IS TWO OPTIONAL INPUTS ON THIS ONE OP, never a second
     *  quiet path — the interaction spec's §3-S5.1 law: `summarizeQuiet` was already declared the generic
     *  quiet-LLM op, so the structured variant and the vision variant are pass-through fields on the lane that
     *  exists. `opts.schema` routes the call to the `structured` role (D109-4 — its firewall row excludes the
     *  metered sub, so hosted-cred laundering stays structurally closed) and the answer is the model's JSON as
     *  TEXT (the guest parses it — a parsed object would cross the marshalling boundary as an unbounded graph
     *  for no gain). `opts.imageAssetIds` attaches images from the INSTALLER's OWN CAS — the same
     *  assetId-only wall the `image` DSL node carries (`ui.ts`): no URL, no path, no bytes are spellable, so a
     *  guest can neither exfiltrate through an image reference nor read a foreign owner's asset. */
    quiet: (prompt: string, opts?: PluginQuietOptions) => Promise<string>;
  };

  readonly databank: {
    /** Ingest a text document into the INSTALLING PRINCIPAL's OWN databank (seam 15 —
     *  the Data Bank scraper parity arm). A CANON WRITE into the installer's own library: the document lands
     *  owner-scoped and the derived indexer auto-runs (the write enqueues the ingest workload). capability:
     *  databank.ingest.
     *
     *  NO CHAT SCOPE, NO HOST AUTHORITY — and both absences are deliberate, mirroring `storage.kv`, not the
     *  room-write capabilities. This writes the installer's OWN library, which is not room state, so gating it
     *  on `canWrite` would claim a protection it does not need. The FUNDER/OWNER is the installer, closed over
     *  host-side exactly as `llm.quiet`'s is — a guest supplies only the document and can name no other owner,
     *  so a cross-owner write is not expressible. Deduped by content hash host-side (a re-ingest of the same
     *  text is idempotent). Returns the new (or deduped) document id — the guest's OWN new content. */
    // @orb-waive brand-in-name-position(documentId): the plugin SANDBOX wire DTO — a host-minted id for the installer's own new document, handed back as inert text; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    ingest: (doc: { name: string; text: string }) => Promise<{ documentId: string }>;
  };

  readonly character: {
    /** Ingest a V2/V3 character CARD (a plain JSON object) into the INSTALLING PRINCIPAL's OWN character
     *  library (sibling / seam 17 — the hub-import scraper arm; the `ui.page`
     *  hub-browser showcase's import verb). A CANON WRITE riding the import domain's ContentChanged-emitting
     *  path (the same `importCharacter` funnel a file upload takes — byte-identical dedup, book/regex relink),
     *  so the indexer auto-runs. capability: character.ingest.
     *
     *  Owner-scoped, grant-gated, no chat scope, no host authority — the `databank.ingest` posture verbatim
     *  (a write into the installer's OWN library, not room state). `card` is the RAW card object as JSON-safe
     *  data (the membrane cannot carry a live PNG across the marshalling boundary, and a scraped card is
     *  structured JSON anyway); the host serializes + validates it through `parseCardJson`, so a malformed
     *  card is a typed refusal of the CALL, never a partial write. Returns the new character id + whether it
     *  was freshly created (`false` = a byte-identical re-ingest deduped by importHash). */
    // @orb-waive brand-in-name-position(characterId): the plugin SANDBOX wire DTO — a host-minted id for the installer's own new character, handed back as inert text; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    ingest: (card: Record<string, unknown>) => Promise<{ characterId: string; created: boolean }>;
    /** Ingest a character from a PNG ASSET the guest already has in the INSTALLER's OWN CAS (plugin-remote-image
     *  #798 — the "Add to your library WITH its art" arm). The guest names an `assetId` (e.g. one
     *  `net.fetchAsset` just returned for a hub cover); the host resolves the installer's OWN CAS through the
     *  OWNER-GATED read (a foreign/absent id rejects leak-free — the `readOwnedAssetBytes` posture, no existence
     *  oracle) and runs the SAME `importCharacter` PNG funnel a file upload takes: it parses the ccv3/chara
     *  chunk AND CAS-stores the embedded avatar, so the created character arrives WITH its art (avatarAssetId
     *  non-null) — which the plain `ingest(card)` JSON path cannot carry. capability: character.ingest.
     *
     *  IT RIDES THE SAME `character.ingest` GRANT as {@link ingest}, and that is the correct classification, not
     *  a shortcut: the REACH is identical (a character import into the installer's OWN library, owner-scoped, no
     *  chat scope, no host authority — the ContentChanged-emitting path so the indexer auto-runs); only the
     *  INPUT FORM differs (a PNG asset the installer owns vs. a raw JSON card). A person who agreed to "add
     *  characters to your library" agreed to this whether the card arrives as JSON or as a fetched PNG. Returns
     *  the new character id + whether it was freshly created (`false` = a byte-identical re-ingest, importHash
     *  dedup). */
    // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — an untrusted guest's JSON string naming an asset in the installer's OWN CAS, owner-scope-gated by the host read, never branded here. Ends if the bridge starts parsing to brands at the membrane.
    // @orb-waive brand-in-name-position(characterId): the plugin SANDBOX wire DTO — a host-minted id for the installer's own new character, handed back as inert text; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    ingestAsset: (assetId: string) => Promise<{ characterId: string; created: boolean }>;
    /** Store this plugin's OWN per-card state on one of the INSTALLER's OWN characters (D148 — the ST
     *  `writeExtensionField` parity arm). capability: `character.card_state`.
     *
     *  IT WRITES EXACTLY ONE RESERVED KEY, `data.extensions.plugin_<slug>`, and that is the whole security story.
     *  The `<slug>` is STAMPED HOST-SIDE from the re-validated manifest (never guest input — the `pubsub.emit`
     *  precedent), so a plugin can name only its OWN namespace: it can never read or overwrite another plugin's
     *  `plugin_<otherslug>` field because it can never spell another slug, and the persistence merge touches only
     *  that one key (sibling plugin keys stay byte-identical). The character is OWNER-SCOPED — the write lands
     *  only WHERE the installer owns the row, so a `characterId` for a character this installer does not own
     *  writes nothing and rejects leak-free (the `character.ingest` / owned-verb posture: a foreign and an absent
     *  character are indistinguishable). `data` is inert JSON-safe data: it rides the residual-extensions
     *  passthrough that makes per-card plugin state PORTABLE (import→store→export→re-import unchanged, D148 clause
     *  a), and a `depth_prompt`/`regex_scripts` nested inside it stays inert data under this key — it can never
     *  promote to the card's typed columns (D148 clause c). The write is METADATA, not card content: it does NOT
     *  recompute the card's `contentHash` and does NOT re-index the character (D148 clause d), the opposite of a
     *  `create`/`update`. NO chat scope, NO host authority — the `storage.kv` posture: a write to the installer's
     *  OWN character is the installer's own reach, not room state, so gating it on `canWrite` would claim a
     *  protection it does not need. */
    // @orb-waive brand-in-name-position(characterId): the guest SANDBOX wire surface — an untrusted guest's JSON string, owner-scope-gated by the persistence predicate, never branded here. Ends if the bridge starts parsing to brands at the membrane.
    setCardData: (characterId: string, data: Record<string, unknown>) => Promise<void>;
    /** Read back this plugin's OWN per-card state (`data.extensions.plugin_<slug>`) from one of the INSTALLER's
     *  OWN characters. capability: `character.card_state`. Same host-stamped-slug + owner-scope walls as
     *  {@link setCardData}: a foreign/absent character rejects leak-free, and a plugin reads only its own key —
     *  never another plugin's `plugin_<otherslug>` field. Returns the stored blob, or `null` when this plugin has
     *  written none on that (owned) character. */
    // @orb-waive brand-in-name-position(characterId): the guest SANDBOX wire surface — an untrusted guest's JSON string, owner-scope-gated by the persistence predicate, never branded here. Ends if the bridge starts parsing to brands at the membrane.
    getCardData: (characterId: string) => Promise<Record<string, unknown> | null>;
  };

  readonly events: {
    /** Subscribe to the Tier-1 trigger taxonomy — the SAME closed union; plugins
     *  get no private event vocabulary. Handlers receive the resolved TriggerFact, never raw bus
     *  payloads. INSTALLED plugins only (snippets run once). capability: events.subscribe */
    on: (type: ChatTriggerType | DomainTriggerType, handler: (fact: TriggerFact) => void | Promise<void>) => void;
  };

  /** THE PRIVATE PLUGIN-EVENT PLANE — a namespaced installer-scoped pub-sub for
   *  multi-plugin composition. It is a DELIBERATELY SEPARATE plane from `events` above, and the separation IS the
   *  forgery wall (§5.24 — "a plugin-emitted DOMAIN event is a forged fact"):
   *   - it NEVER enters a domain/chat bus (the emit reaches only the installer's own resident plugin-event bus);
   *   - the delivered payload is a plain `{ name, data }`, NEVER a `TriggerFact` — so it cannot be laundered into
   *     automation (automation reach is a FUTURE explicit `pluginEvent` trigger member, not this plane);
   *   - it NEVER crosses to another user — the bus is keyed by the installing principal, so an emit reaches only
   *     the SAME installer's plugins.
   *  The channel is `plugin:<emitter-slug>:<name>`; the emitter's slug is STAMPED host-side (a guest supplies only
   *  `name` + `data` to `emit`, so it cannot forge a publication on another plugin's channel). capability:
   *  `plugin_events`. */
  readonly pubsub: {
    /** Publish a private event on THIS plugin's channel `plugin:<own-slug>:<name>` to every SAME-installer
     *  plugin subscribed to it. `data` is inert JSON-safe data. Resolves when delivery is dispatched (the
     *  subscribers' handlers run fire-and-forget under the invocation budget). capability: plugin_events. */
    emit: (name: string, data: Record<string, unknown>) => Promise<void>;
    /** Subscribe to `plugin:<emitterSlug>:<name>` on THIS installer's plane — `emitterSlug` names which of the
     *  installer's plugins to listen to (its own manifest slug; a slug the installer does not have installed
     *  simply never fires). The handler receives `{ name, data }` — a plain payload, never a `TriggerFact`.
     *  Resident (collected at activation, dropped on disable), the `events.on` posture. capability: plugin_events. */
    on: (emitterSlug: string, name: string, handler: (event: { name: string; data: Record<string, unknown> }) => void | Promise<void>) => void;
  };

  readonly tools: {
    /** Register a tool into the ONE domain/tool-use registry (D48 source (b)). The host-side posture
     *  for the raw-JSON-Schema `parameters` field is the named decision against D79 (README truth table).
     *  capability: tools.register */
    register: (def: {
      name: string; // /^[a-z][a-z0-9_]{0,40}$/; host prefixes to "plugin_<slug'>_<name>"
      description: string;
      parameters: Record<string, unknown>; // JSON Schema (validated host-side)
      handler: (args: unknown) => Promise<string>; // runs IN the guest under the invocation budget
    }) => void;
  };

  readonly transforms: {
    /** Register a D50 PromptTransform (order auto-assigned in the plugin band 1000+
     *  by registration order). capability: chat.transform */
    register: (def: {
      name: string;
      point: PromptTransformPoint;
      /** The re-entry passes ONE structured-clone-safe object (the single-arg host→guest invoke seam tools +
       *  events already use — a named field bag is arity-stable: adding an env field never changes the call
       *  shape). `input.draft` is the working text; `input.env` = `{chatId, vars}` for a sync read inside the
       *  250 ms transform deadline (no host round-trip needed). Return the transformed draft. */
      // @orb-waive brand-in-name-position(chatId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, branded only after the host parses it; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
      apply: (input: { draft: string; env: { chatId: string; vars: Record<string, string> } }) => Promise<PromptTransformOutcome>;
    }) => void;
    /** Register a DISPLAY transform (seam 14) — the ST message-formatting-hook
     *  parity arm. capability: chat.transform.
     *
     *  IT IS A DIFFERENT SEAM FROM `register` ABOVE, and the difference is the whole safety story. A D50 prompt
     *  transform rewrites the text going TO THE MODEL; this rewrites only what the INSTALLER'S OWN SCREEN shows,
     *  after their macros and their DISPLAY regex have run (the recorded ordering: member macros → member
     *  DISPLAY regex → plugin display transforms → markdown, so a member's regex cannot post-process a plugin
     *  annotation). It writes no canon, reaches no other viewer, and cannot abort anything — which is why it
     *  needs no new capability and no host authority: it is strictly narrower than the prompt transform
     *  `chat.transform` already buys.
     *
     *  `input.text` is what that viewer's client has ALREADY rendered for the row; the return replaces it. A
     *  throw or a deadline overrun SKIPS this transform (D53) — the row keeps the text it had, never a spinner
     *  and never a blocked message. */
    registerDisplay: (def: {
      name: string;
      // @orb-waive brand-in-name-position(chatId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, branded only after the host parses it; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
      // @orb-waive brand-in-name-position(messageId): same DTO, same reason — the row id crosses INTO the guest as inert text it may key off, and nothing on this side reads it back as one of ours. Ends if the bridge starts parsing to brands at the membrane.
      apply: (input: { text: string; env: { chatId: string; messageId: string } }) => Promise<string>;
    }) => void;
  };

  readonly macros: {
    /** Register a MACRO into the ONE kit macro engine. capability: chat.transform —
     *  a macro substitutes text into the assembled prompt, which is exactly the reach that capability names.
     *
     *  PLUGIN MACROS ARE DATA, NOT A SECOND ENGINE, and the shape follows from a fact about the engine rather
     *  than from taste: `MacroHandler` in `@orb/kit/macro` is SYNCHRONOUS, and a guest invoke is not. So the
     *  host resolves each registered macro ONCE per turn — `resolve()` runs in the guest under the assembly
     *  deadline (the D50 transform precedent for mid-pipeline guest calls) — and registers the RESULT as a
     *  per-turn value on the turn's own registry. One engine, one evaluation order, one budget.
     *
     *  A VALUE MACRO, therefore: it declares no arguments, because arguments would require the engine to call
     *  back into the guest at substitution time, which is the async call the engine cannot make. That is the
     *  bound, stated; it is also ST's own `registerMacro(key, value)` shape.
     *
     *  `name` is guest-local and host-namespaced to `plugin_<slug'>_<name>` (the `tools.register` rule), so a
     *  plugin can never shadow a builtin macro or another plugin's. A throw or an overrun resolves the macro
     *  to "" for that turn (the degrade-never-throw law the whole macro plane obeys) — a broken plugin macro
     *  renders empty, it does not eat the turn. The returned text is `neutralizeMacros`'d before it is
     *  registered: plugin-authored text entering a macro-EXECUTION plane obeys interaction-spec §2 law 7. */
    register: (def: {
      name: string; // /^[a-z][a-z0-9_]{0,40}$/; host prefixes to "plugin_<slug'>_<name>"
      description: string;
      resolve: () => Promise<string>;
    }) => void;
  };

  readonly net: {
    /** capability: net.fetch — host-performed fetch, allowlisted per-manifest hosts ONLY, GET/POST,
     *  5 s deadline, 1 MiB response cap, no redirects off-allowlist, SSRF-guarded (infra/network safeFetch,
     *  D61 B5a). */
    fetch: (url: string, init?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; body: string }>;
    /** capability: net.fetch_asset — download a REMOTE IMAGE into the INSTALLER's OWN CAS and get back an
     *  assetId (plugin-remote-image #798). The guest supplies ONLY the url string and receives ONLY an assetId;
     *  the BYTES never enter the guest realm and NO URL is ever spellable inside a rendered node — the
     *  `image`/`hero` DSL nodes stay assetId-only, so the seam-11 anti-exfil-pixel wall is unchanged.
     *
     *  THE HOST performs everything: it claims its OWN hourly belt (`PluginBridge.admitAssetEgress`, #801 —
     *  split from `net.fetch`'s so an art grid's honest cover spend can never starve text egress; the REACH
     *  delta stays zero — an allowlisted GET is already expressible via `net.fetch`, so this adds a
     *  CAS-WRITE, not egress reach), GETs the url through the audited SSRF guard pinned to the manifest `netHosts` allowlist (every
     *  hop re-validates https + the allowlist + private-range denial — a loopback/internal/off-allowlist/
     *  scheme-downgrade target is refused), runs the remote-image guard on the downloaded bytes (magic-byte
     *  sniff — the remote Content-Type is NEVER trusted — plus the dimension/pixel decompression-bomb caps and
     *  the 5 MiB asset byte cap, #801: real hub art outgrows the 1 MiB wire cap and these bytes never enter
     *  the guest), and writes the validated bytes to the installer's OWN CAS under the sniffed mime. A
     *  non-2xx, an SSRF/oversize/non-image refusal, or a network error is a typed REJECTION of the call (there
     *  is no assetId to return), never a silent empty asset. The CAS write is owner-scoped by construction (the
     *  bridge closes the installer over it — a guest names no owner), the `character.ingest`/`assets.read`
     *  ceiling: the installer's own storage, no paid credential. */
    // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — a host-minted id for the installer's own new asset, handed back as inert text; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    fetchAsset: (url: string) => Promise<{ assetId: string }>;
  };

  /** The DECLARATIVE UI plane (the U0 vocabulary). A plugin registers surfaces built from the
   *  closed `@orb/contracts/plugin/ui` node vocabulary (`ui.ts`) — first-party code renders them at the existing
   *  contribution anchors inside a plugin-labeled shell; plugin code never touches the real DOM and the
   *  vocabulary cannot express host chrome, a modal, or a write channel (§4.3/§4.8). This namespace is the
   *  guest-facing membrane surface; the resident registration + state store + event round-trip land with U1.
   *  Guests feature-detect via `grants` (does it hold `ui.surface`?) — the same posture every capability uses. */
  readonly ui: {
    /** Register a surface at activation (resident state, like `tools.register`/`transforms.register` — rebuilt
     *  on re-activation, deregistered on disable). An invalid `spec` is a REGISTRATION refusal (logged, surface
     *  absent), never activation-fatal. capability: ui.surface */
    register: (def: {
      id: string; // /^[a-z][a-z0-9_]{0,40}$/, unique per plugin
      anchor: PluginSurfaceAnchor;
      title: string; // the shell label line (≤ 80 chars)
      tier: PluginSurfaceTier; // scripted requires the bundle's ui.js (U4)
      spec?: PluginSurfaceSpec; // REQUIRED for the static tier; zod-validated host-side (ui.ts)
      onAction?: (a: { actionId: string; values: Record<string, string>; chat: ChatHandle | null }) => void | Promise<void>;
    }) => void;
    /** Publish surface STATE (the data the spec's `$state` bindings resolve against). ≤ 16 KiB JSON; replaces
     *  the whole state; emits the per-user freshness poke. capability: ui.surface
     *
     *  `chat` is the OPTIONAL ROOM DIMENSION. Omitted, the state row is
     *  keyed `(pluginId, surfaceId)` and every room shows the same publication — the U1 shape, and still the
     *  right one for a settings panel or a cross-room roll-up. Supplied, the row is keyed
     *  `(pluginId, surfaceId, chatId)` and a room-anchored surface reads only ITS room's row, which is what
     *  makes a per-room widget say something true about the room you are looking at.
     *
     *  It takes a {@link ChatHandle}, NOT a chat id string, for the same reason every other room-scoped host fn
     *  does: the handle is the host-minted opaque token of the ADMITTED invocation chat, so a guest can only
     *  name a room this invocation was already admitted to and a forged/stale token fails resolution at the
     *  membrane. A guest that wants the current room writes `host.ui.setState(id, state, host.chat.current())`. */
    setState: (surfaceId: string, state: Record<string, unknown>, chat?: ChatHandle) => Promise<void>;
    /** Register a COMMAND at activation (the `register` mirror — resident, rebuilt on re-activation, dropped on
     *  disable). U5, §4.5. The host routes `/plugin <slug> <name> <rest>` and a first-party "Plugins" chrome menu
     *  item to `onRun`, which receives ONE `{ args, chat }` object (`args` = the raw remainder after the name, so
     *  a command owns its own argument grammar). A plugin never reaches a top-level slash token: the dispatcher
     *  and the menu are ONE first-party contribution each, fanning per-plugin off the caller's own installs.
     *
     *  `onRun` receives ONE `{ args }` object — the raw remainder after the name, so a command owns its own
     *  argument grammar. THE ROOM IS NOT AN ARGUMENT, deliberately: a command run inside a chat is invoked with
     *  that chat as its invocation scope, so it reaches the room through `chat.current()` exactly as a tool,
     *  transform or event handler does. The opaque handle has ONE mint and one accessor; handing a second copy
     *  in through the args bag would be a second spelling of the same token. Run outside a room (the chrome menu
     *  on a non-chat screen), `chat.current()` throws — the honest answer, not a synthesized room.
     *
     *  THE #791 TYPED-ARG GRAMMAR: a command MAY declare `args` (the ST `SlashCommandArgument` core —
     *  named/typed/enum/required). When it does, the platform COLLECTS + TYPES + VALIDATES + AUTOCOMPLETES them at
     *  both surfaces (the palette's typed input strip, the composer's `name=value` completion) before `onRun`
     *  runs, and hands the guest the typed `values` bag ALONGSIDE the raw `args` remainder (unchanged — a command
     *  with no declared args keeps its own opaque argument grammar, and `values` is then `{}`). The values are
     *  re-validated host-side at the membrane against these same specs (a client is untrusted), so `onRun` sees
     *  only well-typed, in-enum, required-present values. capability: ui.surface (a declared arg is metadata on a
     *  command a plugin could already register — no new capability). */
    registerCommand: (def: {
      name: string; // /^[a-z][a-z0-9_]{0,40}$/, unique per plugin
      describe: string; // the palette/menu one-liner (≤ 200 chars)
      args?: readonly PluginCommandArgSpec[]; // the declared typed args (≤ 16); absent ⇒ one opaque `args` remainder
      onRun: (a: { args: string; values: Record<string, PluginCommandArgValue> }) => void | Promise<void>;
    }) => void;
    /** Raise a HOUSE toast, prefixed with the plugin's name (stamped host-side — a guest-supplied prefix is the
     *  impersonation the attribution exists to prevent). Length-capped and RATE-FLOORED per plugin
     *  (`PLUGIN_TOAST_COOLDOWN_SECONDS`). Transient viewer-local feedback: it rides the outcome of the
     *  action/command the person just ran, so a toast raised with no viewer present has no one to reach — the
     *  durable channel stays `notifications.post`. capability: ui.surface */
    toast: (level: PluginToastLevel, message: string) => Promise<void>;
    /** Ask the host to open one of THIS plugin's registered `dialog` surfaces — the house modal shell with a
     *  plugin-attributed title (§4.5a). It resolves when the ask is RECORDED, not when a modal appears: the open
     *  travels on the outcome of a client-initiated round-trip, so a spontaneous open is unspellable rather than
     *  refused, and an id naming no registered dialog is dropped. capability: ui.surface */
    openDialog: (surfaceId: string) => Promise<void>;
    /** THE ESCAPE HATCH. Register a `frame`-tier surface: the plugin's OWN interface
     *  code, served as a document into an isolated iframe. capability: **ui.frame** — deliberately NOT
     *  `ui.surface`.
     *
     *  IT IS A SECOND FUNCTION RATHER THAN A `tier` ARGUMENT ON `register`, and that is the whole gate. The
     *  membrane gates at the FUNCTION (`HOST_FUNCTION_CAPABILITY`), so a tier needing a different consent needs a
     *  different door; `PLUGIN_TIER_REGISTRAR` (ui.ts) records the fork as a total Record, and `ui.register`
     *  refuses `tier: "frame"` outright. Otherwise a guest holding only `ui.surface` could take the hatch by
     *  naming its tier.
     *
     *  WHAT THE FRAME REACHES, honestly: nothing of the app. The served document is opaque-origin
     *  (`sandbox allow-scripts`, never `allow-same-origin`), `default-src 'none'` with NO `connect-src` — so
     *  fetch/XHR/WebSocket/EventSource/sendBeacon are all refused — and it can touch neither the session, nor
     *  storage, nor the app DOM, nor a sibling frame. It has NO network of its own: every host call rides the
     *  postMessage bridge to the SAME re-gated relay the scripted tier uses. What it CAN do, and what its consent
     *  line says out loud, is beacon over WebRTC/STUN — residual R1 in `@orb/kit/card-frame`, measured, and not
     *  closeable by any directive Chromium recognizes.
     *
     *  `anchor` is bounded by {@link PluginSurfaceAnchor} ∩ the `frame` column of `PLUGIN_ANCHOR_TIERS` —
     *  `message-footer` is refused PERMANENTLY (one document per transcript row). An invalid def is a REGISTRATION
     *  refusal (logged, surface absent), never activation-fatal — the `ui.register` posture (§4.9). */
    registerFrame: (def: {
      id: string; // /^[a-z][a-z0-9_]{0,40}$/, unique per plugin (shares the surface-id namespace)
      anchor: PluginSurfaceAnchor;
      title: string; // the shell label line (≤ 80 chars)
      html: string; // the document body, verbatim — the frame is the boundary, not a sanitizer
      css?: string;
    }) => void;
  };
}

// ── The capability → host-function completeness pin (the enforcement table, coded) ──────────────────────────
/** Namespaces reachable with NO capability: the determinism/id floor + the version/feature-detect surface.
 *  The ONE tuple (derive, never re-spell — §7.5); a `satisfies` pins every member to a real `PluginHostV1` key,
 *  so a renamed/removed free namespace fails `tsc` here. */
const PLUGIN_FREE_NAMESPACES = ["version", "grants", "clock", "random", "ids", "log", "tokens"] as const satisfies readonly (keyof PluginHostV1)[];
type FreeNamespace = (typeof PLUGIN_FREE_NAMESPACES)[number];
/** Every namespace whose functions are capability-gated. */
type GatedNamespace = Exclude<keyof PluginHostV1, FreeNamespace>;
/** A `"namespace.method"` reference for every capability-gated host function, DERIVED from the surface — the
 *  set the map below must exactly cover. Adding a gated method widens this union; if the map does not claim it,
 *  the reverse-completeness pin (tests/contracts/plugin/index.test-d.ts) goes red. */
export type HostFunctionRef = {
  [Ns in GatedNamespace]: `${Ns & string}.${keyof PluginHostV1[Ns] & string}`;
}[GatedNamespace];

/** The capability→function map as CODE, keyed by FUNCTION (the per-call lookup the host performs). Both
 *  completeness directions are `tsc`-enforced: `satisfies Record<HostFunctionRef, …>` forces EVERY gated
 *  function to name a capability — a new gated method with no entry is a missing key (RED); the `PluginCapability`
 *  value type makes a capability that does not exist fail (RED). The reverse — a capability claimed by NO
 *  function — is the `.test-d.ts` value-coverage equality pin. Together: the completeness checkpoint. */
export const HOST_FUNCTION_CAPABILITY = {
  "chat.current": "chat.read",
  "chat.listMessages": "chat.read",
  "chat.getVariables": "chat.read",
  // #788 F11 — the character roster read rides the SAME `chat.read` grant its sibling reads do: the present
  // roster (id/name/avatar) is member-visible room state at the exact tier `listMessages`/`getVariables` read,
  // so it is not a distinct consent line (a reader agreeing to "read this room's messages" already agrees to see
  // who is in the room).
  "chat.listCharacters": "chat.read",
  "chat.applyVariableOps": "chat.variables.write",
  "chat.surfaceQuickReply": "chat.quick_reply",
  "chat.requestTurn": "turn.trigger",
  // #788 F12 — the world-info READ half, its OWN `worldinfo.read` grant (a distinct consent line from the write:
  // "read the room's lore" is a reach a person weighs apart from "write lore"). Both read functions ride the one
  // grant — listing the books and reading their entries is one symmetric "read your lore" consent.
  "worldInfo.listBooks": "worldinfo.read",
  "worldInfo.listEntries": "worldinfo.read",
  "worldInfo.upsertEntry": "worldinfo.write",
  // #788 seam-11 read half — the CAS asset read, its OWN `assets.read` grant. Owner-scoped: a guest reads back
  // only assets in the installer's own CAS (the domain's owner-gated read), a foreign/absent id is leak-free null.
  "assets.read": "assets.read",
  // #788 F1 — the first-party retrieval read, its OWN `search.query` grant. Owner-scoped: the bridge closes the
  // installer's ownerId over the search scope, so a guest searches only its own corpus.
  "search.documents": "search.query",
  "variables.get": "global_vars",
  "variables.set": "global_vars",
  "variables.delete": "global_vars",
  "storage.get": "storage.kv",
  "storage.set": "storage.kv",
  "storage.delete": "storage.kv",
  // #1442 — the ATOMIC arm of the same plane. Its capability is `storage.kv`, IDENTICAL to `storage.set`:
  // same grant, same owner scope, no new ownership check, a PRECONDITION added rather than a reach widened.
  // A distinct consent line would be a lie — a user who allowed the plugin to write its own KV has already
  // allowed exactly this write.
  "storage.compareAndSet": "storage.kv",
  "storage.list": "storage.kv",
  "notifications.post": "notify",
  "imagery.generatePicture": "imagery.generate",
  "llm.quiet": "llm.quiet",
  // U8 seams 15/17 — each is its OWN consent line (a canon write into the installer's own library is a distinct
  // reach), keyed 1:1 to its capability. Owner-scoped writes, not room writes: the domain closes the installer
  // over each op, so there is no `canWrite` gate here — the grant is the whole membrane-tier wall.
  "databank.ingest": "databank.ingest",
  "character.ingest": "character.ingest",
  // #798 — the remote-image "summon with art" arm rides the SAME `character.ingest` grant as `character.ingest`:
  // its reach is identical (a character import into the installer's own library), only the input form differs (a
  // PNG asset the installer owns vs. a JSON card), so it is not a distinct consent line (the `card_state`
  // read/write pair riding ONE grant is the precedent).
  "character.ingestAsset": "character.ingest",
  // U8 D148 — the per-card plugin-state write + read, BOTH keyed to the ONE `character.card_state` grant (a
  // symmetric consent line: "store its own data on your characters" covers reading back what it stored). Owner-
  // scoped metadata writes to the installer's OWN characters, not room writes: no `canWrite` gate, the grant is
  // the whole membrane-tier wall (the `storage.kv` posture, one plane over onto the card's residual extensions).
  "character.setCardData": "character.card_state",
  "character.getCardData": "character.card_state",
  "events.on": "events.subscribe",
  // U8 §5a — both the private-event emit and subscribe ride the ONE `plugin_events` grant (a single consent line
  // covers "send and receive private events among your own plugins"). A plugin that may emit may subscribe and
  // vice versa — the plane is symmetric and installer-private.
  "pubsub.emit": "plugin_events",
  "pubsub.on": "plugin_events",
  "tools.register": "tools.register",
  "transforms.register": "chat.transform",
  // U6 — both ride `chat.transform`: a DISPLAY transform is strictly narrower than the prompt transform that
  // capability already buys (installer's own screen, no canon, no other viewer), and a macro substitutes into
  // the assembled prompt, which is that capability's own reach. Neither is a new consent line.
  "transforms.registerDisplay": "chat.transform",
  "macros.register": "chat.transform",
  "net.fetch": "net.fetch",
  // #798 — the remote-image-into-CAS arm, its OWN `net.fetch_asset` consent line (identical egress REACH to
  // `net.fetch` — same allowlist; since #801 it claims its own art-sized hourly belt — plus a CAS write, which
  // is the distinct reach a person weighs). Keyed 1:1 to its capability; the netHosts biconditional treats both
  // as egress capabilities.
  "net.fetchAsset": "net.fetch_asset",
  "ui.register": "ui.surface",
  "ui.setState": "ui.surface",
  // U5's three host-mediated affordances ride the SAME `ui.surface` grant, and that is a decision, not an
  // oversight: the consent line a person read ("Show its own panels and controls — drawn by the app, always
  // labeled with the plugin's name") already describes a command in the app's own menu, a toast in the app's own
  // toast slot, and a dialog in the app's own modal shell. A fourth capability per chrome affordance would grow
  // the grant screen without widening what a person is actually agreeing to.
  "ui.registerCommand": "ui.surface",
  "ui.toast": "ui.surface",
  "ui.openDialog": "ui.surface",
  // U7 — the ONE function claiming `ui.frame`, and the reason the hatch is a separate door at all: a capability
  // is enforced per FUNCTION, so the tier that needs a louder consent line gets its own function. Moving this
  // value to `ui.surface` would silently fold the hatch's consent into the panel row's — which is exactly why
  // U5's affordances ride `ui.surface` (same "draw in the app's chrome" reach) and this one does NOT (it runs
  // the plugin's own code in an isolated frame that can beacon out).
  "ui.registerFrame": "ui.frame",
} as const satisfies Record<HostFunctionRef, PluginCapability>;

// ── The Tier-C PROXY SUBSET ─────────────────────────────────────────────────
/** The host functions a CLIENT-side scripted guest (`ui.js`, the Tier-C QuickJS worker) may reach, relayed
 *  through the ONE `plugin.uiHostCall` proc and RE-GATED server-side per call
 *  (`fn ∈ UI_PROXYABLE_HOST_FUNCTIONS ∩ the caller's own stored grant`). It is a SUBSET of
 *  {@link HostFunctionRef} — `satisfies` pins every member to a real gated host function, so a renamed or
 *  removed function fails `tsc` HERE and cannot leave a dangling proxy name behind.
 *
 *  WHAT IS IN, and why these: the two canon READS a surface renders from, the installing user's global KV, and
 *  the plugin's own private KV. Every one is already bounded by a per-call check the server performs anyway
 *  (owner scope, the KV size/count ceilings, the D16 viewer clamp on canon), and — the load-bearing property —
 *  every one is reachable through the `PluginBridge` the domain already holds, so proxying them adds a CALLER
 *  and not one line of new authority.
 *
 *  WHAT IS OUT, stated as PRICED WIDENINGS rather than a silent omission (the §5a enablement-sheet idiom) —
 *  each names what it would cost to admit, so the absence is a decision surface a reviewer can audit:
 *   - `tools.register` / `transforms.register` / `events.on` / `ui.register` / `ui.setState` — RESIDENT
 *     REGISTRATIONS. These mint process-lifetime state owned by the SERVER guest (a registry row, a transform
 *     band slot, a subscriber, a surface record). A client guest is per-mount and terminable; letting it
 *     register would create residency with no activation to rebuild it from and no deactivate to reap it.
 *     Not purchasable in this shape at any price — the server half is where residency belongs (§4.6 names the
 *     first three explicitly).
 *   - `chat.current` — nothing to resolve: it returns the ADMITTED INVOCATION's chat token, and a proxied call
 *     has no invocation. The client names its room as `chatId` on the proc instead, and the server verifies
 *     MEMBERSHIP rather than trusting the claim.
 *   - `notifications.post` — THE MOST LIKELY FIRST WIDENING. Its per-call bounds already exist (the 60 s
 *     per-(plugin, chat) notify floor, the domain-side recipient resolve, the 200-char cap); what it lacked
 *     until row 777 was a membership-verified room for a CLIENT-claimed `chatId`. Row 777's
 *     `resolveChatAuthority` gate is exactly that, so the sanctioned shape is: admit the claimed chat, then
 *     call the bridge op under the existing floor. Priced, not built — it is an EFFECT, and this lane's
 *     tuple is deliberately reads + KV + belted egress.
 *   - `net.fetch` — OUT ON A STRUCTURAL RECEIPT, not a judgment call, and the receipt is worth stating because
 *     the natural reading of "already-safe effect fns" includes it. THE FETCH IS NOT ON THE BRIDGE: `safeFetch`
 *     is the audited SSRF guard and it lives in `infra/network`, which a domain may not import, so `infra`
 *     PERFORMS every plugin fetch and the bridge carries only the hourly admission (`PluginBridge.admitEgress`,
 *     whose own header states exactly this division). A proxied `net.fetch` would therefore need a NEW injected
 *     egress op wired at compose — i.e. a SECOND egress path beside the membrane's, with its own copy of the
 *     manifest-allowlist plumbing. That is a new trust boundary, and this lane refuses to improvise one. Its
 *     sanctioned shape, if it is ever wanted, is to widen `PluginBridge` so infra's ONE guarded fetch is
 *     reachable by both callers — never a parallel path.
 *   - `chat.applyVariableOps` / `chat.surfaceQuickReply` / `chat.requestTurn` / `worldInfo.upsertEntry` /
 *     `imagery.generatePicture` / `llm.quiet` — THE AUTHORITY-WRITE CLASS. Each is gated on
 *     `InvocationChat.canWrite` (the installer must HOST the room), and the membrane's answer when they hold
 *     the grant but not the authority is NOT a refusal — it is the S4 propose/confirm inbox
 *     (`bridge.suggest`). So their sanctioned route from a client guest is that SAME posture: raise an ask a
 *     host confirms, never a direct proxy that would have to re-derive host authority in a second place. A
 *     direct proxy is the arm this design refuses; the suggest-shaped arm is the one that is priced.
 *   - `databank.ingest` / `character.ingest` (U8) — THE CANON-WRITE class, OUT. They are not room-authority
 *     writes (no `canWrite` gate — a library write is the installer's own), but they are still WRITES that
 *     mint durable rows + kick derived-index compute, and the Tier-C tuple is deliberately reads + the two KV
 *     planes: §4.6 bought LATENCY for local-immediate interaction (filtering, hovering, form state), which
 *     needs reads, not a canon-write relay. Nothing is lost — the plugin's SERVER guest ingests under the same
 *     grant; a scripted surface that wants to trigger an ingest fires an `actionId` round-trip whose server
 *     handler holds the grant, exactly as it would for any other write. Admitting them to the proxy tuple is a
 *     §5a-shaped decision (a new proxyable member is a reviewable act), never a free entry.
 *   - `character.setCardData` / `character.getCardData` (U8 D148) — BOTH OUT, for two DIFFERENT reasons worth
 *     stating separately. `setCardData` is a WRITE (the U8 canon-write reasoning above — mints/mutates a durable
 *     row, and the Tier-C tuple is deliberately reads + KV). `getCardData` is the more interesting exclusion: it
 *     IS a read, and a scripted surface reading its OWN per-card state to render a widget is a plausible LATENCY
 *     want — the class §4.6 bought. It is OUT anyway because its owner-scope is per-CHARACTER, and a proxied call
 *     has no invocation character the way it has no invocation chat (`chat.current`'s exclusion): the client would
 *     name a `characterId`, and the server would then owe a membership/ownership check on that CLAIM before the
 *     read — exactly the `notifications.post`/row-777 `resolveChatAuthority` shape, one plane over onto character
 *     ownership. That gate does not exist yet, so this is a PRICED widening (build the owned-character admission,
 *     then proxy the read under it), never a free entry — and until then a scripted surface reads its own card
 *     state through the server guest's own `getCardData` on an `actionId` round-trip, losing latency, nothing else.
 *   - `pubsub.on` / `pubsub.emit` (U8 §5a) — OUT. `pubsub.on` is a RESIDENT REGISTRATION (a subscriber handle
 *     owned by the SERVER guest, the `events.on` class), and `pubsub.emit` is an EFFECT that fans out to resident
 *     SERVER guests — neither is server-owned DATA a client guest lacks. A client UI guest holds `orb.ui(1)`, not
 *     `orb.host(1)`, and the private-event plane is a SERVER-guest composition primitive; relaying it would put a
 *     client guest into the installer's resident event graph, which is not what §4.6's read-latency purchase was.
 *   - `chat.listCharacters` (#788 F11) — OUT, but the STRONGEST future proxy candidate: it is the same class as the
 *     proxyable `chat.listMessages`/`getVariables` (a chat-scoped canon read a surface renders from, self-gating
 *     membership → `[]` for a non-member), and a scripted sprite/expression surface swapping art per speaker is
 *     exactly the local-immediate latency want §4.6 bought. It is OUT of THIS lane only because the tuple is an
 *     ORDERED, reviewable pin ("reads + the two KV planes, and nothing else") and adding a member is a deliberate
 *     act, not a lane's side effect — a PRICED widening (add it to the tuple + its pin, no new gate needed), never
 *     a silent entry. Until then a scripted surface reads the roster through its server guest on an `actionId`
 *     round-trip, losing latency, nothing else.
 *   - `worldInfo.listBooks` / `worldInfo.listEntries` (#788 F12) — OUT. Chat-scoped reads that self-gate
 *     (attachment + membership), so like `listCharacters` they COULD be proxied under the same membership-on-claimed-
 *     `chatId` shape `listMessages` already uses — but the lore-read consumer is the server-side indexing class,
 *     not a per-frame surface render, so the latency want is weak; a PRICED widening, not this lane's tuple edit.
 *   - `assets.read` (#788 seam-11) — OUT, the `character.getCardData` shape one plane over: it IS a read, but its
 *     owner-scope is per-ASSET and a proxied call names an `assetId` the server would owe an ownership check on
 *     before reading (the `chat.current`/row-777 `resolveChatAuthority` posture onto asset ownership). The bridge
 *     read already owner-gates, so the widening is small, but it is a widening — priced, never a free entry.
 *   - `search.documents` (#788 F1) — OUT. It IS an owner-scoped read (the bridge closes the installer's ownerId
 *     over the scope, so a proxied call would need no new ownership gate), but every call runs a QUERY EMBEDDING
 *     (local box compute), and a client guest firing it at animation rate would hammer the embedder — the
 *     compute-cost class the read tuple deliberately does not admit (§4.6 bought LATENCY for local-immediate
 *     interaction over CHEAP reads, not for per-keystroke retrieval). A scripted surface that wants search fires
 *     an `actionId` round-trip whose server guest runs it under the same grant. Priced, not a free entry.
 *
 *  Nothing here loses ABILITY: the plugin's SERVER guest reaches every excluded function under the same grant.
 *  What Tier C gives up is the LATENCY of those calls, which is not what §4.6 bought — it bought
 *  local-immediate INTERACTION (filtering, hovering, form state), and that needs reads, not writes. */
export const UI_PROXYABLE_HOST_FUNCTIONS = [
  "chat.listMessages",
  "chat.getVariables",
  "variables.get",
  "variables.set",
  "variables.delete",
  "storage.get",
  "storage.set",
  "storage.delete",
  "storage.list",
  // #1442 — IN, and the classification is forced rather than chosen: this is a `storage.kv`-plane DATA op,
  // and its reach is strictly NARROWER than `storage.set` three lines up (same grant, same owner scope, a
  // precondition added). Excluding it would leave a Tier-C surface — which does the same read-modify-write on
  // the same keys the server guest does — with no atomic write at all, which is the defect, not a limit.
  "storage.compareAndSet",
] as const satisfies readonly HostFunctionRef[];

/** One proxyable host-function reference — the `fn` field of `plugin.uiHostCall`. */
export type UiProxyableHostFunction = (typeof UI_PROXYABLE_HOST_FUNCTIONS)[number];

/** Is this client-supplied string a proxyable host function? The FIRST of the two re-gates
 *  (`fn ∈ UI_PROXYABLE`); the second is `HOST_FUNCTION_CAPABILITY[fn] ∈ the caller's own stored grant`. Both
 *  run server-side per call — the client's view of either set is display-only. */
export function isUiProxyableHostFunction(fn: string): fn is UiProxyableHostFunction {
  return (UI_PROXYABLE_HOST_FUNCTIONS as readonly string[]).includes(fn);
}
