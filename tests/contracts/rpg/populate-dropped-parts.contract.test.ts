// @subject packages/contracts/src/rpg/extraction.ts
import { salvagePopulate } from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node";

const GOOD_SHEET = { title: "Artificer", level: 2 };
const GOOD_ITEM = { targetRef: "Rowan", add: [{ name: "Shuttle" }] };
const BAD_ITEM = { targetRef: "Rowan", add: [{ name: "Spare", quantity: 0 }] };
const GOOD_QUEST = { name: "Repair the loom", action: "create", objectives: ["Find the thread"] };

test("a reply that conforms drops nothing", () => {
  expect(salvagePopulate({ sheet: GOOD_SHEET, inventory: [GOOD_ITEM], quests: [GOOD_QUEST] }).droppedParts).toEqual([]);
});

test("each part that lost something is named once, in the vocabulary's order, while the parts beside it still apply", () => {
  const salvaged = salvagePopulate({
    sheet: { title: "", level: "two" },
    inventory: [BAD_ITEM, BAD_ITEM, GOOD_ITEM],
    quests: [{ action: "create" }, GOOD_QUEST],
  });
  expect(salvaged.droppedParts).toEqual(["sheet", "inventory", "quests"]);
  expect(salvaged.sheet).toBeNull();
  expect(salvaged.extraction.inventory).toHaveLength(1);
  expect(salvaged.extraction.quests).toHaveLength(1);
});

test("a sheet alone that cannot parse is the sheet part and nothing else", () => {
  expect(salvagePopulate({ sheet: { level: -1 }, inventory: [GOOD_ITEM] }).droppedParts).toEqual(["sheet"]);
});

test("a reply that is not an object is the whole reply, and a malformed live-play plane is never reported", () => {
  expect(salvagePopulate("not json").droppedParts).toEqual(["reply"]);
  expect(salvagePopulate({ sheet: GOOD_SHEET, journal: [{ nonsense: true }], party: "nobody" }).droppedParts).toEqual([]);
});
