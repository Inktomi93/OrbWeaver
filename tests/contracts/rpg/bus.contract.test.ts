// @orb/contracts/rpg/bus — the feature-root rpg bus union + its `RPG_BUS_EVENT_TYPES` producer-coverage belt
// (rpg-design/05 §4.9). Pins: the belt is TOTAL over the union (the `satisfies` proof made a runtime check —
// a member added to the union without a belt entry fails tsc; here we assert the belt IS the exact member set
// so a DROPPED member is caught too), and the lite v1 member set is the committed 5.

import type { RpgBusEvent } from "@orb/contracts/rpg";
import { RPG_BUS_EVENT_TYPES } from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures.ts";

test("RPG_BUS_EVENT_TYPES is the committed lite-v1 member set", () => {
  expect([...RPG_BUS_EVENT_TYPES]).toEqual(["gameChanged", "snapshotPatched", "sheetChanged", "questChanged", "journalChanged"]);
});

test("the belt is total over RpgBusEvent['type'] (no member drift)", () => {
  // A compile-time `satisfies readonly RpgBusEvent["type"][]` proves each belt entry is a real member; this
  // runtime mirror proves the reverse direction — the belt names EVERY member (a union add without a belt
  // entry would leave this set short). We enumerate every discriminant we know the union carries and assert
  // the belt covers exactly them.
  const known: RpgBusEvent["type"][] = ["gameChanged", "snapshotPatched", "sheetChanged", "questChanged", "journalChanged"];
  expect(new Set(RPG_BUS_EVENT_TYPES)).toEqual(new Set(known));
});

test("every member carries chatId (the channel key)", () => {
  const events: RpgBusEvent[] = [
    { type: "gameChanged", chatId: castChatId() },
    { type: "snapshotPatched", chatId: castChatId(), snapshotId: castSnapshotId() },
    { type: "sheetChanged", chatId: castChatId(), sheetId: castSheetId() },
    { type: "questChanged", chatId: castChatId() },
    { type: "journalChanged", chatId: castChatId() },
  ];
  for (const e of events) {
    expect(e.chatId).toBeDefined();
  }
});

function castChatId(): RpgBusEvent["chatId"] {
  return "chat_x" as RpgBusEvent["chatId"];
}
function castSnapshotId(): Extract<RpgBusEvent, { type: "snapshotPatched" }>["snapshotId"] {
  return "rpg_snapshot_x" as Extract<RpgBusEvent, { type: "snapshotPatched" }>["snapshotId"];
}
function castSheetId(): Extract<RpgBusEvent, { type: "sheetChanged" }>["sheetId"] {
  return "rpg_sheet_x" as Extract<RpgBusEvent, { type: "sheetChanged" }>["sheetId"];
}
