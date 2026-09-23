// The retired ledger splitter: the registry it read is deleted, so the verb refuses, writes nothing, and
// names the verb that mints a decision now.
import { migrateLedger } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("migrate-ledger refuses with the registry gone and writes nothing", () => {
  const outcome = migrateLedger();
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals).toHaveLength(1);
  expect(outcome.refusals[0]).toContain("the legacy registry is gone");
  expect(outcome.refusals[0]).toContain("pnpm doc new adr <slug>");
});
