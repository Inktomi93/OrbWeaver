// The ledger splitter on a planted registry: the dry run names every write, a duplicate anchor refuses,
// and --apply writes the ADRs, removes the rows and regenerates the index, in that order.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { migrateLedger, planMigration } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const REGISTRY = "docs/architecture/core/Core-Path-Registry.md";
const SOURCE =
  "# Registry\n\n> **RESERVED RANGE — D79–D105:** x.\n\n## D1-D2\n\n- **D1** — The auth seam.\n\n- **D2** — The entry shape.\n\n## D62\n\n- **D62** — The UI rulings.\n";

test("the plan names the files a range would mint and refuses a duplicate anchor or an existing file", () => {
  const plan = planMigration(SOURCE, { lo: 1, hi: 2 }, new Set());
  expect(plan.refusals).toEqual([]);
  expect(plan.writes.map((write) => write.path)).toEqual(["docs/adr/0001-d1.md", "docs/adr/0002-d2.md"]);
  expect(planMigration(SOURCE, "all", new Set(["docs/adr/0062-d62.md"])).refusals).toEqual(["docs/adr/0062-d62.md: exists"]);
  expect(planMigration(`${SOURCE}\n## D3-D4\n\n- **D1** — again.\n`, "all", new Set()).refusals[0]).toContain("D1: anchored more than once");
  expect(planMigration(SOURCE, { lo: 200, hi: 300 }, new Set()).refusals).toEqual(["no ruling in range 200-300"]);
});

test("a dry run writes nothing; --apply writes the ADRs and strips the rows", async ({ plantedTree }) => {
  const root = await plantedTree({ [REGISTRY]: SOURCE });
  const dry = migrateLedger({ lo: 1, hi: 2 }, false, root, "2026-09-23");
  expect(dry.planned).toEqual(["D1 → docs/adr/0001-d1.md", "D2 → docs/adr/0002-d2.md"]);
  expect(dry.written).toEqual([]);
  expect(existsSync(join(root, "docs/adr"))).toBe(false);
  const applied = migrateLedger({ lo: 1, hi: 2 }, true, root, "2026-09-23");
  expect(applied.refusals).toEqual([]);
  expect(applied.written.slice(0, 3)).toEqual(["docs/adr/0001-d1.md", "docs/adr/0002-d2.md", REGISTRY]);
  expect(readFileSync(join(root, "docs/adr/0001-d1.md"), "utf8")).toContain("## Decision\n\nThe auth seam.\n");
  const rest = readFileSync(join(root, REGISTRY), "utf8");
  expect(rest).not.toContain("**D1**");
  expect(rest).toContain("- **D62** — The UI rulings.");
  expect(readFileSync(join(root, "docs/adr/README.md"), "utf8")).toContain("| D1 | [D1](0001-d1.md) | active |");
  expect(migrateLedger({ lo: 1, hi: 2 }, false, root, "2026-09-23").refusals).toEqual(["no ruling in range 1-2"]);
});
