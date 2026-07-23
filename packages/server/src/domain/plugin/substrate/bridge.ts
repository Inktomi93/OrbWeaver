// domain/plugin/substrate/bridge — build the authority-agnostic `PluginBridge` the membrane's host functions
// call (P4b-CORE), PER INSTALLER. The composed `PluginHostOps` chat reads/writes are already chat-id-keyed and
// principal-free (the DOMAIN is their authority gate — the invocation-chat-context admission ran
// `can(installer,…)` before any chat reaches here); global-vars is the ONE installer-scoped op, closed over the
// installer's `UserId` so a cross-user KV read is structurally impossible (fetchOwned under the installer, 02
// §4). Still pure of DB/Principal — the injected `spend` gate carries the ONLY new I/O, pre-bound to a concrete
// pluginId + db at the call site (activation), so this file stays testable with a fake gate.
//
// SPEND WRAP (PLUGIN-SPEND): the two spendy closures — `chat.requestTurn` (turn.trigger) and
// `imagery.generatePicture` — are gated DOMAIN-side here (never in infra/plugin-host; the membrane stays
// authority-blind). Each runs its WHOLE critical section under `spend.runExclusive` (the per-instance spend
// serializer): `spend.check()` BEFORE the op → on refusal throw a TYPED error the membrane contains as guest
// errors-as-data (attachAsync's reject arm) → else run the op → `spend.accumulate(costUsd)` AFTER (+1 action
// always; the metered $ where the seam surfaces it).
//
// WHY runExclusive is load-bearing (the intra-invocation TOCTOU belt): a SINGLE guest handler can fire up to
// HOST_CALLS_IN_FLIGHT_MAX (32) CONCURRENT host-fn calls (membrane.ts attachAsync), so if the check→accumulate
// section ran concurrently, all 32 checks would read the same `actionsBase` before any accumulate persisted →
// the action ceiling overshoots by up to 31 (defeating the $0-local-turn belt). runExclusive queues the
// spendy sections on a per-instance tail-promise so op #2's check reads the row AFTER op #1's accumulate
// persisted. The port FIFO does NOT cover this — it serializes distinct invoke()s (cross-invocation), not
// concurrent host-fn calls within one handler. Non-spendy ops (listMessages/getVariables/variable writes) stay
// concurrent — only these two closures serialize. A `null` spend gate (the transient snippet — its grant profile
// can't spend, no persistent row) leaves both closures ungated (inert: the membrane never grants them the
// spendy caps anyway).

import type { PluginBridge } from "@orb/contracts/plugin";
import type { PluginId, UserId, WorldBookId } from "@orb/kit/ids";
import type { PluginHostOps, PluginSpendGate } from "../contract/ops";

/** A budget-exhausted plugin's spendy op is refused with THIS typed error — the membrane's host-fn reject arm
 *  contains it as guest errors-as-data (a caught `ok:false` to the guest, never a host crash). `detail` is the
 *  breached ceiling (`actions_daily` / `usd_daily`). */
class PluginBudgetExhaustedError extends Error {
  constructor(detail: string) {
    super(`plugin budget exhausted: ${detail}`);
    this.name = "PluginBudgetExhaustedError";
  }
}

/** Adapt the injected `PluginHostOps` into the membrane's `PluginBridge` for one installing user. The chat ops
 *  pass through (only the `{limit}` opts shape is re-wrapped); the global-vars ops close over `installerUserId`;
 *  worldInfo + imagery close over the installer for the ownership/spend attribution the shared writers gate on.
 *  The `spend` gate wraps the two spendy closures (see header); `null` where the caller can never spend (the
 *  transient snippet). worldInfo maps the guest `PluginWorldEntryUpsert` onto the shared `UpsertLoreEntryInput`
 *  writer (`entryKey`→`title`, `contentTemplate`→`content`; the guest's `position` hint has no target in the
 *  shared writer and is dropped); imagery forwards the action args + admitted chat to the front door, reads the
 *  metered `costUsd` host-side for the budget debit, and hands the guest ONLY `{assetId}` (cost never crosses
 *  the realm boundary). */
