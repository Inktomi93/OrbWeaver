// Syntax fabrication restrictions preserve D325's tooling boundary without acquiring compiler services.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeFabricationPlugin } from "./_fixtures/native-fabrication-candidate.ts";
import { FABRICATION_PROOFS } from "./_fixtures/native-fabrication-policy-proofs.ts";

const RULE = "orb/no-test-fabrication";
const LITERAL_RULE = "@typescript-eslint/consistent-type-assertions";
const VALUE_RULE = "@typescript-eslint/no-unsafe-type-assertion";
const LITERAL_OPTIONS = { assertionStyle: "as", objectLiteralTypeAssertions: "never", arrayLiteralTypeAssertions: "never" } as const;

test("maintained CT parser composition supplies the real native Intl rule and preserves shadowed near-misses", async ({ scratch, repoRoot }) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const paths = ["tests/client/compose/_native-intl-stories.tsx", "tests/support/node/native.ts", "tests/support/iso/native.ts"];
  for (const [index, config] of ["tsconfig.tests-dom.json", "tsconfig.json", "tsconfig.tests-iso.json"].entries()) {
    const path = paths[index];
    if (path === undefined) {
      throw new Error("native test-world subject is missing");
    }
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), "export const value=1;");
    writeFileSync(join(scratch, config), JSON.stringify({ compilerOptions: { strict: true, types: [], target: "ES2022", jsx: "react-jsx" }, files: [path] }));
  }
  writeFileSync(join(scratch, "package.json"), '{"type":"module"}');
  writeFileSync(
    join(scratch, "eslint.config.mjs"),
    `import base from ${JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href)};
export default base.map(block=>({...block,
...(block.languageOptions?.parserOptions?.tsconfigRootDir===undefined?{}:{languageOptions:{...block.languageOptions,parserOptions:{...block.languageOptions.parserOptions,tsconfigRootDir:import.meta.dirname}}}),
...(block.rules===undefined?{}:{rules:Object.fromEntries(Object.keys(block.rules).map(id=>[id,id==='orb/no-raw-intl-time'?block.rules[id]:'off']))})}));`,
  );
  const path = paths[0];
  if (path === undefined) {
    throw new Error("native CT subject is missing");
  }
  writeFileSync(join(scratch, path), 'export const formatter=new Intl.DateTimeFormat("en-US");');
  const eslint = new ESLint({ cwd: scratch, overrideConfigFile: join(scratch, "eslint.config.mjs"), cache: false });
  const [flag] = await eslint.lintFiles([path]);
  expect(flag?.fatalErrorCount).toBe(0);
  expect(flag?.messages).toMatchObject([{ ruleId: "orb/no-raw-intl-time", message: expect.stringContaining("Operation: intl-formatter") }]);
  expect(flag?.messages).toHaveLength(1);
  writeFileSync(
    join(scratch, path),
    'const Intl={DateTimeFormat:class {constructor(_locale:string){}}};export const formatter=new Intl.DateTimeFormat("en-US");',
  );
  const [nearMiss] = await new ESLint({ cwd: scratch, overrideConfigFile: join(scratch, "eslint.config.mjs"), cache: false }).lintFiles([path]);
  expect(nearMiss?.messages).toEqual([]);
}, 60_000);

