// A world book keeps each entry's SillyTavern prompt slot through an import here and the SillyTavern export: the exported
// file places every entry where SillyTavern placed the original, read through a port of SillyTavern's own placement.
// The import report names each entry whose slot has no seat here.
// @subject packages/server/src/primitives/serde/world-info/index.ts
// @subject packages/server/src/primitives/serde/card/index.ts
// @subject packages/kit/src/world-info/index.ts
// @subject packages/server/src/domain/import/substrate/report.ts

import { readFile } from "node:fs/promises";
import { ST_EXPORT_PROFILE_DIR, ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { StWorldInfoPosition } from "@orb/kit/world-info";
import { ST_SEATLESS_POSITIONS, ST_WORLD_INFO_POSITION } from "@orb/kit/world-info";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { strFromU8 } from "fflate";
import { z } from "zod";
import { admit, exportedZip, finishRun, harness, settings } from "./_st-tree-door.ts";

const BOOK = "Placements";
const OUTLET = "harbor-outlet";
const AT_DEPTH = { depth: 2, role: 1 };

// One entry per SillyTavern slot, as SillyTavern's world editor saves them (`worlds/*.json`, camelCase by its spelling).
const STORED_ENTRIES = Object.entries(ST_WORLD_INFO_POSITION).map(([slot, position], uid) => ({
  uid,
  key: [slot.toLowerCase()],
  comment: slot,
  content: `The ${slot} lore.`,
  order: 100,
  position,
  ...(position === ST_WORLD_INFO_POSITION.atDepth ? AT_DEPTH : {}),
  ...(position === ST_WORLD_INFO_POSITION.outlet ? { outletName: OUTLET } : {}),
}));

const stEntrySchema = z.looseObject({ comment: z.string() });
const stWorldSchema = z.object({ entries: z.record(z.string(), stEntrySchema) });

// SillyTavern's defaults for the fields its placement reads (`newWorldInfoEntryDefinition`, `DEFAULT_DEPTH`,
// public/scripts/world-info.js), which `addMissingWorldInfoFields` back-fills on every entry it loads.
const ST_DEFAULTS = { position: 0, depth: 4, role: 0, outletName: "" };

/** Where SillyTavern puts one loaded entry in the prompt: a port of the `switch (entry.position)` in
 *  `getWorldInfoPrompt`'s placement loop (public/scripts/world-info.js), whose `default` places nothing. */
function stPlacement(raw: Readonly<Record<string, unknown>>): string {
  const entry = { ...ST_DEFAULTS, ...raw };
  const slot = (Object.keys(ST_WORLD_INFO_POSITION) as StWorldInfoPosition[]).find((name) => ST_WORLD_INFO_POSITION[name] === entry.position);
  switch (slot) {
    case "atDepth":
      return `depth ${String(entry.depth)} role ${String(entry.role)}`;
    case "outlet":
      return typeof entry.outletName === "string" && entry.outletName.length > 0 ? `outlet ${entry.outletName}` : "nowhere";
    case undefined:
      return "nowhere";
    default:
      return slot;
  }
}

test("every entry of a SillyTavern world lands in the same SillyTavern slot after an import and the export", async () => {
  await using root = await harness();
  const result = await finishRun(
    root,
    await admit(root, { [ST_SETTINGS_FILE]: settings({}), [`worlds/${BOOK}.json`]: JSON.stringify({ entries: { ...STORED_ENTRIES } }) }),
  );

  const zip = await exportedZip(root);

  const world = stWorldSchema.parse(JSON.parse(strFromU8(present(zip[`${ST_EXPORT_PROFILE_DIR}worlds/${BOOK}.json`]))));
  const placed = Object.fromEntries(Object.values(world.entries).map((entry) => [entry.comment, stPlacement(entry)]));
  const original = Object.fromEntries(STORED_ENTRIES.map((entry) => [entry.comment, stPlacement(entry)]));
  expect(placed).toEqual(original);
  // The control: the original file places every slot, at-depth and outlet included, so a lost field cannot match.
  expect(new Set(Object.values(original)).size).toBe(STORED_ENTRIES.length);
  expect(Object.values(original)).not.toContain("nowhere");

  // The import names each entry whose slot has no seat here, by slot.
  const report = await readFile(present(result.reportPath), "utf8");
  const line = present(report.split("\n").find((text) => text.includes(`\`${BOOK}\``)));
  for (const slot of ST_SEATLESS_POSITIONS) {
    expect(line, slot).toContain(`\`${slot}\` (1 entry)`);
  }
  expect(line).not.toContain("`atDepth`");
});
