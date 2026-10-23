// @subject packages/inference/src/backends/agent-sdk/catalog.ts
// @subject packages/inference/src/catalog/listing.ts
import { getLog } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { physicalSdkScenario } from "./regression-edge.fixtures.ts";

const TOKEN = "sk-ant-oat01-0123456789abcdef0123456789abcdef";
const ROTATED = "rotated-synthetic-subscription-token";
const MODELS = [
  {
    value: "sonnet",
    resolvedModel: "claude-sonnet-4-5",
    displayName: "Sonnet",
    description: "the default",
    supportsEffort: true,
    supportedEffortLevels: ["low", "high"],
  },
];

test("native daemon discovery uses the caller's current saved credential and normalizes advertised model facts", async () => {
  await using edge = physicalSdkScenario({ models: MODELS });
  await using root = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: edge.spawn, startJobs: false });
  const principal = await root.principalFor(root.ownerId);
  const key = await root.services.credentials.add({ principal, provider: "claude-sub", key: TOKEN });
  const foreign = await root.actor();
  await expect(
    root.services.connection.draftCatalogModels({ principal: await root.principalFor(foreign.id), providerId: "claude-sub", credentialId: key.id }),
  ).rejects.toThrow();
  expect(edge.children).toHaveLength(0);
  const draft = { principal, providerId: "claude-sub", credentialId: key.id };
  expect(await root.services.connection.draftCatalogModels(draft)).toMatchObject({ listed: true, models: [{ id: "sonnet", name: "Sonnet" }] });
  expect(edge.environments.map((env) => env["CLAUDE_CODE_OAUTH_TOKEN"])).toEqual([TOKEN]);
  const row = await root.services.connection.create({ principal, providerId: "claude-sub", credentialId: key.id, baseUrl: null, model: "sonnet" });
  const { resolved } = await root.app.runtime.resolve({ principal, task: "chat", connectionId: row.id });
  expect(resolved.model).toBe("claude-sonnet-4-5");
  expect(resolved.capability).toMatchObject({
    kind: "generation",
    generation: { reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "high"] } },
  });
  await root.services.credentials.replace({ principal, credentialId: key.id, key: ROTATED });
  await root.app.runtime.catalogs.refresh("claude-sub");
  expect(await root.services.connection.draftCatalogModels(draft)).toMatchObject({ listed: true });
  expect(edge.environments.map((env) => env["CLAUDE_CODE_OAUTH_TOKEN"])).toEqual([TOKEN, ROTATED]);
});

test("native catalog refusal scrubs a reflected saved token from the readable reason and the actual warning", async () => {
  await using edge = physicalSdkScenario({ catalogError: `auth rejected for ${TOKEN} — refresh the token` });
  await using root = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: edge.spawn, startJobs: false });
  const principal = await root.principalFor(root.ownerId);
  const key = await root.services.credentials.add({ principal, provider: "claude-sub", key: TOKEN });
  using warning = vi.spyOn(getLog(), "warn");
  const listing = await root.services.connection.draftCatalogModels({ principal, providerId: "claude-sub", credentialId: key.id });
  expect(listing.listed).toBe(false);
  if (listing.listed) {
    throw new Error("the controlled daemon refusal unexpectedly listed models");
  }
  expect(listing.reason).toContain("auth rejected");
  expect(listing.reason).toContain("refresh the token");
  expect(listing.reason).not.toContain(TOKEN);
  expect(edge.environments.map((env) => env["CLAUDE_CODE_OAUTH_TOKEN"])).toEqual([TOKEN]);
  const logs = JSON.stringify(warning.mock.calls, (_key, value: unknown) =>
    value instanceof Error ? { ...value, message: value.message, stack: value.stack, cause: value.cause } : value,
  );
  expect(logs).toContain("auth rejected");
  expect(logs).not.toContain(TOKEN);
});

test("native catalog error prose remains readable, markup-free, control-free and bounded", async () => {
  await using edge = physicalSdkScenario({ catalogError: `<html><body><h1>Daemon died</h1><p>exit\u0007 ${"filler ".repeat(300)}</p></body></html>` });
  await using root = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: edge.spawn, startJobs: false });
  const principal = await root.principalFor(root.ownerId);
  const key = await root.services.credentials.add({ principal, provider: "claude-sub", key: TOKEN });
  const listing = await root.services.connection.draftCatalogModels({ principal, providerId: "claude-sub", credentialId: key.id });
  expect(listing.listed).toBe(false);
  if (listing.listed) {
    throw new Error("the controlled daemon refusal unexpectedly listed models");
  }
  expect(listing.reason).toContain("Daemon died");
  expect(listing.reason).not.toContain("<h1>");
  expect(listing.reason).not.toContain("\u0007");
  expect(listing.reason.length).toBeLessThan(600);
});
