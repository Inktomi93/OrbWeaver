// Browser-test consumers must be checked when their production or shared-helper inputs change.
import { touchesTestsDom } from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("browser-test type coverage includes upstream package, tooling and shared-helper changes", () => {
  for (const path of [
    "packages/ui/src/primitives/button/index.ts",
    "packages/client/src/state/value.ts",
    "packages/kit/src/value.ts",
    "packages/contracts/src/chat/index.ts",
    "packages/server/src/domain/chat/contract/context.ts",
    "tooling/src/snap/lib/value.ts",
    "tests/support/node/value.ts",
    "tests/support/ids.ts",
  ]) {
    expect(touchesTestsDom([path]), path).toBe(true);
  }
});

test("direct browser roots and ambient changes remain covered without routing non-TypeScript files", () => {
  expect(touchesTestsDom(["tests/ui/button.ct.tsx"])).toBe(true);
  expect(touchesTestsDom(["reset.d.ts"])).toBe(true);
  expect(touchesTestsDom(["packages/ui/src/styles.css", "tests/support/data.json", "docs/design.md"])).toBe(false);
});
