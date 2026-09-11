// The exact named-file door. The capability under test is TOTAL FAIL-CLOSED over the demanded id set: an
// exact resource is named because the policy's judgment is ABOUT it, so a per-id miss inside a `ready` fact
// would invert that judgment rather than narrow it.
import type { ResourceLoad } from "../../../../tooling/src/verify/contract/resource.ts";
import type { ExactFile, ExactResourceId } from "../../../../tooling/src/verify/contract/resource-exact.ts";
import { EXACT_RESOURCE_PATHS } from "../../../../tooling/src/verify/contract/resource-exact.ts";
import { loadExactFiles } from "../../../../tooling/src/verify/ops/resource-exact.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const BOOT = EXACT_RESOURCE_PATHS["ct-boot"];
const EXTENSION = EXACT_RESOURCE_PATHS["ct-extension-css"];

function load(
  scratch: string,
  overlay: Readonly<Record<string, string | null>>,
  ids: readonly ExactResourceId[],
): ResourceLoad<ReadonlyMap<ExactResourceId, ExactFile>> {
  return loadExactFiles(createResourceReader({ root: scratch, overlay }), ids);
}

test("each demanded id is served with its text and size", ({ scratch }) => {
  const fact = load(scratch, { [BOOT]: "import './index.css';\n", [EXTENSION]: ".ct {}\n" }, ["ct-boot", "ct-extension-css"]);

  expect(fact.status).toBe("ready");
  if (fact.status !== "ready") {
    throw new Error(`fixture exact files failed: ${fact.reason}`);
  }
  expect(fact.value.get("ct-boot")).toEqual({ id: "ct-boot", path: BOOT, text: "import './index.css';\n", bytes: 22, lines: 2 });
  expect(fact.members).toBe(2);
  // The path order follows the sorted ID set, which is the door's own identity — not the alphabetical order
  // of the paths those ids happen to name.
  expect(fact.paths).toEqual([BOOT, EXTENSION]);
});

test("ONE absent member refuses the WHOLE fact rather than serving a shorter map", ({ scratch }) => {
  // The planted control in both directions. Present-and-present is `ready` above; present-and-absent must
  // NOT be a one-entry ready map — "the CT boot file has no CSS import" and "the CT boot file is gone" are
  // opposite verdicts, and a shorter map is how the second silently becomes the first.
  const partial = load(scratch, { [BOOT]: "import './index.css';\n" }, ["ct-boot", "ct-extension-css"]);

  expect(partial.status).toBe("missing");
  expect(partial.status === "ready" ? "" : partial.reason).toContain("ct-extension-css");
  expect(partial).not.toHaveProperty("value");
});

test("zero ids and an unknown id are distinct refusals, and neither is an empty map", ({ scratch }) => {
  const none = load(scratch, { [BOOT]: "x\n" }, []);
  expect(none.status).toBe("empty");

  const unknown = load(scratch, { [BOOT]: "x\n" }, ["not-an-id" as ExactResourceId]);
  expect(unknown.status).toBe("unresolved");
  expect(unknown.status === "unresolved" ? unknown.reason : "").toContain("unknown exact resource id");
});
