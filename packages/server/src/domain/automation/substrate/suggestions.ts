// domain/automation/substrate/suggestions — S4's pending-ask STORE + the suggestible-arm SUMMARY table.
// One per-process instance, created at the composition root and injected
// on the `AutomationContext` beside the enabled-rule index (`ASSUMES(single-replica)`).
//
// TWO INDEXES, one truth: `byId` holds the records, `bySlot` maps `(chatId, source)` → the id currently
// occupying that slot. The slot index is what makes REPLACE-PER-KIND (RULED F1) O(1): a cadence rule that
// keeps firing keeps exactly ONE live ask, so the one-visible-card attention budget (authoring law 5) is
// bounded by the chat's RULE COUNT and not by how often those rules fire.
//
// ONE INBOX, TWO ORIGINS. Plugins joined the same three-posture law post-#24: a plugin whose installer is not
// host of the invocation chat ASKS instead of taking a flat refusal, and its ask lands HERE. Deliberately not
// a second store — a second one would mean a second TTL, a second sweep, a second void-on-handoff and two
// places a host has to look. The slot key discriminates on the `AutomationEmitSource` union, so a chatty
// plugin is bounded by the same one-card-per-origin budget a cadence rule is.
//
// THE TTL IS SWEPT EXPLICITLY, never by a timer: every method that could observe an expired record takes the
// injected `nowMs` and drops the dead ones first. A `setInterval` would read the wall clock in a domain whose
// every other time read is injected (the test-determinism gate's whole point) and would hold a process handle
// open for a map that is allowed to be empty.

import type { AutomationAction, SuggestibleAction, SuggestibleArmType } from "@orb/contracts/automation";
import { AUTOMATION_SUGGESTION_SUMMARY_MAX, SPEND_ARM_TYPES } from "@orb/contracts/automation";
import type { PluginSuggestedAct } from "@orb/contracts/plugin";
import { summarizePluginAct } from "@orb/contracts/plugin";
import type { AutomationSuggestionId, ChatId, PluginId, UserId } from "@orb/kit/ids";
import type { EmitAutomationEvent, PendingSuggestion, SuggestionSource, SuggestionStore } from "../contract/ops.ts";

/** How long a pending ask lives before it is swept. A host who has not answered in half an hour is not
 *  answering THIS beat's ask — the room has moved on, and a re-fire mints a fresh one. */
export const AUTOMATION_SUGGESTION_TTL_MS = 1_800_000; // 30 minutes

/** The replace-per-kind slot key: `(chatId, source)`. The source is the `AutomationEmitSource` union, so a
 *  RULE keeps one live ask per rule and a PLUGIN keeps one live ask per plugin — the same attention budget,
 *  extended to the origin that has no rule id. The `kind:` prefix keeps the two id namespaces from ever
 *  colliding on a shared string. */
function slotKey(chatId: ChatId, source: SuggestionSource): string {
  return source.kind === "rule" ? `${chatId}|rule|${source.ruleId}` : `${chatId}|plugin|${source.pluginId}`;
}

