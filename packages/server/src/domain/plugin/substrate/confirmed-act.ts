// domain/plugin/substrate/confirmed-act — execute a plugin's posture-2 act after a host confirmed it.
//
// THE RULE THIS FILE EXISTS TO HOLD: **the enforcement set follows the ORIGIN, not the executor.** Two of the
// three suggestible plugin acts (`worldInfoUpsert`, `generatePicture`) have an automation ARM that looks
// identical, and `domain/automation` already owns a dispatcher (`runArm`) that could run them. Routing a
// confirmed plugin act through it would compile, demo correctly, and be wrong: the act would take AUTOMATION's
// belts instead of the plugin bridge's — the book-attached-to-chat gate, the per-plugin 64-entry ceiling and
// `neutralizeMacros` (`substrate/bridge.ts`). A plugin would then gain reach BY BEING CONFIRMED that it does
// not have when it acts directly, which is an enforcement swap hidden inside a UX affordance: the feature
// works, the demo passes, and the capability quietly widens.
//
// So the confirmed act re-enters through the plugin's OWN bridge, rebuilt from the identity + installer the
// pending record held. Everything the direct call would have met, it meets — including the hourly belts, which
// is deliberate: a host confirming an act does not top up the plugin's egress or spend budget.
//
// WHAT IT DOES **NOT** RE-CHECK, and why that is correct rather than a gap: authority. The confirm verb
// already gated the caller as HOST of the ask's own chat, claimed the ask take-once, and re-ran
// `holdsChatHostAuthority(installer)` — the ruled host-handoff wall. Re-deriving any of that here would be a
// second spelling of a decision that has exactly one home, which is how two planes end up disagreeing.
//
// NO GUEST RUNS. Every act is a HOST-side op; the sandbox is not involved, so a confirmed act works whether or
// not the plugin still has a resident instance. It works because the ACT is data, not a closure — a pending
// record that could execute itself would be a capability sitting in a map.

import type { PluginSuggestedAct, PluginSuggestedActKind } from "@orb/contracts/plugin";
import type { ChatId, PluginId, UserId } from "@orb/kit/ids";
import type { PluginBelts, PluginHostOps, PluginIdentity } from "../contract/ops.ts";
import { buildPluginBridge } from "./bridge.ts";

/** Run ONE confirmed act through the plugin's own bridge. Rejects on any refusal the bridge raises (an
 *  unattached book, the entry ceiling, a spend failure) — the caller records `action_error`. */
export function buildConfirmedActRunner(
  ops: PluginHostOps,
  belts: PluginBelts,
): (req: { readonly pluginId: PluginId; readonly installerUserId: UserId; readonly chatId: ChatId; readonly act: PluginSuggestedAct }) => Promise<void> {
  return async ({ pluginId, installerUserId, chatId, act }): Promise<void> => {
    // The bridge is keyed by `PluginIdentity`, whose `name` exists for ONE member — `suggest`, which renders a
    // host-facing question. This path structurally cannot reach it: a confirmed act calls the bridge's ops
    // DIRECTLY (the membrane, which is the only caller of `suggest`, is not in this stack), and an act that
    // already has host consent has nothing left to ask. So the name is empty here rather than fetched, and
    // that is a statement about reachability, not a missing lookup.
    // `slug` is empty for the same reason `name` is: a confirmed S4 act re-enters only the write ops it was
    // stashed for, never `pubsub.emit` (a private-event emit is not a host-confirmable act), so the emitter slug
    // is never read here. Empty rather than fetched — one more field the confirm path has no use for.
    const identity: PluginIdentity = { id: pluginId, name: "", slug: "" };
    const bridge = buildPluginBridge(ops, installerUserId, identity, belts);
    // Switched on a LOCAL binding of the CLEAN string union, not on `act.kind`, and each case narrows with an
    // `Extract<>` — the `summarizeSuggestibleArm` / `runArm` idiom. Biome's `noUnnecessaryConditions` cannot
    // narrow this union through the member access and calls every case after the first unreachable; the local
    // binding is the spelling that keeps the exhaustiveness real without a suppression.
    const kind: PluginSuggestedActKind = act.kind;
    switch (kind) {
      case "requestTurn": {
        const turn = act as Extract<PluginSuggestedAct, { kind: "requestTurn" }>;
        // The stashed CHILD depth is replayed verbatim, never re-derived: the confirmed turn must sit at the
        // same point in the cascade the asked-for turn would have, so a delay cannot re-base the
        // loop-prevention ceiling. `requestTurn` refuses past the hard cap downstream either way.
        await bridge.chat.requestTurn(chatId, turn.automationDepth, {
          ...(turn.speakerCharacterId !== undefined ? { speakerCharacterId: turn.speakerCharacterId } : {}),
          ...(turn.guided !== undefined ? { guided: turn.guided } : {}),
        });
        return;
      }
      case "worldInfoUpsert": {
        // The guest's entry, VERBATIM as it was shown. The three domain gates run now, on the CURRENT tree —
        // a book detached between the ask and the answer refuses, which is the room withdrawing its consent.
        await bridge.worldInfo.upsertEntry(chatId, (act as Extract<PluginSuggestedAct, { kind: "worldInfoUpsert" }>).entry);
        return;
      }
      case "generatePicture": {
        await bridge.imagery.generatePicture(chatId, (act as Extract<PluginSuggestedAct, { kind: "generatePicture" }>).args);
        return;
      }
      default: {
        // A new `PluginSuggestedAct` member with no executor is a card a host could answer into a no-op.
        const exhaustive: never = kind;
        throw new Error(`plugin: unhandled confirmed act ${JSON.stringify(exhaustive)}`);
      }
    }
  };
}
