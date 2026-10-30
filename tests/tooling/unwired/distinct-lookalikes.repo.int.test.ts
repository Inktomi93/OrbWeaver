// The distinct registry is the truth list of judged look-alikes: every shape it names still exists, and each pair
// is recorded once, so a renamed or deleted shape cannot keep a stale judgment alive.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { DISTINCT_LOOKALIKES } from "../../../tooling/src/unwired/distinct-lookalikes.ts";

const ROOT = join(import.meta.dirname, "../../..");

test("every shape the distinct registry names is declared where it says", () => {
  const refs = new Set(DISTINCT_LOOKALIKES.flatMap(({ shape, distinctFrom }) => [shape, ...distinctFrom]));
  const missing = [...refs].filter((ref) => {
    const [file = "", name = ""] = ref.split("#");
    return !(existsSync(join(ROOT, file)) && new RegExp(`\\b${name}\\b`, "u").test(readFileSync(join(ROOT, file), "utf8")));
  });
  expect(missing).toEqual([]);
});

test("the distinct registry records each pair once", () => {
  const pairs = DISTINCT_LOOKALIKES.flatMap(({ shape, distinctFrom }) => distinctFrom.map((other) => [shape, other].toSorted().join(" | ")));
  expect(pairs.filter((pair, index) => pairs.indexOf(pair) !== index)).toEqual([]);
});
