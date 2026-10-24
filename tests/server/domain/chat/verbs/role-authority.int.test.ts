// @subject packages/server/src/domain/chat/guard.ts
// @subject packages/server/src/domain/chat/persistence/participants-read.ts
// @subject packages/server/src/transport/trpc/role-output.ts

import { databaseHandle } from "@orb/db/wiring-driver";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import { createResolveViewerVisibility } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import { can } from "@orb/testkit/node/auth";
import { createServerHarness, seedCorpusActors, seedMessage } from "@orb/testkit/node/composed";
import { loadPresentRole } from "#server/domain/chat/persistence/participants-read.ts";

test("real membership, roster and wire owners keep role data separate from global privilege and fresh chat authority", async () => {
  await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "forward-header", ["AUTH_FALLBACK"]: "deny" } });
  const host = await root.principalFor(root.ownerId);
  const actor = await root.actor({ role: "admin" });
  const member = await root.principalFor(actor.id);
  const outsider = await root.principalFor((await root.actor({ role: "admin" })).id);
  const ownerCaller = await root.internalCallerFor(host.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const room = await ownerCaller.chat.startChat({ characterIds: [], opening: "none" });
  const chatId = room.chat.id;
  expect(room.chat.participants.map(({ role }) => role)).toEqual(["host"]);
  const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  const joined = await memberCaller.invites.acceptInvite({ inviteId: invite.invite.id });
  expect(joined.participant.role).toBe("member");
  const data = await root.services.chat.listParticipants({ principal: host, chatId });
  for (const row of data) {
    expect(typeof row.role).toBe("object");
    expect(Object.isFrozen(row.role)).toBe(true);
    expect(Reflect.ownKeys(row.role)).toEqual([]);
    expect("toJSON" in row.role).toBe(false);
  }
  const captured = await loadPresentRole(root.db, chatId, member.userId);
  if (captured === null) {
    throw new Error("the real invite did not create membership");
  }
  expect(() => can(member, "admin", { kind: "global" })).not.toThrow();
  expect(() => can(member, "host", { kind: "chat", membership: { role: captured } })).toThrow(DomainForbiddenError);
  await expect(root.services.chat.setToolRecurseLimit({ principal: member, chatId, limit: 2 })).rejects.toMatchObject({ code: "not_host" });
  await expect(root.services.chat.setToolRecurseLimit({ principal: outsider, chatId, limit: 2 })).rejects.toThrow(DomainNotFoundError);
  const visibility = createResolveViewerVisibility({ db: databaseHandle(root.db) });
  expect(await visibility(chatId, member.userId)).toMatchObject({ readsHidden: false, historyFloorSeq: 0 });
  expect(await visibility(chatId, host.userId)).toMatchObject({ readsHidden: true, historyFloorSeq: 0 });
  expect(await visibility(chatId, outsider.userId)).toBeNull();
  const view = await memberCaller.chat.getChat({ chatId });
  expect(view.participants.map(({ role }) => role).toSorted()).toEqual(["host", "member"]);
  expect((await memberCaller.chat.listChats({})).items.find(({ id }) => id === chatId)).toMatchObject({ viewerRole: "member" });
  const game = await root.services.rpg.createGame({ principal: host, chatId, mode: "lite" });
  expect(game).toBeDefined();
  await expect(root.services.rpg.updateConfig({ principal: member, chatId, patch: { steeringNote: "must-not-land" } })).rejects.toThrow(DomainForbiddenError);
  await expect(root.services.rpg.getGame({ principal: outsider, chatId })).rejects.toThrow(DomainNotFoundError);

  for (const userId of [host.userId, outsider.userId]) {
    await expect(root.services.chat.nominateHostHandoff({ principal: host, chatId, userId })).rejects.toThrow(DomainNotFoundError);
  }
  expect((await root.services.chat.getChat({ principal: host, chatId })).pendingHostUserId).toBeNull();
  await expect(root.services.chat.nominateHostHandoff({ principal: member, chatId, userId: host.userId })).rejects.toMatchObject({ code: "not_host" });
  await root.services.chat.nominateHostHandoff({ principal: host, chatId, userId: member.userId });
  await root.services.chat.acceptHostHandoff({ principal: member, chatId });
  const fresh = await loadPresentRole(root.db, chatId, member.userId);
  if (fresh === null) {
    throw new Error("the accepted host disappeared");
  }
  expect(() => can(member, "host", { kind: "chat", membership: { role: fresh } })).not.toThrow();
  expect(() => can(member, "host", { kind: "chat", membership: { role: captured } })).toThrow(DomainForbiddenError);
  await expect(root.services.chat.setToolRecurseLimit({ principal: host, chatId, limit: 2 })).rejects.toMatchObject({ code: "not_host" });
  await root.services.chat.setToolRecurseLimit({ principal: member, chatId, limit: 2 });
  expect((await memberCaller.chat.getChat({ chatId })).participants.find(({ userId }) => userId === member.userId)).toMatchObject({ role: "host" });
  expect((await memberCaller.chat.getChat({ chatId })).participants.map(({ role }) => role).toSorted((a, b) => a.localeCompare(b))).toEqual(["host", "member"]);
});

