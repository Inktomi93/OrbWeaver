import type { RpgActorView } from "@orb/contracts/rpg";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { actorKey } from "../../../../../packages/client/src/features/rpg/lib/actor-key.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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
  const first = actor("Mara");
  const second = actor("Mara");

  expect(actorKey(first)).not.toBe(actorKey(second));
  expect(actorKey({ ...first, name: "Mara Renamed" })).toBe(actorKey(first));
});