test("native any and double-cast restrictions cover product builders and tooling without judging value casts", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const config = await eslint.calculateConfigForFile("tests/tooling/probe.test.ts");
  expect(config?.rules?.[RULE]).toEqual([2]);
  const verify = (source: string, filename: string): readonly Linter.LintMessage[] =>
    new Linter({ cwd: repoRoot }).verify(
      source,
      {
        files: ["**/*.{ts,tsx}"],
        plugins: config?.plugins,
        languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
        linterOptions: { reportUnusedDisableDirectives: "error" },
        rules: { [RULE]: "error" },
      },
      { filename: join(repoRoot, filename) },
    );
  for (const path of ["tests/tooling/probe.test.ts", "tests/support/node/probe.ts", "tests/client/probe.dom.test.ts", "tests/client/probe.ct.tsx"]) {
    const admitted = await eslint.calculateConfigForFile(path);
    expect(admitted?.rules?.[RULE], path).toEqual([2]);
    expect(admitted?.rules?.[LITERAL_RULE]?.[0], path).toBe(2);
    expect(admitted?.rules?.[VALUE_RULE]?.[0] ?? 0, path).toBe(path.startsWith("tests/tooling/") ? 0 : 2);
    const cases = [
      ["declare const source:unknown;export const value=source as any;", 1],
      ["export const value={n:1} as any;", 1],
      ["export const value={} as unknown as {a:number};", 1],
      ["declare const source:string;export const value=(source as unknown) as Widget;", 1],
      ["declare const bag:{raw:unknown};export const value=(bag['raw'] as unknown) as Widget;", 1],
      ["declare const source:string;export const value=source as unknown as Widget as Other;", 1],
      ["declare const source:unknown;export const value=source as Widget;", 0],
      ["export const value={n:1} as Widget;", 0],
      ["export const value={n:1} as const;export const raw={n:1} as unknown;", 0],
      ["export const value={n:1} satisfies {n:number};export const text='source as any';", 0],
    ] as const;
    for (const [source, expected] of cases) {
      const messages = verify(source, path);
      expect(messages, `${path}: ${source}`).toHaveLength(expected);
      expect(messages.every(({ ruleId }) => ruleId === RULE)).toBe(true);
    }
  }
  for (const path of ["packages/server/src/probe.ts", "tests/legacy/server/probe.test.ts"]) {
    const excluded = await eslint.calculateConfigForFile(path);
    expect(excluded?.rules?.[RULE]?.[0] ?? 0, path).toBe(0);
  }
  const sanctioned = `// eslint-disable-next-line ${RULE} -- Deliberate malformed boundary input; ends when it accepts unknown.
export const value={} as unknown as Widget;`;
  expect(verify(sanctioned, "tests/tooling/probe.test.ts")).toEqual([]);
  expect(verify(`${sanctioned}\nexport const adjacent={} as unknown as Widget;`, "tests/tooling/probe.test.ts")).toMatchObject([{ ruleId: RULE }]);
  expect(verify(sanctioned.replace("{} as unknown as Widget", "{} as unknown"), "tests/tooling/probe.test.ts")).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});

test("combined protocol-fault directives neither cover adjacent fabrication nor survive removal of either finding", async ({ scratch, repoRoot }) => {
  const plugin = nativeFabricationPlugin(scratch, repoRoot);
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile("tests/tooling/probe.test.ts");
  const verify = (source: string): readonly Linter.LintMessage[] =>
    new Linter().verify(source, {
      plugins: { ...config?.plugins, "@typescript-eslint": plugin },
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: "error", [LITERAL_RULE]: ["error", LITERAL_OPTIONS] },
    });
  const directive = `// eslint-disable-next-line ${RULE}, ${LITERAL_RULE} -- Controlled third-party failure; ends when native fault injection replaces it.`;
  const planted = `${directive}\nconst protocol={} as unknown as Session;`;
  expect(verify(planted)).toEqual([]);
  expect(
    verify(`${planted}\nconst adjacent={} as unknown as Session;`)
      .map(({ ruleId }) => ruleId)
      .toSorted((left, right) => String(left).localeCompare(String(right))),
  ).toEqual([LITERAL_RULE, RULE].toSorted((left, right) => left.localeCompare(right)));
  expect(verify(`${directive}\ndeclare const source:unknown;const protocol=source as unknown as Session;`)).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
  expect(verify(`${directive}\nconst protocol={} satisfies Session;`)).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});

test("raw protocol value directives neither hide adjacent narrowing nor survive a safe assertion", ({ scratch, repoRoot }) => {
  const plugin = nativeFabricationPlugin(scratch, repoRoot);
  const path = join(scratch, "value.ts");
  const verify = (source: string): readonly Linter.LintMessage[] => {
    writeFileSync(path, source);
    const program = ts.createProgram([path], { strict: true, types: [], noLib: true });
    return new Linter({ cwd: scratch }).verify(
      source,
      {
        files: ["**/*.ts"],
        plugins: { "@typescript-eslint": plugin },
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
        linterOptions: { reportUnusedDisableDirectives: "error" },
        rules: { [VALUE_RULE]: "error" },
      },
      { filename: path },
    );
  };
  const header = "interface Observation{readonly raw:string}declare const raw:unknown;\n";
  const directive = `// eslint-disable-next-line ${VALUE_RULE} -- Passive protocol correlation preserves unvalidated bytes; ends when a typed recorder preserves them.`;
  const sanctioned = `${header}${directive}\nexport const observed=raw as Observation;`;
  expect(verify(sanctioned)).toEqual([]);
  expect(verify(`${sanctioned}\nexport const adjacent=raw as Observation;`)).toMatchObject([{ ruleId: VALUE_RULE }]);
  expect(verify(`${header}${directive}\nexport const observed=raw as unknown;`)).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});

