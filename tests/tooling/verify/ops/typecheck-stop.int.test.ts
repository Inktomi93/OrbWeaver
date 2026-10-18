// @subject tooling/src/verify/ops/typecheck.ts
// @subject tooling/src/floor/process/proc.ts
// A stopped typecheck run must not leave its async compiler children running. The real ts7 wrapper is
// frozen as soon as it starts, which makes it a child that cannot honor TERM.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { stopFrozenCaller, writeFreezingCaller } from "../../floor/process/stop-fixture.ts";

const COMPILER_WRAPPER = "scripts/ts7.ts";

test("SIGTERM to a typecheck run ends and joins its async compiler child", { timeout: scaledBudget(120_000) }, async ({ scratch, repoRoot }) => {
  const subject = join(scratch, "subject");
  mkdirSync(join(subject, "a"), { recursive: true });
  execFixtureGit(subject, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  writeFileSync(join(subject, "a/tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, strict: true, types: [] }, files: ["value.ts"] }));
  writeFileSync(join(subject, "a/value.ts"), "export const value = 1;\n");
  const caller = join(scratch, "caller.mjs");
  const typecheck = pathToFileURL(join(repoRoot, "tooling/src/verify/ops/typecheck.ts")).href;
  writeFreezingCaller(
    caller,
    COMPILER_WRAPPER,
    `const {executeTypecheckPrograms}=await import(${JSON.stringify(typecheck)});
await executeTypecheckPrograms(${JSON.stringify(subject)},null);`,
  );
  expect((await stopFrozenCaller(caller, repoRoot)).survivors, "every process the stopped typecheck run started").toEqual([]);
});
