import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { fireViewSchema, testRunResultSchema } from "../../../../../packages/server/src/domain/automation/contract/results.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("dry-run predicate errors and previews are closed, but fire detail remains model-authored data", () => {
  const preview = { type: "set_variable", renderedPreview: "tone = quiet" };
  const dry = { predicate: { error: "unknown variable" }, arms: [preview] };
  expect(testRunResultSchema.parse(dry)).toEqual(dry);
  expect(testRunResultSchema.safeParse({ ...dry, predicate: { ...dry.predicate, privateError: "private" } }).success).toBe(false);
  expect(testRunResultSchema.safeParse({ ...dry, arms: [{ ...preview, privateInput: "private" }] }).success).toBe(false);
  const fire = {
    id: mintTypeId(ID_PREFIX.automationFire),
    ruleId: mintTypeId(ID_PREFIX.automationRule),
    chatId: null,
    triggerType: "domain",
    outcome: "action_error",
    detail: { customArm: { arbitraryResult: [1, "retained"] } },
    firedAt: 1,
  };
  expect(fireViewSchema.parse(fire)).toEqual(fire);
  expect(fireViewSchema.safeParse({ ...fire, privateAudit: "private" }).success).toBe(false);
});
