import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, plantFile, test } from "@orb/testkit/tooling";
import { renderBiomeConfig, syncBiomeConfig } from "@orb/tooling/biome-config";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

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

test("native Biome retains scoped naming permissions, overlap precedence, base conventions and ASCII enforcement", async ({ plantedTree, repoRoot }) => {
  const root = await plantedTree({ "biome.json": renderBiomeConfig() });
  const lint = (path: string, body: string): ReturnType<typeof runNicedSync> => {
    plantFile(root, path, body);
    return runNicedSync(join(repoRoot, "node_modules", ".bin", "biome"), ["lint", "--only=style/useNamingConvention", path, "--vcs-enabled=false"], {
      cwd: root,
    });
  };
  for (const [path, body] of SCOPED_CASES) {
    const admitted = lint(path, body);
    expect(admitted.status, `${path}\n${admitted.stderr}`).toBe(0);
    const refused = lint(path, "export interface invalid_name { validName: number; }");
    expect(refused.status, `${path}\n${refused.stderr}`).toBe(1);
    expect(refused.stderr).toContain("lint/style/useNamingConvention");
  }
  const ordinary = "packages/kit/src/naming-control.ts";
  expect(lint(ordinary, "export interface HTTPResponse { camelName: number; }").status).toBe(0);
  for (const [path, body] of [
    [ordinary, "export const payload = { snake_name: 1 };"],
    ["packages/inference/src/backends/openai-compat/body.ts", "export interface Payload { snake_name: number; }"],
    ["packages/inference/src/contract/wire.ts", "export const payload = { snake_name: 1 };"],
    ["scripts/ordinary.config.ts", "export const payload = { latestRecordSuccessOn2026_09_03: 1 };"],
    ["tooling/src/eslint/control.ts", "export const caf\u00e9 = 1;"],
  ] as const) {
    const refused = lint(path, body);
    expect(refused.status, `${path}\n${refused.stderr}`).toBe(1);
    expect(refused.stderr).toContain("lint/style/useNamingConvention");
  }
});
