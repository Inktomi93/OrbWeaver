import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const DOMAIN = "orb/no-inline-domain-interface";
const PACKAGE = "orb/no-inline-package-interface";

const IFACE = "interface Foo {\n  readonly x: string;\n}\n";
const DIRECT = "export interface Foo {\n  readonly x: string;\n}\n";

async function count(subject: { readonly eslint: ESLint; readonly root: string }, rule: string, path: string, source: string): Promise<number> {
  const { eslint, root } = subject;
  const filename = join(root, path);
  const config = await eslint.calculateConfigForFile(filename);
  expect(config, path).toBeDefined();
  const found = new Linter({ cwd: root }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    `${path}: ${source}`,
  ).toEqual([]);
  return found.length;
}

test("a generated server domain file may not publish an interface, directly or through a local export list", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const generated = "packages/server/src/domain/x/result.gen.ts";
  for (const [path, source, expected] of [
    [generated, DIRECT, 1],
    [generated, `${IFACE}export type { Foo };`, 1],
    [generated, `${IFACE}export { Foo as Bar };`, 1],
    [generated, `${IFACE}export default Foo;`, 1],
    [generated, "export default interface Foo {\n  readonly x: string;\n}\n", 1],
    [generated, `${IFACE}interface Bar {}\nexport { Foo, Bar };`, 2],
    // The founding gate's mustPass rows: file-local interfaces, the type homes and the primitives boundary.
    [generated, `${IFACE}export const use = (value: Foo): string => value.x;`, 0],
    [generated, "type Foo = string;\nexport type { Foo };", 0],
    [generated, "import type { Foo } from './owner.ts';\nexport type { Foo };", 0],
    ["packages/server/src/domain/x/contract/types.gen.ts", DIRECT, 0],
    ["packages/server/src/domain/x/contract/types.ts", DIRECT, 0],
    ["packages/server/src/domain/x/contract.ts", DIRECT, 0],
    ["packages/server/src/domain/x/verb.test.ts", DIRECT, 0],
    ["packages/server/src/primitives/egress.ts", DIRECT, 0],
    // An authored domain file is the typed `type-home-direct-export` rule's population, never double-reported here.
    ["packages/server/src/domain/x/verb.ts", DIRECT, 0],
    ["packages/server/src/domain/x/verb.ts", `${IFACE}export type { Foo };`, 0],
  ] as const) {
    expect(await count({ eslint, root: repoRoot }, DOMAIN, path, source), `${path}: ${source}`).toBe(expected);
  }
}, 120_000);

test("an interface in a generated package file, the server root and the ui authoring files is refused outside its home", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const [path, source, expected] of [
    ["packages/server/src/foundation/result.gen.ts", DIRECT, 1],
    ["packages/server/src/foundation/result.gen.ts", `${IFACE}export type { Foo };`, 1],
    ["packages/inference/src/backends/probe.gen.ts", DIRECT, 1],
    ["packages/server/src/index.ts", DIRECT, 1],
    ["packages/server/src/index.ts", `${IFACE}export type { Foo };`, 1],
    ["packages/ui/tokens.build.ts", DIRECT, 1],
    ["packages/ui/tokens.build.ts", `${IFACE}export { Foo };`, 1],
    // Every subtracted home, each on a path the typed rule does not admit.
    ["packages/server/src/domain/x/verb.gen.ts", DIRECT, 0],
    ["packages/server/src/primitives/x.gen.ts", DIRECT, 0],
    ["packages/inference/src/contract/x.gen.ts", DIRECT, 0],
    ["packages/server/src/infra/storage/contract.ts", DIRECT, 0],
    ["packages/server/src/infra/storage/contract/x.gen.ts", DIRECT, 0],
    ["packages/ui/token-contract.ts", DIRECT, 0],
    // The root list: client, kit and the ui `src/` tree are not judged here.
    ["packages/client/src/features/x/view.tsx", DIRECT, 0],
    ["packages/ui/src/x.ts", DIRECT, 0],
    ["packages/kit/src/x.ts", DIRECT, 0],
    // File-local interfaces and aliases are another question.
    ["packages/server/src/foundation/result.gen.ts", `${IFACE}export const use = (value: Foo): string => value.x;\nexport type Alias = string;`, 0],
    ["packages/server/src/index.ts", "export type Alias = string;", 0],
    // The typed rule owns an authored server or inference file.
    ["packages/inference/src/backends/probe.ts", `${IFACE}export { Foo };`, 0],
    ["packages/server/src/entry/http/blob.ts", DIRECT, 0],
    ["packages/server/src/infra/x.ts", `${IFACE}export type { Foo };`, 0],
    ["packages/server/src/infra/storage/cas.ts", DIRECT, 0],
  ] as const) {
    expect(await count({ eslint, root: repoRoot }, PACKAGE, path, source), `${path}: ${source}`).toBe(expected);
  }
}, 120_000);
