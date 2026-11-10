// The caps voices all-caps-body excludes are the voices whose recipe sets uppercase, read from the Text tables.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { loadUiSources } from "../../../../tooling/src/eslint/ui-classes/source.ts";
import { componentTables } from "../../../../tooling/src/eslint/ui-classes/variant-tables.ts";
import { CAPS_RECIPE_VOICES } from "../../../../tooling/src/ui-audit/lib/checks-typography.ts";

const ROOT = join(import.meta.dirname, "../../../..");
const UPPERCASE = "uppercase";

test("the caps voices are exactly the Text voices whose recipe sets uppercase", () => {
  const voices = componentTables(ROOT, loadUiSources(ROOT)).get("text")?.get("Text")?.declared.get("voice");
  expect(voices?.size, "the Text voice table is read").toBeGreaterThan(0);
  const caps = [...(voices ?? new Map())].filter(([, arm]) => arm.tokens.includes(UPPERCASE)).map(([voice]) => voice);
  expect(caps.sort()).toEqual([...CAPS_RECIPE_VOICES].sort());
});