test("the native candidate preserves every fabrication founding and near-miss case with native line authority", { timeout: scaledBudget(30_000) }, async ({
  scratch,
  repoRoot,
}) => {
  const plugin = nativeFabricationPlugin(scratch, repoRoot);
  const eslint = new ESLint({ cwd: repoRoot });
  const expectedRules = [
    [RULE],
    [RULE],
    [LITERAL_RULE, LITERAL_RULE],
    [RULE, LITERAL_RULE],
    [RULE, LITERAL_RULE, VALUE_RULE],
    [LITERAL_RULE],
    [LITERAL_RULE],
    [LITERAL_RULE],
    [VALUE_RULE],
    [VALUE_RULE],
    [VALUE_RULE],
  ];
  const actualFlagRules: Linter.LintMessage["ruleId"][][] = [];
  let index = 0;
  for (const [flag, proofs] of [
    [true, FABRICATION_PROOFS.mustFlag],
    [false, FABRICATION_PROOFS.mustPass],
  ] as const) {
    for (const proof of proofs) {
      const root = join(scratch, String(index++));
      const files = Object.fromEntries(
        Object.entries(proof.files).map(([path, source]) => [path, source.replace(/^[\t ]*\/\/ @orb-waive no-test-fabrication\([^\n]*?\):[^\n]*/gmu, "")]),
      );
      const verify = async (contents: Readonly<Record<string, string>>): Promise<readonly Linter.LintMessage[]> => {
        for (const [path, source] of Object.entries(contents)) {
          mkdirSync(dirname(join(root, path)), { recursive: true });
          writeFileSync(join(root, path), source);
        }
        const program = ts.createProgram(
          Object.keys(contents).map((path) => join(root, path)),
          {
            strict: true,
            types: [],
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
          },
        );
        const messages: Linter.LintMessage[] = [];
        for (const [path, source] of Object.entries(contents)) {
          const config = await eslint.calculateConfigForFile(path);
          const rules = Object.fromEntries(
            [RULE, LITERAL_RULE, VALUE_RULE].flatMap((rule) => (config?.rules?.[rule]?.[0] === 2 ? [[rule, config.rules[rule]]] : [])),
          );
          if (Object.keys(rules).length === 0) {
            continue;
          }
          messages.push(
            ...new Linter({ cwd: root }).verify(
              source,
              {
                files: ["**/*.{ts,tsx}"],
                plugins: { ...config?.plugins, "@typescript-eslint": plugin },
                languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
                linterOptions: { reportUnusedDisableDirectives: "error" },
                rules,
              },
              { filename: join(root, path) },
            ),
          );
        }
        return messages;
      };
      const baseline = await verify(files);
      if (flag) {
        actualFlagRules.push(baseline.map(({ ruleId }) => ruleId).toSorted((left, right) => String(left).localeCompare(String(right))));
        continue;
      }
      const waived = Object.fromEntries(
        Object.entries(proof.files).map(([path, source]) => [
          path,
          source
            .split("\n")
            .map((line, number) => {
              const marker = /^([\t ]*)\/\/ @orb-waive no-test-fabrication\([^\n]*?\):\s*(.*)/u.exec(line);
              if (marker === null) {
                return line;
              }
              const rules = [...new Set(baseline.filter((message) => message.line === number + 2).flatMap(({ ruleId }) => (ruleId === null ? [] : [ruleId])))];
              if (rules.length === 0) {
                throw new Error(`native authority fixture has no finding for ${proof.why}`);
              }
              return `${marker[1]}// eslint-disable-next-line ${rules.join(", ")} -- ${marker[2]}`;
            })
            .join("\n"),
        ]),
      );
      expect(await verify(waived), proof.why).toEqual([]);
    }
  }
  expect(actualFlagRules).toEqual(expectedRules.map((rules) => rules.toSorted((left, right) => left.localeCompare(right))));
});

