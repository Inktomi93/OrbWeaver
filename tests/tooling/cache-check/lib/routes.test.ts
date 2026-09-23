import { CACHE_ROUTES, missingCredential, ROUTE_SPECS } from "@orb/tooling/cache-check";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("only the subscription route is optional: without a credential it is SKIPPED, the others cannot measure", () => {
  const verdicts = Object.fromEntries(CACHE_ROUTES.map((route) => [route, missingCredential(ROUTE_SPECS[route]).verdict]));
  expect(verdicts).toEqual({ direct: "ERROR", openrouter: "ERROR", "agent-sdk": "SKIPPED" });
});

test("the SKIPPED line names both ways to supply the subscription credential", () => {
  const { reason } = missingCredential(ROUTE_SPECS["agent-sdk"]);
  expect(reason).toContain("set CLAUDE_SUB_PROBE_TOKEN");
  expect(reason).toContain("keep a claude-sub credential in the stage DB");
});
