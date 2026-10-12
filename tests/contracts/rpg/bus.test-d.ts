import type { RPG_BUS_EVENT_TYPES, RpgBusEvent } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

// The rpg bus union has no schema. Its producer-coverage belt `RPG_BUS_EVENT_TYPES` is declared
// `satisfies readonly RpgBusEvent["type"][]`, which proves each belt entry is a real member but not the
// reverse. These pins close the other direction at compile time.

test("the belt names every RpgBusEvent member and nothing else (a dropped or added member is a type error)", () => {
  expectTypeOf<(typeof RPG_BUS_EVENT_TYPES)[number]>().toEqualTypeOf<RpgBusEvent["type"]>();
});

// `RpgBusEvent["chatId"]` is an indexed access over the union, so it only resolves when every member declares it.
test("every member carries a chatId, the channel key", () => {
  expectTypeOf<RpgBusEvent["chatId"]>().toEqualTypeOf<ChatId>();
});
