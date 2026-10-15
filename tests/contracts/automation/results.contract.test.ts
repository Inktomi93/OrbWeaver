import { confirmSuggestionResultSchema, fireViewSchema, ruleViewSchema, runRuleNowResultSchema, testRunResultSchema } from "@orb/contracts/automation";
import { ID_PREFIX } from "@orb/kit/ids";
import { makeRuleView } from "@orb/testkit/node/factories/automation-view.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("rule output retains corruption, disablement and provenance disclosure but refuses undeclared trigger and action fields", () => {
  const rule = makeRuleView({ actionsCorrupt: true, autoDisabled: true, enabled: false });
  expect(ruleViewSchema.parse(rule)).toEqual(rule);
  expect(ruleViewSchema.safeParse({ ...rule, trigger: { ...rule.trigger, privateInput: true } }).success).toBe(false);
  const action = { type: "set_variable", scope: "chat", key: "tone", op: "set", value: "quiet" };
  expect(ruleViewSchema.parse({ ...rule, actions: [action] }).actions).toEqual([action]);
  expect(ruleViewSchema.safeParse({ ...rule, actions: [{ ...action, privateInput: true }] }).success).toBe(false);
  expect(ruleViewSchema.safeParse({ ...rule, ownerId: "private-owner" }).success).toBe(false);
});

test("dry-run previews remain closed and omit absent optional fields while fire details stay open", ({ ids }) => {
  const preview = { type: "set_variable", renderedPreview: "tone = quiet" };
  const dry = { predicate: { error: "unknown variable" }, arms: [preview] };
  expect(testRunResultSchema.parse(dry)).toEqual(dry);
  expect(testRunResultSchema.parse({ predicate: true, arms: [{ type: "set_variable", renderedPreview: undefined, error: undefined }] })).toEqual({
    predicate: true,
    arms: [{ type: "set_variable" }],
  });
  expect(testRunResultSchema.safeParse({ ...dry, predicate: { ...dry.predicate, privateError: "private" } }).success).toBe(false);
  expect(testRunResultSchema.safeParse({ ...dry, arms: [{ ...preview, privateInput: "private" }] }).success).toBe(false);
  const fire = {
    id: ids.next(ID_PREFIX.automationFire),
    ruleId: ids.next(ID_PREFIX.automationRule),
    chatId: null,
    triggerType: "domain",
    outcome: "action_error",
    detail: { customArm: { arbitraryResult: [1, "retained"] } },
    firedAt: 1,
  };
  expect(fireViewSchema.parse(fire)).toEqual(fire);
  expect(fireViewSchema.safeParse({ ...fire, privateAudit: "private" }).success).toBe(false);
  expect(runRuleNowResultSchema.parse({ outcome: "predicate_false" })).toEqual({ outcome: "predicate_false" });
  expect(confirmSuggestionResultSchema.parse({ ran: "fresh-run", outcome: "predicate_false" })).toEqual({ ran: "fresh-run", outcome: "predicate_false" });
  expect(confirmSuggestionResultSchema.safeParse({ ran: "private-path", outcome: "fired" }).success).toBe(false);
});
