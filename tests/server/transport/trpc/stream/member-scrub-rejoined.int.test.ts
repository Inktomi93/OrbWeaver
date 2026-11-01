// Removing a hidden tag joins the bytes around it, and those bytes can spell a new tag: a member reads neither, live,
// stored, on replay or joining late.
// @subject packages/kit/src/content/index.ts
// @subject packages/server/src/domain/chat/substrate/member-visibility.ts

import { expect, test } from "@orb/testkit/node";
import type { Room } from "./_held-room.ts";
import { leaks, memberWatching, openRoom, SECRET_HEAD, storedMemberBytes, textOf } from "./_held-room.ts";

const INNER = '<lie truth="x"/>';
const OPENING = "Opening. ";
const CLOSE = " The close.";
const SEALED = `truth="${SECRET_HEAD}"/>`;

async function latestReply(room: Room, principal: Room["host"]): Promise<string> {
  const { messages } = await room.root.services.chat.listMessages({ principal, chatId: room.chatId });
  return messages.findLast((message) => message.role === "assistant")?.content ?? "";
}

test.each([
  ["a tag inside a code block", [`${OPENING}\n\`\`\`\n<lie ${SEALED}\n\`\`\`\n${CLOSE}`], `${OPENING}\n\`\`\`\n\n\`\`\`\n${CLOSE}`],
  ["a code block across deltas", [`${OPENING}\n\`\`\`\n`, `<lie ${SEALED}`, `\n\`\`\`\n${CLOSE}`], `${OPENING}\n\`\`\`\n\n\`\`\`\n${CLOSE}`],
  ["an unclosed open inside a code block", [`${OPENING}\n\`\`\`\n<lie truth="${SECRET_HEAD}\n\`\`\`\n${CLOSE}`], `${OPENING}\n\`\`\`\n`],
  ["one delta", [`${OPENING}<l${INNER}ie ${SEALED}${CLOSE}`], `${OPENING}${CLOSE}`],
  ["the tag between its fragments arrives alone", [`${OPENING}<l`, INNER, `ie ${SEALED}`, CLOSE], `${OPENING}${CLOSE}`],
  ["a fragment ahead of an open still forming", [`${OPENING}<l<`, `lie truth="x"/>ie tr`, `uth="${SECRET_HEAD}"/>${CLOSE}`], `${OPENING}${CLOSE}`],
  ["a fragment that reaches the attr name", [`${OPENING}<lie tr`, INNER, `uth="${SECRET_HEAD}"/>`, CLOSE], `${OPENING}${CLOSE}`],
  ["two levels of nesting", [`${OPENING}<l<l${INNER}ie a="1"/>ie ${SEALED}${CLOSE}`], `${OPENING}${CLOSE}`],
  ["a rejoined fence ahead of a rejoined tag", [`${OPENING}\n\`\`${INNER}\`\n<l${INNER}ie ${SEALED}${CLOSE}`], `${OPENING}\n\`\`\`\n${CLOSE}`],
  ["a tag in another tag's quoted value", [`${OPENING}<gm text="<lie truth='${SECRET_HEAD}'/>"/>${CLOSE}`], `${OPENING}<gm text="`],
  [
    "an escaped tag in another tag's quoted value across deltas",
    [`${OPENING}<gm text="<lie `, `truth=\\"${SECRET_HEAD}\\"/>"/>`, CLOSE],
    `${OPENING}<gm text="`,
  ],
  ["a tag whose value holds the other tag's close", [`${OPENING}<gm x="<lie truth="/>${SECRET_HEAD}"/>${CLOSE}`], `${OPENING}<gm x="${CLOSE}`],
  ["a sheltered tag in a code block", [`${OPENING}\n\`\`\`\n<gm text="<lie truth='${SECRET_HEAD}'/>"/>\n\`\`\`\n${CLOSE}`], `${OPENING}\n\`\`\`\n<gm text="`],
])("%s stays hidden from a member", async (_name, deltas, visible) => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "rejoin-member");
  try {
    room.answerInChunks(deltas);
    await room.send();
    await device.waitFor((frames) => frames.some(({ event }) => event.type === "turnCompleted"));
    const late = await room.root.principalFor((await room.root.actor()).id);
    const invitation = await room.root.services.chat.createInvite({ principal: room.host, chatId: room.chatId, input: { invitedHandle: late.handle } });
    await room.root.services.chat.acceptInvite({ principal: late, inviteId: invitation.invite.id });
    expect(await leaks(room, device, guest)).toEqual([]);
    expect(textOf(device.frames)).toBe(visible);
    expect(await storedMemberBytes(room)).toBe(visible);
    expect(await latestReply(room, guest)).toBe(visible);
    expect(await latestReply(room, late)).toBe(visible);
    expect(JSON.stringify(await room.root.services.chat.replayChatEvents({ principal: late, chatId: room.chatId }))).not.toContain(SECRET_HEAD);
    expect(await latestReply(room, room.host)).toBe(deltas.join(""));
  } finally {
    await device.close();
  }
});

test("a member's chat list preview carries no tag sheltered in a code block", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "preview-member");
  try {
    room.answerWith(`\`\`\`\n<gm text="<lie truth='${SECRET_HEAD}'/>"/>\n\`\`\`\n${CLOSE}`);
    await room.send();
    const preview = async (principal: Room["host"]): Promise<string | null | undefined> =>
      (await room.root.services.chat.listChats({ principal })).items.find((item) => item.id === room.chatId)?.lastMessagePreview;
    expect(await preview(guest)).toBe('<gm text="');
    expect(await preview(room.host)).toBe('<gm text="');
  } finally {
    await device.close();
  }
});
