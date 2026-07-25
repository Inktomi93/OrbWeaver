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
// LOOP SAFETY (the per-plugin $/action spend ceiling was stripped 2026-07-24 — enterprise spend enforcement):
// a runaway plugin's autonomous turns stay bounded by the engine's per-member turn RATE budget + the
// cascade-depth guard (resolved inside chat's `requestTurn`); its images are clamped n≤4 + the membrane's ≤32
// concurrent-host-call cap. Cost VISIBILITY rides the stats domain off the imagery/chat writes themselves.

import type { PluginBridge, PluginMessageView } from "@orb/contracts/plugin";
import type { PluginId, UserId, WorldBookId } from "@orb/kit/ids";
import type { PluginHostOps } from "../contract/ops";

/** Adapt the injected `PluginHostOps` into the membrane's `PluginBridge` for one installing user. `listMessages`
 *  is clamped to the installer's own viewer visibility (see the file header); the other chat ops
 *  pass through; the global-vars ops close over `installerUserId`;
 *  worldInfo + imagery close over the installer for the ownership attribution the shared writers gate on.
 *  worldInfo maps the guest `PluginWorldEntryUpsert` onto the shared `UpsertLoreEntryInput` writer
 *  (`entryKey`→`title`, `contentTemplate`→`content`; the guest's `position` hint has no target in the shared
 *  writer and is dropped); imagery forwards the action args + admitted chat to the front door and hands the guest
 *  ONLY `{assetId}` (cost never crosses the realm boundary). */
export function buildPluginBridge(ops: PluginHostOps, installerUserId: UserId, pluginId: PluginId | null): PluginBridge {
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
        return await ops.chat.listMessages(chatId, { ...(limit === undefined ? {} : { limit }), floorSeq: visibility.historyFloorSeq });
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
      upsertEntry: async (entry): Promise<void> => {
        await ops.worldInfo.upsertEntries({
          authorUserId: installerUserId,
          bookId: entry.bookId as WorldBookId,
          entries: [{ title: entry.entryKey, keys: entry.keys, content: entry.contentTemplate }],
        });
      },
    },
    imagery: {
      // Forward to the front door and hand the guest ONLY `{assetId}` (cost never crosses the realm boundary;
      // cost VISIBILITY rides the stats domain off the imagery write itself).
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
      post: (chatId, recipient, message) =>
        ops.notifications.post({ pluginId: requirePluginId("notifications.post"), installerUserId, chatId, recipient, message }),
    },
    // Transient quick-reply chips onto the chat's automation bus — host-authority is gated UPSTREAM in the
    // membrane (`InvocationChat.canWrite`); the source stamps THIS plugin.
    surfaceQuickReply: (chatId, choices) => ops.quickReply.surface({ pluginId: requirePluginId("surfaceQuickReply"), chatId, choices }),
  };
}
