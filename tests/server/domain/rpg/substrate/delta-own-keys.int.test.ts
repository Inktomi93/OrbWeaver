// A custom relationship label that names an inherited object member renders as the host wrote it: the delta's
// hint lookup reads only the configured hints, never `Object.prototype`.
// @subject packages/server/src/domain/rpg/substrate/delta.ts

import { resolveProseText } from "@orb/contracts/prose";
import { expect, test } from "@orb/testkit/node";
import { DELTA_MARKER, INHERITED_LABEL, NPC_KEY, PRIOR_KIND, SCENE, secondBeatWire } from "./inherited-label-room.ts";

test("the relationship delta for a custom label that names an inherited member carries no inherited member", async () => {
  const wire = await secondBeatWire();
  const delta = wire.split(DELTA_MARKER)[1];
  expect(delta).toBe(`${resolveProseText("rpg.delta.changesHeading", {})}: location → ${SCENE} · ${NPC_KEY}: ${PRIOR_KIND} → ${INHERITED_LABEL}`);
});
