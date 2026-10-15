// @subject tests/support/node/factories/credentials.ts

import { randomBytes } from "node:crypto";
import { credentialViewSchema } from "@orb/contracts/credentials";
import { auditLogs, userCredentials } from "@orb/db";
import { DomainNoCredentialError, DomainOperationError } from "@orb/kit/errors";
import { seedUserCredential } from "@orb/testkit/node/factories/credentials.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { and, eq } from "drizzle-orm";

const KEY = "synthetic-corpus-credential";
const REPLACEMENT_KEY = "replacement-corpus-credential";

test("the actual credential producer seals fresh material, preserves the returned identity and emits secret-free audit/view data", async () => {
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32) });
  const principal = await root.principalFor(root.ownerId);
  const params = { principal, provider: "custom-openai", label: "Corpus endpoint", key: KEY, metadata: { auth: "endpoint" as const } };
  const first = await seedUserCredential(root.db, root.services.credentials.add, params);
  root.clock.advance(1);
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
  const caller = await root.internalCallerFor(root.ownerId);
  const enabled = await caller.credentials.storageStatus();
  expect(enabled).toEqual({ enabled: true });
  root.clock.advance(1);
  await caller.credentials.markRevokedByUser({ credentialId: first.view.id });
  const revoked = (await caller.credentials.list()).find((view) => view.id === first.view.id);
  expect(revoked).toEqual({ ...first.view, revokedAt: root.clock.now(), revokedReason: "user", updatedAt: root.clock.now() });
  root.clock.advance(1);
  const replaced = await caller.credentials.replace({ credentialId: first.view.id, key: REPLACEMENT_KEY });
  expect(replaced).toEqual({ ...first.view, updatedAt: root.clock.now() });
  const rotated = await root.db
    .select()
    .from(userCredentials)
    .where(and(eq(userCredentials.id, replaced.id), eq(userCredentials.ownerId, principal.userId)))
    .get();
  if (rotated === undefined) {
    throw new Error("native credential replacement lost its owned canon");
  }
  expect(rotated.iv).not.toBe(first.row.iv);
  expect(rotated.ciphertext).not.toBe(first.row.ciphertext);
  expect(await root.services.credentials.resolve({ ownerId: principal.userId, credentialId: replaced.id, providerId: replaced.provider })).toMatchObject({
    secret: REPLACEMENT_KEY,
    credentialId: first.view.id,
    kind: "bearer",
  });
  const listed = await caller.credentials.list();
  expect(listed).toEqual([replaced, second.view]);
  const audit = await root.db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.actorUserId, principal.userId), eq(auditLogs.entityId, replaced.id)))
    .orderBy(auditLogs.createdAt, auditLogs.id);
  expect(audit.map((row) => row.action)).toEqual(["credential.add", "credential.markRevokedByUser", "credential.replace"]);
  const publicLifecycle = JSON.stringify({ enabled, created: first.view, revoked, replaced, listed, audit });
  for (const secret of [KEY, REPLACEMENT_KEY, first.row.ciphertext, first.row.iv, first.row.tag, rotated.ciphertext, rotated.iv, rotated.tag]) {
    expect(publicLifecycle).not.toContain(secret);
  }
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
  expect(await foreignCaller.credentials.storageStatus()).toEqual(await ownerCaller.credentials.storageStatus());
  expect(await foreignCaller.credentials.list()).toEqual([]);
  expect(await ownerCaller.credentials.list()).toEqual([capture.view]);
  const before = { credentials: await root.db.select().from(userCredentials), audit: await root.db.select().from(auditLogs) };
  await expect(foreignCaller.credentials.replace({ credentialId: capture.view.id, key: REPLACEMENT_KEY })).rejects.toThrow();
  expect({ credentials: await root.db.select().from(userCredentials), audit: await root.db.select().from(auditLogs) }).toEqual(before);
});

test("disabled deployment storage refuses before producing a credential or audit row", async () => {
  await using root = await createServerHarness({ secretBoxKey: null });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  expect(await caller.credentials.storageStatus()).toEqual({ enabled: false });
  const credentialsBefore = await root.db.select().from(userCredentials);
  const auditBefore = await root.db.select().from(auditLogs);
  const refused = seedUserCredential(root.db, root.services.credentials.add, { principal, provider: "custom-openai", key: KEY });
  await expect(refused).rejects.toBeInstanceOf(DomainOperationError);
  await expect(refused).rejects.toThrow("Per-user credential storage is disabled");
  expect(await root.db.select().from(userCredentials)).toEqual(credentialsBefore);
  expect(await root.db.select().from(auditLogs)).toEqual(auditBefore);
});
