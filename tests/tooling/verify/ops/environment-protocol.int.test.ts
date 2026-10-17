import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { plantedPolicySource, plantedSubject } from "@orb/testkit/node/planted-gate-corpus.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { processEnvValue, withProcessEnv } from "@orb/tooling/floor/process/process-env";
import { z } from "zod";
import { playwrightFiles } from "../../../../tooling/src/verify/ops/tests-execution-membership.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FIXTURE_ENV = "ORB_GATE_FIXTURES";
const SUBJECT = "packages/x/src/__g_environment.ts";
const TOKEN = "environmentControl";
const POLICY = "environment-control";
const CASE_BUDGET_MS = scaledBudget(30_000);
const CHILD_ENV = "E2E_LIVE";
const INHERITED_ENV = "ORB_COLLECTION_ENV_CONTROL";
const childObservation = z.object({ mode: z.string(), inherited: z.string(), argv: z.array(z.string()) });

for (const verb of ["scoped", "structure"] as const) {
  test(`${verb} preserves explicit fixture mode and real-tree probe filtering`, {
    timeout: CASE_BUDGET_MS,
  }, async ({ plantedTree, repoRoot, runCli }) => {
    const root = await plantedTree({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { target: "es2022", module: "nodenext", moduleResolution: "nodenext" },
        include: ["packages/**/*.ts"],
      }),
      [SUBJECT]: plantedSubject(TOKEN),
      "tooling/src/verify/gates/environment-control.ts": plantedPolicySource({ repoRoot, id: POLICY, subjectPath: SUBJECT, token: TOKEN }),
    });
    const args = verb === "scoped" ? [verb, "--changed", SUBJECT] : [verb];
    const fixture = await runCli("verify", args, { cwd: root, env: { [FIXTURE_ENV]: "1" }, timeoutMs: CASE_BUDGET_MS });
    expect(fixture.code, fixture.stderr).toBe(1);
    expect(fixture.stdout).toContain(SUBJECT);
    const ordinary = await runCli("verify", args, { cwd: root, env: { [FIXTURE_ENV]: "0" }, timeoutMs: CASE_BUDGET_MS });
    expect(ordinary.code, ordinary.stderr).toBe(verb === "scoped" ? 0 : 2);
    expect(fixture.stdout.includes("FIXTURE MODE")).toBe(verb === "structure");
    expect(ordinary.stdout.includes("PLANTED FIXTURE PATH")).toBe(verb === "structure");
    expect(ordinary.stdout).not.toContain("FIXTURE MODE");
    expect(ordinary.stdout.includes(SUBJECT)).toBe(verb === "structure");
  });
}

test.skipIf(process.platform === "win32")(
  "collection child snapshots current ambient values and explicit overrides win without parent mutation",
  async ({ scratch }) => {
    const bin = join(scratch, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    const sink = join(scratch, "child-env.json");
    writeFileSync(
      join(bin, "playwright"),
      [
        "#!/usr/bin/env node",
        'const { writeFileSync } = require("node:fs");',
        `writeFileSync(${JSON.stringify(sink)}, JSON.stringify({ mode: process.env[${JSON.stringify(CHILD_ENV)}], inherited: process.env[${JSON.stringify(INHERITED_ENV)}], argv: process.argv.slice(2) }));`,
        `console.log(JSON.stringify({ config: { rootDir: ${JSON.stringify(scratch)} }, suites: [{ file: "tests/e2e/environment.spec.ts" }] }));`,
      ].join("\n"),
      { mode: 0o755 },
    );
    await withProcessEnv(CHILD_ENV, "parent", () =>
      withProcessEnv(INHERITED_ENV, "first", async () => {
        expect(playwrightFiles(scratch, "isolated.config.ts", { [CHILD_ENV]: "1" })).toEqual({ files: new Set(["tests/e2e/environment.spec.ts"]) });
        expect(childObservation.parse(JSON.parse(readFileSync(sink, "utf8")))).toEqual({
          mode: "1",
          inherited: "first",
          argv: ["test", "--list", "--reporter=json", "-c", "isolated.config.ts"],
        });
        expect(processEnvValue(CHILD_ENV)).toBe("parent");
        await withProcessEnv(INHERITED_ENV, "second", () => {
          expect(playwrightFiles(scratch, "isolated.config.ts")).toEqual({ files: new Set(["tests/e2e/environment.spec.ts"]) });
          expect(childObservation.parse(JSON.parse(readFileSync(sink, "utf8")))).toMatchObject({ mode: "parent", inherited: "second" });
          return Promise.resolve();
        });
        expect(processEnvValue(INHERITED_ENV)).toBe("first");
      }),
    );
  },
);

test.skipIf(process.platform === "win32")(
  "collection preserves reported load errors beside stderr warnings without accepting failed empty listings",
  ({ scratch }) => {
    const bin = join(scratch, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    const loadFailure = "Error: fixture module could not be loaded";
    for (const [message, expected] of [
      [loadFailure, loadFailure],
      ["Error: No tests found", "playwright collection failed"],
    ] as const) {
      writeFileSync(
        join(bin, "playwright"),
        [
          "#!/usr/bin/env node",
          'console.error("native collection warning");',
          `console.log(${JSON.stringify(JSON.stringify({ config: { rootDir: scratch }, suites: [], errors: [{ message }] }))});`,
          "process.exitCode = 1;",
        ].join("\n"),
        { mode: 0o755 },
      );
      expect(playwrightFiles(scratch, "isolated.config.ts")).toMatchObject({ error: expect.stringContaining(expected) });
    }
  },
);
