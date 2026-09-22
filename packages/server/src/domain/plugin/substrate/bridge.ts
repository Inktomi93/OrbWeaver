// domain/plugin/substrate/bridge — build the `PluginBridge` the membrane's host functions call (P4b-CORE),
// PER INSTALLER. The composed `PluginHostOps` chat writes are chat-id-keyed and principal-free (the DOMAIN is
// their authority gate — the invocation-chat-context admission ran `can(installer,…)` before any chat reaches
// here); global-vars is the ONE installer-scoped op, closed over the installer's `UserId` so a cross-user KV
// read is structurally impossible (fetchOwned under the installer, 02 §4). Pure of DB/Principal — testable
// with fake ops.
//
// THE ONE VIEWER-VISIBILITY CHOKE for guest canon reads. Every admission path that can put a chat in a guest's
// scope resolves MEMBERSHIP ONLY — `resolveChatAuthority` (runSnippet), `resolveInvocationChat` (a plugin
// tool's PL-C ceiling), and the `events.on` per-delivery `loadPresentRole` — and membership is not visibility:
// a `from-join`-clamped member is legitimately admitted to a room whose pre-join canon they may not read. All
// three funnel through THIS bridge, so the D16 floor is resolved here, once, via chat's
// `resolveViewerVisibility` op (membership AND floor as one value; `null` ⇒ the guest sees nothing) and pushed
// into the read as a REQUIRED param. Reading canon without it is not expressible in `PluginHostOps`.
//
// THE LORE-WRITE GATES (02 §2: "grant + host + book-attached-to-chat + the 64-entry cap"). The membrane owns
// the first two; the last two — plus macro NEUTRALIZATION — are this file's, because only the domain has the db
// and the shared writer. The neutralization is not hygiene: world-info content is macro-rendered at ASSEMBLY
// with the full registry against the assembling chat's live context, and that render MUTATES (`{{setvar}}` →
// a VarOp on the op-log → `foldVarOps` → durable chat state). Storing raw guest text therefore turns a
// `worldinfo.write` grant into a DELAYED `chat.variables.write` in every chat the book is attached to — a
// capability bypass by deferral, reaching rooms this invocation was never admitted to. The automation arm is
// the contrast that proves the shape: it RENDERS its template at write time, so its stored row holds no live
// macro either.
//
// LOOP SAFETY (the per-plugin $/action spend ceiling was stripped for enterprise spend enforcement):
// a runaway plugin's autonomous turns stay bounded by the cascade-depth guard resolved inside chat's
// `requestTurn`; its images are clamped n≤4 + the membrane's ≤32 concurrent-host-call cap. Cost visibility
// rides the host-funded chat writes and the stats domain.
//
// THE BELTS THIS FILE CLAIMS, and why they are claimed HERE rather than at the membrane. Three capabilities
// have a bound that no per-call check can express — `notify` (a durable row per member, per call), `net.fetch`
// (unbounded egress rate) and `llm.quiet` (unbounded spend rate). Each ceiling is per INSTALLED PLUGIN, and
// the membrane is authority-blind by construction: it holds no `pluginId` and no principal, so it cannot key
// any of them. The bridge is the first place that knows whose call this is, so the claim lives here, always
// BEFORE the first `await` — the membrane admits up to 32 concurrent host calls per instance, and a
// check-then-await-then-record would let a burst of 32 all observe the pre-burst count and pass.

import type { PluginBridge, PluginCharacterView, PluginMessageView, PluginWorldBookView, PluginWorldEntryView } from "@orb/contracts/plugin";
import type { PluginId, UserId, WorldBookId } from "@orb/kit/ids";
import { neutralizeMacros } from "@orb/kit/macro";
import type { PluginBelts, PluginHostOps, PluginIdentity } from "../contract/ops.ts";

/** The per-plugin ≤64-entries-per-book ceiling — the plugin mirror of automation's `RULE_MAX_ENTRIES_PER_BOOK`
 *  (a looping inserter fills a book otherwise). Counted over the plugin's OWN title namespace, so one plugin's
 *  entries never consume another's budget and a human's entries are never counted or clobbered. */
const PLUGIN_MAX_ENTRIES_PER_BOOK = 64;

/** The title prefix a plugin's lore entries live under — the idempotency + cap key, mirroring the rule path's
 *  `auto/<ruleId>:`. A transient snippet has no pluginId and no `worldinfo.write` grant, so `null` cannot
 *  reach here through the capability gate; it is spelled defensively rather than silently sharing a namespace. */
