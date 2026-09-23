// Misuse exits 3 through the real cli before any stage or provider work, so the check never spends tokens on a
// malformed run.
import { expect, test } from "../../support/tool-fixtures.ts";

const MISUSE: readonly (readonly [string, readonly string[]])[] = [
  ["an unknown route", ["--routes=bedrock"]],
  ["a ref with the working tree", ["--dirty", "--ref=HEAD"]],
];

for (const [label, argv] of MISUSE) {
  test(`${label} exits as misuse before the stage boots`, async ({ runCli }) => {
    const res = await runCli("cache-check", argv);
    expect(res.stderr).toContain("ARG ERROR");
    expect(res.stdout).not.toContain("[snap-stage]");
    await expect(res).toExitWith(3);
  });
}
