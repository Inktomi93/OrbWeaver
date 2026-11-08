// A corpus wire a case owns refuses at disposal with steps left, so no case asserts what remains by hand.

import { createCorpusConnectionWire } from "./corpus-connection-wire.ts";
import { createCorpusRpgWire } from "./corpus-rpg-wire.ts";
import { expect, test } from "./fixtures.ts";

test("an every-step wire with unspent steps refuses at disposal and names how many", () => {
  expect(() => {
    using _owned = createCorpusRpgWire("every-step");
  }).toThrow(/^RPG corpus wire: [1-9]\d* scripted step\(s\) never spent/u);
});

test("an every-step connection wire refuses at disposal once a case enqueues a recipe it never spends", () => {
  expect(() => {
    using owned = createCorpusConnectionWire("every-step");
    owned.turn();
  }).toThrow(/^connection corpus wire: 1 scripted step\(s\) never spent/u);
});
