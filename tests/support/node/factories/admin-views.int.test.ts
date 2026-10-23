// @subject tests/support/node/factories/admin-user.ts
// @subject tests/support/node/factories/sessions.ts
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { seedCreatedAdminUser } from "./admin-user.ts";
import { seedAdminSession, seedBffSession, seedRevokedUserSessions } from "./sessions.ts";

const PASSWORD = "admin-output-corpus-password";
const ID_TOKEN = "admin-output-private-id-token";

test("admin output captures retain native identities and clocks while excluding secrets and preserving another user's session", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(owner.userId);
  const created = await seedCreatedAdminUser(root, owner.userId, {
    handle: castId<Handle>("admin-output-member"),
    password: PASSWORD,
  });
  expect(created.view).toMatchObject({
    id: created.row.id,
    handle: created.row.handle,
    role: "user",
    enabled: true,
    ownerHandle: null,
    createdAt: root.clock.now(),
    updatedAt: root.clock.now(),
  });
  expect(created.row.passwordHash).not.toBeNull();
  expect(await root.app.sessions.authenticate(created.view.handle, PASSWORD)).toBe(created.view.id);

  const foreign = await root.actor();
  const foreignPrincipal = await root.principalFor(foreign.id);
  const otherSession = await seedBffSession(root, { userId: foreign.id, userAgent: "Other native device" });
  const session = await seedAdminSession(root, { userId: created.view.id, userAgent: "Admin-view native device", oidcIdToken: ID_TOKEN }, owner);
  expect(session.view).toEqual({
    id: session.created.sessionId,
    userId: created.view.id,
    expiresAt: session.created.expiresAt,
    lastSeenAt: root.clock.now(),
    revokedAt: null,
    userAgent: "Admin-view native device",
    createdAt: root.clock.now(),
  });
  expect(session.row.oidcIdTokenCiphertext).not.toBeNull();

  const usersBefore = await caller.admin.listUsers();
  await expect(
    seedCreatedAdminUser(root, foreign.id, {
      handle: castId<Handle>("refused-admin-output-member"),
      password: PASSWORD,
    }),
  ).rejects.toThrow();
  expect(await caller.admin.listUsers()).toEqual(usersBefore);
  await expect(seedRevokedUserSessions(root, { principal: foreignPrincipal, userId: created.view.id })).rejects.toThrow();
  expect(await root.app.sessions.validate(session.created.token)).toMatchObject({ userId: created.view.id });

  root.clock.advance(2000);
  const revoked = await seedRevokedUserSessions(root, { principal: owner, userId: created.view.id });
  expect(revoked.result).toEqual({ revoked: 1 });
  expect(revoked.views).toEqual([{ ...session.view, revokedAt: root.clock.now() }]);
  expect(revoked.rows).toMatchObject([{ id: session.row.id, userId: created.view.id, revokedAt: root.clock.now(), oidcIdTokenCiphertext: null }]);
  expect(await root.app.sessions.validate(session.created.token)).toBeNull();
  expect(await root.app.sessions.validate(otherSession.created.token)).toMatchObject({ userId: foreign.id });
  const repeated = await seedRevokedUserSessions(root, { principal: owner, userId: created.view.id });
  expect(repeated.result).toEqual({ revoked: 0 });
  expect(repeated.views).toEqual(revoked.views);

  const views = JSON.stringify({ user: created.view, session: session.view, revoked: revoked.result, sessions: revoked.views });
  for (const secret of [PASSWORD, ID_TOKEN, created.row.passwordHash, session.created.token, session.row.tokenHash, session.row.oidcIdTokenCiphertext]) {
    if (secret === null) {
      throw new Error("the native private witness was not produced");
    }
    expect(views).not.toContain(secret);
  }
});
