// A cancel a caller can drop never reaches the provider call: server, inference, contracts and kit refuse every shape
// that lets a caller omit an AbortSignal, or the `Signal` type parameter the isomorphic packages bind it through
// (Spine-TypeScript-and-Patterns.md §4). A required signal, in any spelling, is not a finding.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "no-restricted-syntax";
const FINDING = "Require the AbortSignal";
const REFUSING_PATHS = [
  "packages/server/src/domain/search/verbs/probe.ts",
  "packages/inference/src/roles/probe.ts",
  "packages/contracts/src/search/probe.ts",
  "packages/kit/src/rerank/probe.ts",
] as const;
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, REFUSING_PATHS[0]));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId, message }) => ruleId === RULE && message.includes(FINDING));
}

test.for([
  ["an optional member", "export interface Opts {\n  readonly signal?: AbortSignal;\n}"],
  ["an optional class field", "export class Run {\n  signal?: AbortSignal;\n}"],
  ["an optional parameter", "export function run(signal?: AbortSignal): void {\n  void signal;\n}"],
  ["a member that may be undefined", "export interface Opts {\n  readonly signal: AbortSignal | undefined;\n}"],
  ["a parameter that may be null", "export function run(signal: AbortSignal | null): void {\n  void signal;\n}"],
  ["the global spelling, optional", "export interface Opts {\n  readonly signal?: globalThis.AbortSignal;\n}"],
  ["the type parameter, optional", "export interface Opts<Signal> {\n  readonly signal?: Signal;\n}"],
  ["the type parameter, maybe undefined", "export type Op<Signal> = (signal: Signal | undefined) => void;"],
  ["a defaulted parameter", "export function run(signal: AbortSignal = new AbortController().signal): void {\n  void signal;\n}"],
  ["a local alias", "type Cancel = AbortSignal;\nexport interface Opts {\n  readonly signal?: Cancel;\n}"],
  ["Partial over a signal bag", "export type Opts = Partial<{ readonly signal: AbortSignal }>;"],
  ["an optional inline bag", "export function run(opts?: { readonly signal: AbortSignal }): void {\n  void opts;\n}"],
  [
    "an optional intersected bag",
    "interface Base {\n  readonly k: number;\n}\nexport function run(opts?: Base & { readonly signal: AbortSignal }): void {\n  void opts;\n}",
  ],
] as const)("%s is a finding in server, inference, contracts and kit", async ([, source]) => {
  for (const path of REFUSING_PATHS) {
    expect((await findings(source, path)).length, path).toBeGreaterThan(0);
  }
});

test.for([
  ["a required member", "export interface Opts {\n  readonly signal: AbortSignal;\n}"],
  ["a required parameter", "export function run(signal: AbortSignal): void {\n  void signal;\n}"],
  ["the type parameter, required", "export interface Opts<Signal> {\n  readonly signal: Signal;\n}"],
  ["a required bag", "export function run(opts: { readonly signal: AbortSignal }): void {\n  void opts;\n}"],
  ["an optional bag with no signal", "export function run(opts?: { readonly limit: number }): void {\n  void opts;\n}"],
  ["a nullable counter that takes a signal", "export type Counter = ((text: string, signal: AbortSignal) => Promise<number>) | null;"],
] as const)("%s is not a finding", async ([, source]) => {
  for (const path of REFUSING_PATHS) {
    expect(await findings(source, path), path).toEqual([]);
  }
});
