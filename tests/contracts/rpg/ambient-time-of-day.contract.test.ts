// The write mapping and the read-back of the ambient clock agree: the hour a label puts on the clock reads back as that label.
// @subject packages/contracts/src/rpg/ambient.ts
import { clockTimeOfDay, TIME_OF_DAY, TIME_OF_DAY_HOURS } from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node";

test.for(TIME_OF_DAY)("the representative hour of %s lies inside its own range", (label) => {
  expect(clockTimeOfDay({ day: 1, hour: TIME_OF_DAY_HOURS[label], minute: null })).toBe(label);
});
