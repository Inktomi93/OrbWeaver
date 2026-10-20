// automation.{listRules,createRuleFromPreset,runRuleNow,…} — the live rule-lifecycle wire-through (docs/law/Tier-4-Transport.md).
// The router is a THIN driver: it validates the wire schema, injects `principal: ctx.auth` (NEVER from input —
// the acting identity is the resolved Principal), and delegates to `ctx.services.automation.<verb>`. The trigger/
// preset VOCABULARY rides `@orb/contracts/automation` (not re-spelled). These assert the pass-through (the mapped
// fields reach the verb, the principal is the caller's) + that the contract preset id bites at the wire — driven
// through the real ladder via `createCaller`. Host authority + leak-free collapse are the domain guard's
// job (proven in the cross-tenant sweep + the automation domain tests), not re-tested here.

import type { Db } from "@orb/db";
import type { AutomationRuleId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { Context } from "@orb/server/transport/trpc";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, vi } from "vitest";
import type { AutomationService, RuleView } from "#server/domain/automation/index.ts";
import { caller, makeContext, principal } from "../_support.ts";

// MINTED, never readable literals: these ids cross `typeIdSchema` tRPC inputs, which validate the TypeID suffix.
const ID = {
  chat1: mintTypeId(ID_PREFIX.chat),
} as const;

const OWNER = castId<UserId>("user_owner");
const CHAT = ID.chat1;

async function ctxWith(db: Db, automation: Partial<AutomationService>): Promise<Context> {
  return makeContext({ auth: await principal(db, "user", { userId: OWNER }), services: { automation } });
}

const RULE: RuleView = {
  id: mintTypeId(ID_PREFIX.automationRule),
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
  autoDisabled: false,
  rulePresetId: null,
  rulePresetKnobs: null,
  matchAutomationEvents: false,
  suggestOnRefusal: true,
  cooldownSeconds: 0,
  maxFiresPerHour: 30,
  timeZone: UTC_TIME_ZONE,
  lastError: null,
  lastFiredAt: null,
  createdAt: 1,
  updatedAt: 1,
};

describe("automation.listRules — chat wire-through", () => {
  test("passes the validated chatId and the caller's principal to the verb", async () => {
    const db = await freshDb();
    const listRules = vi.fn<AutomationService["listRules"]>(async () => [RULE]);
    await caller(await ctxWith(db, { listRules })).automation.listRules({ chatId: CHAT });
    expect(listRules).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), chatId: CHAT });
  });
});

describe("automation.listRulePresets — catalogue read wire-through", () => {
  test("delegates to the static projection verb (no principal, no chat)", async () => {
    const db = await freshDb();
    const listRulePresets = vi.fn<AutomationService["listRulePresets"]>(() => []);
    await caller(await ctxWith(db, { listRulePresets })).automation.listRulePresets();
    expect(listRulePresets).toHaveBeenCalledWith();
  });
});

describe("automation.createRuleFromPreset — preset-mint wire-through", () => {
  test("threads the caller's principal + validated chatId/presetId/zone, and the knob-override bag when present", async () => {
    const db = await freshDb();
    const createRuleFromPreset = vi.fn<AutomationService["createRuleFromPreset"]>(async () => [RULE]);
    await caller(await ctxWith(db, { createRuleFromPreset })).automation.createRuleFromPreset({
      timeZone: "asia/kathmandu",
      chatId: CHAT,
      presetId: "pacingNudge",
      knobs: { everyN: 8, steer: "shift the pacing" },
    });
    expect(createRuleFromPreset).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: OWNER }),
      chatId: CHAT,
      presetId: "pacingNudge",
      knobs: { everyN: 8, steer: "shift the pacing" },
      // The wire canonicalizes the zone before the verb sees it.
      timeZone: "Asia/Kathmandu",
    });
  });

  test("omits an absent knob bag rather than passing it as undefined (exactOptional discipline)", async () => {
    const db = await freshDb();
    const createRuleFromPreset = vi.fn<AutomationService["createRuleFromPreset"]>(async () => [RULE]);
    await caller(await ctxWith(db, { createRuleFromPreset })).automation.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, chatId: CHAT, presetId: "cutaways" });
    const [args] = createRuleFromPreset.mock.calls[0] ?? [];
    expect(args && "knobs" in args).toBe(false);
  });

  test("rejects an unknown presetId at the wire (the contract id enum bites before the verb)", async () => {
    const db = await freshDb();
    const createRuleFromPreset = vi.fn<AutomationService["createRuleFromPreset"]>(async () => [RULE]);
    await expect(
      // @ts-expect-error — an id outside RULE_PRESET_IDS is a compile error too; the wire enum is the runtime belt.
      caller(await ctxWith(db, { createRuleFromPreset })).automation.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, chatId: CHAT, presetId: "notAPreset" }),
    ).rejects.toThrow();
    expect(createRuleFromPreset).not.toHaveBeenCalled();
  });
});

