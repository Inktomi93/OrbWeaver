import { chatCensusInputSchema } from "@orb/contracts/chat";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("census lens preserves membership filters without admitting paging coordinates", () => {
  const characterId = mintTypeId(ID_PREFIX.character);
  expect(chatCensusInputSchema.parse({ characterId, includeArchived: false, search: "literal%", beforeRecencyAt: 1000, limit: 1 })).toEqual({
    characterId,
    includeArchived: false,
    search: "literal%",
    beforeRecencyAt: 1000,
  });
  expect(chatCensusInputSchema.safeParse({ characterId: "foreign-shape" }).success).toBe(false);
});
