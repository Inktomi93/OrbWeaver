import { createCharacterSchema } from "@orb/contracts/character";
import { TAG_TARGET_TYPES } from "@orb/contracts/tag";
import { characterTags, chatTags } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";

test("tag mutation ingress refuses malformed and wrong-kind target ids without changing an owned attachment", async ({ harness }) => {
  const principal = await harness.principalFor((await harness.actor()).id);
  const caller = await harness.internalCallerFor(principal.userId);
  const tag = await caller.tag.createTag({ input: { name: "Typed target boundary" } });
  const character = await harness.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "typed-target-boundary", name: "Typed target boundary", description: "" }),
  });
  await caller.tag.attachTag({ tagId: tag.id, targetType: "character", targetId: character.id });
  const before = await harness.db.select().from(characterTags).where(eq(characterTags.tagId, tag.id));
  expect(before).toMatchObject([{ characterId: character.id, tagId: tag.id, status: "accepted" }]);

  for (const targetType of TAG_TARGET_TYPES) {
    for (const targetId of ["not-a-type-id", tag.id]) {
      await expect(caller.tag.attachTag({ tagId: tag.id, targetType, targetId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(caller.tag.detachTag({ tagId: tag.id, targetType, targetId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  }
  expect(await harness.db.select().from(characterTags).where(eq(characterTags.tagId, tag.id))).toEqual(before);
  await caller.tag.detachTag({ tagId: tag.id, targetType: "character", targetId: character.id });
  expect(await harness.db.select().from(characterTags).where(eq(characterTags.tagId, tag.id))).toEqual([]);
});

test("typed tag targets retain owner refusal, chat membership and separate tagger overlays", async ({ harness }) => {
  const host = await harness.principalFor((await harness.actor()).id);
  const member = await harness.principalFor((await harness.actor()).id);
  const stranger = await harness.principalFor((await harness.actor()).id);
  const hostCaller = await harness.internalCallerFor(host.userId);
  const memberCaller = await harness.internalCallerFor(member.userId);
  const strangerCaller = await harness.internalCallerFor(stranger.userId);
  const hostTag = await hostCaller.tag.createTag({ input: { name: "Host target label" } });
  const memberTag = await memberCaller.tag.createTag({ input: { name: "Member target label" } });
  const strangerTag = await strangerCaller.tag.createTag({ input: { name: "Stranger target label" } });
  const character = await harness.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "owned-tag-target", name: "Owned tag target", description: "" }),
  });
  const characterTarget = { targetType: "character", targetId: character.id } as const;
  await hostCaller.tag.attachTag({ tagId: hostTag.id, ...characterTarget });
  const before = await harness.db.select().from(characterTags).where(eq(characterTags.characterId, character.id));
  expect(before).toMatchObject([{ characterId: character.id, tagId: hostTag.id, status: "accepted" }]);
  await expect(memberCaller.tag.attachTag({ tagId: memberTag.id, ...characterTarget })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(memberCaller.tag.detachTag({ tagId: memberTag.id, ...characterTarget })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(memberCaller.tag.detachTag({ tagId: hostTag.id, ...characterTarget })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(harness.services.tag.bulkAttachTag({ principal: member, tagIds: [memberTag.id], ...characterTarget })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  expect(await harness.db.select().from(characterTags).where(eq(characterTags.characterId, character.id))).toEqual(before);

  const { chat } = await harness.services.chat.startChat({ principal: host, characterIds: [], opening: "none" });
  const invitation = await harness.services.chat.createInvite({ principal: host, chatId: chat.id, input: { invitedHandle: member.handle } });
  await harness.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const chatTarget = { targetType: "chat", targetId: chat.id } as const;
  await hostCaller.tag.attachTag({ tagId: hostTag.id, ...chatTarget });
  await memberCaller.tag.attachTag({ tagId: memberTag.id, ...chatTarget });
  const overlays = await harness.db.select().from(chatTags).where(eq(chatTags.chatId, chat.id)).orderBy(chatTags.tagId);
  expect(overlays).toMatchObject([
    { chatId: chat.id, tagId: hostTag.id, ownerId: host.userId },
    { chatId: chat.id, tagId: memberTag.id, ownerId: member.userId },
  ]);
  await expect(strangerCaller.tag.attachTag({ tagId: strangerTag.id, ...chatTarget })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(strangerCaller.tag.detachTag({ tagId: strangerTag.id, ...chatTarget })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(memberCaller.tag.detachTag({ tagId: hostTag.id, ...chatTarget })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await harness.db.select().from(chatTags).where(eq(chatTags.chatId, chat.id)).orderBy(chatTags.tagId)).toEqual(overlays);
  await memberCaller.tag.detachTag({ tagId: memberTag.id, ...chatTarget });
  expect(await harness.db.select().from(chatTags).where(eq(chatTags.chatId, chat.id))).toEqual(overlays.filter((row) => row.ownerId === host.userId));
});
