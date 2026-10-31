// The config write door has no prose arm: a client that still sends the old per-game prose key (a stale build, a
// hand-rolled call) is refused at parse, so the key can never reach the game row.
import type { ProseSlotId } from "@orb/contracts/prose";
import { rpgUpdateConfigInputSchema } from "@orb/contracts/rpg";
import { mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";

// The key the retired per-game prose arm carried; a slot id the prose table renames fails `tsc` here.
const STALE_SLOT: ProseSlotId = "rpg.reminder.steeringLicense";

test("a wire-level prose patch is refused at parse and the real arms alone are kept", ({ ids }) => {
  const chatId = mintTypeId("chat", ids.next);
  const stale = rpgUpdateConfigInputSchema.safeParse({
    chatId,
    patch: { steeringNote: "z", prose: { [STALE_SLOT]: { text: "our table's own license", baseVersion: 1 } } },
  });
  expect(stale.success).toBe(false);
  const parsed = rpgUpdateConfigInputSchema.parse({ chatId, patch: { steeringNote: "z" } });
  expect(parsed.patch).toEqual({ steeringNote: "z" });
});
