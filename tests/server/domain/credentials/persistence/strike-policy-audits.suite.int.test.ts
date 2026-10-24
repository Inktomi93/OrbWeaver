// Each provider error kind strikes or spares the dispatched key as policy says, recorded as one credential
// audit_logs row, and a keyless rejection writes no strike for an unrelated owned key.
// @subject packages/server/src/domain/credentials/verbs/maybe-revoke-on-auth-failed.ts
// @subject packages/server/src/domain/credentials/substrate/execution-witness.ts
// @subject packages/contracts/src/credentials/index.ts

import { credentialExecutionEvidenceOf } from "@orb/contracts/credentials";
import { auditLogs } from "@orb/db";
import { expect } from "@orb/testkit/node";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/helpers";
import { and, eq } from "drizzle-orm";
import { PROVIDER_ERROR_KINDS } from "#inference/contract/errors.ts";
import { fundingConnection, test } from "../../embeddings/verbs/runtime-funding.fixtures.ts";

for (const kind of PROVIDER_ERROR_KINDS) {
  test(`the credential owner applies exactly its ${kind} strike policy`, async ({ app, harness, db, ownerCaller }) => {
    const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "classified-funding-key", metadata: { auth: "endpoint" } });
    const secret = await app.services.credentials.resolve({ ownerId: harness.ownerId, credentialId: key.id, providerId: key.provider });
    const evidence = credentialExecutionEvidenceOf(secret);
    expect(Object.keys(evidence).sort()).toEqual(["credentialId", "executionWitness"]);
    expect(JSON.stringify(evidence.executionWitness)).toBe("{}");
    await app.services.credentials.maybeRevokeOnAuthFailed({
      ...evidence,
      ownerId: harness.ownerId,
      errorKind: kind,
      errorMessage: "the classified provider failure",
    });
    expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe(kind === "auth_failed" ? "auth_failed" : null);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
    ).toHaveLength(kind === "auth_failed" ? 1 : 0);
  });
}

test("a genuinely keyless provider rejection cannot strike an unrelated owned key", async ({ app, harness, db, ownerCaller, fundingProvider }) => {
  const spare = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "keyless-spare-key", metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "embed" });
  expect(credentialExecutionEvidenceOf(connection.credential)).toEqual({ credentialId: null, executionWitness: null });
  fundingProvider.status(401);
  await expect(app.runtime.executor.embed({ connection, input: "the keyless rejection control" })).toThrowProviderError("auth_failed");
  expect((await ownerCaller.credentials.list()).find((row) => row.id === spare.id)?.revokedAt).toBeNull();
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, spare.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(0);
  expect(fundingProvider.authorizations).toEqual([null]);
});
