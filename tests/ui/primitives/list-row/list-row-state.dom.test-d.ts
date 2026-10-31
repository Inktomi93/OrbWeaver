// D336: ListRow state is the attribute, never a boolean prop that restates it, and `density` left with its last caller.
import type { ListRowProps } from "@orb/ui/list-row";
import { ListRow } from "@orb/ui/list-row";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("ListRow takes its state as the attributes and refuses the booleans that restated them", () => {
  // @ts-expect-error selected is data-selected
  createElement(ListRow, { title: "x", selected: true });
  // @ts-expect-error expanded is aria-expanded
  createElement(ListRow, { title: "x", expanded: true });
  // @ts-expect-error disabled is data-disabled
  createElement(ListRow, { title: "x", disabled: true });
  // @ts-expect-error the compact height left with its last caller
  createElement(ListRow, { title: "x", density: "compact" });
  // @ts-expect-error aria-current follows data-selected inside the row, never a caller's second input
  createElement(ListRow, { title: "x", "aria-current": true });
  // @ts-expect-error the attribute carries the empty string or nothing
  createElement(ListRow, { title: "x", "data-selected": true });
  createElement(ListRow, { title: "x", "data-selected": "", "aria-expanded": false, "data-disabled": "" });
  expectTypeOf<ListRowProps["data-selected"]>().toEqualTypeOf<"" | undefined>();
  expectTypeOf<ListRowProps["data-disabled"]>().toEqualTypeOf<"" | undefined>();
  expectTypeOf<ListRowProps["aria-expanded"]>().toEqualTypeOf<boolean | undefined>();
});
