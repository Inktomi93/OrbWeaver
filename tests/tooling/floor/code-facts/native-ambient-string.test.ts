// @subject tooling/src/floor/code-facts/reference-fact-global.ts
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns, readCallReturnProgram } from "@orb/tooling/floor/code-facts/call-returns";
import { beginReferencePass, endReferencePass, referenceResolutionServices, resolveStableExpression } from "@orb/tooling/floor/code-facts/reference-fact";
import { readNativeStringCallWith } from "@orb/tooling/floor/code-facts/reference-fact-global";
import { readReturnedValue } from "@orb/tooling/floor/code-facts/value-carrier";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { CallExpression, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

const CONFIG = "packages/server/tsconfig.json";
const SOURCE = "packages/server/src/consumer.ts";
const SERVICES = { ...referenceResolutionServices, readCallReturnProgram, resolveStableExpression };
const CASES = [
  {
    name: "literal native conversion",
    body: "export const shown = String('native');",
    kind: "resolved",
  },
  {
    name: "native immutable alias",
    body: "const convert = String; export const shown = convert(42);",
    kind: "resolved",
  },
  {
    name: "global member native conversion",
    body: "export const shown = globalThis.String(false);",
    kind: "resolved",
  },
  {
    name: "native unknown-to-primitive narrowing",
    body: "export function shown(input: unknown) { if (typeof input !== 'string') return; return String(input); }",
    kind: "resolved",
  },
  {
    name: "input provenance lying predicate",
    body: "function claimsString(input: unknown): input is string { return true; } export function shown(input: unknown) { if (!claimsString(input)) return; return String(input); }",
    kind: "unresolved",
  },
  {
    name: "input provenance empty assertion",
    body: "function assertString(input: unknown): asserts input is string {} export function shown(input: unknown) { assertString(input); return String(input); }",
    kind: "unresolved",
  },
  {
    name: "input provenance unrelated guard",
    body: "function claimsString(input: unknown): input is string { return true; } export function shown(input: unknown, other: unknown) { if (typeof other !== 'string') return; if (!claimsString(input)) return; return String(input); }",
    kind: "unresolved",
  },
  {
    name: "input provenance nondominating guard",
    body: "function claimsString(input: unknown): input is string { return true; } export function shown(input: unknown, flag: boolean) { if (flag) { if (typeof input !== 'string') return; } if (!claimsString(input)) return; return String(input); }",
    kind: "unresolved",
  },
  {
    name: "input provenance closure guard",
    body: "function claimsString(input: unknown): input is string { return true; } export function shown(input: unknown) { const check = () => { if (typeof input !== 'string') return; }; if (!claimsString(input)) return; return String(input); }",
    kind: "unresolved",
  },
  {
    name: "input provenance reassigned formal",
    body: "function assertString(input: unknown): asserts input is string {} export function shown(input: unknown) { if (typeof input !== 'string') return; input = {}; assertString(input); return String(input); }",
    kind: "unresolved",
  },
  {
    name: "input provenance ambient binding across await",
    body: "declare const input: unknown; export async function shown() { if (typeof input !== 'string') return; await Promise.resolve(); return String(input); }",
    kind: "unresolved",
  },
  {
    name: "local callable shadow",
    body: "const String = (input: string) => input; export const shown = String('native');",
    kind: "unresolved",
  },
  {
    name: "formal shadow",
    body: "export function shown(String: (input: string) => string) { return String('native'); }",
    kind: "unresolved",
  },
  {
    name: "written ambient value",
    body: "String = Object.assign(String, {}); export const shown = String('native');",
    kind: "unresolved",
  },
  {
    name: "mutable alias",
    body: "let convert = String; export const shown = convert('native');",
    kind: "unresolved",
  },
  {
    name: "authored selected signature",
    body: "const convert: (input: number) => string = String; export const shown = convert(42);",
    kind: "unresolved",
  },
  {
    name: "augmented nonnative constructor signature",
    body: "export {}; declare global { interface StringConstructor { (input: 'native'): string; } } export const shown = String('native');",
    kind: "unresolved",
  },
  {
    name: "object custom conversion",
    body: "export const shown = String({toString() { return 'native'; }});",
    kind: "unresolved",
  },
  {
    name: "direct asserted object",
    body: "export const shown = String({} as unknown as string);",
    kind: "unresolved",
  },
  {
    name: "asserted object through immutable aliases",
    body: "const input = {} as unknown as string; const alias = input; export const shown = String(alias);",
    kind: "unresolved",
  },
  {
    name: "opaque declared primitive annotation",
    body: "declare const input: string; export const shown = String(input);",
    kind: "unresolved",
  },
  {
    name: "unnarrowed unknown",
    body: "export function shown(input: unknown) { return String(input); }",
    kind: "unresolved",
  },
  {
    name: "native wrapper is not direct conversion",
    body: "export const shown = String.call(undefined, 'native');",
    kind: "unresolved",
  },
  {
    name: "omitted input",
    body: "export const shown = String();",
    kind: "unresolved",
  },
  {
    name: "unobserved call",
    body: "export const other = String('other'); export const shown = String('native');",
    kind: "unresolved",
    mode: "unobserved",
  },
  {
    name: "foreign captured world",
    body: "export const shown = String('native');",
    kind: "unresolved",
    mode: "foreign",
  },
  {
    name: "stale captured epoch",
    body: "export const shown = String('native');",
    kind: "unresolved",
    mode: "stale",
  },
] as const;

async function nativeFixture(
  fixture: Pick<ToolFixtures, "plantedTree" | "repoRoot">,
  body: string,
): Promise<{ readonly root: string; readonly source: SourceFile }> {
  const root = await fixture.plantedTree({
    "package.json": '{"type":"module"}',
    ".gitignore": "node_modules\n",
    "tsconfig.base.json": JSON.stringify({
      compilerOptions: { strict: true, skipLibCheck: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", types: ["node"] },
    }),
    [CONFIG]: '{"extends":"../../tsconfig.base.json","include":["src/**/*.ts"]}',
    [SOURCE]: body,
  });
  symlinkSync(join(fixture.repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  const source = createSemanticWorkspace({ root }).program(CONFIG)?.sourceFile(SOURCE);
  if (source === undefined) {
    throw new Error("the genuine fixture world omitted its native call source");
  }
  return { root, source };
}

function lastCall(source: SourceFile): CallExpression {
  const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).at(-1);
  if (call === undefined) {
    throw new Error("the native control omitted its actual call");
  }
  return call;
}

for (const scenario of CASES) {
  test(`native ambient String: ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const { root, source } = await nativeFixture({ plantedTree, repoRoot }, scenario.body);
    const call = lastCall(source);
    const first = source.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    const roots = "mode" in scenario && scenario.mode === "unobserved" && first !== undefined ? [first] : [call];
    beginReferencePass();
    try {
      const observations = observeCallReturns(roots);
      let read = call;
      if ("mode" in scenario && scenario.mode === "foreign") {
        const foreign = createSemanticWorkspace({ root }).program(CONFIG)?.sourceFile(SOURCE);
        if (foreign === undefined) {
          throw new Error("the genuine foreign native world omitted its source");
        }
        read = lastCall(foreign);
      }
      if ("mode" in scenario && scenario.mode === "stale") {
        source.insertStatements(0, "// advance the captured epoch");
        read = lastCall(source);
      }
      const inputProvenance = scenario.name.startsWith("input provenance");
      const inputWitness = inputProvenance
        ? { diagnostics: source.getPreEmitDiagnostics(), narrowed: call.getArguments()[0]?.getType().isString() }
        : { diagnostics: [], narrowed: true };
      expect(inputWitness).toEqual({ diagnostics: [], narrowed: true });
      const fact = readNativeStringCallWith(read, observations, SERVICES);
      expect(fact.kind, fact.kind === "unresolved" ? fact.detail : scenario.name).toBe(scenario.kind);
      const witness = fact.kind === "resolved" ? fact.value : undefined;
      expect(witness === undefined || Node.isVariableDeclaration(witness.valueDeclaration)).toBe(true);
      expect(witness === undefined || witness.signature.getReturnType().isString()).toBe(true);
      expect(witness === undefined || witness.program.program.isSourceFileDefaultLibrary(witness.signature.getDeclaration().getSourceFile().compilerNode)).toBe(
        true,
      );
    } finally {
      endReferencePass();
    }
  });
}

const OPTIONAL_CASES = [
  {
    name: "explicit bare and literal alternatives",
    body: "function choose(value: string) { if (value.length === 0) return; return value; } export const shown = choose('held');",
    kind: "resolved",
    absent: 1,
    strings: 1,
  },
  {
    name: "all explicit bare returns contribute no string",
    body: "function choose() { return; } export const shown = choose();",
    kind: "resolved",
    absent: 1,
    strings: 0,
  },
  {
    name: "erased annotated result contributes no string",
    body: "function choose(): string | undefined { return undefined; } export const shown = choose();",
    kind: "resolved",
    absent: 0,
    strings: 0,
  },
  {
    name: "opaque annotated function supplies no body",
    body: "declare function choose(): string; export const shown = choose();",
    kind: "unresolved",
  },
  {
    name: "opaque returned operation supplies no body",
    body: "declare function opaque(): string; function choose(): string { return opaque(); } export const shown = choose();",
    kind: "unresolved",
  },
  {
    name: "implicit fallthrough stays refused",
    body: "function choose(value: string) { if (value.length > 0) return value; } export const shown = choose('held');",
    kind: "unresolved",
  },
  {
    name: "nested closure bare return is not an outer exit",
    body: "function choose(value: string) { const child = () => { return; }; return value; } export const shown = choose('held');",
    kind: "resolved",
    absent: 0,
    strings: 1,
  },
  {
    name: "optional spread absence retains earlier field",
    body: "function choose(value: string) { if (value.length === 0) return; return {key:value}; } export const shown = {key:'earlier', ...choose('held')};",
    kind: "resolved",
    absent: 0,
    strings: 2,
    path: ["key"],
  },
  {
    name: "uncaptured optional mode refuses",
    body: "function choose() { return; } export const shown = choose();",
    kind: "unresolved",
    mode: "uncaptured",
  },
  {
    name: "foreign optional context refuses",
    body: "function choose(value: string) { if (value.length === 0) return; return value; } export const shown = choose('held');",
    kind: "unresolved",
    mode: "foreign",
  },
  {
    name: "stale optional context refuses",
    body: "function choose(value: string) { if (value.length === 0) return; return value; } export const shown = choose('held');",
    kind: "unresolved",
    mode: "stale",
  },
] as const;

for (const scenario of OPTIONAL_CASES) {
  test(`captured optional returns: ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const { root, source } = await nativeFixture({ plantedTree, repoRoot }, scenario.body);
    const call = lastCall(source);
    const capture = "mode" in scenario && scenario.mode === "uncaptured" ? {} : ({ explicitAbsentReturns: true } as const);
    beginReferencePass();
    try {
      const observations = observeCallReturns([call], undefined, capture);
      let read: MorphNode = call;
      if ("path" in scenario) {
        read = source.getVariableDeclarationOrThrow("shown").getInitializerOrThrow();
      }
      if ("mode" in scenario && scenario.mode === "foreign") {
        const foreign = createSemanticWorkspace({ root }).program(CONFIG)?.sourceFile(SOURCE);
        if (foreign === undefined) {
          throw new Error("the optional foreign native world omitted its source");
        }
        read = lastCall(foreign);
      }
      if ("mode" in scenario && scenario.mode === "stale") {
        source.insertStatements(0, "// advance optional return epoch");
        read = lastCall(source);
      }
      const fact = readReturnedValue(read, "path" in scenario ? scenario.path : [], observations, {
        terminals: new Set(),
        bindings: new Map<MorphNode, MorphNode>(),
        explicitAbsentReturns: true,
      });
      expect(fact.kind, fact.kind === "unresolved" ? fact.detail : scenario.name).toBe(scenario.kind);
      const leaves = fact.kind === "resolved" ? fact.value : [];
      expect(leaves.filter((leaf) => !leaf.present)).toHaveLength("absent" in scenario ? scenario.absent : 0);
      expect(leaves.filter((leaf) => leaf.present && Node.isStringLiteral(leaf.value))).toHaveLength("strings" in scenario ? scenario.strings : 0);
    } finally {
      endReferencePass();
    }
  });
}
