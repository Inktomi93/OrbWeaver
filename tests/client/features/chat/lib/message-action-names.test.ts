// A message row's article name, pinned arm by arm: a numbered row names its speaker and number, an unattributed one names
// only its number, and a row with no number yet names its speaker or nothing.
import { expect, test } from "@orb/testkit/node";
import { messageArticleName } from "#client/features/chat/lib/message-action-names.ts";

test("each mix of speaker and position names the row its own way", () => {
  expect([messageArticleName("Mira", 7), messageArticleName(null, 7), messageArticleName("Mira", undefined), messageArticleName(null, undefined)]).toEqual([
    "Mira · #7",
    "Message #7",
    "Mira",
    undefined,
  ]);
});
