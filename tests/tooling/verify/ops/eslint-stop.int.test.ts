// @subject tooling/src/verify/ops/eslint-profile.ts
// A stopped scoped ESLint run must not leave its native ESLint worker running. The real worker is frozen
// as soon as it starts, which makes it a worker that cannot honor TERM.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { stopFrozenCaller, writeFreezingCaller } from "../../floor/process/stop-fixture.ts";

const ESLINT_WORKER = "scripts/eslint.ts";
const ARGS_FILE_FLAG = "--args-file";
// An untyped file: the run reaches the worker spawn without building a compiler program.
const UNTYPED_TARGET = "stylelint.config.js";

test("SIGTERM to a scoped ESLint run ends and joins its native worker and removes its arguments", { timeout: scaledBudget(240_000) }, async ({
  scratch,
  repoRoot,
}) => {
  const caller = join(scratch, "caller.mjs");
  const eslint = pathToFileURL(join(repoRoot, "tooling/src/verify/ops/eslint.ts")).href;
  writeFreezingCaller(
    caller,
    ESLINT_WORKER,
    `const {runScopedEslint}=await import(${JSON.stringify(eslint)});
await runScopedEslint(${JSON.stringify(repoRoot)},[${JSON.stringify(UNTYPED_TARGET)}]);`,
  );
  const stopped = await stopFrozenCaller(caller, repoRoot);
  expect(stopped.survivors, "every process the stopped ESLint run started").toEqual([]);
  const flag = stopped.frozenArgv.indexOf(ARGS_FILE_FLAG);
  const argumentsFile = flag === -1 ? undefined : stopped.frozenArgv[flag + 1];
  if (argumentsFile === undefined) {
    throw new Error(`the frozen worker names no arguments file: ${stopped.frozenArgv.join(" ")}`);
  }
  expect(existsSync(dirname(resolve(repoRoot, argumentsFile))), "the stopped run's arguments directory").toBe(false);
});
