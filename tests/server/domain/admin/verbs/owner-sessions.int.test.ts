// @subject packages/server/src/domain/admin/verbs/sessions.ts
// Only the owner manages the owner's sessions (D17): a delegated admin cannot list or revoke them through the admin
// router, an owner can, and the delegate still manages every other user's. A session the delegate may not touch reads
// as not found whether its id is unknown or the owner's.

import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { ADMIN_OP_CODES } from "#server/domain/admin/contract/errors.ts";

const OWNER_REFUSAL = { code: "BAD_REQUEST", cause: { code: ADMIN_OP_CODES.cannotModifyOwner } };

test("a delegated admin cannot list or revoke the owner's sessions, the owner can, and the delegate manages a member's", async () => {
  await using root = await createServerHarness();
  const delegate = await root.actor({ role: "admin" });
  const member = await root.actor();
  await root.app.sessions.create({ userId: root.ownerId });
  await root.app.sessions.create({ userId: member.id });
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  const adminCaller = await root.internalCallerFor(delegate.id);
  const [ownerSession] = await ownerCaller.admin.listSessions({ userId: root.ownerId });
  if (ownerSession === undefined) {
    throw new Error("the owner's session was minted");
  }

  // The delegate: refused on the owner as a target, with the owner-boundary code.
  await expect(adminCaller.admin.listSessions({ userId: root.ownerId })).rejects.toMatchObject(OWNER_REFUSAL);
  await expect(adminCaller.admin.revokeUserSessions({ userId: root.ownerId })).rejects.toMatchObject(OWNER_REFUSAL);
  // One session at a time: the owner's id reads exactly as an unknown id does, so it names nothing.
  const unknownSession = root.idSource.typeId("session");
  const ownerSessionRefusal = await adminCaller.admin.revokeSession({ sessionId: ownerSession.id }).catch((error: unknown) => error);
  const unknownSessionRefusal = await adminCaller.admin.revokeSession({ sessionId: unknownSession }).catch((error: unknown) => error);
  expect(ownerSessionRefusal).toMatchObject({ code: "NOT_FOUND" });
  expect(unknownSessionRefusal).toMatchObject({ code: "NOT_FOUND" });
  expect(String(ownerSessionRefusal).replace(ownerSession.id, unknownSession)).toBe(String(unknownSessionRefusal));
  expect(await ownerCaller.admin.listSessions({ userId: root.ownerId })).toEqual([ownerSession]);

  // The delegate on a member: listed and revoked as before.
  const [memberSession] = await adminCaller.admin.listSessions({ userId: member.id });
  if (memberSession === undefined) {
    throw new Error("the member's session was minted");
  }
  await adminCaller.admin.revokeSession({ sessionId: memberSession.id });
  await root.app.sessions.create({ userId: member.id });
  await adminCaller.admin.revokeUserSessions({ userId: member.id });
  expect(nonEmpty(await adminCaller.admin.listSessions({ userId: member.id })).every((session) => session.revokedAt !== null)).toBe(true);

  // The owner on its own sessions: listed and revoked.
  await ownerCaller.admin.revokeSession({ sessionId: ownerSession.id });
  await ownerCaller.admin.revokeUserSessions({ userId: root.ownerId });
  expect(await ownerCaller.admin.listSessions({ userId: root.ownerId })).toMatchObject([{ id: ownerSession.id, revokedAt: expect.any(Number) }]);
});
