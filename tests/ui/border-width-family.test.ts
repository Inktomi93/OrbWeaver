// The border-width family: the control border follows the default step, and both stay whole CSS pixels so the
// switch rest offset and the combobox chip sizes land on the device-pixel grid (docs/law/integer-line-boxes.md).
import { expect, test } from "@orb/testkit/node";
import { LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";

test("the control border is the default step, not a second decision", () => {
  expect(LENGTH_BASE_PX["border-width.control"]).toBe(LENGTH_BASE_PX["border-width.default"]);
});

test("the default and control borders are whole CSS pixels", () => {
  for (const step of ["border-width.default", "border-width.control"] as const) {
    expect(Number.isInteger(LENGTH_BASE_PX[step]), step).toBe(true);
  }
});

test("Tailwind's bare border and bare ring read the default step through the theme", () => {
  const defaultVar = TOKENS["border-width.default"].cssVar;
  expect(TOKENS["default.border-width"].value).toBe(`var(${defaultVar})`);
  expect(TOKENS["default.ring-width"].value).toBe(`var(${defaultVar})`);
});
