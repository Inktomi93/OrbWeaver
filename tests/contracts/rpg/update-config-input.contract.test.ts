// The config write door has no prose arm: a client that still sends the old per-game prose key (a stale build, a
// hand-rolled call) is parsed to a patch without it, so the key can never reach the game row.
import type { ProseSlotId } from "@orb/contracts/prose";
import { rpgUpdateConfigInputSchema } from "@orb/contracts/rpg";
import { mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";

// The key the retired per-game prose arm carried; a slot id the prose table renames fails `tsc` here.
const STALE_SLOT: ProseSlotId = "rpg.reminder.steeringLicense";

test("a wire-level prose patch is dropped at parse and the real arms beside it are kept", ({ ids }) => {
  const parsed = rpgUpdateConfigInputSchema.parse({
    chatId: mintTypeId("chat", ids.next),
    patch: { steeringNote: "z", prose: { [STALE_SLOT]: { text: "our table's own license", baseVersion: 1 } } },
  });
  expect(Object.hasOwn(parsed.patch ?? {}, "prose")).toBe(false);
  expect(parsed.patch?.steeringNote).toBe("z");
});
