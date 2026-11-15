// @subject packages/inference/src/resolve/availability.ts
// A key the provider refused is struck, and the Connections page still reads: the struck row's role says its key was
// rejected, and every other row and role reads as it did.
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { SECRET_BOX_TEST_KEY } from "@orb/testkit/node/helpers";

test("a struck key bound to chat leaves the connections list and every model role readable", async () => {
  await using root = await createServerHarness({
    secretBoxKey: SECRET_BOX_TEST_KEY,
    providerFetch: () => Promise.reject(new Error("no provider is dialled by a readout")),
  });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const struck = await root.services.credentials.add({ principal, provider: "openai", key: "sk-struck-fixture-key-000000000000" });
  const healthy = await root.services.credentials.add({ principal, provider: "openrouter", key: "sk-or-healthy-fixture-key-0000000000" });
  const chat = await caller.connection.create({ providerId: "openai", credentialId: struck.id, baseUrl: null, model: "gpt-5-mini" });
  const summarize = await caller.connection.create({
    providerId: "openrouter",
    credentialId: healthy.id,
    baseUrl: null,
    model: "openai/gpt-4o-mini",
    allowBackground: true,
  });
  await caller.connection.setBinding({ task: "chat", connectionId: chat.id });
  await caller.connection.setBinding({ task: "summarize", connectionId: summarize.id });
  await root.services.credentials.markRevokedByUser({ principal, credentialId: struck.id });

  expect((await caller.connection.list()).map((row) => row.id)).toEqual(expect.arrayContaining([chat.id, summarize.id]));
  const roles = await caller.connection.listBindings();
  expect(roles.find((role) => role.task === "chat")).toMatchObject({ binding: { connectionId: chat.id }, resolved: null, unavailableCause: "key-rejected" });
  expect(roles.find((role) => role.task === "summarize")).toMatchObject({
    binding: { connectionId: summarize.id },
    resolved: { connectionId: summarize.id },
    unavailableCause: null,
  });
});
