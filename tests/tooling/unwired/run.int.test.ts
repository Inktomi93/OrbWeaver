// The `pnpm unwired` verb parser through the real CLI. An empty root holds no world, so the member scan runs in
// milliseconds and still writes its report where the bare verb writes it.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";

const MEMBER_REPORT = "reports/unwired/unwired.json";

test.for([
  { spelling: "the bare verb", argv: [] },
  { spelling: "scan", argv: ["scan"] },
])("unwired $spelling runs the member scan and writes its report", async ({ argv }, { runCli, scratch }) => {
  const run = await runCli("unwired", [...argv, `--root=${scratch}`]);
  await expect(run).toExitWith(0);
  expect(existsSync(join(scratch, MEMBER_REPORT))).toBe(true);
});