function pluginEntryPrefix(pluginId: PluginId | null): string {
  return `plugin/${pluginId ?? "unknown"}:`;
}

function pluginEntryTitle(pluginId: PluginId | null, entryKey: string): string {
  return `${pluginEntryPrefix(pluginId)}${entryKey}`;
}

/** Adapt the injected `PluginHostOps` into the membrane's `PluginBridge` for one installing user. `listMessages`
 *  is clamped to the installer's own viewer visibility (see the file header); the other chat ops
 *  pass through; the global-vars ops close over `installerUserId`;
 *  worldInfo + imagery close over the installer for the ownership attribution the shared writers gate on.
 *  worldInfo maps the guest `PluginWorldEntryUpsert` onto the shared `UpsertLoreEntryInput` writer
 *  (`entryKey`→`title`, `contentTemplate`→`content`; the guest's `position` hint has no target in the shared
 *  writer and is dropped); imagery forwards the action args + admitted chat to the front door and hands the guest
 *  ONLY `{assetId}` (cost never crosses the realm boundary). */
export function buildPluginBridge(ops: PluginHostOps, installerUserId: UserId, plugin: PluginIdentity | null, belts: PluginBelts): PluginBridge {
  // The plugin-scoped ops (storage / notify / quick_reply / llm.quiet / the net.fetch egress claim) are keyed
  // by a PERSISTENT pluginId — a transient snippet has none (`null`). Its fixed grant profile omits every one
  // of those capabilities, so the membrane's capability gate never reaches these closures on the snippet path;
  // a `null` here throws only if the membrane ever DID reach them (a defensive contradiction of the grant
  // profile, never a live path). For the two BELTED capabilities the requirement is stronger than plumbing:
  // an hourly ceiling has to be keyed to something durable, and an anonymous one-shot has no identity to bill
  // or to bound — so "no pluginId" and "may not egress or spend" are the same fact, not two.
  const pluginId = plugin?.id ?? null;
  const requirePluginId = (fn: string): PluginId => {
    if (plugin === null) {
      throw new Error(`plugin host: ${fn} requires an installed plugin (unavailable to a transient snippet)`);
    }
    return plugin.id;
  };
  /** The identity form — for the one op that needs the plugin's NAME too (`ui.toast`'s attribution prefix). */
  const requirePlugin = (fn: string): PluginIdentity => {
    if (plugin === null) {
      throw new Error(`plugin host: ${fn} requires an installed plugin (unavailable to a transient snippet)`);
    }
    return plugin;
  };
  return {
    chat: {
      // VIEWER CLAMP (the read-visibility D-entry): resolve the INSTALLER's membership + D16 history floor as
      // ONE answer before any canon crosses the realm boundary. `null` (not a present member — a chat that
      // raced a kick/leave between admission and this call) ⇒ `[]`, never a partial read. Otherwise the floor
      // rides into the read as a required param, so the SQL — not a post-filter — withholds pre-join rows and
      // the `limit` still returns a full page of what this human may actually see.
      listMessages: async (chatId, limit): Promise<readonly PluginMessageView[]> => {
        const visibility = await ops.chat.resolveViewerVisibility(chatId, installerUserId);
        if (visibility === null) {
          return [];
        }
        // The §3.6 / D106 hidden-content verdict rides the SAME visibility answer as the D16 floor (chat DERIVES
        // it via its ONE `viewerReadsHidden` home — the bridge never re-derives `role === "host"`). Threaded as a
        // required param (like `floorSeq`) so the read site — not a post-filter — owns the predicate; a non-host
        // member's snippet has hidden `<lie>`/`<ofilter>` spans stripped before the body crosses the realm boundary.
        return await ops.chat.listMessages(chatId, {
          ...(limit === undefined ? {} : { limit }),
          floorSeq: visibility.historyFloorSeq,
          readsHidden: visibility.readsHidden,
        });
      },
      getVariables: (chatId) => ops.chat.getVariables(chatId),
      // THE ROSTER READ (#788 F11) — the SAME viewer choke `listMessages` uses. Resolve the installer's
      // membership FIRST; a non-member (a chat that raced a kick/leave between admission and this call) ⇒ `[]`,
      // never a read of a room the caller is no longer in. Membership confirmed, the read is the room's own
      // present character seats (reduced to id/name/avatar) — the room's member-visible state, so no owner filter
      // is needed past membership. The op is principal-free (`loadPluginCharacters`); this file owns the gate.
      listCharacters: async (chatId): Promise<readonly PluginCharacterView[]> => {
        const visibility = await ops.chat.resolveViewerVisibility(chatId, installerUserId);
        if (visibility === null) {
          return [];
        }
        return await ops.chat.listCharacters(chatId);
      },
      applyVariableOps: (chatId, varOps, expect) => ops.chat.applyVariableOps(chatId, varOps, expect),
      // The initiator is closed over the installer (never infra/guest-supplied) — the membrane passes only the
      // admitted chatId + child depth + guest speaker/guided hints; `initiator:"plugin"`, initiator membership,
      // frozen host funding, and the cascade-depth guard are resolved inside chat's `requestTurn`.
      requestTurn: (chatId, automationDepth, p): Promise<void> =>
        ops.chat.requestTurn({
          triggeredBy: installerUserId,
          chatId,
          automationDepth,
          ...(p.speakerCharacterId !== undefined ? { speakerCharacterId: p.speakerCharacterId } : {}),
          ...(p.guided !== undefined ? { guided: p.guided } : {}),
        }),
    },
    worldInfo: {
      // THE LORE READ (#788 F12) — the read symmetry of the write below, owner-scoped + attachment-gated the
      // SAME way. `listBooks` reads world-info's own MEMBER-gated `listForChat` under the installer, so a
      // non-member gets `[]` and only books attached to THIS room are named.
      listBooks: (chatId): Promise<readonly PluginWorldBookView[]> => ops.worldInfo.listBooksForChat(installerUserId, chatId),
      // `listEntries` meets the SAME attachment gate the WRITE does (the room's consent to a book's content),
      // BEFORE any entry crosses the realm boundary: a guest-named `bookId` not attached to this chat — even one
      // the installer owns in another room — resolves to `[]`, leak-free (indistinguishable from an empty book,
      // no existence oracle for another room's/owner's lore). Only past the attachment gate is the owner-gated
      // entry read reached.
      listEntries: async (chatId, bookId): Promise<readonly PluginWorldEntryView[]> => {
        const id = bookId as WorldBookId;
        if (!(await ops.worldInfo.isBookAttachedToChat(installerUserId, chatId, id))) {
          return [];
        }
        return await ops.worldInfo.listEntries(installerUserId, id);
      },
      // THE PLUGIN LORE WRITE — three domain gates the membrane cannot express (it holds no db), in the order
      // a hostile guest meets them. See the file header for why each exists.
      upsertEntry: async (chatId, entry): Promise<void> => {
        const bookId = entry.bookId as WorldBookId;
        // (1) ATTACHMENT = the room's consent. The bookId is GUEST-SUPPLIED and the shared writer only checks
        // OWNERSHIP, so without this a plugin invoked in chat X writes any book its installer owns — including
        // one attached solely to chat Y, a room this invocation was never admitted to.
        if (!(await ops.worldInfo.isBookAttachedToChat(installerUserId, chatId, bookId))) {
          throw new Error("plugin host: worldInfo.upsertEntry requires the book to be attached to this chat");
        }
        // (2) The per-plugin TITLE NAMESPACE + entry CEILING, keyed the way the automation arm keys its own
        // (`auto/<ruleId>:<entryKey>`). The namespace does two jobs: a re-upsert of the same entryKey updates
        // THIS plugin's own entry (idempotency) instead of clobbering a same-titled entry the human wrote, and
        // it makes "how many entries does this plugin own here" answerable — which is what the cap counts.
        const title = pluginEntryTitle(pluginId, entry.entryKey);
        const owned = (await ops.worldInfo.listEntryTitles(installerUserId, bookId)).filter((t) => t.startsWith(pluginEntryPrefix(pluginId)));
        if (!owned.includes(title) && owned.length >= PLUGIN_MAX_ENTRIES_PER_BOOK) {
          throw new Error(`plugin host: this plugin already owns ${PLUGIN_MAX_ENTRIES_PER_BOOK} entries in book ${bookId}`);
        }
        await ops.worldInfo.upsertEntries({
          authorUserId: installerUserId,
          bookId,
          entries: [
            {
              title,
              keys: entry.keys,
              // (3) NEUTRALIZE. The stored row is macro-rendered LATER, at assembly, with the FULL registry and
              // the assembling chat's live context — and that render MUTATES: `{{setvar}}` pushes a VarOp onto
              // the op-log, which `foldVarOps` replays into durable chat state. So raw guest text here is a
              // `chat.variables.write` the plugin was never granted, executed by deferral in every chat the
              // book is attached to. The house primitive (the same one the automation model→lore route and
              // `user-macros` use) makes the braces inert while the text still reads identically to a human.
              content: neutralizeMacros(entry.contentTemplate),
            },
          ],
        });
      },
    },
    imagery: {
      // Forward to the front door and hand the guest ONLY `{assetId}` (cost never crosses the realm boundary;
      // cost VISIBILITY rides the stats domain off the imagery write itself).
      // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, branded only after the host parses it; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
      generatePicture: (chatId, args): Promise<{ readonly assetId: string }> => ops.imagery.generatePicture({ authorUserId: installerUserId, chatId, args }),
    },
    variables: {
      get: (key) => ops.variables.get(installerUserId, key),
      set: (key, value) => ops.variables.set(installerUserId, key, value),
      delete: (key) => ops.variables.delete(installerUserId, key),
    },
    // THE CAS ASSET READ (#788 seam-11 read half). Closed over the INSTALLER only — a guest names an id and can
    // name no owner, so a cross-owner read is structurally impossible (the `variables`/`storage` pattern). The
    // compose op reads through the assets domain's OWNER-GATED front door and collapses a foreign/absent id to
    // the leak-free `null`; NO `requirePluginId` (the read keys nothing on the pluginId — it is the installer's
    // own reach, the `databank`/`variables` posture). The capability gate is the membrane-tier wall.
    assets: {
      read: (assetId) => ops.assets.read({ installerUserId, assetId }),
      // #798 — the `net.fetch_asset` CAS write. Closed over the INSTALLER only (a guest names no owner), the
      // `read`/`variables`/`databank` owner-closure. Infra performed the fetch + SSRF wall + remote-image guard
      // and hands ONLY validated bytes + the sniffed mime; the bytes cross THIS seam, never the guest realm.
      // `requirePluginId` HERE (unlike `read`) because the write is RECORDED against the plugin — the #802
      // `plugin_assets` link is what makes the fetched blob visible to the asset-GC ref registry, and its
      // retention unit is the install. It adds no refusal a live path can reach: this same call already claimed
      // `admitAssetEgress` above, which requires the identical durable identity (and a snippet holds neither the
      // capability nor an id).
      storeFetched: (bytes, mime) => ops.assets.storeFetched({ pluginId: requirePluginId("net.fetchAsset"), installerUserId, bytes, mime }),
    },
    // FIRST-PARTY RETRIEVAL (#788 F1). Closed over the INSTALLER only — the guest supplies the query text + the
    // (already host-clamped) limit and can name no owner, so the compose op's `scope: { ownerId: installer }`
    // makes a cross-owner search structurally impossible (the `assets`/`databank` owner-closure pattern). NO
    // `requirePluginId`: the read keys nothing on the pluginId — it is the installer's own library reach.
    search: {
      documents: (queryText, limit) => ops.search.documents({ installerUserId, queryText, ...(limit !== undefined ? { limit } : {}) }),
    },
    // Plugin-PRIVATE KV — closed over BOTH the pluginId AND the installer (owner), so a cross-plugin OR
    // cross-owner read is structurally impossible: the guest names only the key/prefix, never a scope.
    storage: {
      get: (key) => ops.storage.get(requirePluginId("storage.get"), installerUserId, key),
      set: (key, value) => ops.storage.set(requirePluginId("storage.set"), installerUserId, key, value),
      compareAndSet: (key, expected, next) => ops.storage.compareAndSet(requirePluginId("storage.compareAndSet"), installerUserId, { key, expected, next }),
      delete: (key) => ops.storage.delete(requirePluginId("storage.delete"), installerUserId, key),
      list: (prefix) => ops.storage.list(requirePluginId("storage.list"), installerUserId, prefix),
    },
    // Durable participant notice — the recipient set is resolved DOMAIN-side (host = installer; all_members = the
    // present human roster of the ADMITTED chat), so a plugin can never notify a non-participant. The notice
    // source stamps THIS plugin (never a synthetic rule).
    notifications: {
      // `async` so a refusal is a REJECTED PROMISE, never a synchronous throw out of a `Promise`-typed op —
      // every other membrane refusal (capability / handle / host-authority) reaches the guest as a rejection,
      // and a caller awaiting this one must not need a try/catch instead of `.catch`.
      post: async (chatId, recipient, message): Promise<void> => {
        const id = requirePluginId("notifications.post");
        // THE 60 s FLOOR (02 §2). Claimed BEFORE the first await, so the check-and-record is atomic against
        // the ≤32 concurrent host calls the membrane admits — a check that awaited before recording would let
        // a burst through the gap.
        belts.notify.admit(id, chatId);
        await ops.notifications.post({ pluginId: id, installerUserId, chatId, recipient, message });
      },
    },
    // THE QUIET GENERATION (`llm.quiet`, SPEND). The guest supplies ONLY the prompt; the installer — and so the
    // credential, the connection and the spend attribution — is closed over here and can never be named by the
    // guest, the same posture `requestTurn`'s funder takes. The HOURLY floor is claimed BEFORE the first await,
    // for the same reason the notify floor's is: the membrane admits up to 32 concurrent host calls per
    // instance, so a claim that awaited first would let a burst straight through the gap. `async` so the
    // refusal reaches the guest as a REJECTED promise, matching every other membrane refusal.
    llm: {
      // The U6 widening rides the SAME op and the SAME floor (plugin-ui-plane §5.16/§5.32 / interaction-spec
      // §3-S5.1's "widen the declared-generic quiet op, never add a second quiet path"): `opts` is the guest's
      // raw structured-schema + asset-id bag, forwarded verbatim. The lift/projection and the CAS ownership
      // resolve happen at COMPOSE, which is the only tier holding the projection rule and the asset reader —
      // this substrate stays a pure closer-over-the-installer, exactly as it was.
      quiet: async (prompt, opts, liveness): Promise<{ readonly text: string }> => {
        const id = requirePluginId("llm.quiet");
        belts.quietLlm.admit(id);
        const controller = new AbortController();
        const unsubscribe = liveness.onAbort(() => controller.abort());
        try {
          return await ops.llm.quiet({ installerUserId, prompt, signal: controller.signal, ...(opts !== undefined ? { opts } : {}) });
        } finally {
          unsubscribe();
        }
      },
    },
    // POSTURE 2 — stash the act as an ask instead of performing it. The membrane calls this on exactly the
    // arm that used to be a flat refusal (grant held, host authority absent) and converts the resolution into
    // the guest-facing `PluginSuggestedError`. The plugin IDENTITY and the INSTALLER are closed over here, so
    // a guest can no more name whose ask this is than it can name a funder — it supplies the act and nothing
    // else. `async` so a raise failure reaches the guest as a rejection like every other membrane refusal.
    suggest: async (chatId, act): Promise<void> => {
      const id = requirePluginId("suggest");
      // The name is DERIVED from the re-validated manifest at activation (never guest-supplied) and is what
      // makes the host's card say WHO is asking — a plugin ask is the one card class whose requester is not
      // a rule the host wrote themselves.
      ops.suggestions.raise({ plugin: { id, name: plugin?.name ?? "", slug: plugin?.slug ?? "" }, installerUserId, chatId, act });
      return await Promise.resolve();
    },
    // The `net.fetch` HOURLY egress claim. Infra performs the fetch (`safeFetch` is the audited SSRF guard and
    // lives in infra — a domain may not import it), so what crosses down is only the admission, keyed by a
    // pluginId infra never sees. Synchronous check-and-claim, before the fetch, same atomicity argument.
    admitEgress: (): void => {
      belts.egress.admit(requirePluginId("net.fetch"));
    },
    // The `net.fetchAsset` claim rides its OWN belt (#801 split — see the contract's member header): same
    // closure mechanics, different ceiling, so covers never starve text egress.
    admitAssetEgress: (): void => {
      belts.assetEgress.admit(requirePluginId("net.fetchAsset"));
    },
    // Transient quick-reply chips onto the chat's automation bus — host-authority is gated UPSTREAM in the
    // membrane (`InvocationChat.canWrite`); the source stamps THIS plugin.
    surfaceQuickReply: (chatId, choices) => ops.quickReply.surface({ pluginId: requirePluginId("surfaceQuickReply"), chatId, choices }),
    // Publish a UI surface's state (`host.ui.setState`, ui.surface). The pluginId + installer are closed over
    // here (a guest names only the surfaceId, the state, and — through an already-admitted opaque handle the
    // membrane resolved — its room); the op writes the state row + emits the per-user poke. `chatId` arrives
    // ADMITTED, so this file adds no gate of its own: the membrane's `resolveChat` is the whole authority story
    // for the room dimension, exactly as it is for `listMessages`/`upsertEntry`. A transient snippet has no
    // pluginId — and no `ui.surface` grant, so the capability gate never reaches this.
    ui: {
      setState: (surfaceId, state, chatId) => ops.ui.setState({ pluginId: requirePluginId("ui.setState"), installerUserId, surfaceId, chatId, state }),
      // The two HOST-MEDIATED affordances (U5, §4.5a). `toast` takes the whole identity because the outbox
      // stamps the plugin NAME as the attribution prefix — the toast half of the labeled-shell wall — and a
      // guest supplies only the body. Both require an installed plugin for the same reason `storage`/`notify`
      // do: they are keyed to a durable row (the outbox, the rate floor), and a transient snippet holds no
      // `ui.surface` grant anyway, so the capability gate refuses first.
      toast: (level, message) => ops.ui.toast(requirePlugin("ui.toast"), level, message),
      openDialog: (surfaceId) => ops.ui.openDialog(requirePluginId("ui.openDialog"), surfaceId),
    },
    // The two U8 CANON-WRITE ops (seams 15/17). Closed over the INSTALLER only — the guest names the content
    // and can name no owner, so a cross-owner write is structurally impossible (the `variables`/`storage`
    // pattern). NO `requirePluginId`: unlike storage/notify these key nothing on the pluginId (no per-plugin
    // belt — a library write into the installer's own store is not a rate-floored external spend, see the
    // capability header), so `installerUserId` is the whole scope. The capability gate is the membrane-tier
    // wall; a transient snippet's fixed grant profile omits both capabilities, so neither closure is reachable
    // from a snippet regardless.
    databank: {
      ingest: (doc) => ops.databank.ingest({ installerUserId, name: doc.name, text: doc.text }),
    },
    character: {
      // `pluginId` rides along for PROVENANCE only (#1702) — the ingest/ingestAsset ops key no per-plugin
      // belt on it (see the file-header note above this block), so it is the already-derived closure var,
      // never `requirePluginId` (which would newly refuse the — currently unreachable — transient-snippet
      // path this capability's fixed grant profile already excludes).
      ingest: (card) => ops.character.ingest({ installerUserId, card, pluginId }),
      // #798 — the remote-image "summon with art" arm. Closed over the INSTALLER only (a guest names no owner);
      // the compose op reads the PNG from the installer's OWN CAS (owner-gated, leak-free on foreign/absent) and
      // runs the SAME importCharacter funnel `ingest` does. Rides the SAME `character.ingest` grant.
      ingestAsset: (assetId) => ops.character.ingestAsset({ installerUserId, assetId, pluginId }),
      // The U8 D148 per-card state write/read. BOTH un-forgeable coordinates are closed over here: `installerUserId`
      // (the owner-scope predicate — a character the installer does not own is the leak-free NOT_FOUND, resolved at
      // compose) and the emitter's own manifest `slug` (`requirePlugin(…).slug` — a guest supplies only the
      // characterId + data, so it can target only its own `plugin_<slug>` key, never another plugin's). It requires
      // an installed plugin like `pubsub.emit`/`toast` do: a snippet has no identity AND no `character.card_state`
      // grant, so the capability gate refuses first.
      setCardData: (characterId, data) => ops.character.setCardData({ installerUserId, slug: requirePlugin("character.setCardData").slug, characterId, data }),
      getCardData: (characterId) => ops.character.getCardData({ installerUserId, slug: requirePlugin("character.getCardData").slug, characterId }),
    },
    // The PRIVATE plugin-event EMIT (§5a). BOTH un-forgeable coordinates are closed over here: `installerUserId`
    // (the plane is installer-scoped — an emit can never reach another user's plugins) and the emitter's own
    // manifest `slug` (`requirePlugin("pubsub.emit").slug` — a guest supplies only `name` + `data`, so it cannot
    // publish on another plugin's `plugin:<slug>:<name>` channel). It requires an installed plugin like `toast`
    // does: a snippet has no identity AND no `plugin_events` grant, so the capability gate refuses first.
    pubsub: {
      emit: (name, data) => ops.pubsub.emit({ installerUserId, emitterSlug: requirePlugin("pubsub.emit").slug, name, data }),
    },
  };
}
