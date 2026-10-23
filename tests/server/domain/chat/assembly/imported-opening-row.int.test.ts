// @subject packages/server/src/domain/chat/assembly/shape.ts
// @subject packages/server/src/domain/chat/persistence/import-write.ts
// An import-born room's opening line must reach the physical provider request on its next turn.
import { expect, test } from "@orb/testkit/node";
import { importedSeqs, importTranscript, LEGACY_IMPORT_ARMS, renumberFromZero, textRoom } from "../scenario-physical.ts";

const OPENING = "The lantern-lit opening line of the imported room.";
const REPLY = "The imported character's first answer.";

test.for(LEGACY_IMPORT_ARMS)("$title: the first imported message reaches the next turn's provider request", async ({ legacy }) => {
  await using h = await textRoom(["A reply after the import."]);
  const chatId = await importTranscript(h, [
    { user: true, text: OPENING },
    { user: false, text: REPLY },
  ]);
  if (legacy) {
    await renumberFromZero(h, chatId);
  }
  const imported = await importedSeqs(h, chatId);
  expect((await h.root.services.chat.send({ principal: h.owner, chatId, content: "And then?" })).aborted).toBe(false);
  const completions = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(completions).toHaveLength(1);
  const wire = await completions[0]?.clone().text();
  expect(wire).toContain(OPENING);
  expect(wire).toContain(REPLY);
  expect(imported).toEqual(legacy ? [0, 1] : [1, 2]);
});