test("the maintained literal rule candidate follows transparent wrappers without mistaking call arguments for operands", ({ scratch, repoRoot }) => {
  const plugin = nativeFabricationPlugin(scratch, repoRoot);
  const verify = (source: string, options: Linter.RuleEntry = ["error", LITERAL_OPTIONS], filename = "value.ts"): readonly Linter.LintMessage[] =>
    new Linter().verify(
      source,
      {
        files: ["**/*.{ts,tsx}"],
        plugins: { "@typescript-eslint": plugin },
        languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { [LITERAL_RULE]: options },
      },
      { filename },
    );
  const header = "interface Widget{readonly n:number} declare function identity<T>(value:T):T;\n";
  for (const filename of ["value.ts", "value.tsx"]) {
    for (const literal of ["{n:1}", "[1,2]"]) {
      let operand = literal;
      for (const suffix of Array.from({ length: 3 }, () => [" satisfies unknown)", " as unknown)", ")!"]).flat()) {
        operand = `(${operand}${suffix}`;
      }
      const messages = verify(`${header}export const value=(${operand}) as Widget;`, ["error", LITERAL_OPTIONS], filename);
      expect(messages, filename).toHaveLength(1);
      expect(messages[0]?.ruleId).toBe(LITERAL_RULE);
      expect(verify(`${header}export const value=identity(${literal}) as Widget;`, ["error", LITERAL_OPTIONS], filename)).toEqual([]);
    }
    expect(verify(`${header}export const value=({n:1} satisfies Widget) as unknown;`, ["error", LITERAL_OPTIONS], filename)).toEqual([]);
    expect(verify("export const value={n:1} as const;", ["error", LITERAL_OPTIONS], filename)).toEqual([]);
  }
  const angleOptions = ["error", { ...LITERAL_OPTIONS, assertionStyle: "angle-bracket" }] satisfies Linter.RuleEntry;
  expect(verify(`${header}export const value=<Widget>(<unknown>({n:1} satisfies Widget))!;`, angleOptions)).toMatchObject([
    { ruleId: LITERAL_RULE, messageId: "unexpectedObjectTypeAssertion" },
  ]);
  expect(verify(`${header}export const value=<Widget>identity({n:1});`, angleOptions)).toEqual([]);
  const parameter = `${header}identity(({n:1} satisfies Widget) as Widget);`;
  expect(
    verify(parameter, ["error", { assertionStyle: "as", objectLiteralTypeAssertions: "allow-as-parameter", arrayLiteralTypeAssertions: "never" }]),
  ).toEqual([]);
  expect(verify(parameter)).toHaveLength(1);
  expect(verify("export const value={n:1} as const;", ["error", { assertionStyle: "never" }])).toEqual([]);
  expect(verify("export const value={} as Widget;", ["error", { assertionStyle: "never" }])).toMatchObject([{ messageId: "never" }]);
  expect(
    verify(`${header}export const value=({n:1} satisfies Widget) as Widget;`, ["error", { ...LITERAL_OPTIONS, objectLiteralTypeAssertions: "allow" }]),
  ).toEqual([]);
  const suggestionSource = `${header}const value=({n:1} satisfies Widget) as Widget;`;
  const [message] = verify(suggestionSource);
  expect(message?.suggestions?.map(({ messageId }) => messageId)).toEqual([
    "replaceObjectTypeAssertionWithAnnotation",
    "replaceObjectTypeAssertionWithSatisfies",
  ]);
  const suggestion = message?.suggestions?.[0];
  if (suggestion === undefined) {
    throw new Error("native literal rule omitted its annotation suggestion");
  }
  const { range, text } = suggestion.fix;
  expect(suggestionSource.slice(0, range[0]) + text + suggestionSource.slice(range[1])).toBe(`${header}const value: Widget=({n:1} satisfies Widget);`);
});

