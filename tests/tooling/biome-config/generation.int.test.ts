import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, plantFile, test } from "@orb/testkit/tooling";
import { renderBiomeConfig, syncBiomeConfig } from "@orb/tooling/biome-config";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { z } from "zod";

test("the checked-in native configuration matches deterministic generation", ({ repoRoot }) => {
  const rendered = renderBiomeConfig();
  expect(readFileSync(join(repoRoot, "biome.json"), "utf8")).toBe(rendered);
  expect(renderBiomeConfig()).toBe(rendered);
});

test("check refuses missing, altered and malformed artifacts without writing; write repairs them idempotently", ({ scratch }) => {
  const target = join(scratch, "biome.json");
  expect(syncBiomeConfig("--check", target)).toBe(false);
  expect(existsSync(target)).toBe(false);
  expect(syncBiomeConfig("--write", target)).toBe(true);
  const emitted = readFileSync(target, "utf8");
  expect(syncBiomeConfig("--check", target)).toBe(true);
  for (const stale of [emitted.replace('"requireAscii": true', '"requireAscii": false'), "{malformed", `${emitted}\n`]) {
    writeFileSync(target, stale);
    expect(syncBiomeConfig("--check", target)).toBe(false);
    expect(readFileSync(target, "utf8")).toBe(stale);
    expect(syncBiomeConfig("--write", target)).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(emitted);
  }
  expect(syncBiomeConfig("--write", target)).toBe(true);
  expect(readFileSync(target, "utf8")).toBe(emitted);
});

test("CLI refuses ambiguous or missing actions", async ({ runCli }) => {
  for (const args of [[], ["--check", "--write"], ["--typo"]]) {
    const result = await runCli("biome-config", args);
    expect(result.code, result.stderr).toBe(3);
    expect(result.stderr).toContain("--check | --write");
  }
});

const SCOPED_CASES = [
  ["packages/client/src/forms/editor/use-app-form.ts", "export const payload = { PascalName: 1 };"],
  ["packages/server/src/foundation/env/index.ts", "export interface Payload { SNAKE_NAME: number; }"],
  ["tooling/src/snap/ops/stage.ts", "export const payload = { snake_name: 1 };"],
  ["packages/inference/src/backends/openai-compat/body.ts", "export const payload = { snake_name: 1 };"],
  ["packages/inference/src/contract/wire.ts", "export interface Payload { snake_name: number; }"],
  ["packages/inference/src/backends/openai-compat/rerank.ts", "export interface Payload { snake_name: number; }"],
  ["packages/inference/src/backends/agent-sdk/env.ts", "export const payload = { CONSTANT_NAME: 1 };"],
  ["packages/inference/src/backends/agent-sdk/terminal-tools.ts", "export const payload = { PascalName: 1 };"],
  ["ordinary.config.ts", "export interface Payload { snake_name: number; }"],
  ["scripts/ordinary.config.ts", "export const payload = { latestRecordSuccessOn2026_09_02: 1 };"],
  ["packages/client/src/lib/create-registry-context.tsx", "export interface Payload { PascalName: number; }"],
  ["tooling/src/eslint/control.ts", "export interface Payload { PascalName: number; }"],
] as const;

const ORDINARY_PATH = "packages/kit/src/naming-control.ts";
const BASE_REFUSED_CASES = [
  [ORDINARY_PATH, "export const payload = { snake_name: 1 };"],
  ["packages/inference/src/backends/openai-compat/body.ts", "export interface Payload { snake_name: number; }"],
  ["packages/inference/src/contract/wire.ts", "export const payload = { snake_name: 1 };"],
  ["scripts/ordinary.config.ts", "export const payload = { latestRecordSuccessOn2026_09_03: 1 };"],
  ["tooling/src/eslint/control.ts", "export const caf\u00e9 = 1;"],
] as const;
const NAMING_RULE = "style/useNamingConvention";
const NAMING_CATEGORY = `lint/${NAMING_RULE}`;
const namingReportSchema = z.object({ diagnostics: z.array(z.object({ category: z.string(), location: z.object({ path: z.string() }) })) });

test("native Biome retains scoped naming permissions, overlap precedence, base conventions and ASCII enforcement", async ({ plantedTree, repoRoot }) => {
  const root = await plantedTree({ "biome.json": renderBiomeConfig() });
  // One Biome process per planted generation, not per file: each spawn costs a fixed start-up, and a file's verdict
  // does not depend on the other files in the same run. The report names the refused files, so the per-file reading
  // is the same as one run per file.
  const lint = (cases: readonly (readonly [string, string])[]): { readonly status: number | null; readonly refused: readonly string[] } => {
    for (const [path, body] of cases) {
      plantFile(root, path, body);
    }
    const result = runNicedSync(
      join(repoRoot, "node_modules", ".bin", "biome"),
      ["lint", `--only=${NAMING_RULE}`, "--reporter=json", "--max-diagnostics=none", "--vcs-enabled=false", ...cases.map(([path]) => path)],
      { cwd: root },
    );
    const report = namingReportSchema.parse(JSON.parse(result.stdout));
    const refused = report.diagnostics.filter((diagnostic) => diagnostic.category === NAMING_CATEGORY).map((diagnostic) => diagnostic.location.path);
    return { status: result.status, refused: refused.toSorted() };
  };
  const scopedPaths = SCOPED_CASES.map(([path]) => path);
  expect(lint([...SCOPED_CASES, [ORDINARY_PATH, "export interface HTTPResponse { camelName: number; }"]])).toEqual({ status: 0, refused: [] });
  expect(lint(scopedPaths.map((path) => [path, "export interface invalid_name { validName: number; }"]))).toEqual({
    status: 1,
    refused: scopedPaths.toSorted(),
  });
  expect(lint(BASE_REFUSED_CASES)).toEqual({ status: 1, refused: BASE_REFUSED_CASES.map(([path]) => path).toSorted() });
});
