import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const RULE = "orb/no-inline-union-alias";

async function messages(eslint: ESLint, root: string, path: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await eslint.calculateConfigForFile(filename);
  expect(config, path).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

const THREE = "'a' | 'b' | 'c'";

test("an inline string-literal union alias of three or more members is refused in every authored root", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const [path, source, count] of [
    ["packages/contracts/src/x.ts", `export type Mode = ${THREE};`, 1],
    ["packages/server/src/alias-respell.ts", `export type Reuse = ${THREE};`, 1],
    ["tooling/src/verify/lib/reader.ts", 'export type ReaderVerdict = "reads" | "other" | "unreadable";', 1],
    ["packages/client/src/features/x/view.tsx", `type Local = ${THREE}; export const A = (): null => null;`, 1],
    ["packages/ui/token-contract.ts", `export type Axis = ${THREE};`, 1],
    ["tests/server/domain/x/verb.test.ts", `type Axis = ${THREE};`, 1],
    ["scripts/probes/x.ts", `type Axis = ${THREE};`, 1],
    ...[
      "packages/kit/src/x.ts",
      "packages/db/src/x.ts",
      "packages/ui/src/x.ts",
      "packages/inference/src/x.ts",
      "packages/showcase-plugins/src/x.ts",
      "packages/plugin-toolchain/src/x.ts",
      "packages/default-content/src/x.ts",
      "packages/client/src/x.tsx",
    ].map((root) => [root, `export type Axis = ${THREE};`, 1] as const),
    ["packages/contracts/src/x.ts", "export type Many = 'a' | 'b' | 'c' | 'd' | 'e';", 1],
    ["packages/contracts/src/x.ts", `type One = ${THREE}; type Two = ${THREE};`, 2],
    ["packages/contracts/src/x.ts", `type Lead = | 'a' | 'b' | 'c';`, 1],
  ] as const) {
    expect(await messages(eslint, repoRoot, path, source), `${path}: ${source}`).toHaveLength(count);
  }
}, 60_000);

test("only a pure three-member string-literal alias is an axis", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const source of [
    "export type NodeEnv = 'development' | 'production';",
    "export type Mixed = 'a' | 'b' | 3;",
    "export type WithType = 'a' | 'b' | string;",
    `export type WithTemplate = 'a' | 'b' | \`c\${string}\`;`,
    "export type WithNull = 'a' | 'b' | null;",
    "export type Wrapped = ('a' | 'b' | 'c')[];",
    "export type Fn = (mode: 'a' | 'b' | 'c') => void;",
    "export interface Props { readonly mode: 'a' | 'b' | 'c'; }",
    "export const x: 'a' | 'b' | 'c' = 'a';",
    "export const AXIS = ['a', 'b', 'c'] as const;\nexport type Axis = (typeof AXIS)[number];",
  ]) {
    expect(await messages(eslint, repoRoot, "packages/contracts/src/y.ts", source), source).toEqual([]);
  }
}, 60_000);

test("gate proof modules and the legacy tests are outside the population", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of ["tooling/src/verify/gates/example-policy.ts", "tests/legacy/server/x.ts"]) {
    expect(await messages(eslint, repoRoot, path, `export type G = ${THREE};`), path).toEqual([]);
  }
}, 60_000);
