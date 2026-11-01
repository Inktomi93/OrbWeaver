// A member edits from the stripped view, so saving it over a body with hidden bytes would erase bytes they never saw.
// @subject packages/server/src/domain/chat/verbs/edit.ts

import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, seedCorpusActors, seedMessage } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";

type Principal = Awaited<ReturnType<ServerTestHarness["principalFor"]>>;

interface MemberRow {
  readonly host: Principal;
  readonly member: Principal;
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly hostReads: () => Promise<string | undefined>;
}

/** A room with a seated member, and the row that member wrote. */
async function memberRow(root: ServerTestHarness, body: string): Promise<MemberRow> {
  const { owner: host } = await seedCorpusActors(root);
  const member = await root.principalFor((await root.actor()).id);
  const chatId = (await root.services.chat.startChat({ principal: host, characterIds: [], opening: "none" })).chat.id;
  const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const row = await seedMessage(root, { principal: member, chatId, content: body });
  const hostReads = async (): ReturnType<MemberRow["hostReads"]> =>
    (await root.services.chat.listMessages({ principal: host, chatId })).messages.at(-1)?.content;
  return { host, member, chatId, messageId: row.id, hostReads };
}

test.each([
  ["a closed span", 'Mine. <lie character="Witness" truth="secret"/>'],
  ["a trailing open", 'Mine. <lie character="Witness" truth="secret'],
  ["a broken tag", 'Mine. <lie truth="secret"> and the rest'],
])("a member's edit over %s is refused and the stored body keeps every byte", async (_name, body) => {
  await using root = await createServerHarness();
  const { member, chatId, messageId, hostReads } = await memberRow(root, body);
  await expect(root.services.chat.editMessage({ principal: member, chatId, messageId, content: "Mine." })).rejects.toMatchObject({
    code: CHAT_OP_CODES.hiddenSpanEdit,
  });
  const caller = await root.internalCallerFor(member.userId);
  await expect(caller.chat.editMessage({ chatId, messageId, content: "Mine.", timeZone: UTC_TIME_ZONE })).toThrowTRPCError("BAD_REQUEST");
  expect(await hostReads()).toBe(body);
});

test("a member edits a row whose text only looks like a tag", async () => {
  await using root = await createServerHarness();
  const { member, chatId, messageId, hostReads } = await memberRow(root, "She will <lie down on the bed.");
  await root.services.chat.editMessage({ principal: member, chatId, messageId, content: "She will rest." });
  expect(await hostReads()).toBe("She will rest.");
});

test("the host reads the whole body, so the host may edit it", async () => {
  await using root = await createServerHarness();
  const body = 'Mine. <lie character="Witness" truth="secret"/>';
  const { host, chatId, messageId, hostReads } = await memberRow(root, body);
  await root.services.chat.editMessage({ principal: host, chatId, messageId, content: `${body} Noted.` });
  expect(await hostReads()).toBe(`${body} Noted.`);
});
