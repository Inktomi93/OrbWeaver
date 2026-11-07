// Trailing content needs a rule to trail: only a stacked kicker draws one.
import { Section } from "@orb/ui/layout";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("a stacked kicker takes trailing content, and no other heading does", () => {
  expectTypeOf<Parameters<typeof Section>[0]>().toHaveProperty("trailing");
  createElement(Section, { kicker: "Lane", trailing: "tally" });
  createElement(Section, { kicker: "Lane", kickerLayout: "stacked", trailing: "tally" });
  createElement(Section, { kicker: "Rail", kickerLayout: "inline" });
  // @ts-expect-error the inline kicker's rule is the section's top edge, so nothing trails it
  createElement(Section, { kicker: "Rail", kickerLayout: "inline", trailing: "tally" });
  // @ts-expect-error a plain heading has no rule
  createElement(Section, { heading: "Sampling", trailing: "tally" });
});
