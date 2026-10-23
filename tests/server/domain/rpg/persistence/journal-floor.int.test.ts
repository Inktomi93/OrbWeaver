// @subject packages/server/src/domain/rpg/persistence/journal.ts
// @subject packages/server/src/domain/rpg/verbs/read/list-journal.ts
import { messages, rpgJournal } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-owner";
import { DomainNotFoundError } from "@orb/kit/errors";
import { createResolveViewerVisibility } from "@orb/server/domain/chat";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq, max } from "drizzle-orm";

test("journal readers retain inclusive member floors, unfiltered host reads and anchorless hand entries", async () => {
  await using root = await createServerHarness();
  const host = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const stranger = await root.principalFor((await root.actor()).id);
  const { chat } = await root.services.chat.startChat({ principal: host, characterIds: [], opening: "none" });
  const chatId = chat.id;
  await root.services.rpg.createGame({ principal: host, chatId, mode: "lite" });
  const [head] = await root.db
    .select({ seq: max(messages.seq) })
    .from(messages)
    .where(eq(messages.chatId, chatId));
  const firstSeq = (head?.seq ?? 0) + 1;
  const preJoin = await seedMessage(root.db, { chatId, seq: firstSeq }, root.idSource);
  const boundary = await seedMessage(root.db, { chatId, seq: firstSeq + 1 }, root.idSource);
  const invitation = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const postJoin = await seedMessage(root.db, { chatId, seq: firstSeq + 2 }, root.idSource);

  for (const [message, content] of [
    [preJoin, "pre-join"],
    [boundary, "join boundary"],
    [postJoin, "post-join"],
  ] as const) {
    const id = await root.services.rpg.addJournalEntry({ principal: host, chatId, type: "note", title: content, content });
    // The persistence fixture binds each model-derived entry to its actual selected canon variant.
    await root.db.update(rpgJournal).set({ sourceMessageId: message.id, variantId: message.variantId }).where(eq(rpgJournal.id, id));
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

  const visibility = createResolveViewerVisibility({ db: databaseHandle(root.db) });
  expect(await visibility(chatId, stranger.userId)).toBeNull();
  await expect(root.services.rpg.listJournal({ principal: stranger, chatId })).rejects.toBeInstanceOf(DomainNotFoundError);
});
