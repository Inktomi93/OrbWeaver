// The exact named-file door. The capability under test is TOTAL FAIL-CLOSED over the demanded id set: an
// exact resource is named because the policy's judgment is ABOUT it, so a per-id miss inside a `ready` fact
// would invert that judgment rather than narrow it.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { ResourceLoad } from "../../../../tooling/src/verify/contract/resource.ts";
import type { ExactFile, ExactResourceId } from "../../../../tooling/src/verify/contract/resource-exact.ts";
import { EXACT_RESOURCE_PATHS } from "../../../../tooling/src/verify/contract/resource-exact.ts";
import { loadExactFiles } from "../../../../tooling/src/verify/ops/resource-exact.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";

const VITEST = EXACT_RESOURCE_PATHS["vitest-config"];
const PLAYWRIGHT = EXACT_RESOURCE_PATHS["playwright-ct-config"];

function load(
  scratch: string,
  overlay: Readonly<Record<string, string | null>>,
  ids: readonly ExactResourceId[],
): ResourceLoad<ReadonlyMap<ExactResourceId, ExactFile>> {
  return loadExactFiles(createResourceReader({ root: scratch, overlay }), ids);
}

test("each demanded id is served with its text and size", ({ scratch }) => {
  const fact = load(scratch, { [VITEST]: "export default {};\n", [PLAYWRIGHT]: "export default {};\n" }, ["vitest-config", "playwright-ct-config"]);

  expect(fact.status).toBe("ready");
  if (fact.status !== "ready") {
    throw new Error(`fixture exact files failed: ${fact.reason}`);
  }
  expect(fact.value.get("vitest-config")).toEqual({ id: "vitest-config", path: VITEST, text: "export default {};\n", bytes: 19, lines: 2 });
  expect(fact.members).toBe(2);
  // The path order follows the sorted ID set, which is the door's own identity — not the alphabetical order
  // of the paths those ids happen to name.
  expect(fact.paths).toEqual([PLAYWRIGHT, VITEST]);
});

test("ONE absent member refuses the WHOLE fact rather than serving a shorter map", ({ scratch }) => {
  // The planted control in both directions. Present-and-present is `ready` above; present-and-absent must
  // NOT be a one-entry ready map — "the config has no such literal" and "the config is gone" are
  // opposite verdicts, and a shorter map is how the second silently becomes the first.
  const partial = load(scratch, { [VITEST]: "export default {};\n" }, ["vitest-config", "playwright-ct-config"]);

  expect(partial.status).toBe("missing");
  expect(partial.status === "ready" ? "" : partial.reason).toContain("playwright-ct-config");
  expect(partial).not.toHaveProperty("value");
});

test("zero ids and an unknown id are distinct refusals, and neither is an empty map", ({ scratch }) => {
  const none = load(scratch, { [VITEST]: "x\n" }, []);
  expect(none.status).toBe("empty");

  const unknown = load(scratch, { [VITEST]: "x\n" }, ["not-an-id" as ExactResourceId]);
  expect(unknown.status).toBe("unresolved");
  expect(unknown.status === "unresolved" ? unknown.reason : "").toContain("unknown exact resource id");
});
