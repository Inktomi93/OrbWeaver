// A pointer cached before the engaged toggle carries no `engaged` field; the gate must still read it as a live game.
import { chatRpgPointerSchema, isRpgEngaged } from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node";

test("the takeover gate reads a pointer missing `engaged` as engaged, an explicit false as off, and no pointer as no game", ({ ids }) => {
  const gameId = ids.typeId("rpg_game");
  expect(isRpgEngaged({ gameId })).toBe(true);
  expect(isRpgEngaged({ gameId, engaged: true })).toBe(true);
  expect(isRpgEngaged({ gameId, engaged: false })).toBe(false);
  expect(isRpgEngaged(null)).toBe(false);
  expect(isRpgEngaged(undefined)).toBe(false);
  expect(isRpgEngaged(chatRpgPointerSchema.parse({ gameId }))).toBe(true);
});
