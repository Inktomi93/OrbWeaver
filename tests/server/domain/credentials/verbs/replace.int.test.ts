// verb: replace — the one explicit way a stored key's secret changes: in place by id, owner-scoped.

import type { ProviderId } from "@orb/contracts/inference";
import { userCredentials } from "@orb/db";
import { castId } from "@orb/kit/ids";
import { CREDENTIALS_OP_CODES, createCredentialsService } from "@orb/server/domain/credentials";
import { createSecretBox } from "@orb/server/infra/crypto";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedCredential, seedUser } from "../_support.ts";

const OPENROUTER = castId<ProviderId>("openrouter");

describe("replace", () => {
  test("replaces the secret in place: same id and label, the new key resolves", async () => {
    const db = await freshDb();
    const { svc, owner, cred } = await seedCredential(db, makeHarness(db), { key: "sk-old", label: "work" });
    const replaced = await svc.replace({ principal: principal(owner), credentialId: cred.id, key: "sk-new" });

    expect(replaced).toMatchObject({ id: cred.id, label: "work", provider: "openrouter" });
    expect(await svc.resolve({ ownerId: owner, credentialId: cred.id, providerId: OPENROUTER })).toMatchObject({ secret: "sk-new" });
    expect(await db.select().from(userCredentials)).toHaveLength(1);
  });

  test("a fresh key clears a revocation", async () => {
    const db = await freshDb();
    const { svc, owner, cred } = await seedCredential(db, makeHarness(db));
    await svc.markRevokedByUser({ principal: principal(owner), credentialId: cred.id });
    const replaced = await svc.replace({ principal: principal(owner), credentialId: cred.id, key: "sk-new" });
    expect(replaced.revokedAt).toBeNull();
  });

  test("audits credential.replace attributed to the owner", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cred } = await seedCredential(db, h);
    await svc.replace({ principal: principal(owner), credentialId: cred.id, key: "sk-new" });
    const audit = h.audits.find((a) => a.entry.action === "credential.replace");
    expect(audit?.entry).toMatchObject({ actorUserId: owner, entityType: "credential", entityId: cred.id });
  });

  test("another user's credential is refused as not found and keeps its secret", async () => {
    const db = await freshDb();
    const { svc, owner, cred } = await seedCredential(db, makeHarness(db), { key: "sk-alice" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });

    await expect(svc.replace({ principal: principal(bob), credentialId: cred.id, key: "sk-bob" })).rejects.toMatchObject({
      code: CREDENTIALS_OP_CODES.notFound,
    });
    expect(await svc.resolve({ ownerId: owner, credentialId: cred.id, providerId: OPENROUTER })).toMatchObject({ secret: "sk-alice" });
  });

  test("a disabled SecretBox refuses before anything is read or written", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { owner, cred } = await seedCredential(db, h);
    const disabled = createCredentialsService({ ...h.ctx, box: createSecretBox(null) });
    await expect(disabled.replace({ principal: principal(owner), credentialId: cred.id, key: "sk-new" })).rejects.toMatchObject({
      code: CREDENTIALS_OP_CODES.disabled,
    });
    const [row] = await db.select({ updatedAt: userCredentials.updatedAt }).from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(row?.updatedAt).toBe(cred.updatedAt);
  });
});
