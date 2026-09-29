import "../../../tooling/src/plugin-author-showcase/cli.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

test("showcase author CLI imports without running and rejects an invalid command at its real entry", async ({ runCli }) => {
  const result = await runCli("plugin-author-showcase", ["not-a-command"]);
  await expect(result).toExitWith(3);
  expect(result.stderr).toContain("usage: node tooling/src/plugin-author-showcase/cli.ts <build|check>");
  expect(result.stdout).toBe("");
});
