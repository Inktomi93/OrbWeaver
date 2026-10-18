import { ST_SETTINGS_FILE, sniffTreeLayout } from "@orb/contracts/import";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("mixed format markers refuse routing, while each distinct layout retains its staging prefix", () => {
  const nativeDirs = new Set(["personas"]);
  expect(sniffTreeLayout([ST_SETTINGS_FILE, "personas/author.json"], nativeDirs)).toEqual({ kind: "reject", found: ["personas", ST_SETTINGS_FILE] });
  expect(sniffTreeLayout([ST_SETTINGS_FILE, "characters/card.png"], nativeDirs)).toEqual({ kind: "st", stagePrefix: "profile/" });
  expect(sniffTreeLayout(["personas/author.json", "characters/card.png"], nativeDirs)).toEqual({ kind: "orb", stagePrefix: "" });
  expect(sniffTreeLayout([`alice/${ST_SETTINGS_FILE}`, "alice/characters/card.png"], nativeDirs)).toEqual({ kind: "st", stagePrefix: "" });
  expect(sniffTreeLayout(["unrecognized.json"], nativeDirs)).toEqual({ kind: "reject", found: ["unrecognized.json"] });
});

test("an explicit ST profile keeps its shared themes and unsupported assets without becoming a native bundle", () => {
  const paths = [
    ST_SETTINGS_FILE,
    `${PORTABLE_DIRECTORIES.character}card.png`,
    `${PORTABLE_DIRECTORIES.theme}night.json`,
    `${PORTABLE_DIRECTORIES.assets}extension.bin`,
  ];
  expect(sniffTreeLayout(paths)).toEqual({ kind: "st", stagePrefix: "profile/" });
  expect(sniffTreeLayout(paths.map((path) => `alice/${path}`))).toEqual({ kind: "st", stagePrefix: "" });
});
