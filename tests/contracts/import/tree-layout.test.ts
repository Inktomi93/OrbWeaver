import { admitTreeBatch, ST_SETTINGS_FILE, sniffTreeLayout } from "@orb/contracts/import";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { expect, test } from "@orb/testkit/node";

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

test("a declared native batch is admitted only when every entry sits under a canonical native directory", () => {
  const assets = `${PORTABLE_DIRECTORIES.assets}blob`;
  const theme = `${PORTABLE_DIRECTORIES.theme}night.json`;
  const card = `${PORTABLE_DIRECTORIES.character}aria.png`;
  const chat = `${PORTABLE_DIRECTORIES.chat}aria.json`;
  const native = { kind: "orb", stagePrefix: "" };
  expect(admitTreeBatch([assets], "orb")).toEqual(native);
  expect(admitTreeBatch([theme], "orb")).toEqual(native);
  expect(admitTreeBatch([card, chat], "orb")).toEqual(native);
  expect(admitTreeBatch([assets, theme, card, chat], "orb")).toEqual(native);
  // The declaration never reaches the SillyTavern importer: its markers and stray entries are refused.
  expect(admitTreeBatch([card, ST_SETTINGS_FILE], "orb")).toEqual({ kind: "reject", found: ["characters", ST_SETTINGS_FILE] });
  expect(admitTreeBatch([card, "User Avatars/me.png"], "orb")).toEqual({ kind: "reject", found: ["characters", "User Avatars"] });
  expect(admitTreeBatch([card, "notes/plan.txt"], "orb")).toEqual({ kind: "reject", found: ["characters", "notes"] });
  expect(admitTreeBatch([card, "README.txt"], "orb")).toEqual({ kind: "reject", found: ["characters", "README.txt"] });
  expect(admitTreeBatch([], "orb")).toEqual({ kind: "reject", found: [] });
});

test("an undeclared batch keeps the lone sniff exactly", () => {
  const batches = [
    [`${PORTABLE_DIRECTORIES.assets}blob`],
    [`${PORTABLE_DIRECTORIES.character}aria.png`],
    [ST_SETTINGS_FILE, `${PORTABLE_DIRECTORIES.regex}x.json`],
  ];
  for (const paths of batches) {
    expect(admitTreeBatch(paths, null)).toEqual(sniffTreeLayout(paths));
  }
});
