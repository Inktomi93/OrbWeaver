// Entry: `isRefusalReason` and `REFUSAL_REASONS` through `@orb/contracts/refusal`, the door the client reads a tRPC
// error's `data.reason` through. Layer: contracts. Red: a guard that admits any string, or a reason family dropped from
// the registry, fails a case below.
import { ruleRefusalReason } from "@orb/contracts/automation";
import { PROVIDER_FAILURE_REASON_PREFIX } from "@orb/contracts/chat";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { isRefusalReason, REFUSAL_REASONS } from "@orb/contracts/refusal";
import { expect, test } from "@orb/testkit/node";

// A code only a server domain declares (`packages/server/src/domain/workloads/substrate/params.ts`): no client can name it.
const SERVER_ONLY_REASON = "invalid_params";

test("every reason the registry holds is admitted, each connection code included", () => {
  expect(REFUSAL_REASONS.length).toBeGreaterThan(0);
  expect(REFUSAL_REASONS.filter((reason) => !isRefusalReason(reason))).toEqual([]);
  expect(Object.values(CONNECTION_OP_CODES).filter((reason) => !REFUSAL_REASONS.some((held) => held === reason))).toEqual([]);
});

test("a provider failure and an automation rule refusal are admitted by their prefix and code", () => {
  expect(isRefusalReason(`${PROVIDER_FAILURE_REASON_PREFIX}rate_limit`)).toBe(true);
  expect(isRefusalReason(ruleRefusalReason("bad_cel"))).toBe(true);
});

test("a reason no contract declares is refused, as is the empty reason and a rule prefix with no code", () => {
  expect(isRefusalReason(SERVER_ONLY_REASON)).toBe(false);
  expect(isRefusalReason("")).toBe(false);
  expect(isRefusalReason("automation_rule_not_a_code")).toBe(false);
});
