// S4 — the CLIENT total map over `AutomationBusEvent` (the consumer-exhaustiveness belt the automation bus
// never had until the card landed). Pure reducer, no DOM, no socket: the card's RENDERING is the S1 band's
// own CT surface; what is provable here is the FOLD — which is where the two mirrored server rules live.
//
// The two rows that matter are mirrors of server behavior, and they are the ones that silently rot if the
// server changes and nobody looks: REPLACE-PER-RULE (the server store's `(chatId, ruleId)` slot) and the
// auto-disable DROP (the server voids that rule's asks). A client that stacked N cards for one rule would
// make the band's "+N pending" count a lie about a server that is holding exactly one.

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

function fold(events: readonly AutomationBusEvent[]): readonly PendingAsk[] {
  return events.reduce<readonly PendingAsk[]>((asks, event) => applyAutomationBusEvent(asks, event), []);
}

test("suggestionRaised adds the ask, whole — the payload IS the card (there is no row to fetch)", () => {
  const [ask] = fold([raised(RULE_1, "Take a turn in the room?")]);
  expect(ask).toMatchObject({ source: { kind: "rule", ruleId: RULE_1 }, chatId: CHAT, kind: "confirm", summary: "Take a turn in the room?", expiresAt: NOW + TTL });
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