test("the maintained value rule candidate refuses the real recursive-template compiler failure and missing typed context", ({ scratch, repoRoot }) => {
  const plugin = nativeFabricationPlugin(scratch, repoRoot);
  const path = join(scratch, "value.ts");
  const source =
    'type A<T extends string> = T extends `${infer F}${infer R}` ? `${F}b${A<R>}` : "";\n' +
    'type B<T extends string> = T extends `${infer F}${infer R}` ? `${F}b${B<R>}` : "";\n' +
    "export function asserted<T extends string>(source:A<T>){return source as B<T>;}\n";
  writeFileSync(path, source);
  const program = ts.createProgram([path], { strict: true, noLib: true, types: [], target: ts.ScriptTarget.ES2022 });
  const linter = new Linter({ cwd: scratch });
  const config = {
    files: ["**/*.ts"],
    plugins: { "@typescript-eslint": plugin },
    languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
    rules: { [VALUE_RULE]: "error" },
  } satisfies Linter.Config;
  expect(() => linter.verify(source, config, { filename: path })).toThrow("Maximum call stack size exceeded");
  expect(() =>
    linter.verify(
      "declare const value:unknown;export const result=value as string;",
      {
        ...config,
        languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      },
      { filename: path },
    ),
  ).toThrow("requires type information");
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noLib: true, types: [] }, files: ["value.ts"] }));
  const require = createRequire(import.meta.url);
  writeFileSync(
    join(scratch, "eslint.config.mjs"),
    `import tseslint from ${JSON.stringify(pathToFileURL(require.resolve("typescript-eslint")).href)};
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
export default [{files:['**/*.ts'],languageOptions:{parser:tseslint.parser,parserOptions:{project:'./tsconfig.json',tsconfigRootDir:import.meta.dirname,projectService:false}},plugins:{'@typescript-eslint':require(${JSON.stringify(join(scratch, "plugin/dist/index.js"))})},rules:{'${VALUE_RULE}':'error'}}];`,
  );
  const result = runNicedSync(
    process.execPath,
    [join(repoRoot, "scripts/eslint.ts"), "--config", join(scratch, "eslint.config.mjs"), "--no-cache", "--concurrency", "off", path],
    { cwd: scratch },
  );
  expect(result.status, result.stdout + result.stderr).toBe(2);
  expect(result.stderr).toContain("Maximum call stack size exceeded");
  expect(result.stderr).toContain(VALUE_RULE);
});

test("native value assertions keep importing Node and DOM timer meanings and safe upcasts", ({ scratch, repoRoot }) => {
  const plugin = nativeFabricationPlugin(scratch, repoRoot);
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const source =
    "import type {Count} from './count.ts';declare const choice:boolean;const bag={handle:choice?setTimeout(()=>{},0):0};export const value=bag['handle'] as Count;";
  const results: (readonly Linter.LintMessage[])[] = [];
  for (const browser of [false, true]) {
    const root = join(scratch, browser ? "dom" : "node");
    mkdirSync(root);
    const path = join(root, "value.ts");
    writeFileSync(path, source);
    writeFileSync(join(root, "count.ts"), "export type Count=number;");
    const program = ts.createProgram([path, join(root, "count.ts")], {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: browser ? ["lib.es2022.d.ts", "lib.dom.d.ts"] : ["lib.es2022.d.ts"],
      types: browser ? [] : ["node"],
      skipLibCheck: true,
    });
    expect(program.getSemanticDiagnostics()).toEqual([]);
    results.push(
      new Linter({ cwd: root }).verify(
        source,
        {
          files: ["**/*.ts"],
          plugins: { "@typescript-eslint": plugin },
          languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
          rules: { [VALUE_RULE]: "error" },
        },
        { filename: path },
      ),
    );
  }
  expect(results[0]).toMatchObject([{ ruleId: VALUE_RULE }]);
  expect(results[1]).toEqual([]);
  const path = join(scratch, "upcast.ts");
  const upcast =
    "interface Base{readonly kind:string}interface Full extends Base{readonly seq:number}declare const full:Full;export const value=full as Base;export const raw=full as unknown;";
  writeFileSync(path, upcast);
  const program = ts.createProgram([path], { strict: true, types: [], noLib: true });
  expect(
    new Linter({ cwd: scratch }).verify(
      upcast,
      {
        files: ["**/*.ts"],
        plugins: { "@typescript-eslint": plugin },
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
        rules: { [VALUE_RULE]: "error" },
      },
      { filename: path },
    ),
  ).toEqual([]);
});
