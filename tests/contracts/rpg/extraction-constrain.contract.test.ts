// The per-call extraction schema hands the model only the write arms its game can use: an arm no tracker needs is
// removed from the object's properties and from its required list, and a game with no trackers loses the whole plane.
// @subject packages/contracts/src/rpg/extraction.ts

import type { ExtractionRefs } from "@orb/contracts/rpg";
import { constrainExtractionSchema, rpgExtractionSchema } from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

const node = z.object({ properties: z.record(z.string(), z.unknown()).default({}), required: z.array(z.string()).default([]) });

const NO_TRACKERS: ExtractionRefs = {
  actorRefs: ["Mira"],
  trackerWriteGroups: [],
  gameTrackerKeys: { deltaKeys: [], setKeys: [] },
  conditionNames: [],
  establishScene: { location: false, timeOfDay: false, presentCast: false },
};

/** The projected schema's `party[]` item and the root, as the model's tool payload shapes them. */
function constrained(refs: ExtractionRefs): { readonly root: z.infer<typeof node>; readonly partyItem: z.infer<typeof node> } {
  const root = node.parse(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs));
  const items = z.object({ items: node }).parse(root.properties["party"]);
  return { root, partyItem: items.items };
}

test("a game that tracks nothing offers no tracker arm on a party member and no game tracker plane, in properties or required", () => {
  const { root, partyItem } = constrained(NO_TRACKERS);
  expect(Object.keys(partyItem.properties)).not.toContain("trackerDeltas");
  expect(Object.keys(partyItem.properties)).not.toContain("trackerSets");
  expect(partyItem.required).not.toContain("trackerDeltas");
  expect(partyItem.required).not.toContain("trackerSets");
  expect(Object.keys(root.properties)).not.toContain("trackers");
  expect(root.required).not.toContain("trackers");
  // The rest of the party item is untouched.
  expect(Object.keys(partyItem.properties)).toContain("targetRef");
});

test("a game with a delta tracker keeps the delta arm and the tracker plane, and drops only the arm no key needs", () => {
  const { root, partyItem } = constrained({
    ...NO_TRACKERS,
    trackerWriteGroups: [{ targetRefs: ["Mira"], deltaKeys: ["Mana"], setKeys: [] }],
    gameTrackerKeys: { deltaKeys: ["Doom"], setKeys: [] },
  });
  expect(Object.keys(partyItem.properties)).toContain("trackerDeltas");
  expect(Object.keys(partyItem.properties)).not.toContain("trackerSets");
  expect(Object.keys(root.properties)).toContain("trackers");
});
