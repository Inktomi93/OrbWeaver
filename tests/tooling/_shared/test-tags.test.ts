import { ambientRootsForProgram } from "@orb/tooling/_shared/type-config-intent";
import { expect, test } from "../../support/tool-fixtures.ts";

test("the Vitest augmentation belongs only to Node and browser test programs", () => {
  const ambient = "tests/support/vitest-tags.d.ts";
  expect(ambientRootsForProgram("tsconfig.json")).toContain(ambient);
  expect(ambientRootsForProgram("tsconfig.tests-dom.json")).toContain(ambient);
  expect(ambientRootsForProgram("tsconfig.tests-iso.json")).not.toContain(ambient);
  expect(ambientRootsForProgram("packages/client/tsconfig.json")).not.toContain(ambient);
  expect(ambientRootsForProgram("packages/ui/tsconfig.json")).not.toContain(ambient);
});
