// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/kit/src/content/index.ts
// The chat list's last-message line for a reply that carries its own markup, a panel a preset's display script styles,
// is the words that reply shows and nothing else: no tag, no attribute value, no stylesheet text.

import { expect, test } from "@orb/testkit/node";
import { textRoom } from "../scenario-physical.ts";

const STYLED_REPLY = [
  "Sola leans in the doorway.",
  '<div class="hud" style="border: 1px solid #c80">',
  "<style>.hud { color: #c80; font-family: serif; }</style>",
  '<b>Mood:</b> <font color="#ff8800">wary</font>, <span style="color: teal">fond</span>',
  "</div>",
  "",
  "You're late, she says.",
].join("\n");

test("a styled reply's list preview is its visible words, with no tag, attribute or stylesheet text", async () => {
  await using h = await textRoom([STYLED_REPLY]);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Hello." });
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();

  const preview = (await h.root.services.chat.listChats({ principal: h.owner })).items.find((item) => item.id === h.chatId)?.lastMessagePreview;
  expect(preview).toBe("Sola leans in the doorway. Mood: wary, fond You're late, she says.");
});
