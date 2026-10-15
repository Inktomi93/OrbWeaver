import "@orb/testkit/node/composed-real.ts";
import { setImmediate } from "node:timers/promises";
import { makeGenerationCapability } from "@orb/testkit/iso/inference-capability.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

test("cancelling one connection waiter leaves the shared catalog and another caller alive", async () => {
  const started = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<Response>();
  let requests = 0;
  await using root = await createServerHarness({
    providerFetch: () => {
      requests += 1;
      started.resolve();
      return reply.promise;
    },
  });
  const principal = await root.principalFor(root.ownerId);
  const row = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "owned-model",
    declared: { kind: "generation", features: { detectServer: false }, generation: makeGenerationCapability() },
  });
  const cancelled = new AbortController();
  const first = root.services.connection.resolve({ principal, task: "chat", connectionId: row.id, signal: cancelled.signal });
  const settled = first.then(
    () => "resolved",
    (error: unknown) => error,
  );
  const second = root.services.connection.resolve({ principal, task: "chat", connectionId: row.id });
  await started.promise;
  try {
    cancelled.abort();
    expect(await Promise.race([settled, setImmediate().then(() => "still waiting")])).toMatchObject({ kind: "aborted" });
  } finally {
    reply.resolve(Response.json({ data: [{ id: "owned-model" }] }));
  }
  expect((await second).resolved).toMatchObject({ connectionId: row.id, ownerId: principal.userId, model: "owned-model" });
  await settled;
  expect(requests).toBe(1);
});

test("already-aborted resolve and availability refuse before catalog requests or writes", async () => {
  let requests = 0;
  await using root = await createServerHarness({
    providerFetch: () => {
      requests += 1;
      return Promise.resolve(Response.json({ data: [] }));
    },
  });
  const principal = await root.principalFor(root.ownerId);
  const row = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "owned-model",
    declared: { kind: "generation", features: { detectServer: false }, generation: makeGenerationCapability() },
  });
  const params = { principal, task: "chat", connectionId: row.id, signal: AbortSignal.abort() } as const;
  await expect(root.services.connection.resolve(params)).rejects.toMatchObject({ kind: "aborted" });
  await expect(root.services.connection.availability(params)).rejects.toMatchObject({ kind: "aborted" });
  expect(requests).toBe(0);
  expect(await root.services.settings.getGlobalSetting("catalog:endpoint:http://127.0.0.1:9999/v1#list")).toBeNull();
});
