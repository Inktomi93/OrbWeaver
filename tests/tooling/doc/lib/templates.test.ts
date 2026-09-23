// The content-flag tuples and the templates bind one-to-one: every flag the parser accepts lands in a
// section of its kind's template, so a flag with no section cannot silently drop the author's text.
import { ADR_SECTION_FLAGS, adrTemplate, ITEM_SECTION_FLAGS, itemTemplate, PLAN_SECTION_FLAGS, planTemplate } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TODAY = "2026-09-23";

function marker(flag: string): string {
  return `MARK-${flag}-TEXT`;
}

function allMarked<F extends string>(flags: readonly F[]): { [K in F]?: string } {
  const content: { [K in F]?: string } = {};
  for (const flag of flags) {
    content[flag] = marker(flag);
  }
  return content;
}

test("every ADR, plan and item content flag renders into its template", () => {
  const rendered: readonly (readonly [readonly string[], string])[] = [
    [ADR_SECTION_FLAGS, adrTemplate("A", TODAY, allMarked(ADR_SECTION_FLAGS))],
    [PLAN_SECTION_FLAGS, planTemplate("P", TODAY, allMarked(PLAN_SECTION_FLAGS))],
    [ITEM_SECTION_FLAGS, itemTemplate({ kind: "work", status: "open", updated: TODAY }, "T", allMarked(ITEM_SECTION_FLAGS))],
  ];
  for (const [flags, text] of rendered) {
    for (const flag of flags) {
      expect(text, flag).toContain(marker(flag));
    }
  }
});
