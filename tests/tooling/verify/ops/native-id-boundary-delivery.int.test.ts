import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { SyntaxKind } from "ts-morph";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { canonicalIdBrand, deriveCanonicalTypeIdPrefixes, ID_BRAND_HOME } from "../../../../tooling/src/floor/code-facts/id-brand.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SERVER = "packages/server/src/native-id-boundary.ts";
const BROWSER = "packages/client/src/native-id-boundary.ts";

function fixture(root: string, repoRoot: string, casts = false): void {
  const put = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const common = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true };
  put("tsconfig.json", JSON.stringify({ compilerOptions: { ...common, lib: ["es2022"], types: ["node"] }, files: [SERVER, ID_BRAND_HOME] }));
  put("tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...common, lib: ["es2022", "dom"], types: [] }, files: [BROWSER] }));
  put("package.json", JSON.stringify({ name: "native-id-boundary-fixture", type: "module" }));
  put(
    ID_BRAND_HOME,
    `declare const brand: unique symbol;
export type Branded<B extends string> = string & {readonly [brand]:B};
export type TypeIdOf<P extends string> = Branded<P>;
export type ChatId = TypeIdOf<'chat'>;
export type Prefixless = Branded<'Prefixless'>;
export type Wrong = Branded<'wrong'>;
export declare function brandedId<T extends Branded<string>>():T;
export declare function castId<T extends string>(raw:string):T;
`,
  );
  const entry = `import {brandedId,type ChatId,type Prefixless,type Wrong,type TypeIdOf} from '../../kit/src/ids/index';
type Selected = ReturnType<typeof setTimeout> extends number ? ChatId : Prefixless;
declare const foreignBrand:unique symbol;
type Lookalike=string & {readonly [foreignBrand]:'chat'};
declare function local<T>():T;
export const selected=brandedId<Selected>();
export const wrong=brandedId<Wrong>();
export const prefixless=brandedId<Prefixless>();
export const inline=brandedId<TypeIdOf<'chat'>>();
export const unrelated=local<Lookalike>();
`;
  put(SERVER, entry);
  put(
    BROWSER,
    entry +
      (casts
        ? `
import {castId as brand} from '../../kit/src/ids/index';
const blank = '' as const;
${
  ""
  // eslint-disable-next-line orb/test-ambient-source-string -- This ID-origin fixture is parsed, never executed; remove with these cast and entropy controls.
}
export const sentinel=brand(blank satisfies string);
export const minted=brand(crypto.randomUUID().replace('-','').slice(0,12));
export const entropy=brand(crypto.getRandomValues(new Uint8Array(32)).toString());
export const wrapped=brand(crypto.randomUUID.call(crypto));
const bound=crypto.randomUUID.bind(crypto);
export const boundResult=brand(bound());
const localKit={castId:(value:string):string=>value};
export const decoy=localKit.castId('');
`
        : ""),
  );
  execFixtureGit(root, ["init", "-q"]);
}

test("native ID targets preserve canonical, wrong-prefix and prefixless meanings in their owning Node/browser worlds", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const workspace = createSemanticWorkspace({ root: scratch });
  for (const [config, path, selectedBrand] of [
    ["tsconfig.json", SERVER, '"Prefixless"'],
    ["tsconfig.tests-dom.json", BROWSER, '"chat"'],
  ] as const) {
    const view = workspace.program(config);
    const source = view?.sourceFile(path);
    if (source === undefined) {
      throw new Error("native ID boundary source is unavailable");
    }
    expect(source.getPreEmitDiagnostics()).toEqual([]);
    const prefixes = deriveCanonicalTypeIdPrefixes(
      [view?.sourceFile(ID_BRAND_HOME)].filter((value) => value !== undefined),
      () => ID_BRAND_HOME,
    );
    expect([...prefixes]).toEqual(["chat"]);
    const targets = source.getDescendantsOfKind(SyntaxKind.CallExpression).map((call) => call.getTypeArguments()[0]);
    expect(targets.map((target) => (target === undefined ? null : canonicalIdBrand(target.getType(), target, target.getProject().getTypeChecker())))).toEqual([
      selectedBrand,
      '"wrong"',
      '"Prefixless"',
      '"chat"',
      null,
    ]);
  }
});

test("the canonical brand reader follows aliases and refuses plain, counterfeit and nullable types", ({ scratch }) => {
  const put = (path: string, text: string): void => {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  };
  put(".gitignore", ".cache/\n");
  put("tsconfig.json", JSON.stringify({ compilerOptions: { noLib: true, types: [], strict: true }, files: ["source.ts", ID_BRAND_HOME] }));
  put(
    ID_BRAND_HOME,
    'declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport type ChatId = TypeIdOf<"chat">;\n',
  );
  put(
    "source.ts",
    `import type {ChatId} from './packages/kit/src/ids/index';
type Original=ChatId;
type Alias=Original;
type Plain=string;
declare const brand:unique symbol;
type Counterfeit=string & {readonly [brand]:"chat"};
type Nullable=Original|undefined;
`,
  );
  execFixtureGit(scratch, ["init", "-q"]);
  const project = createSemanticWorkspace({ root: scratch }).program("tsconfig.json")?.project();
  if (project === undefined) {
    throw new Error("missing canonical native fixture owner");
  }
  const source = project.getSourceFileOrThrow(join(scratch, "source.ts"));
  const brands = source.getTypeAliases().map((alias) => {
    const target = alias.getTypeNodeOrThrow();
    return [alias.getName(), canonicalIdBrand(target.getType(), target, project.getTypeChecker())];
  });
  expect(brands).toEqual([
    ["Original", '"chat"'],
    ["Alias", '"chat"'],
    ["Plain", null],
    ["Counterfeit", null],
    ["Nullable", null],
  ]);
});

test(
  "native mint keeps the real ID fixture's exact alias coordinate and direct-wrapper/entropy limits",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, true);
    const rule = "orb/no-mint-via-cast";
    const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, BROWSER));
    const path = join(scratch, BROWSER);
    const program = ts.createProgram([path], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      types: [],
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    });
    const messages = new Linter({ cwd: scratch }).verify(
      readFileSync(path, "utf8"),
      {
        files: ["**/*.ts"],
        plugins: config.plugins,
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
        rules: { [rule]: "error" },
      },
      { filename: path },
    );
    expect(messages).toMatchObject([{ ruleId: rule, line: 16, column: 21, message: expect.stringContaining("castId wraps a fresh-id generator") }]);
    expect(messages).toHaveLength(1);
  },
  scaledBudget(60_000),
);
