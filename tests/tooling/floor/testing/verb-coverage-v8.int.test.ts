// The coverage judge on a real V8 report: Vitest runs one test that calls one of two wrapped verbs, and only that
// verb's own body reads executed. V8 places a remapped function start at its body, not at its first token.
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { testProcessEnv } from "@orb/tooling/floor/process/process-env";
import { readServiceVerbs } from "@orb/tooling/floor/testing/service-verbs";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";
import { coverageReportSchema, judgeVerbCoverage } from "@orb/tooling/floor/testing/verb-coverage";
import { Project, ts } from "ts-morph";
import { scaledBudget } from "../../_load-budget.ts";

const DOMAIN = "packages/server/src/domain/hub";
const REPORTS = "coverage";
const FILES = {
  [`${DOMAIN}/contract/service.ts`]: "export interface HubService {\n  wrappedA(): Promise<number>;\n  wrappedB(): Promise<number>;\n  plain(): number;\n}\n",
  [`${DOMAIN}/service.ts`]: [
    'import type { HubService } from "./contract/service.ts";',
    "function wrap<R>(verb: () => Promise<R>): () => Promise<R> {",
    "  return async () => {",
    "    return await verb();",
    "  };",
    "}",
    "export function createHubService(): HubService {",
    "  return {",
    "    wrappedA: wrap(async () => {",
    "      return 1;",
    "    }),",
    "    wrappedB: wrap(async () => {",
    "      return 2;",
    "    }),",
    "    plain: () => 3,",
    "  };",
    "}",
    "",
  ].join("\n"),
  "hub.test.ts": [
    'import { expect, test } from "vitest";',
    `import { createHubService } from "./${DOMAIN}/service.ts";`,
    'test("only wrappedA runs", async () => {',
    "  expect(await createHubService().wrappedA()).toBe(1);",
    "});",
    "",
  ].join("\n"),
  "package.json": '{"name":"verb-coverage-v8","private":true,"type":"module"}\n',
  "vitest.config.ts": `export default { test: { include: ["hub.test.ts"], reporters: [], coverage: { enabled: true, provider: "v8", include: ["packages/**/*.ts"], reporter: ["json"], reportsDirectory: "${REPORTS}" } } };\n`,
};

test("a real V8 report credits only the wrapped verb whose own body ran", { timeout: scaledBudget(LONG_TEST_TIMEOUT_BASE_MS) }, ({ scratch, repoRoot }) => {
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const run = runNicedSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.config.ts"], { cwd: scratch, env: testProcessEnv() });
  expect(run.status, run.stderr).toBe(0);
  const report = coverageReportSchema.parse(JSON.parse(readFileSync(join(scratch, REPORTS, "coverage-final.json"), "utf8")));

  const project = new Project({
    compilerOptions: {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      noEmit: true,
    },
  });
  project.addSourceFilesAtPaths([join(scratch, DOMAIN, "contract/service.ts"), join(scratch, DOMAIN, "service.ts")]);
  const census = readServiceVerbs(project);
  expect(census.unjudged).toEqual([]);
  const verdicts = judgeVerbCoverage(census, [report], scratch).verdicts;
  expect(Object.fromEntries(verdicts.map(({ verb, kind }) => [verb, kind]))).toEqual({ wrappedA: "executed", wrappedB: "not-executed", plain: "not-executed" });
});
