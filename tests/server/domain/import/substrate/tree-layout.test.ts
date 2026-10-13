import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { sniffTreeLayout } from "@orb/server/domain/import";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("mixed format markers refuse routing, while each distinct layout retains its staging prefix", () => {
  const nativeDirs = new Set(["personas"]);
  expect(sniffTreeLayout([ST_SETTINGS_FILE, "personas/author.json"], nativeDirs)).toEqual({ kind: "reject", found: ["personas", ST_SETTINGS_FILE] });
  expect(sniffTreeLayout([ST_SETTINGS_FILE, "characters/card.png"], nativeDirs)).toEqual({ kind: "st", stagePrefix: "profile/" });
  expect(sniffTreeLayout(["personas/author.json", "characters/card.png"], nativeDirs)).toEqual({ kind: "orb", stagePrefix: "" });
  expect(sniffTreeLayout([`alice/${ST_SETTINGS_FILE}`, "alice/characters/card.png"], nativeDirs)).toEqual({ kind: "st", stagePrefix: "" });
  expect(sniffTreeLayout(["unrecognized.json"], nativeDirs)).toEqual({ kind: "reject", found: ["unrecognized.json"] });
});
