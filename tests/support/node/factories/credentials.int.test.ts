// @subject tests/support/node/factories/credentials.ts

import { randomBytes } from "node:crypto";
import { credentialViewSchema } from "@orb/contracts/credentials";
import { auditLogs, userCredentials } from "@orb/db";
import { DomainNoCredentialError, DomainOperationError } from "@orb/kit/errors";
import { seedUserCredential } from "@orb/testkit/node/factories/credentials.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const KEY = "synthetic-corpus-credential";

test("the actual credential producer seals fresh material, preserves the returned identity and emits secret-free audit/view data", async () => {
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32) });
  const principal = await root.principalFor(root.ownerId);
  const params = { principal, provider: "custom-openai", label: "Corpus endpoint", key: KEY, metadata: { auth: "endpoint" as const } };
  const first = await seedUserCredential(root.db, root.services.credentials.add, params);
  const second = await seedUserCredential(root.db, root.services.credentials.add, params);
  expect(first.row.id).toBe(first.view.id);
  expect(first.row.ownerId).toBe(principal.userId);
  expect(second.row.id).not.toBe(first.row.id);
  expect(second.row.label).not.toBe(first.row.label);
  expect(second.row.iv).not.toBe(first.row.iv);
  expect(first.row.ciphertext).not.toBe(Buffer.from(KEY).toString("base64"));
  expect(credentialViewSchema.parse(first.view)).toEqual(first.view);
  expect(first.audit).toMatchObject([{ actorUserId: principal.userId, entityId: first.view.id, action: "credential.add" }]);
  expect(JSON.stringify({ view: first.view, audit: first.audit })).not.toContain(KEY);
  const resolved = await root.services.credentials.resolve({ ownerId: principal.userId, credentialId: first.row.id, providerId: first.row.provider });
  expect(resolved.secret).toBe(KEY);
  expect(resolved.kind).toBe("bearer");
  expect(resolved.credentialId).toBe(first.row.id);
});

test("a foreign credential ID cannot manufacture a resolved secret or widen the real routed list", async () => {
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32) });
  const owner = await root.principalFor(root.ownerId);
  const capture = await seedUserCredential(root.db, root.services.credentials.add, { principal: owner, provider: "custom-openai", key: KEY });
  const foreign = await root.actor();
  await expect(
    root.services.credentials.resolve({ ownerId: foreign.id, credentialId: capture.row.id, providerId: capture.row.provider }),
  ).rejects.toBeInstanceOf(DomainNoCredentialError);
  const foreignCaller = await root.internalCallerFor(foreign.id);
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  expect(await foreignCaller.credentials.list()).toEqual([]);
  expect(await ownerCaller.credentials.list()).toEqual([capture.view]);
});

test("disabled deployment storage refuses before producing a credential or audit row", async () => {
  await using root = await createServerHarness({ secretBoxKey: null });
  const principal = await root.principalFor(root.ownerId);
  const credentialsBefore = await root.db.select().from(userCredentials);
  const auditBefore = await root.db.select().from(auditLogs);
  const refused = seedUserCredential(root.db, root.services.credentials.add, { principal, provider: "custom-openai", key: KEY });
  await expect(refused).rejects.toBeInstanceOf(DomainOperationError);
  await expect(refused).rejects.toThrow("Per-user credential storage is disabled");
  expect(await root.db.select().from(userCredentials)).toEqual(credentialsBefore);
  expect(await root.db.select().from(auditLogs)).toEqual(auditBefore);
});
