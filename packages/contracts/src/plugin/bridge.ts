// @orb/contracts/plugin/bridge — the domain↔infra op-bridge WIRE. `infra/plugin-host` cannot import
// a domain (plugin-no-ambient) and the domain never imports `#infra`, so the shape the membrane's host functions
// call across that seam has its ONE home here in the cake — below both. `domain/plugin` BUILDS a `PluginBridge`
// (adapting `PluginHostOps` per-installer: closing global-vars over the installer, mapping worldInfo/imagery to
// the membrane's arg/result shapes) and gates the chat authority UPSTREAM; `infra/plugin-host` consumes it
// authority-blind — every function receives an ALREADY-ADMITTED `ChatId` (the domain's invocation-chat-context
// admission did the `can(installer,"read"/"host",chat)` check). Infra therefore never sees a Principal or roster.

import type { ChatId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { VariablePrecondition, VariableWriteResult } from "#chat";
import type { GenerateImageActionArgs } from "#imagery";
import type { PluginNotificationRecipient } from "#notifications";
import type {
  PluginAssetView,
  PluginCharacterView,
  PluginMessageView,
  PluginQuietOptions,
  PluginSearchHit,
  PluginWorldBookView,
  PluginWorldEntryUpsert,
  PluginWorldEntryView,
} from "./host-v1.ts";
import type { PluginSuggestedAct } from "./suggestion.ts";
import type { PluginToastLevel } from "./ui.ts";

/** Isomorphic invocation liveness crossing the contracts cake. `AbortSignal` itself is a DOM/server type and
 *  cannot live in `@orb/contracts`; infra adapts its controller to this subscription seam, and the server-side
 *  bridge re-mints an AbortSignal only at the provider door that accepts one. */
export interface PluginInvocationLiveness {
  readonly aborted: boolean;
  /** Subscribe to cancellation. If the invocation is already aborted, the listener runs synchronously. */
  readonly onAbort: (listener: () => void) => () => void;
}

/** The JSON-shaped, authority-agnostic op bridge the membrane calls. Chat-scoped fns take an admitted
 *  `ChatId`; global-vars is pre-scoped to the installer by the domain builder. Exposes the composable set:
 *  chat.read / chat.variables.write / global_vars + the two host-gated writers worldInfo + imagery (the domain
 *  builder closes each over the installer — worldInfo maps the guest entry onto the shared `upsertEntries`
 *  writer, imagery onto the `{assetId}` front door). The write ceiling (host authority) is enforced UPSTREAM in
 *  the membrane via `InvocationChat.canWrite`; the bridge only ever receives already-admitted ids. */
export interface PluginBridge {
  readonly chat: {
    readonly listMessages: (chatId: ChatId, limit: number | undefined) => Promise<readonly PluginMessageView[]>;
    readonly getVariables: (chatId: ChatId) => Promise<Record<string, string>>;
    /** The invocation chat's present CHARACTER roster (`chat.listCharacters`, chat.read — #788 F11). The membrane
     *  passes the ALREADY-ADMITTED `chatId`; the domain builder resolves the installer's viewer visibility
     *  (membership) before the read and short-circuits a non-member to `[]` (the `listMessages` viewer choke), so
     *  a plugin sees only the roster of a room it is in. Reduced to id/name/avatar — never a co-participant's full
     *  card. */
    readonly listCharacters: (chatId: ChatId) => Promise<readonly PluginCharacterView[]>;
    /** The room's variable write, with the OPTIONAL compare-and-set (#1555). The membrane parses the guest's
     *  preconditions before they reach here; the domain applies the ops only while every one still holds and
     *  answers `stale` (with the live values) otherwise, having written nothing. */
    readonly applyVariableOps: (chatId: ChatId, ops: readonly VarOp[], expect?: readonly VariablePrecondition[]) => Promise<VariableWriteResult>;
    /** Request an autonomous turn (`chat.requestTurn`, turn.trigger — SPEND). The membrane passes the
     *  ALREADY-ADMITTED `chatId` (the invocation-chat-context ran `can(installer,"host",chat)` → `canWrite`),
     *  the CHILD cascade depth to stamp (already-incremented; the domain seam refuses past the hard cap), and the
     *  guest-supplied speaker/guided hints. The FUNDER is closed over by the domain builder (the installer —
     *  NEVER infra/guest-supplied); chat's `requestTurn` resolves the funding box from the room host, gates the
     *  funder's membership (leak-free NOT_FOUND), and runs the D17 by-proxy consent + per-member budget belts —
     *  so infra stays authority-blind. */
    readonly requestTurn: (chatId: ChatId, automationDepth: number, p: { readonly speakerCharacterId?: string; readonly guided?: string }) => Promise<void>;
  };
  readonly worldInfo: {
    /** List the books ATTACHED to the invocation chat (`worldInfo.listBooks`, worldinfo.read — #788 F12). The
     *  membrane passes the ALREADY-ADMITTED `chatId`; the domain builder resolves the installer's Principal and
     *  reads world-info's own member-gated attachment front door (`listForChat`), so a non-member/kicked caller
     *  gets `[]` and a plugin sees only THIS room's lore. Reduced to `{id, name}`. */
    readonly listBooks: (chatId: ChatId) => Promise<readonly PluginWorldBookView[]>;
    /** List the entries of one attached book (`worldInfo.listEntries`, worldinfo.read — #788 F12). The membrane
     *  passes the ADMITTED `chatId` + the guest-supplied `bookId`; the domain builder gates the book on ATTACHMENT
     *  to this chat (the write path's own `isBookAttachedToChat`) before reading its entries, so a `bookId` not
     *  attached to this room — even one the installer owns in another chat — resolves to `[]`, leak-free. */
    readonly listEntries: (chatId: ChatId, bookId: string) => Promise<readonly PluginWorldEntryView[]>;
    /** Upsert one ATTACHED-book entry (`worldInfo.upsertEntry`). The entry carries its own guest-supplied
     *  `bookId`, so the ADMITTED `chatId` rides along as the domain's consent anchor: 02 §2 specifies this
     *  capability as "grant + host + book-attached-to-chat + the 64-entry cap", and only the domain can answer
     *  the last two. Without the chatId the bridge could not express the attachment gate at all — a plugin
     *  invoked in chat X could write into any book its installer owns, including books attached only to chat Y.
     *  The domain builder also resolves the installer's Principal (so a cross-owner book write is refused by
     *  the shared writer's ownership gate) and NEUTRALIZES macros in the guest content. */
    readonly upsertEntry: (chatId: ChatId, entry: PluginWorldEntryUpsert) => Promise<void>;
  };
  readonly imagery: {
    /** SPEND-classed generation (`imagery.generatePicture`); returns the primary image's asset id. The
     *  domain builder closes over the installer for connection + spend attribution. */
    // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, branded only after the host parses it; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    readonly generatePicture: (chatId: ChatId, args: GenerateImageActionArgs) => Promise<{ readonly assetId: string }>;
  };
  readonly variables: {
    readonly get: (key: string) => Promise<string | null>;
    readonly set: (key: string, value: string) => Promise<void>;
    readonly delete: (key: string) => Promise<void>;
  };
  /** Read one asset from the installer's OWN CAS (`assets.read`, assets.read — #788 seam-11 read half). The
   *  membrane passes ONLY the guest-supplied `assetId`; the domain builder closes the INSTALLER over the op and
   *  reads through the assets domain's OWNER-GATED front door (`readOwnedAssetBytes`), so a guest names an id but
   *  can only ever read its own. A foreign/absent id is the leak-free `null` (indistinguishable — no existence
   *  oracle), and an owned asset over the read cap returns metadata with `dataBase64: null`. Authority-agnostic
   *  like every bridge op — infra holds no principal or CAS. */
  readonly assets: {
    // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — an untrusted guest's JSON string, owner-scope-gated by the domain read, never branded here. Ends if the bridge starts parsing to brands at the membrane.
    readonly read: (assetId: string) => Promise<PluginAssetView | null>;
    /** Write ALREADY-FETCHED-AND-VALIDATED image bytes into the installer's OWN CAS and return the assetId
     *  (`net.fetchAsset`, capability `net.fetch_asset` — plugin-remote-image #798). Infra PERFORMS the fetch +
     *  the SSRF egress wall + the remote-image guard (all live in `infra/network`, which a domain may not
     *  import), then hands the domain ONLY the validated bytes + the SNIFFED mime (never the remote
     *  Content-Type); the domain builder closes the INSTALLER over the store so the asset lands owner-scoped (a
     *  guest names no owner). The bytes cross the infra→domain seam but NEVER the guest realm — the guest
     *  receives an assetId string only. Authority-agnostic like every bridge op — infra holds no principal. */
    // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — a host-minted id for the installer's own new asset; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    readonly storeFetched: (bytes: Uint8Array, mime: string) => Promise<{ readonly assetId: string }>;
  };
  /** Semantic document search over the installer's OWN indexed corpus (`search.documents`, search.query — #788
   *  F1). The membrane passes ONLY the guest-supplied query text + the (host-clamped) limit; the domain builder
   *  closes the INSTALLER's ownerId over the search scope, so a guest searches no other owner's library. Returns
   *  ranked reduced hits. Authority-agnostic like every bridge op — infra holds no principal. */
  readonly search: {
    readonly documents: (queryText: string, limit: number | undefined) => Promise<readonly PluginSearchHit[]>;
  };
  /** The plugin-PRIVATE KV (`storage.*`). Distinct from `variables` (the installing USER's namespace,
   *  shared with macros/CEL): `storage` is per plugin × installing owner (the `plugin_kv` plane). The domain
   *  builder closes each op over the concrete `pluginId` + installer, so a cross-plugin (or cross-owner) read is
   *  structurally impossible — the guest supplies ONLY the key/prefix. The value/key-size + 256-key caps are
   *  enforced host-side by the domain op. */
  readonly storage: {
    readonly get: (key: string) => Promise<string | null>;
    readonly set: (key: string, value: string) => Promise<void>;
    readonly delete: (key: string) => Promise<void>;
    readonly list: (prefix: string | undefined) => Promise<readonly string[]>;
    /** The ATOMIC write (#1442): apply `next` only while the key still holds `expected` (`null` = absent).
     *  ONE statement at the persistence layer — the predicate rides the write, so nothing can interleave —
     *  which is the only thing a guest can build a lost-update-free counter on. `current` is the post-state
     *  value (advisory on a refusal: the caller's next `expected`). */
    readonly compareAndSet: (key: string, expected: string | null, next: string) => Promise<{ applied: boolean; current: string | null }>;
  };
  /** Post a durable `automation-notice` to the chat's PARTICIPANTS (`notifications.post`). The membrane passes
   *  the ALREADY-ADMITTED `chatId` + the guest recipient
   *  selector + the (host-capped) message; the domain builder closes over the `pluginId` (the notice source) +
   *  installer, resolves the recipient set DOMAIN-side (host = the installer; all_members = the present human
   *  roster — a plugin can never notify a non-participant), and emits through the SAME durable inbox path a
   *  `post_notification` arm uses. The selector is the PLUGIN SUBSET of the recipient axis — the
   *  actor-excluding member needs a triggering fact this call does not have
   *  (`PLUGIN_NOTIFICATION_RECIPIENTS`). */
  readonly notifications: {
    readonly post: (chatId: ChatId, recipient: PluginNotificationRecipient, message: string) => Promise<void>;
  };
  /** ONE bounded non-canon generation on the INSTALLER's own resolved `summarize`-role connection
   *  (`llm.quiet`, SPEND). The domain builder closes the installer over it — a guest supplies ONLY the prompt
   *  text and can never name a funder, a connection, a model, or a chat. It also claims the plugin's HOURLY
   *  quiet-call floor before spending (the check-and-claim is inside the builder, before the first await, for
   *  the same reason the notify floor's is: the membrane admits up to 32 concurrent host calls per instance,
   *  so a check that awaited before recording would let a burst straight through the gap). Returns raw text;
   *  the guest never sees cost (cost VISIBILITY rides the stats domain off the generation itself). */
  readonly llm: {
    /** `opts` is the U6 widening (plugin-ui-plane §5.16/§5.32) travelling as inert JSON-safe data: a RAW
     *  structured-output schema the DOMAIN lifts + projects (a guest can never hand a wire an unprojected
     *  schema — D79) and asset ids the DOMAIN resolves to bytes under the INSTALLER's own ownership gate.
     *  Infra performs neither resolution: it holds no principal and no CAS, which is exactly why both arms
     *  cross as ids/blobs rather than as anything live. */
    readonly quiet: (prompt: string, opts: PluginQuietOptions | undefined, liveness: PluginInvocationLiveness) => Promise<{ readonly text: string }>;
  };
  /** POSTURE 2 — stash `act` as a SUGGESTION for the ADMITTED chat's host to confirm, instead of performing
   *  it. Called by the membrane on exactly the arm that used to be a flat refusal: the installer holds the
   *  grant but not host authority on this chat (`InvocationChat.canWrite === false`).
   *
   *  THE MEMBRANE STAYS AUTHORITY-BLIND. It decides "no standing authority" from the `canWrite` the DOMAIN
   *  already resolved and hands the act down; it does not mint an id, render the question, know the plugin's
   *  name, or touch the S4 store — all of which are domain state it holds none of. The domain builder closes
   *  the plugin identity + installer over this, so a guest can no more name whose ask this is than it can
   *  name a funder.
   *
   *  It resolves when the ASK IS STORED, never when the act happens — the membrane converts that into the
   *  typed `PluginSuggestedError` the guest sees, because "your act became a question" is a different
   *  outcome from both "done" and "refused" and a guest that cannot tell them apart will do the wrong next
   *  thing. It REJECTS only if the ask itself could not be raised. */
  readonly suggest: (chatId: ChatId, act: PluginSuggestedAct) => Promise<void>;
  /** CHECK-AND-CLAIM one `net.fetch` egress slot for this plugin's hourly floor; THROWS when the plugin is
   *  over its ceiling. Synchronous and atomic for the same reason `NotifyFloor.admit` is.
   *
   *  WHY THE ADMISSION IS A BRIDGE MEMBER WHILE THE FETCH IS NOT: `safeFetch` is the audited SSRF guard and it
   *  lives in `infra/network` — a domain may not import it, so infra must keep PERFORMING the fetch. But the
   *  belt is per-INSTALLED-PLUGIN state, which infra cannot key (it holds no `pluginId` and is authority-blind
   *  by construction). So the domain hands the admission down as a closure, exactly as it hands `netHosts`
   *  down as data, and infra calls it without knowing whose budget it just spent.
   *
   *  WHAT IT CLOSES (the D46 review's tracked finding, 2026-08-24 §8): `safeFetch`
   *  bounds each REQUEST — deadline, byte cap, redirect budget — and the manifest bounds the target SET, but
   *  nothing bounded the RATE. A plugin subscribing to `messageCommitted` egresses once per committed message,
   *  forever; the ≤32-in-flight cap is a concurrency bound and says nothing about how many calls per hour.
   *  The belt is on the RESOURCE (egress), not on the amplifier (event delivery): a delivery-side belt would
   *  miss the identical egress reachable from a tool handler or a D50 transform, while throttling legitimate
   *  non-egress work. */
  readonly admitEgress: () => void;
  /** CHECK-AND-CLAIM one `net.fetchAsset` slot for this plugin's OWN hourly floor (#801 — the belt split).
   *  The asset arm rode `admitEgress` when #798 landed; it moved to its own belt because the two channels
   *  price differently: `net.fetch` carries a POST body OUT (the D46 exfil channel the tight ceiling is
   *  for), while `fetchAsset` is GET-only to the manifest allowlist and its product lands in the
   *  installer's OWN CAS — its honest cost is an art GRID's (a fresh browse page is ~30 covers), which a
   *  belt priced for text egress starved. Same closure mechanics as `admitEgress`; THROWS over ceiling. */
  readonly admitAssetEgress: () => void;
  /** Surface transient quick-reply chips into the admitted chat (`surfaceQuickReply`; the automation-bus
   *  `quickReplySurfaced` event). Host-authority gated UPSTREAM in the membrane (same write ceiling as
   *  the plugin's other chat writes) via `InvocationChat.canWrite`. The domain builder closes over the `pluginId`
   *  (stamped as the emit `source`) + the injected bus sink (`publishAutomationEvent`, composed UP — infra never
   *  imports transport). Transient (no row): the chips are ephemeral display strings. */
  readonly surfaceQuickReply: (chatId: ChatId, choices: readonly { readonly label: string; readonly sendText: string }[]) => Promise<void>;
  /** Publish a UI surface's STATE (`host.ui.setState`, capability ui.surface — plugin-ui-plane #679 U1). The
   *  membrane passes the guest-named `surfaceId` + the whole replacement state as JSON-safe data; the domain
   *  builder closes over the `pluginId` + installer, writes the per-`(pluginId, surfaceId)` in-memory state row
   *  (the S4-suggestion-store precedent — respawn wipes; durable state is the plugin's own `storage.kv` job) and
   *  emits the per-user freshness poke (`pluginSurfaceStateChanged`) so the installer's own client refetches.
   *
   *  `chatId` is the ROOM DIMENSION (row 777): `null` ⇒ the plugin-wide row every room shares; a chat id ⇒ the
   *  per-room row a room-anchored surface reads. It arrives ALREADY ADMITTED, like every other chat-scoped
   *  bridge op — the membrane resolved the guest's opaque `ChatHandle` against the invocation's one admitted
   *  token before calling, so infra stays authority-blind and a guest can never name a room it was not admitted
   *  to. Authority-agnostic like every bridge op — infra holds no pluginId or Principal. */
  readonly ui: {
    readonly setState: (surfaceId: string, state: Record<string, unknown>, chatId: ChatId | null) => Promise<void>;
    /** Stash a host-mediated TOAST for this plugin (`host.ui.toast`, U5 §4.5a). The domain builder closes over
     *  the `pluginId` + the plugin's DISPLAY NAME (the attribution prefix — a guest can no more name whose toast
     *  this is than it can name a funder) and applies the per-plugin rate floor + the length cap before the item
     *  reaches the bounded outbox. THROWS when the floor refuses, so a flooding guest is told rather than
     *  silently swallowed. Infra stays authority-blind: it holds no pluginId, no name, and no outbox. */
    readonly toast: (level: PluginToastLevel, message: string) => Promise<void>;
    /** Stash an OPEN-DIALOG ask for one of this plugin's own registered `dialog` surfaces (`host.ui.openDialog`,
     *  U5 §4.5a). Resolves when the ask is recorded; the DOMAIN resolves the id against the resident instance
     *  when the outbox drains onto a client round-trip, so an id naming no registered dialog costs nothing and a
     *  cross-plugin open is not expressible (the outbox is keyed by the plugin the guest is). */
    readonly openDialog: (surfaceId: string) => Promise<void>;
  };
  /** Ingest a text document into the installer's OWN databank (`host.databank.ingest`, capability
   *  `databank.ingest` — plugin-ui-plane #679 U8 seam 15). The domain builder closes the INSTALLER over the op
   *  (owner-scoped by construction — a guest names only the document), writes canon through databank's
   *  `createFromText` and returns the new document id. NO chat scope + NO host authority, the `storage`/`llm`
   *  posture: a library write is the installer's own reach, not room state. Authority-agnostic like every bridge
   *  op — infra holds no principal. */
  readonly databank: {
    // @orb-waive brand-in-name-position(documentId): the plugin SANDBOX wire DTO — a host-minted id for the installer's own new document; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    readonly ingest: (doc: { readonly name: string; readonly text: string }) => Promise<{ readonly documentId: string }>;
  };
  /** Ingest a V2/V3 character card object into the installer's OWN library (`host.character.ingest`, capability
   *  `character.ingest` — plugin-ui-plane #679 U8 seam 17). The domain builder closes the installer over the op,
   *  serializes the guest card to JSON bytes and runs the SAME `importCharacter` funnel a file upload takes (the
   *  ContentChanged-emitting path — the indexer auto-runs), returning the new character id + whether it was
   *  freshly created (a byte-identical re-ingest deduplicates). Same owner-scoped, no-chat, no-host posture as
   *  `databank.ingest`. */
  readonly character: {
    // @orb-waive brand-in-name-position(characterId): the plugin SANDBOX wire DTO — a host-minted id for the installer's own new character; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    readonly ingest: (card: Record<string, unknown>) => Promise<{ readonly characterId: string; readonly created: boolean }>;
    /** Ingest a character from a PNG ASSET in the installer's OWN CAS (`host.character.ingestAsset`, capability
     *  `character.ingest` — plugin-remote-image #798). The membrane passes ONLY the guest-supplied `assetId`;
     *  the domain builder closes the installer over the op, reads the PNG bytes through the assets domain's
     *  OWNER-GATED front door (a foreign/absent id rejects leak-free), and runs the SAME `importCharacter` funnel
     *  a file upload takes — which parses the card chunk AND CAS-stores the embedded avatar, so the character
     *  arrives WITH its art. Same owner-scoped, no-chat, no-host posture as `ingest`; rides its SAME grant (the
     *  reach is identical, only the input form differs). Returns the new character id + whether it was freshly
     *  created (a byte-identical re-ingest deduplicates by importHash). */
    // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — an untrusted guest's JSON string naming an asset in the installer's OWN CAS, owner-scope-gated by the domain read, never branded here. Ends if the bridge starts parsing to brands at the membrane.
    // @orb-waive brand-in-name-position(characterId): the plugin SANDBOX wire DTO — a host-minted id for the installer's own new character; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    readonly ingestAsset: (assetId: string) => Promise<{ readonly characterId: string; readonly created: boolean }>;
    /** Store this plugin's per-card state under `data.extensions.plugin_<slug>` on one of the installer's OWN
     *  characters (`host.character.setCardData`, capability `character.card_state` — D148). The membrane passes
     *  ONLY the guest-supplied `characterId` + inert `data`; the domain builder closes over the INSTALLER (the
     *  owner-scope predicate) AND the emitter's own un-forgeable manifest SLUG (the `pubsub.emit` precedent — a
     *  guest names no slug, so it can target only its own key on the character), derives the reserved
     *  `plugin_<slug>` key and MERGES it into the character's residual `extensions` touching that one key only. A
     *  `characterId` the installer does not own writes nothing and rejects leak-free (the `PluginNotFoundError`
     *  posture). METADATA, not content: the write does NOT bump `contentHash` or re-index the character (D148
     *  clause d). NO chat scope, NO host authority (the `storage.kv` posture). Authority-agnostic like every
     *  bridge op — infra holds no pluginId, slug, or Principal. */
    // @orb-waive brand-in-name-position(characterId): the plugin SANDBOX wire DTO — an untrusted guest's JSON string, owner-scope-gated by the persistence predicate, never branded here. Ends if the bridge starts parsing to brands at the membrane.
    readonly setCardData: (characterId: string, data: Record<string, unknown>) => Promise<void>;
    /** Read back this plugin's per-card state (`data.extensions.plugin_<slug>`) from one of the installer's OWN
     *  characters (`host.character.getCardData`, capability `character.card_state`). Same installer-owner-scope +
     *  host-stamped-slug walls as {@link setCardData}: a foreign/absent character rejects leak-free, and the read
     *  targets only this plugin's own key. Returns the stored blob or `null` when none is stored on that owned
     *  character. */
    // @orb-waive brand-in-name-position(characterId): the plugin SANDBOX wire DTO — an untrusted guest's JSON string, owner-scope-gated by the persistence predicate, never branded here. Ends if the bridge starts parsing to brands at the membrane.
    readonly getCardData: (characterId: string) => Promise<Record<string, unknown> | null>;
  };
  /** Publish a PRIVATE plugin event (`host.pubsub.emit`, capability `plugin_events` — plugin-ui-plane §5a). The
   *  domain builder closes over the INSTALLER + the emitter's own manifest SLUG (both un-forgeable — a guest
   *  supplies only `name` + `data`), and the op publishes on the installer-scoped resident plugin-event bus. It
   *  NEVER touches a domain/chat bus and the delivered payload is `{name, data}`, never a `TriggerFact` — the
   *  forgery wall. `on` is NOT a bridge op: a subscription is a RESIDENT registration collected at the membrane
   *  and wired through the registrar (the `events.on` pattern), not a runtime call. Authority-agnostic like every
   *  bridge op — infra holds no pluginId, slug, or Principal. */
  readonly pubsub: {
    readonly emit: (name: string, data: Record<string, unknown>) => Promise<void>;
  };
}

/** The admitted invocation chat + whether the acting principal is HOST of it (the write ceiling:
 *  variables.write / worldinfo.write / imagery.generate are host-gated). The domain sets it per-invocation
 *  (fixed for a snippet's single run; re-set before each resident tool handler call). `null` = no chat scope
 *  (an installed plugin's `activate` run — `chat.current()` throws). */
export interface InvocationChat {
  readonly chatId: ChatId;
  readonly canWrite: boolean;
  /** The cascade depth of the CONTEXT this invocation runs in (the loop-prevention lever; mirrors
   *  requestTurn's `automationDepth` param, the `messages.automationDepth` column, and the fact's
   *  depth). A resident TOOL handler in a human turn = 0 (the human turn is the cascade root); an EVENT handler
   *  = the resolved depth of the turn that triggered the fact. A guest `chat.requestTurn` stamps `+1` at the
   *  membrane boundary — requestTurn refuses a child depth past the hard cap, so a plugin can never launder an
   *  event→turn→event loop past the ceiling. */
  readonly automationDepth: number;
}
