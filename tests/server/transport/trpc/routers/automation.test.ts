// automation.{listRules,createRuleFromPreset,runRuleNow,…} — the live rule-lifecycle wire-through (core/Tier-4-Transport.md).
// The router is a THIN driver: it validates the wire schema, injects `principal: ctx.auth` (NEVER from input —
// the acting identity is the resolved Principal), and delegates to `ctx.services.automation.<verb>`. The trigger/
// preset VOCABULARY rides `@orb/contracts/automation` (not re-spelled). These assert the pass-through (the mapped
// fields reach the verb, the principal is the caller's) + that the contract preset id bites at the wire — driven
// through the real ladder via `createCaller`. Host authority + leak-free collapse are the domain guard's
// job (proven in the cross-tenant sweep + the automation domain tests), not re-tested here.

import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AutomationService, RuleView } from "@orb/server/domain/automation";
import type { Context } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const OWNER = castId<UserId>("user_owner");
const CHAT = castId<ChatId>("chat_1");

function ctxWith(automation: Partial<AutomationService>): Context {
  return makeContext({ auth: principal("user", { userId: OWNER }), services: { automation } });
}

const RULE: RuleView = {
  id: castId<AutomationRuleId>("automationrule_1"),
  chatId: CHAT,
  name: "Greet",
  description: null,
  enabled: false,
  position: 1,
  trigger: { bus: "chat", type: "messageCommitted" },
  predicateCel: null,
  actions: [{ type: "set_variable", scope: "chat", key: "greeted", op: "set", value: "1" }],
  // #1422 — the arms parsed; `true` here would be a fixture claiming a corrupt blob it does not have.
  actionsCorrupt: false,
  rulePresetId: null,
  rulePresetKnobs: null,
  matchAutomationEvents: false,
  suggestOnRefusal: true,
  cooldownSeconds: 0,
  maxFiresPerHour: 30,
  lastError: null,
  lastFiredAt: null,
  createdAt: 1,
  updatedAt: 1,
};

describe("automation.listRules — chat wire-through", () => {
  test("passes the validated chatId and the caller's principal to the verb", async () => {
    const listRules = vi.fn<AutomationService["listRules"]>(async () => [RULE]);
    await caller(ctxWith({ listRules })).automation.listRules({ chatId: CHAT });
    expect(listRules).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), chatId: CHAT });
  });
});

describe("automation.listRulePresets — catalogue read wire-through", () => {
  test("delegates to the static projection verb (no principal, no chat)", async () => {
    const listRulePresets = vi.fn<AutomationService["listRulePresets"]>(() => []);
    await caller(ctxWith({ listRulePresets })).automation.listRulePresets();
    expect(listRulePresets).toHaveBeenCalledWith();
  });
});

describe("automation.createRuleFromPreset — preset-mint wire-through", () => {
  test("threads the caller's principal + validated chatId/presetId, and the knob-override bag when present", async () => {
    const createRuleFromPreset = vi.fn<AutomationService["createRuleFromPreset"]>(async () => [RULE]);
    await caller(ctxWith({ createRuleFromPreset })).automation.createRuleFromPreset({
      chatId: CHAT,
      presetId: "pacingNudge",
      knobs: { everyN: 8, steer: "shift the pacing" },
    });
    expect(createRuleFromPreset).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: OWNER }),
      chatId: CHAT,
      presetId: "pacingNudge",
      knobs: { everyN: 8, steer: "shift the pacing" },
    });
  });

  test("omits an absent knob bag rather than passing it as undefined (exactOptional discipline)", async () => {
    const createRuleFromPreset = vi.fn<AutomationService["createRuleFromPreset"]>(async () => [RULE]);
    await caller(ctxWith({ createRuleFromPreset })).automation.createRuleFromPreset({ chatId: CHAT, presetId: "cutaways" });
    const [args] = createRuleFromPreset.mock.calls[0] ?? [];
    expect(args && "knobs" in args).toBe(false);
  });

  test("rejects an unknown presetId at the wire (the contract id enum bites before the verb)", async () => {
    const createRuleFromPreset = vi.fn<AutomationService["createRuleFromPreset"]>(async () => [RULE]);
    await expect(
      // @ts-expect-error — an id outside RULE_PRESET_IDS is a compile error too; the wire enum is the runtime belt.
      caller(ctxWith({ createRuleFromPreset })).automation.createRuleFromPreset({ chatId: CHAT, presetId: "notAPreset" }),
    ).rejects.toThrow();
    expect(createRuleFromPreset).not.toHaveBeenCalled();
  });
});