// R7 + S4 — the three verbs the card and the Rules panel drive.
// Same thin-driver contract as the rest: the wire shape is validated, the PRINCIPAL comes from `ctx.auth`
// (never from input — a caller-supplied confirmer would hand the whole authority story to the caller), and
// the verb decides everything else.

describe("automation.runRuleNow — R7 wire-through", () => {
  test("passes the validated ruleId + the caller's principal (the chat is the RULE's, never a caller claim)", async () => {
    const db = await freshDb();
    const runRuleNow = vi.fn<AutomationService["runRuleNow"]>(async () => ({ outcome: "fired" }));
    await caller(await ctxWith(db, { runRuleNow })).automation.runRuleNow({ ruleId: RULE.id });
    expect(runRuleNow).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), ruleId: RULE.id });
  });
});

describe("automation.setRuleSuggestOnRefusal — B4's per-rule F4 opt-out wire-through", () => {
  test("threads the ruleId + the flag + the caller's principal", async () => {
    const db = await freshDb();
    const setRuleSuggestOnRefusal = vi.fn<AutomationService["setRuleSuggestOnRefusal"]>(async () => undefined);
    await caller(await ctxWith(db, { setRuleSuggestOnRefusal })).automation.setRuleSuggestOnRefusal({ ruleId: RULE.id, suggestOnRefusal: false });
    expect(setRuleSuggestOnRefusal).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: OWNER }),
      ruleId: RULE.id,
      suggestOnRefusal: false,
    });
  });

  test("the flag is REQUIRED on the wire — an omitted one is a BAD_REQUEST, never a silent default", async () => {
    const db = await freshDb();
    const setRuleSuggestOnRefusal = vi.fn<AutomationService["setRuleSuggestOnRefusal"]>(async () => undefined);
    const call = caller(await ctxWith(db, { setRuleSuggestOnRefusal })).automation.setRuleSuggestOnRefusal({
      ruleId: RULE.id,
    } as unknown as { ruleId: AutomationRuleId; suggestOnRefusal: boolean });
    await expect(call).rejects.toThrow();
    // The verb is never reached — a defaulted flag would silently mute (or unmute) a host's rule.
    expect(setRuleSuggestOnRefusal).not.toHaveBeenCalled();
  });
});

describe("automation.confirmSuggestion / dismissSuggestion — the S4 pair", () => {
  test("confirm threads the claim handle + the caller as the AUTHORIZER", async () => {
    const db = await freshDb();
    const suggestionId = mintTypeId(ID_PREFIX.automationSuggestion);
    const confirmSuggestion = vi.fn<AutomationService["confirmSuggestion"]>(async () => ({ ran: "stashed-arm", outcome: "fired" }));
    await caller(await ctxWith(db, { confirmSuggestion })).automation.confirmSuggestion({ suggestionId });
    expect(confirmSuggestion).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), suggestionId });
  });

  test("dismiss threads the same handle", async () => {
    const db = await freshDb();
    const suggestionId = mintTypeId(ID_PREFIX.automationSuggestion);
    const dismissSuggestion = vi.fn<AutomationService["dismissSuggestion"]>(async () => undefined);
    await caller(await ctxWith(db, { dismissSuggestion })).automation.dismissSuggestion({ suggestionId });
    expect(dismissSuggestion).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: OWNER }), suggestionId });
  });
});