export function createSuggestionStore(): SuggestionStore {
  const byId = new Map<AutomationSuggestionId, PendingSuggestion>();
  const bySlot = new Map<string, AutomationSuggestionId>();

  const forget = (entry: PendingSuggestion): void => {
    byId.delete(entry.id);
    const key = slotKey(entry.chatId, entry.source);
    // Only clear the slot if it still points at THIS record — a replace already re-pointed it.
    if (bySlot.get(key) === entry.id) {
      bySlot.delete(key);
    }
  };

  const sweep = (nowMs: number): void => {
    for (const entry of [...byId.values()]) {
      if (entry.expiresAt <= nowMs) {
        forget(entry);
      }
    }
  };

  const take = (id: AutomationSuggestionId, nowMs: number): PendingSuggestion | null => {
    sweep(nowMs);
    const entry = byId.get(id);
    if (entry === undefined) {
      return null;
    }
    forget(entry);
    return entry;
  };

  const voidWhere = (predicate: (entry: PendingSuggestion) => boolean): number => {
    let dropped = 0;
    for (const entry of [...byId.values()]) {
      if (predicate(entry)) {
        forget(entry);
        dropped += 1;
      }
    }
    return dropped;
  };

  return {
    // `raise` OBSERVES nothing, so it sweeps nothing: it has no clock of its own (reconstructing one from
    // `expiresAt - TTL` would silently lie the day an ask is raised with a different TTL), and the map it
    // adds to is already bounded — replace-per-key means at most one entry per (chat, rule). Every call
    // that can HAND an expired ask to a caller sweeps first, which is where it matters.
    raise: (entry): void => {
      const key = slotKey(entry.chatId, entry.source);
      const replaced = bySlot.get(key);
      if (replaced !== undefined) {
        byId.delete(replaced);
      }
      byId.set(entry.id, entry);
      bySlot.set(key, entry.id);
    },
    peek: (id, nowMs): PendingSuggestion | null => {
      sweep(nowMs);
      return byId.get(id) ?? null;
    },
    claim: take,
    drop: take,
    voidRule: (ruleId): number => voidWhere((entry) => entry.source.kind === "rule" && entry.source.ruleId === ruleId),
    // The plugin twin (deactivate / uninstall). The confirm-time liveness re-check is what makes a stale
    // plugin card SAFE; this is what makes it DISAPPEAR, so a host is never offered an answer that refuses.
    voidPlugin: (pluginId): number => voidWhere((entry) => entry.source.kind === "plugin" && entry.source.pluginId === pluginId),
    voidChat: (chatId): number => voidWhere((entry) => entry.chatId === chatId),
    listForChat: (chatId, nowMs): readonly PendingSuggestion[] => {
      sweep(nowMs);
      return [...byId.values()].filter((entry) => entry.chatId === chatId);
    },
    countForChat: (chatId): number => {
      let count = 0;
      for (const key of bySlot.keys()) {
        if (key.startsWith(`${chatId}|`)) {
          count += 1;
        }
      }
      return count;
    },
  };
}

// ── the ASK the host reads ────────────────────────────────────────────────────────────────────────
// THE SUGGESTIBLE-ARM SUMMARY TABLE — the compile enforcer §3-S4 names, in the ONE form this domain can
// spell it: a `switch` over the CLEAN `SuggestibleArmType` string union with `default: never`. Not a
// mapped-type `Record` (spine §5.5's usual shape) for the reason `engine/arm-executors.ts` documents at
// length — the arm discriminators are snake_case, and snake_case PROPERTY keys trip `useNamingConvention`
// while string-literal `case`s are DATA. The exhaustiveness is identical: an arm that GAINS `confirmFirst`
// widens `SuggestibleArmType` and fails `tsc` here until it is given an ask a human can answer.
//
// Consent, not cost: this table is about which acts a host may be asked to approve; SPEND_ARM_TYPES is about
// which acts cost the author money. They overlap; they are not the same axis, and collapsing them would
// either start charging for backgrounds or stop asking about them.

/** The rendered, capped ask for a confirm-first arm. Reads as a QUESTION about a concrete act, never as a
 *  rule-editor label — the host is answering "should this happen", and the card's button carries the verb.
 *  The per-case `as Extract<>` is the price of narrowing off the string union rather than the zod-inferred
 *  object union (the `runArm` idiom) — sound by construction, each case names its own arm. */
export function summarizeSuggestibleArm(action: SuggestibleAction): string {
  const type: SuggestibleArmType = action.type;
  let ask: string;
  switch (type) {
    case "trigger_turn": {
      const steer = (action as Extract<SuggestibleAction, { type: "trigger_turn" }>).guidedTemplate ?? "";
      ask = steer.trim().length === 0 ? "Take a turn in the room?" : `Take a turn: “${steer.trim()}”`;
      break;
    }
    case "insert_world_info_entry": {
      ask = `Save a lore entry for “${(action as Extract<SuggestibleAction, { type: "insert_world_info_entry" }>).entryKey}”?`;
      break;
    }
    case "generate_image": {
      ask = `Illustrate the scene (${(action as Extract<SuggestibleAction, { type: "generate_image" }>).mode})?`;
      break;
    }
    case "set_chat_background": {
      ask = "Change this room's background to match the scene?";
      break;
    }
    default: {
      const exhaustive: never = type;
      throw new Error(`unhandled suggestible arm: ${JSON.stringify(exhaustive)}`);
    }
  }
  return ask.slice(0, AUTOMATION_SUGGESTION_SUMMARY_MAX);
}

