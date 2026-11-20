// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
// A correction kept from the Rewrite dialog is an ordinary chat injection (D116): every later turn carries it in the
// player's words at the Add placement, the injections list shows it, and removing it there drops it from the next turn.
import { CHAT_INJECTION_POSITIONS, NEW_CHAT_INJECTION_PLACEMENT } from "@orb/contracts/chat";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { withoutNul } from "@orb/kit/strings";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom, wireOf, wireText } from "../scenario-physical.ts";

const CORRECTION = "Mira lost her left hand at the siege; she never holds anything in it.";

async function send(h: ChatRoot, content: string): Promise<string> {
  const { outcome, newest } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content }));
  expect(outcome).toMatchObject({ aborted: false });
  await h.root.settleBackground();
  return wireText(newest);
}

// The refusal's message with the asked id taken out, so two refusals of different ids compare by their shape alone.
async function notFoundShape(attempt: Promise<unknown>, chatId: ChatId): Promise<string> {
  const refusal = await attempt.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(refusal instanceof DomainNotFoundError)) {
    throw new Error("the save was not refused as a missing room", { cause: refusal });
  }
  return refusal.message.replace(chatId, "<chat id>");
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

test("a NUL in a correction is stripped at write, so keeping it again is the kept row", async () => {
  await using h = await textRoom([]);
  const pasted = `Mira lost her left hand${String.fromCodePoint(0)} at the siege.`;
  const kept = await h.caller.chat.saveCorrection({ chatId: h.chatId, content: pasted });
  expect(kept.content).toBe(withoutNul(pasted));
  expect(await h.caller.chat.saveCorrection({ chatId: h.chatId, content: pasted })).toEqual(kept);
  expect(await h.caller.chat.listChatInjections({ chatId: h.chatId })).toEqual([kept]);
});

test("the same words placed elsewhere by hand do not stand in for the kept correction", async () => {
  await using h = await textRoom([]);
  const elsewhere = CHAT_INJECTION_POSITIONS.find((position) => position !== NEW_CHAT_INJECTION_PLACEMENT.position);
  if (elsewhere === undefined) {
    throw new Error("the injection positions have no member besides the Add placement");
  }
  const placed = await h.caller.chat.setChatInjection({ chatId: h.chatId, ...NEW_CHAT_INJECTION_PLACEMENT, position: elsewhere, content: CORRECTION });
  const kept = await h.caller.chat.saveCorrection({ chatId: h.chatId, content: CORRECTION });
  expect(kept).toEqual({ id: kept.id, ...NEW_CHAT_INJECTION_PLACEMENT, content: CORRECTION });
  expect(kept.id).not.toBe(placed.id);
  expect(await h.caller.chat.saveCorrection({ chatId: h.chatId, content: CORRECTION })).toEqual(kept);
  expect(await h.caller.chat.listChatInjections({ chatId: h.chatId })).toHaveLength(2);
});

test("only the room's host keeps a correction, and a room the caller is not in reads as missing", async () => {
  await using h = await textRoom([]);
  const member = await invitePerson(h);
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  const strangerRoom = (await h.root.services.chat.startChat({ principal: stranger, characterIds: [], opening: "none" })).chat.id;
  const unknownRoom = h.root.idSource.typeId(ID_PREFIX.chat);

  await expect(h.root.services.chat.saveCorrection({ principal: member, chatId: h.chatId, content: CORRECTION })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  // A stranger learns nothing a made-up id would not tell them: both are the same not-found, naming only the id asked.
  const asStranger = await notFoundShape(h.root.services.chat.saveCorrection({ principal: stranger, chatId: h.chatId, content: CORRECTION }), h.chatId);
  const asUnknown = await notFoundShape(h.root.services.chat.saveCorrection({ principal: stranger, chatId: unknownRoom, content: CORRECTION }), unknownRoom);
  expect(asStranger).toBe(asUnknown);
  await expect(h.caller.chat.saveCorrection({ chatId: strangerRoom, content: CORRECTION })).toThrowTRPCError("NOT_FOUND");
  expect(await h.caller.chat.listChatInjections({ chatId: h.chatId })).toEqual([]);
  expect(await h.root.services.chat.listChatInjections({ principal: stranger, chatId: strangerRoom })).toEqual([]);

  // The positive control: the host's own save is kept.
  await expect(h.caller.chat.saveCorrection({ chatId: h.chatId, content: CORRECTION })).resolves.toMatchObject({ content: CORRECTION });
  expect(await h.caller.chat.listChatInjections({ chatId: h.chatId })).toHaveLength(1);
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
