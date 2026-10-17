import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import type { Project } from "ts-morph";
import { Identifier, Node, SyntaxKind } from "ts-morph";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { afterEach, beforeEach, vi } from "vitest";
import { canonicalIdBrand, deriveCanonicalTypeIdPrefixes, ID_BRAND_HOME } from "../../../../tooling/src/floor/code-facts/id-brand.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as disabled } from "../../../../tooling/src/verify/gates/no-fake-disabled-id.ts";
import { gate } from "../../../../tooling/src/verify/gates/typeid-prefix-boundary.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

// Local callbacks judge native-child historical facts and consumer leases, not current producer authority.
beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const SERVER = "packages/server/src/native-id-boundary.ts";
const BROWSER = "packages/client/src/native-id-boundary.ts";

function fixture(root: string, repoRoot: string, casts = false, waived = false): void {
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
  waived ? "// @orb-waive no-fake-disabled-id(brand): native authority control; ends with this fixture." : ""
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
  const policies = [gate, disabled];
  put("tooling/tsconfig.json", JSON.stringify({ compilerOptions: { ...common, types: [] }, files: policies.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of policies) {
    put(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const readType = Node.prototype.getType;
  const readSymbol = Node.prototype.getSymbol;
  const readDefinitions = Identifier.prototype.getDefinitionNodes;
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary id-boundary Type read");
    }
    return readType.call(this);
  });
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary id-boundary Symbol read");
    }
    return readSymbol.call(this);
  });
  const definitions = vi.spyOn(Identifier.prototype, "getDefinitionNodes").mockImplementation(function (this: Identifier) {
    if (this.getProject() === project) {
      throw new Error("ordinary id-boundary definition read");
    }
    return readDefinitions.call(this);
  });
  const checker = vi.spyOn(project, "getTypeChecker").mockImplementation(() => {
    throw new Error("ordinary id-boundary checker read");
  });
  return {
    [Symbol.dispose]: (): void => {
      checker.mockRestore();
      definitions.mockRestore();
      symbols.mockRestore();
      types.mockRestore();
    },
  };
}

test(
  "native ID helper origins preserve namespace, re-export aliases, local decoys and unresolved-door findings",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(join(scratch, "packages/client/src/door.ts"), "export {brandedId,type ChatId} from '../../kit/src/ids/index';");
    writeFileSync(
      join(scratch, BROWSER),
      `import * as ids from '../../kit/src/ids/index';
import {brandedId as alias,type ChatId} from './door';
import {brandedId as missing} from './missing';
export const namespace=ids['brandedId']<ChatId>();
export const renamed=alias<ChatId>();
export const unreadable=missing<ChatId>();
function brandedId<T>():T {throw new Error();}
export const decoy=brandedId<ChatId>();
`,
    );
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      policies: [gate],
      knownPolicies: [gate],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);
    expect(result.policies[0]?.findings.filter(({ file }) => file === BROWSER)).toMatchObject([
      { file: BROWSER, line: 4, token: "ids" },
      { file: BROWSER, line: 5, token: "alias" },
      { file: BROWSER, line: 6, token: "missing", message: expect.stringContaining("CANNOT be established") },
    ]);
  },
  scaledBudget(60_000),
);

test(
  "an empty canonical prefix vocabulary retains its blind finding and receipt",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const home = join(scratch, ID_BRAND_HOME);
    const original = readFileSync(home, "utf8");
    writeFileSync(home, original.replace("export type ChatId = TypeIdOf<'chat'>;", "export type ChatId = Branded<'chat'>;"));
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      policies: [gate],
      knownPolicies: [gate],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.policies[0]?.findings).toMatchObject([
      { file: ID_BRAND_HOME, line: 1, token: "TypeIdOf", message: expect.stringContaining("prefix vocabulary is empty") },
    ]);
    expect(result.policies[0]?.receipts).toMatchObject([{ kind: "population", source: "canonical-typeid-prefixes", members: 0 }]);
  },
  scaledBudget(60_000),
);

test("missing native ID services withhold the consumer instead of consulting the ordinary checker", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const context = projectCtx(scratch);
  using _poison = poisonSyntax(context.project);
  const result = runPolicyPass({ root: scratch, project: context.project, policies: [gate], knownPolicies: [gate], reviewedGrants: [], failOnWarnings: false });
  expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
  expect(result.toolErrors).toMatchObject([{ policyId: gate.id, message: expect.stringContaining("native type fact context is unavailable") }]);
});

