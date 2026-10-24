// A custom relationship label that names an inherited object member renders as the host wrote it: the reminder's
// hint lookup reads only the configured hints, never `Object.prototype`.
// @subject packages/server/src/domain/rpg/substrate/reminder.ts

import { expect, test } from "@orb/testkit/node";
import { INHERITED_LABEL, NPC_KEY, secondBeatWire } from "./inherited-label-room.ts";

test("the reminder line for a custom relationship labelled with an inherited member name carries no inherited member", async () => {
  const wire = await secondBeatWire();
  expect(wire.split("\n")).toContain(`- ${NPC_KEY} — ${INHERITED_LABEL}`);
  expect(wire).not.toContain("native code");
});