export function buildPluginBridge(ops: PluginHostOps, installerUserId: UserId, spend: PluginSpendGate | null, pluginId: PluginId | null): PluginBridge {
  // The plugin-scoped ops (storage / notify / quick_reply) are keyed by a PERSISTENT pluginId — a transient
  // snippet has none (`null`). Its fixed grant profile omits storage.kv / notify / chat.quick_reply, so the
  // membrane's capability gate never reaches these closures on the snippet path; a `null` here throws only if the
  // membrane ever DID reach them (a defensive contradiction of the grant profile, never a live path — the same
  // fail-closed posture the `null` spend gate takes).
  const requirePluginId = (fn: string): PluginId => {
    if (pluginId === null) {
      throw new Error(`plugin host: ${fn} requires an installed plugin (unavailable to a transient snippet)`);
    }
    return pluginId;
  };
  return {
    chat: {
      listMessages: (chatId, limit) => ops.chat.listMessages(chatId, limit === undefined ? undefined : { limit }),
      getVariables: (chatId) => ops.chat.getVariables(chatId),
      applyVariableOps: (chatId, varOps) => ops.chat.applyVariableOps(chatId, varOps),
      // The FUNDER is closed over the installer (never infra/guest-supplied) — the membrane passes only the
      // admitted chatId + child depth + guest speaker/guided hints; `initiator:"plugin"` + the room-host box +
      // the D17/membership/budget belts are resolved inside chat's `requestTurn` (compose op below). SPEND-gated
      // under `runExclusive` (check → op → accumulate atomic per instance): check BEFORE (throw the typed refusal
      // on a breach), accumulate the metered `costUsd` AFTER (+1 action). The compose op projects the turn cost as
      // the SUM of the committed messages' per-message costUsd (the automation requestTurn precedent) — the guest
      // never sees it (the seam returns cost, the bridge consumes it; the membrane's `requestTurn` returns void).
      requestTurn: (chatId, automationDepth, p): Promise<void> =>
        spendGated(spend, async () => {
          const result = await ops.chat.requestTurn({
            funderUserId: installerUserId,
            chatId,
            automationDepth,
            ...(p.speakerCharacterId !== undefined ? { speakerCharacterId: p.speakerCharacterId } : {}),
            ...(p.guided !== undefined ? { guided: p.guided } : {}),
          });
          return result.costUsd ?? 0;
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
      // SPEND-gated under `runExclusive` (check → op → accumulate atomic per instance): check BEFORE, run the op,
      // accumulate the metered `costUsd` (+1 action) AFTER — then hand the guest ONLY `{assetId}` (the cost is
      // consumed host-side, never crosses the realm boundary).
      generatePicture: async (chatId, args): Promise<{ readonly assetId: string }> => {
        let assetId = "";
        await spendGated(spend, async () => {
          const result = await ops.imagery.generatePicture({ authorUserId: installerUserId, chatId, args });
          assetId = result.assetId;
          return result.costUsd ?? 0;
        });
        return { assetId };
      },
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

/** Run a spendy op's critical section under the per-instance spend serializer: `check` BEFORE (throw the typed
 *  refusal on a breach — the membrane contains it as guest errors-as-data), run `op` (returns the metered
 *  `costUsd`), `accumulate` AFTER. The WHOLE section runs under `runExclusive` so concurrent spendy host calls
 *  from ONE guest handler queue and run one-at-a-time (the intra-invocation TOCTOU belt — op #2's check reads the
 *  row AFTER op #1's accumulate persisted, so the action ceiling never overshoots). A `null` gate (the snippet —
 *  can't spend) runs `op` ungated (no check, no accumulate, no serialization). */
async function spendGated(spend: PluginSpendGate | null, op: () => Promise<number>): Promise<void> {
  if (spend === null) {
    await op();
    return;
  }
  await spend.runExclusive(async () => {
    const verdict = await spend.check();
    if (!verdict.ok) {
      throw new PluginBudgetExhaustedError(verdict.detail);
    }
    const costUsd = await op();
    await spend.accumulate(costUsd);
  });
}
