import "@orb/testkit/node/composed-real.ts";
import type { CredentialHealth } from "@orb/contracts/credentials";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso/ids.ts";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const MODEL = "health-ownership-encoder";
const KEY = "health-ownership-private-material";
const PROBE_GAP_MS = 120_000;
const UNREACHABLE = { status: "unreachable", checkedAt: 0, reason: "scripted remote transport failure" } satisfies CredentialHealth;

interface CredentialOwner {
  readonly principal: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly saved: Awaited<ReturnType<ServerTestHarness["services"]["credentials"]["add"]>>;
}

async function credential(root: ServerTestHarness): Promise<CredentialOwner> {
  const principal = await root.principalFor(root.ownerId);
  const saved = await root.services.credentials.add({ principal, provider: TEST_PROVIDER_ID, key: KEY, metadata: { auth: "endpoint" } });
  return { principal, saved };
}

test("same-ID native connection probes have independent cooldowns and checkedAt clocks", async () => {
  const probeReply = (): Promise<Response> => Promise.resolve(Response.json({ data: [{ id: MODEL }] }));
  await using first = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), providerFetch: probeReply, startJobs: false });
  await using second = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 2), providerFetch: probeReply, startJobs: false });
  const firstKey = await credential(first);
  const secondKey = await credential(second);
  expect(firstKey.saved.id).toBe(secondKey.saved.id);
  const connection = (root: ServerTestHarness, key: CredentialOwner): ReturnType<ServerTestHarness["services"]["connection"]["create"]> =>
    root.services.connection.create({
      principal: key.principal,
      providerId: TEST_PROVIDER_ID,
      credentialId: key.saved.id,
      baseUrl: "http://127.0.0.1:9999/v1",
      model: MODEL,
      declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false } },
    });
  const firstConnection = await connection(first, firstKey);
  const secondConnection = await connection(second, secondKey);
  const probeFirst = (): Promise<CredentialHealth> => first.services.connection.probe({ principal: firstKey.principal, connectionId: firstConnection.id });
  const probeSecond = (): Promise<CredentialHealth> => second.services.connection.probe({ principal: secondKey.principal, connectionId: secondConnection.id });
  expect(await probeFirst()).toEqual({ status: "ok", checkedAt: first.clock.now() });
  second.clock.advance(1);
  expect(await probeSecond()).toEqual({ status: "ok", checkedAt: second.clock.now() });
  expect(await probeFirst()).toEqual({ status: "throttled", checkedAt: first.clock.now() });
  const secondCheckedAt = second.clock.now();
  first.clock.advance(PROBE_GAP_MS);
  expect(await probeFirst()).toEqual({ status: "ok", checkedAt: first.clock.now() });
  expect(await probeSecond()).toEqual({ status: "throttled", checkedAt: secondCheckedAt });
  await first[Symbol.asyncDispose]();
  second.clock.advance(PROBE_GAP_MS);
  expect(await probeSecond()).toEqual({ status: "ok", checkedAt: second.clock.now() });
});

test("same-ID remote failure streaks trip independently and disposal preserves the sibling's strikes", async () => {
  await using first = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), ids: createSeededIds(FIXTURE_ID_CURSOR), startJobs: false });
  await using second = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 2), ids: createSeededIds(FIXTURE_ID_CURSOR), startJobs: false });
  const firstKey = await credential(first);
  const secondKey = await credential(second);
  expect(firstKey.saved.id).toBe(secondKey.saved.id);
  const strike = (root: ServerTestHarness, key: CredentialOwner): Promise<CredentialHealth> =>
    root.services.credentials.recordProbeOutcome({ principal: key.principal, credentialId: key.saved.id, localEndpoint: false, result: UNREACHABLE });
  expect(await strike(first, firstKey)).toMatchObject({ status: "unreachable", checkedAt: first.clock.now() });
  second.clock.advance(PROBE_GAP_MS);
  expect(await strike(second, secondKey)).toMatchObject({ status: "unreachable", checkedAt: second.clock.now() });
  first.clock.advance(PROBE_GAP_MS * 2);
  expect(await strike(first, firstKey)).toMatchObject({ status: "unreachable", checkedAt: first.clock.now() });
  expect((await first.services.credentials.list({ principal: firstKey.principal }))[0]?.revokedAt).toBeNull();
  first.clock.advance(PROBE_GAP_MS);
  expect(await strike(first, firstKey)).toMatchObject({ status: "revoked", checkedAt: first.clock.now() });
  expect((await first.services.credentials.list({ principal: firstKey.principal }))[0]).toMatchObject({
    revokedAt: first.clock.now(),
    revokedReason: "unreachable",
  });
  expect((await second.services.credentials.list({ principal: secondKey.principal }))[0]?.revokedAt).toBeNull();
  second.clock.advance(PROBE_GAP_MS * 3);
  expect(await strike(second, secondKey)).toMatchObject({ status: "unreachable", checkedAt: second.clock.now() });
  await first[Symbol.asyncDispose]();
  second.clock.advance(PROBE_GAP_MS);
  expect(await strike(second, secondKey)).toMatchObject({ status: "revoked", checkedAt: second.clock.now() });
  expect((await second.services.credentials.list({ principal: secondKey.principal }))[0]).toMatchObject({
    revokedAt: second.clock.now(),
    revokedReason: "unreachable",
  });
});