// R7 + S4 (interaction-direction-spec §6 R7 / §3-S4) — the three verbs the card and the Rules panel drive.
// Same thin-driver contract as the rest: the wire shape is validated, the PRINCIPAL comes from `ctx.auth`
// (never from input — a caller-supplied confirmer would hand the whole authority story to the caller), and
// the verb decides everything else.

describe("automation.runRuleNow — R7 wire-through", () => {
  test("passes the validated ruleId + the caller's principal (the chat is the RULE's, never a caller claim)", async () => {
    const runRuleNow = vi.fn<AutomationService["runRuleNow"]>(async () => ({ outcome: "fired" }));
    await caller(ctxWith({ runRuleNow })).automation.runRuleNow({ ruleId: RULE.id });
    expect(runRuleNow).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), ruleId: RULE.id });
  });
});

describe("automation.setRuleSuggestOnRefusal — B4's per-rule F4 opt-out wire-through", () => {
  test("threads the ruleId + the flag + the caller's principal", async () => {
    const setRuleSuggestOnRefusal = vi.fn<AutomationService["setRuleSuggestOnRefusal"]>(async () => undefined);
    await caller(ctxWith({ setRuleSuggestOnRefusal })).automation.setRuleSuggestOnRefusal({ ruleId: RULE.id, suggestOnRefusal: false });
    expect(setRuleSuggestOnRefusal).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: OWNER }),
      ruleId: RULE.id,
      suggestOnRefusal: false,
    });
  });

  test("the flag is REQUIRED on the wire — an omitted one is a BAD_REQUEST, never a silent default", async () => {
    const setRuleSuggestOnRefusal = vi.fn<AutomationService["setRuleSuggestOnRefusal"]>(async () => undefined);
    // @orb-waive no-test-fabrication(unknown): the subject IS the invalid input — this probe exists to prove the wire schema refuses Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    // an omitted flag, which cannot be spelled without defeating the type that documents the requirement.
    const call = caller(ctxWith({ setRuleSuggestOnRefusal })).automation.setRuleSuggestOnRefusal({
      ruleId: RULE.id,
    } as unknown as { ruleId: AutomationRuleId; suggestOnRefusal: boolean });
    await expect(call).rejects.toThrow();
    // The verb is never reached — a defaulted flag would silently mute (or unmute) a host's rule.
    expect(setRuleSuggestOnRefusal).not.toHaveBeenCalled();
  });
});

describe("automation.confirmSuggestion / dismissSuggestion — the S4 pair", () => {
  test("confirm threads the claim handle + the caller as the AUTHORIZER", async () => {
    const suggestionId = mintTypeId(ID_PREFIX.automationSuggestion);
    const confirmSuggestion = vi.fn<AutomationService["confirmSuggestion"]>(async () => ({ ran: "stashed-arm", outcome: "fired" }));
    await caller(ctxWith({ confirmSuggestion })).automation.confirmSuggestion({ suggestionId });
    expect(confirmSuggestion).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), suggestionId });
  });

  test("dismiss threads the same handle", async () => {
    const suggestionId = mintTypeId(ID_PREFIX.automationSuggestion);
    const dismissSuggestion = vi.fn<AutomationService["dismissSuggestion"]>(async () => undefined);
    await caller(ctxWith({ dismissSuggestion })).automation.dismissSuggestion({ suggestionId });
    expect(dismissSuggestion).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), suggestionId });
  });
});
