// entry/boot/seed-default-characters — FLAG[PD-32] no-op. The authored default-card seeder subsystem is not
// built (PROMOTION-DEBT PD-32); this boot step records the gap and returns without touching the db. The test
// pins that it is a side-effect-free no-op (it takes no deps, does not throw, returns void) so a future wire
// of the real seeder is a deliberate change, not an accident.

import { seedDefaultCharacters } from "@orb/server/entry/boot";
import { expect, test } from "vitest";

test("FLAG[PD-32] — seedDefaultCharacters is a no-op that returns void without throwing", () => {
  expect(seedDefaultCharacters()).toBeUndefined();
});