test("real member reads, author checks and a sole-human fork preserve the hidden-content and history-floor boundary", async () => {
  await using root = await createServerHarness();
  // Every committed line is funded through the host's chat binding.
  const { owner: host } = await seedCorpusActors(root);
  const member = await root.principalFor((await root.actor()).id);
  const room = await root.services.chat.startChat({ principal: host, characterIds: [], opening: "none" });
  const chatId = room.chat.id;
  await seedMessage(root, { principal: host, chatId, content: "pre-join-secret" });
  const boundary = await seedMessage(root, { principal: host, chatId, content: "join boundary" });
  const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  await root.services.chat.setMemberHistoryVisibility({ principal: host, chatId, userId: member.userId, visibility: "from-join" });
  const body = 'Visible <lie character="Witness" truth="hidden-role-secret"/>';
  const authored = await seedMessage(root, { principal: member, chatId, content: body });
  const ownEdit = await root.services.chat.editMessage({ principal: member, chatId, messageId: authored.id, content: body });
  expect(ownEdit.content).toBe("Visible ");
  await expect(root.services.chat.editMessage({ principal: member, chatId, messageId: boundary.id, content: "must-not-land" })).rejects.toMatchObject({
    code: "not_author",
  });
  expect((await root.services.chat.editMessage({ principal: host, chatId, messageId: authored.id, content: body })).content).toBe(body);
  const memberView = await root.services.chat.listMessages({ principal: member, chatId });
  expect(memberView.messages.map(({ seq }) => seq)).toEqual([2, 3]);
  expect(JSON.stringify(memberView)).not.toContain("pre-join-secret");
  expect(JSON.stringify(memberView)).not.toContain("hidden-role-secret");
  const hostView = await root.services.chat.listMessages({ principal: host, chatId });
  expect(JSON.stringify(hostView)).toContain("pre-join-secret");
  expect(JSON.stringify(hostView)).toContain("hidden-role-secret");
  await expect(root.services.chat.forkChat({ principal: member, chatId })).rejects.toMatchObject({ code: "not_host" });
  await root.services.chat.selfLeave({ principal: host, chatId });
  const fork = await root.services.chat.forkChat({ principal: member, chatId });
  const copied = await root.services.chat.listMessages({ principal: member, chatId: fork.chat.id });
  expect(copied.messages.map(({ content }) => content)).toEqual(["join boundary", "Visible "]);
  expect(JSON.stringify(copied)).not.toContain("secret");
  expect((await (await root.internalCallerFor(member.userId)).chat.getChat({ chatId: fork.chat.id })).participants.map(({ role }) => role)).toEqual(["host"]);
});
