import { nextTurnConnectionViewSchema } from "@orb/contracts/chat";
import { testModelId, testProviderId } from "@orb/testkit/iso/inference-identities.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("member-safe connection output keeps configured and unset arms closed", () => {
  const configured = {
    state: "configured",
    connectionLabel: null,
    provider: testProviderId("openrouter"),
    providerLabel: "OpenRouter",
    model: testModelId("chat-model"),
  };
  expect(nextTurnConnectionViewSchema.parse(configured)).toEqual(configured);
  expect(nextTurnConnectionViewSchema.parse({ ...configured, connectionLabel: "Host's label" })).toEqual({ ...configured, connectionLabel: "Host's label" });
  expect(nextTurnConnectionViewSchema.parse({ state: "unset" })).toEqual({ state: "unset" });
  expect(nextTurnConnectionViewSchema.safeParse({ ...configured, apiKey: "private" }).success).toBe(false);
  expect(nextTurnConnectionViewSchema.safeParse({ state: "unset", model: configured.model }).success).toBe(false);
  expect(nextTurnConnectionViewSchema.safeParse({ state: "configured" }).success).toBe(false);
});
