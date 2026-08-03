// @orb/contracts/rpg/pointer — the opaque chats.metadata.rpg sync pointer (§2.1). Pins: mode-free {gameId},
// prefix-validated, and that a malformed gameId is rejected (the corrupt-blob-heals-to-absent behavior is
// realized at the chat metadata parser's `.catch(undefined)`, tested there; here we pin the schema's
// validation so the heal has something to bite on).

import { chatRpgPointerSchema } from "@orb/contracts/rpg";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("the pointer is a mode-free {gameId} — no mode field", () => {
  const gameId = mintTypeId(ID_PREFIX.rpgGame);
  const parsed = chatRpgPointerSchema.parse({ gameId });
  expect(parsed.gameId).toBe(gameId);
  expect((parsed as Record<string, unknown>)["mode"]).toBeUndefined();
});

test("a malformed / wrong-prefix gameId is rejected (so the parser can heal it to absent)", () => {
  expect(chatRpgPointerSchema.safeParse({ gameId: "not-a-typeid" }).success).toBe(false);
  expect(chatRpgPointerSchema.safeParse({ gameId: mintTypeId(ID_PREFIX.chat) }).success).toBe(false);
  expect(chatRpgPointerSchema.safeParse({}).success).toBe(false);
});
