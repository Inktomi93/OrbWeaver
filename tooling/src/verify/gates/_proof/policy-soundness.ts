// Shared isolated-project sources for the `policy-soundness` family's self-proofs (#1971). Every row plants a
// stub of the final contract so `isCanonicalDefineGate` resolves by IMPORT ORIGIN inside the virtual project —
// the same shape `lib/gate-contract.test.ts` uses — and reaches the judged module through the ONE population
// path the family declares, `tooling/src/verify/gates/<id>.ts`.

/** The contract stub: an untyped `defineGate` so a row can spell any descriptor shape it needs to prove. */
export const POLICY_CONTRACT_PATH = "tooling/src/verify/contract/policy.ts";
export const POLICY_CONTRACT_STUB = "export function defineGate<const Policy>(policy: Policy): Policy {\n  return policy;\n}\n";

/** An ambient `ts-morph` so `inspectGateContract`'s receiver-type identity can prove a direct walk (a
 *  member declared by ts-morph, on a receiver typed by ts-morph), and so `policy-binding-resolution`'s owner
 *  identity can tell `Symbol#getDeclarations` from `VariableStatement#getDeclarations` (#2097). Outside the
 *  family's population on purpose. */
export const TS_MORPH_TYPES_PATH = "tooling/src/verify/contract/ts-morph-stub.d.ts";
export const TS_MORPH_TYPES_STUB =
  'declare module "ts-morph" {\n  export interface Node {\n    getSourceFile(): SourceFile;\n    getSymbol(): Symbol | undefined;\n    getDefinitionNodes(): Node[];\n    getDefinitions(): unknown[];\n    findReferences(): unknown[];\n    findReferencesAsNodes(): Node[];\n    getImplementations(): unknown[];\n  }\n' +
  "  export class Symbol {\n    getDeclarations(): Node[];\n    getValueDeclaration(): Node | undefined;\n    getValueDeclarationOrThrow(): Node;\n    getAliasedSymbol(): Symbol | undefined;\n    getAliasedSymbolOrThrow(): Symbol;\n  }\n" +
  "  export interface VariableStatement extends Node {\n    getDeclarations(): Node[];\n  }\n  export class Project {\n    getSourceFiles(): SourceFile[];\n  }\n" +
  "  export interface SourceFile extends Node {\n    forEachDescendant(visitor: (node: unknown) => void): void;\n    getDescendantsOfKind(kind: number): unknown[];\n    getVariableStatements(): VariableStatement[];\n  }\n}\n";

/** The resource-guard home, planted so E4's origin test resolves a REAL import rather than a spelling. The
 *  path is the live one because the arm checks the declaration's module by suffix; a guard declared anywhere
 *  else must not acquit, which is what the local-lookalike row proves. */
export const RESOURCE_DECLARATION_PATH = "tooling/src/verify/lib/resource-declaration.ts";
export const RESOURCE_DECLARATION_STUB = "export function readyResourceValue<T>(fact: T): T {\n  return fact;\n}\n";

/** A shared `lib/` reader that takes the closed host and narrows it ITSELF — the shape E4 briefly ADMITTED and
 *  now ACCUSES (#2148). It stays planted under `lib/` on purpose: the retired carve keyed on exactly that home,
 *  so a fixture anywhere else would prove the removal against bytes the carve never covered. The live corpus
 *  had three of these (`lib/config-grant-rows.ts`, consumed by both `tsconfig-entry-liveness` modules and by
 *  `biome-grant-liveness`); all three were inverted to take the narrowed value in the same commit. */
export const LIB_READER_PATH = "tooling/src/verify/lib/probe-reader.ts";
export const LIB_READER_STUB =
  'import { readyResourceValue } from "./resource-declaration.ts";\nexport function readProbeRoster(resources: { trackedFiles: () => unknown }): unknown {\n  return readyResourceValue(resources.trackedFiles() as never);\n}\n';

const PROBE_GATE_ID = "probe";
const PROBE_GATE_PATH = `tooling/src/verify/gates/${PROBE_GATE_ID}.ts`;
/** The family test that a family-test identity arm lives in, relative to the same root. */
export const PROBE_FAMILY_TEST_PATH = "tests/tooling/verify/gates/probe-family.test.ts";
/** The specifier a test at `PROBE_FAMILY_TEST_PATH` imports the probe module through. */
export const PROBE_IMPORT_FROM_TEST = `../../../../${PROBE_GATE_PATH}`;

const DESCRIPTOR_HEAD = `import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({\n  id: "${PROBE_GATE_ID}",\n  family: "${PROBE_GATE_ID}",\n`;

/** A final module at the probe path whose descriptor carries `fields` verbatim after `id`/`family`. */
export function finalProbeModule(fields: string, prelude = ""): string {
  return `${prelude}${DESCRIPTOR_HEAD}${fields}\n});\n`;
}

/** The ordinary, syntax, selected-files trunk every waiver-arm row varies one field of. */
export const ORDINARY_TRUNK =
  'authority: "ordinary",\n  severity: "error",\n  population: "@client",\n  analysis: "syntax",\n  execution: "selected-files",\n  facts: [],\n  resources: [],\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node) => ctx.report.node(node) }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],';

/** A hard trunk for rows about proof expectations: no waiver door, so the identity/spelling arms stay quiet. */
export const HARD_TRUNK =
  'authority: "hard",\n  severity: "error",\n  population: "@client",\n  analysis: "syntax",\n  execution: "selected-files",\n  facts: [],\n  resources: [],\n  mustPass: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, why: "w" }],';

/** The three fixture files every row of this family plants beside the judged module. */
export function familyFixture(moduleSource: string, extra: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return { [POLICY_CONTRACT_PATH]: POLICY_CONTRACT_STUB, [PROBE_GATE_PATH]: moduleSource, ...extra };
}
