// Native worker reuse must preserve suite-owned budgets without relying on a cached helper's import.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { RELATIONAL_CLI_TIMEOUT_MS } from "@orb/testkit/node";
import { expect, test } from "@orb/testkit/tooling";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";

const DEFAULT_TEST_TIMEOUT_MS = 5000;

test("each relational suite registers its budget after Vitest resets the previous file", { timeout: budget(RELATIONAL_CLI_TIMEOUT_MS) }, async ({
  scratch,
  repoRoot,
}) => {
  const helper = join(repoRoot, "tests/support/node/ui-audit-relational.ts");
  const vitest = join(repoRoot, "node_modules/vitest/dist/index.js");
  const source = `import { expect, test } from ${JSON.stringify(vitest)};
import { configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS } from ${JSON.stringify(helper)};
configureRelationalCliBudget();
test("suite budget", ({ task }) => {
  expect(task.timeout).toBe(RELATIONAL_CLI_TIMEOUT_MS);
});
`;
  const files = [join(scratch, "first.test.ts"), join(scratch, "second.test.ts")];
  await Promise.all(files.map((file) => writeFile(file, source)));
  const ordinary = join(scratch, "ordinary.test.ts");
  await writeFile(
    ordinary,
    `import { expect, test } from ${JSON.stringify(vitest)};
import { RELATIONAL_CLI_TIMEOUT_MS } from ${JSON.stringify(helper)};
test("import alone retains the ordinary budget", ({ task }) => {
  expect(RELATIONAL_CLI_TIMEOUT_MS).toBeGreaterThan(${DEFAULT_TEST_TIMEOUT_MS});
  expect(task.timeout).toBe(${DEFAULT_TEST_TIMEOUT_MS});
});
`,
  );
  const config = join(scratch, "vitest.config.mjs");
  await writeFile(
    config,
    `export default ${JSON.stringify({
      root: repoRoot,
      test: {
        include: [...files, ordinary],
        pool: "forks",
        maxWorkers: 1,
        fileParallelism: false,
        isolate: false,
        testTimeout: DEFAULT_TEST_TIMEOUT_MS,
        hookTimeout: 10_000,
      },
    })};`,
  );
  const result = await spawnNiced(process.execPath, [join(repoRoot, "node_modules/vitest/vitest.mjs"), "run", "--config", config, "--reporter=verbose"], {
    cwd: repoRoot,
    timeoutMs: budget(LONG_TEST_TIMEOUT_BASE_MS),
  });
  expect(result.timedOut, result.stderr || result.stdout).toBe(false);
  expect(result.code, result.stderr || result.stdout).toBe(0);
});
