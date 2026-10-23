import {
  DEFAULT_COMPACT_INSTRUCTIONS,
  DEFAULT_FORMAT_STRINGS,
  DEFAULT_GUIDED_ACTIONS,
  GUIDED_ACTION_KINDS,
  PRESET_FORMAT_SLOT_IDS,
  TEMPLATE_DEFS,
} from "@orb/contracts/preset";
import { isPresetProseSlotId, isProseSlotId, PROSE_SLOTS, resolveProseText } from "@orb/contracts/prose";
import { expect, test } from "@orb/testkit/node";

test("guided Templates rows resolve the defaults used by their actual actions", () => {
  for (const kind of GUIDED_ACTION_KINDS) {
    const rows = TEMPLATE_DEFS.filter((def) => def.id === kind);
    expect(rows, kind).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) {
      throw new Error(`Missing guided template: ${kind}`);
    }
    expect(resolveProseText(row.defaultSlot, {}), kind).toBe(DEFAULT_GUIDED_ACTIONS[kind].prompt);
    expect(isPresetProseSlotId(row.defaultSlot), kind).toBe(false);
  }
  expect(TEMPLATE_DEFS.find((def) => def.id === "response")?.defaultSlot).toBe("preset.guided.response");
  expect(TEMPLATE_DEFS.find((def) => def.id === "swipe")?.defaultSlot).toBe("preset.guided.response");
});

test("adapted format and compaction defaults stay out of prose storage", () => {
  for (const [key, slot] of Object.entries(PRESET_FORMAT_SLOT_IDS)) {
    expect(resolveProseText(slot, {}), key).toBe(DEFAULT_FORMAT_STRINGS[key as keyof typeof DEFAULT_FORMAT_STRINGS]);
    expect(isPresetProseSlotId(slot), key).toBe(false);
  }
  expect(resolveProseText("preset.compaction.instructions", {})).toBe(DEFAULT_COMPACT_INSTRUCTIONS);
  expect(isPresetProseSlotId("preset.compaction.instructions")).toBe(false);
});

test("preset prose storage and Templates rows agree in both directions", () => {
  const storedSlots = Object.values(PROSE_SLOTS).filter((slot) => isPresetProseSlotId(slot.id));
  const proseRows = TEMPLATE_DEFS.filter((def) => isProseSlotId(def.id));
  expect(storedSlots.map((slot) => slot.id).toSorted()).toEqual(proseRows.map((def) => def.id).toSorted());
  expect(storedSlots.map((slot) => slot.home)).toEqual(storedSlots.map(() => "preset"));
  expect(proseRows.filter((def) => def.defaultSlot !== def.id).map((def) => def.id)).toEqual([]);
  expect(isPresetProseSlotId("chat.injection.userNote")).toBe(true);
  expect(isPresetProseSlotId("preset.rewriteToggle.concise")).toBe(true);
  expect(isPresetProseSlotId("chat.arbiter.system")).toBe(false);
});
