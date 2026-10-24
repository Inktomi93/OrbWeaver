import { makeGenerationCapability } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

test("connection admission and use-for-everything retain canonical API and funding decisions", async () => {
  await using root = await createServerHarness();
  const { services } = root;
  const ownerPrincipal = await root.principalFor(root.ownerId);
  const fields = {
    principal: ownerPrincipal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "owned-model",
    declared: { kind: "generation", features: { detectServer: false }, generation: makeGenerationCapability() },
  } as const;
  await expect(services.connection.create({ ...fields, api: "agent-sdk" })).rejects.toMatchObject({ code: "connection_api_incoherent" });
  const row = await services.connection.create(fields);
  expect((await services.connection.useForEverything({ principal: ownerPrincipal, connectionId: row.id })).map((binding) => binding.task)).toEqual(["chat"]);
  await services.connection.update({ principal: ownerPrincipal, connectionId: row.id, patch: { allowBackground: true } });
  expect((await services.connection.useForEverything({ principal: ownerPrincipal, connectionId: row.id })).map((binding) => binding.task)).toEqual([
    "chat",
    "summarize",
  ]);
});

test("diagnostics resolve embedding rows under their canonical kind task", async () => {
  await using root = await createServerHarness({ providerFetch: () => Promise.resolve(Response.json({ data: [{ id: "owned-encoder" }] })) });
  const principal = await root.principalFor(root.ownerId);
  const row = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "owned-encoder",
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false } },
  });
  expect(await root.services.connection.probe({ principal, connectionId: row.id })).toMatchObject({ status: "ok" });
});
