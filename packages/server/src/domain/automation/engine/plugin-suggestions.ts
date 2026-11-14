// domain/automation/engine/plugin-suggestions — the PLUGIN-origin raiser over the pending-ask store
// (`substrate/suggestions.ts`). It reads the installer's membership row, so it sits outside the pure substrate; the
// store, its TTL and its summary cap stay in that one home.

import type { EmitAutomationEvent, SuggestionCardDetail } from "@orb/contracts/automation";
import { AUTOMATION_SUGGESTION_SUMMARY_MAX } from "@orb/contracts/automation";
import type { PluginSuggestedAct } from "@orb/contracts/plugin";
import { summarizePluginAct } from "@orb/contracts/plugin";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatId, PluginId, UserId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";
import type { SuggestionStore } from "../contract/ops.ts";
import type { NewSuggestionId } from "../contract/suggestion-id.ts";
import { loadMembershipInstance } from "../persistence/ask-standing.ts";
import { AUTOMATION_SUGGESTION_TTL_MS } from "../substrate/suggestions.ts";

/** Build the PLUGIN-origin raiser — the seam `domain/plugin` is wired to at compose (it declares the type;
 *  this is the body). It raises into the ONE store because everything it does is that store's business: mint the id, render
 *  and CAP the question, stamp the same TTL a rule ask gets, put it in the SAME map, and emit the SAME
 *  host-only card event. A plugin raising its own asks somewhere else would be a second proposal system with
 *  a second TTL, a second sweep, and two places a host has to look.
 *
 *  The QUESTION is rendered by `@orb/contracts/plugin`'s `summarizePluginAct` (the act vocabulary's own home),
 *  then capped to the shared summary length here — one cap for both origins, so a card is one line either way.
 *  A turn's steer is the part the cut can hide, so the whole steer rides the card's `detail`.
 *  The ask is always the `confirm` class: the `invitation` class is structurally rule-only (it exists because
 *  `budget_refused` fires pre-predicate on a RULE), and a plugin ask always carries its act.
 *
 *  It records the STANDING the ask is raised against (`PluginAskStanding`): the host whose card it becomes and
 *  the installer's membership instance. A room with no host, or an installer no longer present, raises nothing.
 *  The installer's handle rides the card as its own field, apart from the plugin-named summary. */
export function createPluginSuggestionRaiser(deps: {
  readonly db: DatabaseHandle;
  readonly suggestions: SuggestionStore;
  readonly notify: EmitAutomationEvent;
  readonly newSuggestionId: NewSuggestionId;
  readonly now: Clock;
  /** The installer's handle for the card: the `users` table is not this domain's to read. */
  readonly installerHandle: (userId: UserId) => Promise<string>;
  /** Chat's one present-host reader, injected: the roster is chat's to read. */
  readonly presentHostUserId: (chatId: ChatId) => Promise<UserId | null>;
}): (req: {
  readonly plugin: { readonly id: PluginId; readonly name: string };
  readonly installerUserId: UserId;
  readonly chatId: ChatId;
  readonly act: PluginSuggestedAct;
}) => Promise<void> {
  const db = databaseForOwner(deps.db);
  return async ({ plugin, installerUserId, chatId, act }): Promise<void> => {
    const [hostUserId, installerMembership, installerHandle] = await Promise.all([
      deps.presentHostUserId(chatId),
      loadMembershipInstance(db, chatId, installerUserId),
      deps.installerHandle(installerUserId),
    ]);
    if (hostUserId === null || installerMembership === undefined) {
      throw new Error("plugin host: this room has no host to ask, or the installer is no longer in it");
    }
    const id = deps.newSuggestionId();
    const expiresAt = deps.now() + AUTOMATION_SUGGESTION_TTL_MS;
    const summary = summarizePluginAct(act, plugin.name).slice(0, AUTOMATION_SUGGESTION_SUMMARY_MAX);
    const detail = pluginActDetail(act);
    const source = { kind: "plugin", pluginId: plugin.id } as const;
    deps.suggestions.raise({
      id,
      kind: "confirm",
      chatId,
      source,
      // The INSTALLER is the actor: the confirmed act runs as them, on their budget, in their namespace. The
      // confirmer authorizes, never substitutes, and must be the host recorded in `standing`.
      actorUserId: installerUserId,
      expiresAt,
      payload: { via: "plugin-act", act },
      standing: { hostUserId, installerMembership },
    });
    deps.notify({
      type: "suggestionRaised",
      chatId,
      source,
      suggestionId: id,
      kind: "confirm",
      summary,
      expiresAt,
      installerHandle,
      ...(detail === null ? {} : { detail }),
    });
  };
}

/** The card body a plugin act needs beyond its one-line question: a turn's steer, verbatim, as the turn receives it. */
function pluginActDetail(act: PluginSuggestedAct): SuggestionCardDetail | null {
  if (act.kind !== "requestTurn" || act.guided === undefined || act.guided.trim().length === 0) {
    return null;
  }
  return { kind: "steer", text: act.guided };
}
