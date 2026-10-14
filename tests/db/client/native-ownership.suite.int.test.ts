// @subject packages/db/src/client/index.ts
import { execPath } from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

test("installed native statements, rows and canonical DB lifetimes release before the process exits", ({ importStagingDir }) => {
  const control = fileURLToPath(new URL("./native-ownership-control.mjs", import.meta.url));
  const result = runNicedSync(execPath, [control, importStagingDir], { timeout: 30_000 });
  expect(result.status, result.stderr || result.stdout).toBe(0);
});
