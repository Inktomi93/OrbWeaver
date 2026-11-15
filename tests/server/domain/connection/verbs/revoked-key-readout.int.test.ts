// @subject packages/inference/src/resolve/availability.ts
// A revoked key bound to chat names why it was revoked, and the Connections page still reads: the revoked row's role
// carries the cause for its stored reason, and every other row and role reads as it did.
import type { CredentialHealth, CredRevokedReason } from "@orb/contracts/credentials";
import { CRED_REVOKED_REASONS } from "@orb/contracts/credentials";
import type { UnavailableCause } from "@orb/contracts/inference";
import type { UserCredentialId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { SECRET_BOX_TEST_KEY } from "@orb/testkit/node/helpers";

// Past the probe throttle window, so each recorded failure is its own probe.
const PROBE_GAP_MS = 2 * 60_000;
// Far past any strike limit: the loop stops at the first probe that revokes.
const STRIKES_MAX = 10;

// The wire cause each stored reason reads as: the contract this case pins.
const CAUSES: Record<CredRevokedReason, UnavailableCause> = {
  ["auth_failed"]: "key-rejected",
  unreachable: "key-revoked-unreachable",
  user: "key-revoked-by-user",
};

// Each reason through the production path that writes it.
const REVOKE: Record<CredRevokedReason, (root: ServerTestHarness, credentialId: UserCredentialId) => Promise<void>> = {
  ["auth_failed"]: async (root, credentialId) => {
    const result = { status: "revoked", checkedAt: 0, reason: "scripted provider rejection" } satisfies CredentialHealth;
    await root.services.credentials.recordProbeOutcome({ principal: await root.principalFor(root.ownerId), credentialId, localEndpoint: false, result });
  },
  unreachable: async (root, credentialId) => {
    const principal = await root.principalFor(root.ownerId);
    const result = { status: "unreachable", checkedAt: 0, reason: "scripted remote transport failure" } satisfies CredentialHealth;
    for (let strike = 0; strike < STRIKES_MAX; strike += 1) {
      if ((await root.services.credentials.recordProbeOutcome({ principal, credentialId, localEndpoint: false, result })).status === "revoked") {
        return;
      }
      root.clock.advance(PROBE_GAP_MS);
    }
    throw new Error("the remote failure streak never revoked the key");
  },
  user: async (root, credentialId) => {
    await root.services.credentials.markRevokedByUser({ principal: await root.principalFor(root.ownerId), credentialId });
  },
};

test.for(CRED_REVOKED_REASONS)("a key revoked for %s bound to chat reads its own cause and leaves every model role readable", async (reason) => {
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
  await REVOKE[reason](root, struck.id);
  expect((await caller.credentials.list()).find((key) => key.id === struck.id)?.revokedReason).toBe(reason);

  expect((await caller.connection.list()).map((row) => row.id)).toEqual(expect.arrayContaining([chat.id, summarize.id]));
  const roles = await caller.connection.listBindings();
  expect(roles.find((role) => role.task === "chat")).toMatchObject({ binding: { connectionId: chat.id }, resolved: null, unavailableCause: CAUSES[reason] });
  expect(roles.find((role) => role.task === "summarize")).toMatchObject({
    binding: { connectionId: summarize.id },
    resolved: { connectionId: summarize.id },
    unavailableCause: null,
  });
});
