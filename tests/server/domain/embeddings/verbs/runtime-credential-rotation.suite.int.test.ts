// @subject packages/server/src/domain/credentials/verbs/maybe-revoke-on-auth-failed.ts
// @subject packages/server/src/domain/credentials/verbs/replace.ts
// @subject packages/inference/src/roles/executor.ts

import { credentialExecutionEvidenceOf } from "@orb/contracts/credentials";
import { auditLogs } from "@orb/db";
import { expect } from "@orb/testkit/node";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/helpers";
import { and, eq } from "drizzle-orm";
import { fundingConnection, test } from "./runtime-funding.fixtures.ts";

for (const replace of [false, true]) {
  test(`a held provider rejection ${replace ? "cannot revoke replacement material" : "revokes its unchanged material"}`, async ({
    app,
    harness,
    db,
    ownerCaller,
    fundingProvider,
  }) => {
    const firstKey = "in-flight-first-funding-key";
    const replacementKey = "in-flight-replacement-funding-key";
    const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: firstKey, metadata: { auth: "endpoint" } });
    const connection = await fundingConnection({ ownerCaller, harness, task: "embed", credentialId: key.id });
    const held = fundingProvider.holdAuthenticationFailure();
    const call = app.runtime.executor.embed({ connection, input: "a rotation control" });
    const rejected = expect(call).toThrowProviderError("auth_failed");
    await held.reached;
    try {
      const replacement = replace ? await ownerCaller.credentials.replace({ credentialId: key.id, key: replacementKey }) : key;
      expect(replacement.id).toBe(key.id);
      expect(replacement.updatedAt).toBe(key.updatedAt);
      expect(replacement.revokedAt).toBeNull();
    } finally {
      held.release();
    }
    await rejected;
    expect(fundingProvider.authorizations).toEqual([`Bearer ${firstKey}`]);
    expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe(replace ? null : "auth_failed");
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
    ).toHaveLength(replace ? 0 : 1);
    const repaired = replace ? await app.runtime.executor.embed({ connection, input: "the repaired credential works" }) : null;
    expect(repaired?.vectors[0]).toEqual(replace ? new Float32Array([1, 0, 0]) : undefined);
    expect(fundingProvider.authorizations).toEqual(replace ? [`Bearer ${firstKey}`, `Bearer ${replacementKey}`] : [`Bearer ${firstKey}`]);
  });
}

test("opaque evidence cannot cross the credential owner boundary", async ({ app, harness, db, ownerCaller, otherCaller }) => {
  const foreignKey = await otherCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "foreign-witness-key", metadata: { auth: "endpoint" } });
  const foreignOwner = await otherCaller.sessions.me();
  const secret = await app.services.credentials.resolve({ ownerId: foreignOwner.userId, credentialId: foreignKey.id, providerId: foreignKey.provider });
  const evidence = credentialExecutionEvidenceOf(secret);
  expect(evidence.credentialId).toBe(foreignKey.id);
  expect(JSON.stringify(evidence.executionWitness)).toBe("{}");
  await app.services.credentials.maybeRevokeOnAuthFailed({
    ...evidence,
    ownerId: harness.ownerId,
    errorKind: "auth_failed",
    errorMessage: "the actual captured key was rejected",
  });
  expect((await otherCaller.credentials.list()).find((row) => row.id === foreignKey.id)?.revokedAt).toBeNull();
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, foreignKey.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, foreignKey.id), eq(auditLogs.action, "credential.revokeOwnerMismatch"))),
  ).toMatchObject([{ actorUserId: null, metadata: { claimedOwnerId: harness.ownerId, path: "auth_failed" } }]);
  expect(await ownerCaller.credentials.list()).not.toContainEqual(expect.objectContaining({ id: foreignKey.id }));
});

test("a removed dispatched credential reports a miss without inventing a successful revoke", async ({ app, harness, db, ownerCaller, fundingProvider }) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "removed-dispatched-key", metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "embed", credentialId: key.id });
  const held = fundingProvider.holdAuthenticationFailure();
  const rejected = expect(app.runtime.executor.embed({ connection, input: "a removed credential control" })).toThrowProviderError("auth_failed");
  await held.reached;
  try {
    await ownerCaller.credentials.remove({ credentialId: key.id });
  } finally {
    held.release();
  }
  await rejected;
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.revokeOwnerMismatch"))),
  ).toMatchObject([{ actorUserId: null, metadata: { claimedOwnerId: harness.ownerId, path: "auth_failed" } }]);
});