/** Build the PLUGIN-origin raiser — the seam `domain/plugin` is wired to at compose (it declares the type;
 *  this is the body). It lives HERE because everything it does is this store's business: mint the id, render
 *  and CAP the question, stamp the same TTL a rule ask gets, put it in the SAME map, and emit the SAME
 *  host-only card event. A plugin raising its own asks somewhere else would be a second proposal system with
 *  a second TTL, a second sweep, and two places a host has to look.
 *
 *  The QUESTION is rendered by `@orb/contracts/plugin`'s `summarizePluginAct` (the act vocabulary's own home),
 *  then capped to the shared summary length here — one cap for both origins, so a card is one line either way.
 *  The ask is always the `confirm` class: the `invitation` class is structurally rule-only (it exists because
 *  `budget_refused` fires pre-predicate on a RULE), and a plugin ask always carries its act. */
export function createPluginSuggestionRaiser(deps: {
  readonly suggestions: SuggestionStore;
  readonly notify: EmitAutomationEvent;
  readonly newSuggestionId: () => AutomationSuggestionId;
  readonly now: () => number;
}): (req: {
  readonly plugin: { readonly id: PluginId; readonly name: string };
  readonly installerUserId: UserId;
  readonly chatId: ChatId;
  readonly act: PluginSuggestedAct;
}) => void {
  return ({ plugin, installerUserId, chatId, act }): void => {
    const id = deps.newSuggestionId();
    const expiresAt = deps.now() + AUTOMATION_SUGGESTION_TTL_MS;
    const summary = summarizePluginAct(act, plugin.name).slice(0, AUTOMATION_SUGGESTION_SUMMARY_MAX);
    const source = { kind: "plugin", pluginId: plugin.id } as const;
    deps.suggestions.raise({
      id,
      kind: "confirm",
      chatId,
      source,
      // The INSTALLER is the actor: the confirmed act runs as them, on their budget, in their namespace —
      // and it is their host authority the confirm re-check re-runs. The confirmer authorizes, never
      // substitutes.
      actorUserId: installerUserId,
      summary,
      expiresAt,
      payload: { via: "plugin-act", act },
    });
    deps.notify({ type: "suggestionRaised", chatId, source, suggestionId: id, kind: "confirm", summary, expiresAt });
  };
}

/** The rate-refusal INVITATION's ask. It names the rule, because that is all a pre-predicate refusal knows
 *  (no env, no rendered arm) — and being honest about the rate cap is the point: the host is choosing to
 *  spend past a ceiling they set. */
export function summarizeRateRefusal(ruleName: string, limitDetail: string): string {
  return `“${ruleName}” hit its rate cap (${limitDetail}). Run it now?`.slice(0, AUTOMATION_SUGGESTION_SUMMARY_MAX);
}

/** RULED F4 — does a refusal of THIS rule's ARMS earn an invitation? ON for spend arms, derived from the
 *  arms rather than stored, so the ruling's default needs no authoring surface to stay true.
 *
 *  This answers only half the question, and deliberately so. The HOST'S half — "do I still want to be asked
 *  about this rule" — is the B4 per-rule opt-out, and it landed 2026-08-29 as the real
 *  `automation_rules.suggest_on_refusal` column (this comment previously recorded it as unbuilt). The two
 *  are ANDed at the one gate that raises the ask (`engine/dispatch.ts::inviteOnRefusal`): arm shape decides
 *  what COULD be asked, the stored knob decides what IS. Keeping the derivation here means a rule that gains
 *  a spend arm becomes ask-eligible with no migration, and a host's standing preference survives it. */
export function invitesOnRefusal(actions: readonly AutomationAction[]): boolean {
  const spend: readonly string[] = SPEND_ARM_TYPES;
  return actions.some((action) => spend.includes(action.type));
}

/** The stashed arm as the CONFIRM must hand it back to the dispatcher: the same arm with `confirmFirst`
 *  CLEARED. Without this the dispatcher's confirm-first chokepoint would stash it again and a confirmed ask
 *  could never execute — the flag says "ask first", and the asking already happened. */
export function armToExecute(action: SuggestibleAction): AutomationAction {
  return { ...action, confirmFirst: false };
}
