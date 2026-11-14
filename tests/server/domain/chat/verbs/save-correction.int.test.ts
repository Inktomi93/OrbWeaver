// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
// A correction kept from the Rewrite dialog is an ordinary chat injection (D116): every later turn carries it in the
// player's words at the Add placement, the injections list shows it, and removing it there drops it from the next turn.
import { NEW_CHAT_INJECTION_PLACEMENT } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { textRoom, wireOf, wireText } from "../scenario-physical.ts";

const CORRECTION = "Mira lost her left hand at the siege; she never holds anything in it.";

async function send(h: ChatRoot, content: string): Promise<string> {
  const { outcome, newest } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content }));
  expect(outcome).toMatchObject({ aborted: false });
  await h.root.settleBackground();
  return wireText(newest);
}

test("a kept correction reaches every later turn at the injection placement until the player removes it", async () => {
  await using h = await textRoom(["She waves with both hands.", "She waves with her right hand.", "She nods.", "She smiles.", "She sighs."]);
  await send(h, "Mira greets us.");
  const reply = (await readRoomCanon(h.root, h.owner, h.chatId)).at(-1);
  if (reply === undefined) {
    throw new Error("the first turn committed no reply");
  }
  // The rewrite path: the correction steers this one rewrite, and only this one.
  const rewrite = await wireOf(h, () =>
    h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: reply.id, guided: { action: "rewrite", input: CORRECTION } }),
  );
  expect(rewrite.outcome).toMatchObject({ aborted: false });
  expect(wireText(rewrite.newest)).toContain(CORRECTION);
  await h.root.settleBackground();
  expect(await send(h, "Mira picks up the cup.")).not.toContain(CORRECTION);

  const kept = await h.caller.chat.saveCorrection({ chatId: h.chatId, content: `  ${CORRECTION}\n` });
  expect(kept).toEqual({ id: kept.id, ...NEW_CHAT_INJECTION_PLACEMENT, content: CORRECTION });
  expect(await h.caller.chat.listChatInjections({ chatId: h.chatId })).toEqual([kept]);

  const withCorrection = await send(h, "Mira raises a toast.");
  expect(withCorrection).toContain(CORRECTION);
  // The Add placement is the tail of the history: the correction sits after the last committed reply.
  expect(withCorrection.lastIndexOf(CORRECTION)).toBeGreaterThan(withCorrection.lastIndexOf("She nods."));

  await h.caller.chat.deleteChatInjection({ chatId: h.chatId, injectionId: kept.id });
  expect(await send(h, "Mira leaves.")).not.toContain(CORRECTION);
});

test("the same correction kept twice is one injection, and a blank one is refused", async () => {
  await using h = await textRoom([]);
  const first = await h.caller.chat.saveCorrection({ chatId: h.chatId, content: CORRECTION });
  const again = await h.caller.chat.saveCorrection({ chatId: h.chatId, content: ` ${CORRECTION} ` });
  expect(again).toEqual(first);
  await expect(h.caller.chat.saveCorrection({ chatId: h.chatId, content: " \n\t " })).toThrowTRPCError("BAD_REQUEST");
  const other = await h.caller.chat.saveCorrection({ chatId: h.chatId, content: `${CORRECTION} Her right hand is steady.` });
  // Both rows share the frozen clock's stamp, so the list's tie order is not this case's subject.
  const listed = await h.caller.chat.listChatInjections({ chatId: h.chatId });
  expect(listed).toHaveLength(2);
  expect(listed).toEqual(expect.arrayContaining([first, other]));
});

test("two saves of one correction that race each other still keep one injection", async () => {
  await using h = await textRoom([]);
  const [left, right] = await Promise.all([
    h.caller.chat.saveCorrection({ chatId: h.chatId, content: CORRECTION }),
    h.caller.chat.saveCorrection({ chatId: h.chatId, content: CORRECTION }),
  ]);
  expect(right).toEqual(left);
  expect(await h.caller.chat.listChatInjections({ chatId: h.chatId })).toEqual([left]);
});
