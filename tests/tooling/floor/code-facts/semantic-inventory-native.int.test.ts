import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { initializeNativeInventoryFixture as initialize, writeNativeInventoryFixtureFile as write } from "../compiler/native-inventory-fixture.ts";

// Independent committed and projected acquisitions need completion allowance, not a latency assertion.
test("actual codemod transaction inventories preserve aliases, native package paths and overlay-only lookup roots on refusal", {
  timeout: scaledBudget(90_000),
}, ({ scratch }) => {
  initialize(scratch);
  write(scratch, "packages/client/src/missing.ts", "import { absent } from './absent'; export const read=absent;\n");
  const basePath = join(scratch, "packages/kit/src/base.ts");
  const original = readFileSync(basePath, "utf8");
  const entry = fileURLToPath(new URL("../compiler/native-inventory-command-cases.ts", import.meta.url));
  const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
  const result = join(scratch, ".cache/codemod-result.json");
  const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, "codemod-refusal", scratch, result], { cwd: scratch });
  expect(completed.status, completed.stderr).toBe(0);
  expect(JSON.parse(readFileSync(result, "utf8"))).toMatchObject({
    refusal: expect.stringContaining("refuse transaction after extraction"),
    disposed: expect.stringContaining("disposed"),
    observations: [
      {
        lookup: join(scratch, "packages/client/src/absent.ts"),
        alias: basePath,
        platform: join(scratch, "node_modules/fixture-platform/browser.ts"),
        text: expect.stringContaining("alive=101"),
        absentDeleted: true,
      },
      { text: expect.stringContaining("alive=101") },
    ],
    physicalUnchanged: true,
    latestUnchanged: true,
    pinnedUnchanged: true,
  });
  expect(readFileSync(basePath, "utf8")).toBe(original);
});
