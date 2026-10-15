// Rule defaults represent an admitted, disabled owner-global birth; complete hard-state overrides remain explicit.

import { automationRuleEditableSchema, automationTriggerFor, ruleViewSchema } from "@orb/contracts/automation";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";
import { ruleActionExamples } from "./automation-rule-actions.ts";

const ids = createSeededIds();

type RuleViewWire = TrpcWireOutput<"automation.listRules">[number];

export function makeRuleView(overrides: Partial<RuleViewWire> = {}): RuleViewWire {
  const authored = automationRuleEditableSchema.parse({
    name: "Rule",
    trigger: automationTriggerFor("character.updated"),
    actions: [ruleActionExamples.set_variable],
  });
  return {
    ...ruleViewSchema.parse({
      ...authored,
      id: ids.next(ID_PREFIX.automationRule),
      chatId: null,
      description: null,
      enabled: false,
      position: 0,
      predicateCel: null,
      actionsCorrupt: false,
      autoDisabled: false,
      rulePresetId: null,
      rulePresetKnobs: null,
      suggestOnRefusal: true,
      timeZone: UTC_TIME_ZONE,
      lastError: null,
      lastFiredAt: null,
      createdAt: FROZEN_AT_MS,
      updatedAt: FROZEN_AT_MS,
    }),
    ...overrides,
  };
}
