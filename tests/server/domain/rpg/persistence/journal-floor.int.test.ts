// @subject packages/server/src/domain/rpg/persistence/journal.ts
// @subject packages/server/src/domain/rpg/verbs/read/list-journal.ts
import { rpgJournal } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCorpusActors } from "@orb/testkit/node/composed";
import { seedMessageRows } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";

test("journal readers retain inclusive member floors, unfiltered host reads and anchorless hand entries", async () => {
  await using root = await createServerHarness();
  // The host's chat binding funds each committed canon line.
  const { owner: host } = await seedCorpusActors(root);
  const member = await root.principalFor((await root.actor()).id);
  const stranger = await root.principalFor((await root.actor()).id);
  const { chat } = await root.services.chat.startChat({ principal: host, characterIds: [], opening: "none" });
  const chatId = chat.id;
  await root.services.rpg.createGame({ principal: host, chatId, mode: "lite" });
  const preJoin = await seedMessageRows(root, { principal: host, chatId, content: "Before the member arrives." });
  const boundary = await seedMessageRows(root, { principal: host, chatId, content: "The member is invited." });
  const invitation = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const postJoin = await seedMessageRows(root, { principal: host, chatId, content: "The member has arrived." });

  for (const [message, content] of [
    [preJoin, "pre-join"],
    [boundary, "join boundary"],
    [postJoin, "post-join"],
  ] as const) {
    const id = await root.services.rpg.addJournalEntry({ principal: host, chatId, type: "note", title: content, content });
    // The persistence fixture binds each model-derived entry to its actual selected canon variant.
    await root.db.update(rpgJournal).set({ sourceMessageId: message.slot.id, variantId: message.variant.id }).where(eq(rpgJournal.id, id));
  }
  await root.services.rpg.addJournalEntry({ principal: host, chatId, type: "note", title: "Hand entry", content: "hand entry" });

  const contents = async (principal: typeof host): Promise<string[]> =>
    (await root.services.rpg.listJournal({ principal, chatId })).map((entry) => entry.content).toSorted();
  const all = ["pre-join", "join boundary", "post-join", "hand entry"].toSorted();
  expect(await contents(host)).toEqual(all);
  expect(await contents(member)).toEqual(all);
  await root.services.chat.setMemberHistoryVisibility({ principal: host, chatId, userId: member.userId, visibility: "from-join" });
  expect(await contents(member)).toEqual(["join boundary", "post-join", "hand entry"].toSorted());
  expect(await contents(host)).toEqual(all);

  // The stranger cannot see the room through chat's own read, so the journal refusal below is that same verdict.
  await expect(root.services.chat.getChat({ principal: stranger, chatId })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(root.services.rpg.listJournal({ principal: stranger, chatId })).rejects.toBeInstanceOf(DomainNotFoundError);
});
