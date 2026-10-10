import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readConcurrencyProfile, readStageBudgets } from "@orb/tooling/_shared/concurrency-profile";
import { testProcessEnv } from "@orb/tooling/_shared/process-env";
import { parse } from "yaml";
import { z } from "zod";
import { expect, test } from "../../support/tool-fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const EXPLORATORY_CONFIG = "stryker.config.ts";
const GATE_CONFIG = "stryker.gate.config.ts";
const UNCANCELLED_JOB = "${{ !cancelled() }}";

const IGNORE_PATTERNS = [
  ".stryker-tmp/**",
  ".git/**",
  ".codegraph/**",
  "node_modules/**",
  ".cache/**",
  ".models/**",
  "coverage/**",
  "dist/**",
  "reports/**",
  "docs/**",
  "playwright-report/**",
  "test-results/**",
  ".claude/**",
  ".agents/**",
  ".codex/**",
  ".qwen/**",
  "reference/**",
  "scratch/**",
  "data/**",
  "*.db*",
  "playwright/**",
  "scripts/probes/st-goldens/sillytavern-runtime/**",
  "scripts/probes/st-goldens/fixtures/**",
  "scripts/probes/st-goldens/output/**",
  "scripts/probes/st-goldens/orbweaver-output/**",
  "FINAL-*.md",
];

const COMMON_OPTIONS = {
  packageManager: "pnpm",
  testRunner: "vitest",
  vitest: { configFile: "vitest.stryker.config.ts" },
  plugins: ["@stryker-mutator/vitest-runner", "@stryker-mutator/typescript-checker", "./tooling/src/mutation-arid/index.ts"],
  ignorers: ["arid"],
  checkers: ["typescript"],
  typescriptChecker: { experimentalNativePreview: true },
  tsconfigFile: "tsconfig.json",
  reporters: ["html", "json", "clear-text", "progress"],
  ignorePatterns: IGNORE_PATTERNS,
  dryRunTimeoutMinutes: readStageBudgets().vitestHardCeilingMs / 60_000,
  fileLogLevel: "trace",
  ignoreStatic: true,
  concurrency: readConcurrencyProfile().strykerConcurrency,
  timeoutMS: 10_000,
  incremental: true,
};

const EXPECTED_EXPLORATORY = {
  ...COMMON_OPTIONS,
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  mutate: [
    "packages/kit/src/macro/**/*.ts",
    "packages/kit/src/regex/**/*.ts",
    "packages/server/src/domain/chat/assembly/assemble.ts",
    "packages/server/src/domain/chat/persistence/lock.ts",
    "packages/server/src/domain/credentials/**/*.ts",
    "packages/server/src/foundation/observability/audit.ts",
    "packages/server/src/infra/providers/backends/openrouter/**/*.ts",
    "packages/server/src/domain/chat/substrate/stats-delta.ts",
    "packages/server/src/domain/stats/persistence/rebuild-from-canon.ts",
    "packages/server/src/domain/chat/persistence/canon-write.ts",
    "packages/server/src/domain/chat/memory/recall/recall.ts",
    "packages/server/src/entry/lifecycle.ts",
    "packages/server/src/domain/discovery/substrate/pca.ts",
    "packages/server/src/domain/discovery/substrate/kmeans.ts",
    "packages/server/src/infra/extraction/loaders/epub.ts",
    "packages/server/src/domain/export/verbs/export-chat-bundle.ts",
    "packages/server/src/domain/import/verbs/import-chat-bundle.ts",
    "!packages/**/*.d.ts",
  ],
  incrementalFile: "reports/stryker-incremental.json",
  thresholds: { high: 80, low: 60, break: null },
};

const EXPECTED_GATE = {
  ...COMMON_OPTIONS,
  htmlReporter: { fileName: "reports/mutation/gate.html" },
  mutate: [
    "packages/server/src/domain/chat/assembly/assemble.ts",
    "packages/server/src/domain/credentials/verbs/resolve.ts",
    "packages/server/src/domain/admin/guard.ts",
    "packages/server/src/domain/chat/engine/round.ts",
    "!packages/**/*.d.ts",
  ],
  incrementalFile: "reports/stryker-gate-incremental.json",
  thresholds: { high: 80, low: 60, break: 82 },
};

async function importConfig(configName: string, nonce: string): Promise<Record<string, unknown>> {
  const url = pathToFileURL(join(ROOT, configName));
  url.searchParams.set("test", nonce);
  const loaded: unknown = await import(url.href);
  if (typeof loaded !== "object" || loaded === null || !("default" in loaded)) {
    throw new TypeError(`${configName} must have a default export`);
  }
  const config = loaded.default;
  if (typeof config !== "object" || config === null) {
    throw new TypeError(`${configName} default export must be an object`);
  }
  return config as Record<string, unknown>;
}

