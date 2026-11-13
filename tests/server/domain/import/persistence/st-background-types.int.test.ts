// A SillyTavern background is stored under the type its bytes are, whatever its extension says: a JPEG named `.png`
// lands as a JPEG in the owner's background library, and bytes that are no picture or video are still refused and named
// in the import report with the store's reason.
// @subject packages/server/src/domain/import/loader/profile-directory.ts

import { readFile } from "node:fs/promises";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { magicBytes } from "@orb/testkit/node/helpers";
import { admit, finishRun, harness, settings } from "./_st-tree-door.ts";

const JPEG = "image/jpeg";
const PNG = "image/png";
const DAWN = "Dawn";
const DUSK = "Dusk";

test("a JPEG named .png lands as a JPEG background, and a text file named .png is refused with its reason", async () => {
  await using root = await harness();
  const result = await finishRun(
    root,
    await admit(root, {
      [ST_SETTINGS_FILE]: settings({}),
      "backgrounds/Dawn.png": magicBytes("jpeg", 90),
      "backgrounds/Dusk.png": magicBytes("png", 91),
      "backgrounds/Notes.png": "a note, not a picture",
    }),
  );
  if (result.reportPath === undefined) {
    throw new Error("the real run did not expose its written report");
  }
  const report = await readFile(result.reportPath, "utf8");
  const library = (await root.services.settings.getUserSettings({ principal: await root.principalFor(root.ownerId) })).config.appearance.backgroundLibrary;
  const imported = Object.fromEntries(library.filter((entry) => entry.name === DAWN || entry.name === DUSK).map((entry) => [entry.name, entry.mime]));

  // Control: a PNG named .png lands under its own type beside the relabelled JPEG.
  expect(imported).toEqual({ [DAWN]: JPEG, [DUSK]: PNG });
  expect(nonEmpty(library).some((entry) => entry.name === "Notes")).toBe(false);
  expect(report).toMatch(/`[^`]*Notes\.png` — \S/u);
  expect(report).not.toMatch(/`[^`]*Dawn\.png` — /u);
});
