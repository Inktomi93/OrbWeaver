// Wire-output builder for an automation rule read (`automation.listRules`, `automation.createRule`): an enabled,
// preset-free rule on the chat bus with no actions. Overrides retain the tRPC wire output type.

import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type RuleViewWire = TrpcWireOutput<"automation.listRules">[number];

export function makeRuleView(overrides: Partial<RuleViewWire> = {}): RuleViewWire {
  return {
    id: ids.next(ID_PREFIX.automationRule),
    chatId: null,
    name: "Rule",
    description: null,
    enabled: true,
    position: 0,
    trigger: { bus: "chat", type: "turnStarted" },
    predicateCel: null,
    actions: [],
    actionsCorrupt: false,
    autoDisabled: false,
    rulePresetId: null,
    rulePresetKnobs: null,
    matchAutomationEvents: true,
    suggestOnRefusal: true,
    cooldownSeconds: 0,
    maxFiresPerHour: 0,
    timeZone: null,
    lastError: null,
    lastFiredAt: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}
