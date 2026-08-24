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
// a runaway plugin's autonomous turns stay bounded by the engine's per-member turn RATE budget + the
// cascade-depth guard (resolved inside chat's `requestTurn`); its images are clamped n≤4 + the membrane's ≤32
// concurrent-host-call cap. Cost VISIBILITY rides the stats domain off the imagery/chat writes themselves.

import type { PluginBridge, PluginMessageView } from "@orb/contracts/plugin";
import type { PluginId, UserId, WorldBookId } from "@orb/kit/ids";
import { neutralizeMacros } from "@orb/kit/macro";
import type { PluginHostOps } from "../contract/ops.ts";
import type { NotifyFloor } from "./notify-floor.ts";

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
export function buildPluginBridge(ops: PluginHostOps, installerUserId: UserId, pluginId: PluginId | null, notifyFloor: NotifyFloor): PluginBridge {
  // The plugin-scoped ops (storage / notify / quick_reply) are keyed by a PERSISTENT pluginId — a transient
  // snippet has none (`null`). Its fixed grant profile omits storage.kv / notify / chat.quick_reply, so the
  // membrane's capability gate never reaches these closures on the snippet path; a `null` here throws only if the
  // membrane ever DID reach them (a defensive contradiction of the grant profile, never a live path).
  const requirePluginId = (fn: string): PluginId => {
    if (pluginId === null) {
      throw new Error(`plugin host: ${fn} requires an installed plugin (unavailable to a transient snippet)`);
    }
    return pluginId;
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
      applyVariableOps: (chatId, varOps) => ops.chat.applyVariableOps(chatId, varOps),
      // The FUNDER is closed over the installer (never infra/guest-supplied) — the membrane passes only the
      // admitted chatId + child depth + guest speaker/guided hints; `initiator:"plugin"` + the room-host box +
      // the D17/membership belts + the per-member turn RATE budget + the cascade-depth guard (loop safety) are
      // resolved inside chat's `requestTurn` (compose op below). Returns void to the realm.
      requestTurn: (chatId, automationDepth, p): Promise<void> =>
        ops.chat.requestTurn({
          funderUserId: installerUserId,
          chatId,
          automationDepth,
          ...(p.speakerCharacterId !== undefined ? { speakerCharacterId: p.speakerCharacterId } : {}),
          ...(p.guided !== undefined ? { guided: p.guided } : {}),
        }),
    },
    worldInfo: {
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
      // @foreign-id-ok(assetId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, branded only after the host parses it; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
      generatePicture: (chatId, args): Promise<{ readonly assetId: string }> => ops.imagery.generatePicture({ authorUserId: installerUserId, chatId, args }),
    },
    variables: {
      get: (key) => ops.variables.get(installerUserId, key),
      set: (key, value) => ops.variables.set(installerUserId, key, value),
      delete: (key) => ops.variables.delete(installerUserId, key),
    },
    // Plugin-PRIVATE KV — closed over BOTH the pluginId AND the installer (owner), so a cross-plugin OR
    // cross-owner read is structurally impossible: the guest names only the key/prefix, never a scope.
    storage: {
      get: (key) => ops.storage.get(requirePluginId("storage.get"), installerUserId, key),
      set: (key, value) => ops.storage.set(requirePluginId("storage.set"), installerUserId, key, value),
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
        notifyFloor.admit(id, chatId);
        await ops.notifications.post({ pluginId: id, installerUserId, chatId, recipient, message });
      },
    },
    // Transient quick-reply chips onto the chat's automation bus — host-authority is gated UPSTREAM in the
    // membrane (`InvocationChat.canWrite`); the source stamps THIS plugin.
    surfaceQuickReply: (chatId, choices) => ops.quickReply.surface({ pluginId: requirePluginId("surfaceQuickReply"), chatId, choices }),
  };
}
