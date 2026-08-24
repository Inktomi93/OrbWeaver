// domain/automation/substrate/suggestions — S4's pending-ask STORE + the suggestible-arm SUMMARY table
// (interaction-direction-spec §3-S4). One per-process instance, created at the composition root and injected
// on the `AutomationContext` beside the enabled-rule index (`ASSUMES(single-replica)`).
//
// TWO INDEXES, one truth: `byId` holds the records, `bySlot` maps `(chatId, ruleId)` → the id currently
// occupying that slot. The slot index is what makes REPLACE-PER-KIND (RULED F1) O(1): a cadence rule that
// keeps firing keeps exactly ONE live ask, so the one-visible-card attention budget (authoring law 5) is
// bounded by the chat's RULE COUNT and not by how often those rules fire.
//
// THE TTL IS SWEPT EXPLICITLY, never by a timer: every method that could observe an expired record takes the
// injected `nowMs` and drops the dead ones first. A `setInterval` would read the wall clock in a domain whose
// every other time read is injected (the test-determinism gate's whole point) and would hold a process handle
// open for a map that is allowed to be empty.

import type { AutomationAction, SuggestibleAction, SuggestibleArmType } from "@orb/contracts/automation";
import { AUTOMATION_SUGGESTION_SUMMARY_MAX, SPEND_ARM_TYPES } from "@orb/contracts/automation";
import type { AutomationRuleId, AutomationSuggestionId, ChatId } from "@orb/kit/ids";
import type { PendingSuggestion, SuggestionStore } from "../contract/ops.ts";

/** How long a pending ask lives before it is swept. A host who has not answered in half an hour is not
 *  answering THIS beat's ask — the room has moved on, and a re-fire mints a fresh one. */
export const AUTOMATION_SUGGESTION_TTL_MS = 1_800_000; // 30 minutes

/** The `(chatId, ruleId)` replace-per-kind slot key. */
function slotKey(chatId: ChatId, ruleId: AutomationRuleId): string {
  return `${chatId}|${ruleId}`;
}

export function createSuggestionStore(): SuggestionStore {
  const byId = new Map<AutomationSuggestionId, PendingSuggestion>();
  const bySlot = new Map<string, AutomationSuggestionId>();

  const forget = (entry: PendingSuggestion): void => {
    byId.delete(entry.id);
    const key = slotKey(entry.chatId, entry.ruleId);
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
      const key = slotKey(entry.chatId, entry.ruleId);
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
    voidRule: (ruleId): number => voidWhere((entry) => entry.ruleId === ruleId),
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

/** The rate-refusal INVITATION's ask. It names the rule, because that is all a pre-predicate refusal knows
 *  (no env, no rendered arm) — and being honest about the rate cap is the point: the host is choosing to
 *  spend past a ceiling they set. */
export function summarizeRateRefusal(ruleName: string, limitDetail: string): string {
  return `“${ruleName}” hit its rate cap (${limitDetail}). Run it now?`.slice(0, AUTOMATION_SUGGESTION_SUMMARY_MAX);
}

/** RULED F4 — does a refusal of THIS rule earn an invitation? ON by default for spend arms, and derived from
 *  the arms rather than stored: `automation_rules` carries no `suggest_on_refusal` column, and the per-rule
 *  OPT-OUT is the same recorded-unbuilt column class as R5's suggestion fire-terminal (spec §6 R5 / §8 F1).
 *  Deriving it makes the SHIPPED behavior exactly the ruling's default with no authoring surface to drift. */
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
