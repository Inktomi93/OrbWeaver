// B3 — the CLIENT chip fold (`apply-quick-reply-event.ts`), the sibling of the S4 card fold. Pure reducer, no
// DOM, no socket: the chips' RENDERING + click is the S1 band's CT surface (`quick-reply-chips.ct.tsx`); what
// is provable here is the FOLD — the replace-per-source rule (mirroring the card fold + the server slot) and
// the deliberate no-op of every non-surfacing member (a chip has no server record to void — the card fold's
// `ruleAutoDisabled` DROP has no chip analogue). GUARD tests for new behaviour, not defect proofs.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { AutomationRuleId, AutomationSuggestionId, ChatId, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SurfacedChipSet } from "../../../../../packages/client/src/features/automation/lib/apply-quick-reply-event.ts";
import { applyQuickReplyEvent } from "../../../../../packages/client/src/features/automation/lib/apply-quick-reply-event.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_a");
const RULE_1 = castId<AutomationRuleId>("automationrule_1");
const RULE_2 = castId<AutomationRuleId>("automationrule_2");
const PLUGIN_1 = castId<PluginId>("plugin_1");

type QuickReplyChoices = Extract<AutomationBusEvent, { type: "quickReplySurfaced" }>["choices"];

function surfacedByRule(ruleId: AutomationRuleId, choices: QuickReplyChoices): AutomationBusEvent {
  return { type: "quickReplySurfaced", chatId: CHAT, source: { kind: "rule", ruleId }, choices };
}

function fold(events: readonly AutomationBusEvent[]): readonly SurfacedChipSet[] {
  return events.reduce<readonly SurfacedChipSet[]>((chips, event) => applyQuickReplyEvent(chips, event), []);
}

/** Flatten a fold to its rendered labels, in the order the band would show them. */
function labels(chips: readonly SurfacedChipSet[]): readonly string[] {
  return chips.flatMap((set) => set.choices.map((c) => c.label));
}

test("quickReplySurfaced adds the chip set, whole — the payload IS the chips (there is no row to fetch)", () => {
  const [set] = fold([surfacedByRule(RULE_1, [{ label: "Go", sendText: "I go.", mode: "send" }])]);
  expect(set).toEqual({ source: { kind: "rule", ruleId: RULE_1 }, choices: [{ label: "Go", sendText: "I go.", mode: "send" }] });
});

test("a second surfacing from the SAME rule REPLACES the first (mirroring the server's slot + the card fold)", () => {
  const chips = fold([
    surfacedByRule(RULE_1, [{ label: "beat 1", sendText: "a", mode: "send" }]),
    surfacedByRule(RULE_1, [{ label: "beat 2", sendText: "b", mode: "send" }]),
  ]);
  expect(labels(chips)).toEqual(["beat 2"]);
});

test("a different rule keeps its own set, and arrival order is preserved", () => {
  const chips = fold([
    surfacedByRule(RULE_1, [{ label: "first", sendText: "1", mode: "send" }]),
    surfacedByRule(RULE_2, [{ label: "second", sendText: "2", mode: "compose" }]),
  ]);
  expect(labels(chips)).toEqual(["first", "second"]);
});

test("a PLUGIN source keys separately from a rule — a plugin's chips never collide with a rule's", () => {
  const chips = fold([
    surfacedByRule(RULE_1, [{ label: "rule chip", sendText: "r", mode: "send" }]),
    {
      type: "quickReplySurfaced",
      chatId: CHAT,
      source: { kind: "plugin", pluginId: PLUGIN_1 },
      choices: [{ label: "plugin chip", sendText: "p", mode: "send" }],
    },
  ]);
  expect(labels(chips)).toEqual(["rule chip", "plugin chip"]);
});

test("every NON-surfacing member is a no-op — a chip has no server record any of them could void", () => {
  const chips = fold([
    surfacedByRule(RULE_1, [{ label: "kept", sendText: "k", mode: "send" }]),
    {
      type: "suggestionRaised",
      chatId: CHAT,
      source: { kind: "rule", ruleId: RULE_1 },
      suggestionId: castId<AutomationSuggestionId>("automationsuggestion_x"),
      kind: "confirm",
      summary: "ask",
      expiresAt: 1,
    },
    { type: "ruleFired", chatId: CHAT, ruleId: RULE_1 },
    { type: "ruleErrored", chatId: CHAT, ruleId: RULE_1 },
    { type: "ruleAutoDisabled", chatId: CHAT, ruleId: RULE_1 },
    { type: "rulesChanged", chatId: CHAT },
  ]);
  expect(labels(chips)).toEqual(["kept"]);
});