test(
  "all maintained ID seam callers retain native origins, readonly/cast scalar aliases, exact waivers and direct-wrapper limits",
  async ({ scratch, repoRoot }) => {
    const nativeSyntaxReads: number[] = [];
    fixture(scratch, repoRoot, true);
    const context = projectCtx(scratch);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const createContext = contexts.projectCtx;
    const useContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      expect(await nativeVerifyFixture(scratch, "structure", ["--check=no-fake-disabled-id"], { forbidSyntax: true, syntaxReads: nativeSyntaxReads })).toBe(1);
      expect(await nativeVerifyFixture(scratch, "scoped", ["--scope", "packages"], { forbidSyntax: true, syntaxReads: nativeSyntaxReads })).toBe(1);
      const policies = [gate, disabled];
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        policies,
        knownPolicies: policies,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.policies.find(({ id }) => id === disabled.id)?.findings).toMatchObject([{ file: BROWSER, line: 15, token: "brand" }]);
      expect(result.authority.waivedFindings).toEqual([]);
      expect(result.authority.authorityAlarms).toEqual([]);
      const root = join(scratch, "waived");
      fixture(root, repoRoot, true, true);
      const waivedContext = createContext(root);
      const waivedResult = runPolicyPass({
        root,
        project: waivedContext.project,
        ...nativeTypeFactOptions(waivedContext),
        policies,
        knownPolicies: policies,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(waivedResult.toolErrors).toEqual([]);
      expect(waivedResult.authority.waivedFindings).toHaveLength(1);
      expect(waivedResult.authority.waivedFindings[0]?.finding).toMatchObject({ policyId: disabled.id, token: "brand", line: 15 });
      expect(waivedResult.authority.authorityAlarms).toEqual([]);
    } finally {
      useContext.mockRestore();
    }

    expect(nativeSyntaxReads).toEqual([0, 0]);
  },
  scaledBudget(60_000 * 4),
);

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

test(
  "the existing sealed idBrands door captures exact call type-arguments, not only alias and cast annotations",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const context = projectCtx(scratch);
    const source = context.project.getSourceFileOrThrow(join(scratch, BROWSER));
    const target = source
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((call) => call.getText().includes("TypeIdOf"))
      ?.getTypeArguments()[0];
    if (target === undefined || context.nativeTypeFacts === undefined) {
      throw new Error("native ID call-argument demand is unavailable");
    }
    using facts = context.nativeTypeFacts();
    facts.request(gate.id, { kind: "id-brands", nodes: [target] });
    facts.seal(new Set([gate.id]));
    expect(facts.idBrands(gate.id, [target]).get(target)).toBe('"chat"');
  },
  scaledBudget(60_000),
);

test(
  "typeid boundary actual structure and scoped doors use native facts under ordinary semantic poison",
  async ({ scratch, repoRoot }) => {
    const nativeSyntaxReads: number[] = [];
    fixture(scratch, repoRoot);
    const context = projectCtx(scratch);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const useContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      const exits = [
        await nativeVerifyFixture(scratch, "structure", [`--check=${gate.id}`], { forbidSyntax: true, syntaxReads: nativeSyntaxReads }),
        await nativeVerifyFixture(scratch, "scoped", ["--scope", "packages"], { forbidSyntax: true, syntaxReads: nativeSyntaxReads }),
      ];
      expect(exits).toEqual([1, 1]);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        policies: [gate],
        knownPolicies: [gate],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.authority.effectiveFindings.map(({ file, line, token }) => ({ file, line, token }))).toEqual([
        { file: BROWSER, line: 6, token: "brandedId" },
        { file: BROWSER, line: 9, token: "brandedId" },
        { file: SERVER, line: 9, token: "brandedId" },
      ]);
    } finally {
      useContext.mockRestore();
    }

    expect(nativeSyntaxReads).toEqual([0, 0]);
  },
  scaledBudget(60_000),
);

test("native mint keeps the real ID fixture's exact alias coordinate and direct-wrapper/entropy limits", async ({ scratch, repoRoot }) => {
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
});
