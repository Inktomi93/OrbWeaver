// S4 — the CLIENT total map over `AutomationBusEvent` (the consumer-exhaustiveness belt the automation bus
// never had until the card landed). Pure reducer, no DOM, no socket: the card's RENDERING is the S1 band's
// own CT surface; what is provable here is the FOLD — which is where the two mirrored server rules live.
//
// The rows that matter are mirrors of server behavior, and they are the ones that silently rot if the
// server changes and nobody looks: REPLACE-PER-RULE (the server store's `(chatId, ruleId)` slot), the
// auto-disable DROP (the server voids that rule's asks), and the RETIREMENT (`suggestionResolved` — the ask
// was answered and left the store, so every attached host tab drops its card; #700). A client that stacked N
// cards for one rule, or held an answered card until TTL, would make the band's "+N pending" count a lie.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { AutomationRuleId, AutomationSuggestionId, ChatId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PendingAsk } from "../../../../../packages/client/src/features/automation/lib/apply-automation-bus-event.ts";
import { applyAutomationBusEvent, pruneExpiredAsks } from "../../../../../packages/client/src/features/automation/lib/apply-automation-bus-event.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_a");
const RULE_1 = castId<AutomationRuleId>("automationrule_1");
const RULE_2 = castId<AutomationRuleId>("automationrule_2");
const NOW = 1_700_000_000_000;
const TTL = 1_800_000;

function raised(ruleId: AutomationRuleId, summary: string, id: AutomationSuggestionId = mintTypeId(ID_PREFIX.automationSuggestion)): AutomationBusEvent {
  return { type: "suggestionRaised", chatId: CHAT, source: { kind: "rule", ruleId }, suggestionId: id, kind: "confirm", summary, expiresAt: NOW + TTL };
}

function resolved(id: AutomationSuggestionId): AutomationBusEvent {
  return { type: "suggestionResolved", chatId: CHAT, suggestionId: id };
}

function fold(events: readonly AutomationBusEvent[]): readonly PendingAsk[] {
  return events.reduce<readonly PendingAsk[]>((asks, event) => applyAutomationBusEvent(asks, event), []);
}

test("suggestionRaised adds the ask, whole — the payload IS the card (there is no row to fetch)", () => {
  const [ask] = fold([raised(RULE_1, "Take a turn in the room?")]);
  expect(ask).toMatchObject({
    source: { kind: "rule", ruleId: RULE_1 },
    chatId: CHAT,
    kind: "confirm",
    summary: "Take a turn in the room?",
    expiresAt: NOW + TTL,
  });
});

test("a second ask from the SAME rule REPLACES the first (mirroring the server's replace-per-slot)", () => {
  const asks = fold([raised(RULE_1, "beat 1"), raised(RULE_1, "beat 2")]);
  expect(asks.map((a) => a.summary)).toEqual(["beat 2"]);
});

test("a different rule keeps its own card, and arrival order is preserved (the band shows the NEWEST)", () => {
  const asks = fold([raised(RULE_1, "first"), raised(RULE_2, "second")]);
  expect(asks.map((a) => a.summary)).toEqual(["first", "second"]);
});

test("ruleAutoDisabled drops that rule's card — the server already voided it", () => {
  const asks = fold([raised(RULE_1, "doomed"), raised(RULE_2, "kept"), { type: "ruleAutoDisabled", chatId: CHAT, ruleId: RULE_1 }]);
  expect(asks.map((a) => a.summary)).toEqual(["kept"]);
});

test("suggestionResolved retires the ask with the matching id — the server took it, so this tab drops the card (#700)", () => {
  const id = mintTypeId(ID_PREFIX.automationSuggestion);
  const asks = fold([raised(RULE_1, "answer me", id)]);
  expect(asks).toHaveLength(1);
  expect(applyAutomationBusEvent(asks, resolved(id))).toEqual([]);
});

test("suggestionResolved is a no-op for an id it does not hold — a stale resolve for another tab's gone ask leaves live cards alone", () => {
  const asks = fold([raised(RULE_1, "still live")]);
  const other = mintTypeId(ID_PREFIX.automationSuggestion);
  expect(applyAutomationBusEvent(asks, resolved(other)).map((a) => a.summary)).toEqual(["still live"]);
});

test("resolving the NEWEST card reveals the older one (the band renders cards.at(-1)) — the #700 masking regression", () => {
  const olderId = mintTypeId(ID_PREFIX.automationSuggestion);
  const newerId = mintTypeId(ID_PREFIX.automationSuggestion);
  // Two DIFFERENT rules so both cards live at once; the band shows the newest and hides the rest as "+N".
  const both = fold([raised(RULE_1, "older", olderId), raised(RULE_2, "newer", newerId)]);
  expect(both.at(-1)?.summary).toBe("newer");
  // Answer the newest. Before the fix nothing retired it, so the band kept rendering the DEAD "newer" and hid
  // "older" behind a lying "+N pending" for up to the 30-min TTL. Now the fold drops it and "older" is the
  // sole (therefore visible) card — the mask is gone.
  const after = applyAutomationBusEvent(both, resolved(newerId));
  expect(after.map((a) => a.summary)).toEqual(["older"]);
  expect(after.at(-1)?.summary).toBe("older");
});

test("the fire-log members move no card (they are B2's surface, not this one's)", () => {
  const asks = fold([
    raised(RULE_1, "kept"),
    { type: "ruleFired", chatId: CHAT, ruleId: RULE_1 },
    { type: "ruleErrored", chatId: CHAT, ruleId: RULE_1 },
    { type: "rulesChanged", chatId: CHAT },
    { type: "quickReplySurfaced", chatId: CHAT, source: { kind: "rule", ruleId: RULE_1 }, choices: [{ label: "go", sendText: "go", mode: "send" }] },
  ]);
  expect(asks.map((a) => a.summary)).toEqual(["kept"]);
});

test("prune drops an ask ON its deadline — the same edge the server sweeps, so no card outlives its ask", () => {
  const asks = fold([raised(RULE_1, "a")]);
  expect(pruneExpiredAsks(asks, NOW + TTL - 1)).toHaveLength(1);
  expect(pruneExpiredAsks(asks, NOW + TTL)).toEqual([]);
});
