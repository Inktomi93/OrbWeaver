import { ARTIFACT_FLAGS, ENVIRONMENT_FLAGS, WHERE_FLAGS } from "@orb/tooling/_shared/instrument-argv";
import { parseSnapArgs } from "../../../tooling/src/snap/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const VALUE_BY_FLAG: Readonly<Record<string, string>> = {
  "--base": "http://localhost:5173",
  "--ref": "HEAD",
  "--session": "p-family-control",
  "--viewport": "800x600",
  "--out": "family-control",
};

// ONE PARSER, and that IS the fold's receipt (#1315). This roster carried snap + design-audit while the
// sibling CLIs existed; every one of them is now a snap ARM, so a second parser here would be a second
// argv grammar the fold exists to delete. The family enforcement is unchanged and still two-sided: a
// planted member reds the parser that does not consume it, and every real member must parse clean.
const PARSERS = [["snap", parseSnapArgs]] as const;

test("a planted shared-family member reds every parser until it is consumed", () => {
  const plantedFlag = "--__planted-family-control";
  const whereFlags = WHERE_FLAGS as Set<string>;
  whereFlags.add(plantedFlag);
  try {
    for (const [tool, parse] of PARSERS) {
      expect(parse([]).errors, tool).toContain(`${tool} parser is missing shared where flags: ${plantedFlag}`);
    }
  } finally {
    whereFlags.delete(plantedFlag);
  }
});

test("all public rendered-tool parsers consume every shared family table member", () => {
  const familyFlags = [...WHERE_FLAGS, ...ENVIRONMENT_FLAGS, ...ARTIFACT_FLAGS];

  for (const [tool, parse] of PARSERS) {
    for (const flag of familyFlags) {
      const value = VALUE_BY_FLAG[flag];
      const errors = parse(value === undefined ? [flag] : [flag, value]).errors;
      expect(errors, `${tool} ${flag}`).not.toContain(`unknown flag ${flag}`);
      expect(errors, `${tool} ${flag}`).not.toContainEqual(expect.stringContaining(`${tool} parser is missing shared`));
    }
  }
});
