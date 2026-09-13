import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

vi.setConfig({ testTimeout: scaledBudget(30_000) });

async function reportTree(plantedTree: (files: Record<string, string>) => Promise<string>, report: object): Promise<string> {
  return await plantedTree({ "reports/check-structure.json": `${JSON.stringify(report)}\n` });
}

const brokenReport = {
  gates: [{ name: "broken-gate", ok: true, violations: [] }],
  toolErrors: [{ gate: "broken-gate", phase: "run", message: "planted checker crash" }],
  scanAlarms: [],
  total: 0,
  ok: false,
};

test("a filtered show view preserves tool-error exit 2", async ({ plantedTree, runCli }) => {
  const root = await reportTree(plantedTree, brokenReport);
  const result = await runCli("verify", ["show", "--gate", "broken"], { cwd: root });
  await expect(result).toExitWith(EXIT.toolError);
  expect(result.stdout).toContain("TOOL ERROR");
});

for (const argv of [["--unknown"], ["--gate"], ["--file"], ["--limit", "0"], ["--limit", "wat"]]) {
  test(`invalid show argv ${JSON.stringify(argv)} exits misuse`, async ({ plantedTree, runCli }) => {
    const root = await reportTree(plantedTree, brokenReport);
    const result = await runCli("verify", ["show", ...argv], { cwd: root });
    await expect(result).toExitWith(EXIT.misuse);
  });
}

test("a valid filter over an ordinary violation remains an inspection view", async ({ plantedTree, runCli }) => {
  const root = await reportTree(plantedTree, {
    gates: [{ name: "dirty-gate", ok: false, violations: [{ file: "x.ts", line: 1, message: "violation" }] }],
    toolErrors: [],
    scanAlarms: [],
    total: 1,
    ok: false,
  });
  const result = await runCli("verify", ["show", "--gate", "dirty"], { cwd: root });
  await expect(result).toExitWith(EXIT.clean);
});
