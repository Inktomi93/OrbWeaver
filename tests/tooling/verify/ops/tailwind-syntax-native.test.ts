// Native syntax controls cover direct JSX; shared semantic policies keep aliases, imports and exact permissions.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Project } from "ts-morph";
import tseslint from "typescript-eslint";
import { gate as splice } from "../../../../tooling/src/verify/gates/class-token-splice.ts";
import { gate as dark } from "../../../../tooling/src/verify/gates/no-tailwind-dark-variant.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const SPLICE = "orb/class-token-splice";
const DARK = "orb/no-tailwind-dark-variant";
const PLUGIN_SPLICE = "better-tailwindcss/no-concatenated-classes";
const PLUGIN_RESTRICT = "better-tailwindcss/no-restricted-classes";

async function configured(eslint: ESLint, path: string, source: string, rules?: Linter.Config["rules"]): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(path);
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      settings: config.settings ?? {},
      rules: rules ?? { [SPLICE]: config.rules[SPLICE] ?? "off", [DARK]: config.rules[DARK] ?? "off" },
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages;
}

test("effective native JSX restrictions reject literal splice junctions and direct dark prefixes without accusing valid classes", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of ["packages/ui/src/primitives/probe.tsx", "packages/client/src/features/probe.tsx"]) {
    for (const source of ['<div className={`inset-${"end"}-0`} />;', '<div className={`p-row ${"flex"}-row`} />;', '<div className="dark:bg-card" />;']) {
      expect(await configured(eslint, join(repoRoot, path), source), source).toHaveLength(1);
    }
    for (const source of [
      '<div className={`shrink-0${" flex"}`} />;',
      '<div className={`p-row ${"flex"}`} />;',
      '<div className={`p-row${""} flex`} />;',
      '<div className={`p-row ${""}`} />;',
      '<div className={`bg-card${""}`} />;',
      '<div className={`bg-card${" "}text-foreground`} />;',
      '<div className={`bg-${""}card`} />;',
      '<div title={`inset-${"end"}-0`} />;',
      '<div title="dark:bg-card" />;',
      '<div className="[&_.x:dark:y]:bg-card" />;',
      'function cn(value: string) { return value.length; } cn("dark:copy");',
      'tv({base:"bg-card", defaultVariants:{tone:"dark:copy"}});',
      'const leading=" flex"; <div className={`shrink-0${leading}`} />;',
    ]) {
      expect(await configured(eslint, join(repoRoot, path), source), source).toEqual([]);
    }
  }
});

test("native-owned direct cases and imported/composed semantic cases have disjoint owners", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const path = "packages/ui/src/probe.tsx";
  const root = "/tailwind-syntax-remainder";
  for (const [source, nativeCount, customCount] of [
    ['<div className={`p-row ${"flex"}-row`} />;', 1, 0],
    ['<div className={`bg-${""}card`} />;', 0, 0],
    ['<div className={`bg-card${""}`} />;', 0, 0],
    ['<div className="dark:bg-card" />;', 1, 0],
    ['<div className="dark:bg-card hover:dark:text-foreground" />;', 1, 1],
    ['<div className="dark:bg-card dark:text-foreground" />;', 1, 0],
    ['<div className="bg-card dark:text-foreground" />;', 0, 1],
    ['const side="end"; <div className={`inset-${side}-0`} />;', 0, 1],
    ['const side="end"; <div className={`inset-${"end"}-${side}`} />;', 0, 1],
    ['const leading=" flex"; <div className={`shrink-0${leading}`} />;', 0, 0],
    ['const CARD="dark:bg-card"; <div className={CARD} />;', 0, 1],
    ['import { CARD as SURFACE } from "./producer.ts"; <div className={SURFACE} />;', 0, 1],
    ['<div className={(`p-row ${"flex"}-row` as string)} />;', 0, 1],
    ['<div className={"dark:bg-card" as string} />;', 0, 1],
    ['<div className="hover:dark:bg-card" />;', 0, 1],
    ['<div className="[&_.x:dark:y]:bg-card" />;', 0, 0],
  ] as const) {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(`${root}/packages/ui/src/producer.ts`, 'export const CARD = "dark:bg-card";');
    project.createSourceFile(`${root}/${path}`, source);
    const result = runPolicyPass({ root, project, policies: [splice, dark], knownPolicies: [splice, dark], reviewedGrants: [], failOnWarnings: false });
    expect(result.toolErrors, source).toEqual([]);
    expect(result.authority.effectiveFindings, source).toHaveLength(customCount);
    expect(await configured(eslint, join(repoRoot, path), source), source).toHaveLength(nativeCount);
  }
  for (const outside of ["packages/server/src/probe.tsx", "tooling/src/probe.tsx"]) {
    expect(await configured(eslint, join(repoRoot, outside), '<div className="dark:bg-card" />;'), outside).toEqual([]);
  }
});

test("installed plugin counterexamples prevent unsupported global replacements", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const path = join(repoRoot, "packages/ui/src/probe.tsx");
  const candidateRules = {
    [PLUGIN_SPLICE]: "error",
    [PLUGIN_RESTRICT]: ["error", { restrict: ["(^|:)dark:", "^(?:w|h|grid-cols)-\\[(?!(?:--|var\\(|calc\\()).+\\]$"] }],
  } satisfies Linter.Config["rules"];
  for (const source of [
    'const leading=" flex"; <div className={`shrink-0${leading}`} />;',
    'function leading(){return " flex";} <div className={`shrink-0${leading()}`} />;',
    '<div className="[&_.x:dark:y]:bg-card" />;',
    'function cn(value:string){return value.length;} cn("dark:copy");',
    '// @orb-waive no-arbitrary-tw-values(grid-cols-[repeat): justified layout.\ntv({base:"grid-cols-[repeat(auto-fit,1fr)]"});',
  ]) {
    expect((await configured(eslint, path, source, candidateRules)).length, source).toBeGreaterThan(0);
  }
  for (const source of [
    "const forward=(...args: string[])=>cn(...args); forward(`inset-${dynamic}-0`);",
    "const CARD=`inset-${dynamic}-0`; <div className={CARD} />;",
    'import {CARD} from "./producer.ts"; <div className={CARD} />;',
    'import {clsx as joined} from "clsx"; joined("dark:bg-card");',
    'const WIDTH="w-[137px]"; <div className={WIDTH} />;',
  ]) {
    expect(await configured(eslint, path, source, candidateRules), source).toEqual([]);
  }
});
