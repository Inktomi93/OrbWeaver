import type { RpgActorView } from "@orb/contracts/rpg";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { actorKey } from "#client/features/rpg/lib/actor-key.ts";

function actor(name: string, characterId = mintTypeId(ID_PREFIX.character)): RpgActorView {
  return {
    actorRef: { kind: "character", characterId },
    name,
    presence: true,
    identity: null,
    sheet: { className: "", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] },
    volatile: null,
    trackers: [],
  };
}

test("actor keys are collision-free for same-name participant actors and survive display-name changes", () => {
  const first = actor("Mira");
  const second = actor("Mira");

  expect(actorKey(first)).not.toBe(actorKey(second));
  expect(actorKey({ ...first, name: "Mira Renamed" })).toBe(actorKey(first));
});