test("native Stryker configs preserve every effective option and retire JSON", async () => {
  expect(existsSync(join(ROOT, "stryker.config.tson"))).toBe(false);
  expect(existsSync(join(ROOT, "stryker.gate.config.tson"))).toBe(false);

  const exploratory = await importConfig(EXPLORATORY_CONFIG, "options");
  const gate = await importConfig(GATE_CONFIG, "options");
  expect(exploratory).toEqual(EXPECTED_EXPLORATORY);
  expect(gate).toEqual(EXPECTED_GATE);
  expect(exploratory).not.toHaveProperty("inPlace");
  expect(gate).not.toHaveProperty("inPlace");

  const rootManifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { readonly scripts: Record<string, string> };
  expect(rootManifest.scripts["test:mutation"]).toBe("node tooling/src/_shared/niced-exec.ts stryker run stryker.config.ts");
  expect(rootManifest.scripts["test:mutation:gate"]).toBe("node tooling/src/_shared/niced-exec.ts stryker run stryker.gate.config.ts");
});

test("each config import owns independent mutable option branches", async () => {
  const exploratory = await importConfig(EXPLORATORY_CONFIG, "independence-a");
  const gate = await importConfig(GATE_CONFIG, "independence-b");
  const freshExploratory = await importConfig(EXPLORATORY_CONFIG, "independence-c");

  for (const key of ["vitest", "plugins", "ignorers", "checkers", "reporters", "htmlReporter", "mutate", "ignorePatterns", "thresholds"] as const) {
    expect(exploratory[key]).not.toBe(gate[key]);
  }

  const exploratoryPlugins = exploratory["plugins"];
  const exploratoryVitest = exploratory["vitest"];
  if (!Array.isArray(exploratoryPlugins) || typeof exploratoryVitest !== "object" || exploratoryVitest === null) {
    throw new TypeError("expected mutable plugin and vitest options");
  }
  exploratoryPlugins.push("probe-plugin");
  (exploratoryVitest as Record<string, unknown>)["configFile"] = "probe.config.ts";

  expect(gate).toEqual(EXPECTED_GATE);
  expect(freshExploratory).toEqual(EXPECTED_EXPLORATORY);
});

test("qualification retains root Stryker TRACE on success and failure without changing artifact roots", ({ repoRoot, scratch }) => {
  const workflow = z
    .object({
      jobs: z.object({
        "qualification-partition": z.object({
          steps: z.array(
            z.object({
              id: z.string().optional(),
              name: z.string().optional(),
              if: z.string().optional(),
              run: z.string().optional(),
              uses: z.string().optional(),
              with: z.object({ path: z.string().optional() }).optional(),
            }),
          ),
        }),
      }),
    })
    .parse(parse(readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8")));
  const steps = workflow.jobs["qualification-partition"].steps;
  const retain = steps.find((step) => step.name === "Retain Stryker TRACE");
  expect(retain?.if).toBe(UNCANCELLED_JOB);
  const script = z.string().parse(retain?.run);
  expect(steps.indexOf(retain ?? {})).toBeGreaterThan(steps.findIndex((step) => step.id === "verify"));
  const upload = steps.find((step) => step.uses?.startsWith("actions/upload-artifact@") === true);
  expect(upload?.if).toBe(UNCANCELLED_JOB);
  expect(upload?.with?.path).toBe("reports/");
  expect(steps.indexOf(upload ?? {})).toBeGreaterThan(steps.indexOf(retain ?? {}));
  for (const outcome of ["success", "failure"]) {
    const tree = join(scratch, outcome);
    mkdirSync(tree);
    writeFileSync(join(tree, "stryker.log"), outcome + " native progress");
    const result = spawnSync("bash", ["-euo", "pipefail", "-c", script], { cwd: tree, env: testProcessEnv(), encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(tree, "reports/mutation/stryker.log"), "utf8")).toBe(outcome + " native progress");
  }
  const absent = join(scratch, "not-started");
  mkdirSync(absent);
  const missing = spawnSync("bash", ["-euo", "pipefail", "-c", script], { cwd: absent, env: testProcessEnv(), encoding: "utf8" });
  expect(missing.status, missing.stderr).toBe(0);
  expect(existsSync(join(absent, "reports/mutation/stryker.log"))).toBe(false);
});
