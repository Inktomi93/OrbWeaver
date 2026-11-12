// @subject packages/db/src/custom-types/index.ts
// A NUL is not text in this app: the text a member sends and the text a model streams back are each stored without
// their NULs, so they read back whole. Without the strip the driver would return each cut at its first NUL.
import { expect, test } from "@orb/testkit/node";
import { coreHttpRoom, coreProse } from "./core-physical.ts";

const NUL = "\0";
const SENT = ["The member asks", " for the whole story."] as const;
const STREAMED = ["The keeper answers", " in full."] as const;

test("a member's message and the model's streamed reply that carry a NUL each read back whole, without it", async () => {
  await using h = await coreHttpRoom([(): Response => coreProse(STREAMED.join(NUL))]);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: SENT.join(NUL) });
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();

  const stored = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.map(({ role, content }) => ({ role, content }));
  expect(stored).toEqual([
    { role: "user", content: SENT.join("") },
    { role: "assistant", content: STREAMED.join("") },
  ]);
});
