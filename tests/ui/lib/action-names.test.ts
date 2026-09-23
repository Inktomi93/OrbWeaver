// The LITERAL control for the two item-action name grammars `@orb/ui` owns (#2436, the #2261 pattern).
//
// Every other pin on these names now calls the builder — two `@orb/ui` primitives, six client components
// and ~25 CT locators — so a drifted SPELLING is a compile error and none of those pins can see a COPY
// change. This file is the one place the wording itself is asserted, at the builder's own mirror home
// (`packages/ui/src/lib/action-names.ts` -> `tests/ui/lib/action-names.test.ts`, CLAUDE.md "Test layout").
import { removeActionName, selectActionName } from "@orb/ui/lib";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("removeActionName", () => {
  test("the house grammar is `Remove <subject>`", () => {
    expect(removeActionName("adventure")).toBe("Remove adventure");
  });

  test("the subject is spent VERBATIM — a file name keeps its extension, a tag its case", () => {
    expect(removeActionName("portrait.png")).toBe("Remove portrait.png");
    expect(removeActionName("dry_multiplier")).toBe("Remove dry_multiplier");
  });
});

describe("selectActionName", () => {
  test("the house grammar is `Select <subject>`", () => {
    expect(selectActionName("Bram")).toBe("Select Bram");
  });

  test("the table's unlabelled-row fallback reads as a position, not an id", () => {
    expect(selectActionName("row 3")).toBe("Select row 3");
  });
});
