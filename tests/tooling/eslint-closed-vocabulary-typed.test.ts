// `orb/closed-vocabulary` through the repository's resolved config: a kind, status or role projection that copies a
// closed string-literal union into a plain `string` slot is refused; a slot typed by the source vocabulary passes.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/closed-vocabulary";
const FILE = "packages/server/src/domain/probe/verbs/probe.ts";
const CONTRACT = "packages/server/src/domain/probe/contract/vocab.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FILE));
}, 120_000);

const CONTRACT_SOURCE = [
  'export const PROBE_KINDS = ["draft", "sent"] as const;',
  "export type ProbeKind = (typeof PROBE_KINDS)[number];",
  'export type ProbeStatus = "open" | "closed";',
  "export interface ProbeRow {",
  "  readonly kind: ProbeKind;",
  "  readonly status: ProbeStatus;",
  "  readonly messageKind: ProbeKind;",
  "  readonly label: ProbeKind;",
  "  readonly type: ProbeKind;",
  "  readonly count: number;",
  "}",
].join("\n");

const PREAMBLE = [
  'import type { ProbeKind, ProbeRow, ProbeStatus } from "../contract/vocab.ts";',
  "declare const row: ProbeRow;",
  "declare const maybe: ProbeRow | undefined;",
  "export type Keep = ProbeKind | ProbeStatus;",
].join("\n");

async function findings(scratch: string, source: string): Promise<readonly string[]> {
  const text = `${PREAMBLE}\n${source}\n`;
  for (const [path, body] of [
    [CONTRACT, CONTRACT_SOURCE],
    [FILE, text],
  ] as const) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), body);
  }
  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  };
  const program = ts.createProgram({ rootNames: [CONTRACT, FILE].map((path) => join(scratch, path)), options });
  const file = program.getSourceFile(join(scratch, FILE));
  expect(file).toBeDefined();
  expect(program.getSemanticDiagnostics(file)).toEqual([]);
  const config = await resolvedConfig(eslint, join(ROOT, FILE));
  const found = new Linter({ cwd: scratch }).verify(
    text,
    {
      files: ["**/*.ts"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: join(scratch, FILE) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE).map(({ message }) => message);
}

test.for([
  {
    name: "a property read into a string slot",
    source: "interface Wide { readonly kind: string }\nexport const out: Wide = { kind: row.kind };",
    field: "kind",
  },
  {
    name: "a shorthand copy into a string slot",
    source: "interface Wide { readonly status: string }\nconst { status } = row;\nexport const out: Wide = { status };",
    field: "status",
  },
  {
    name: "an element read into a string slot",
    source: 'interface Wide { readonly kind: string }\nexport const out: Wide = { kind: row["kind"] };',
    field: "kind",
  },
  {
    name: "a suffixed axis name",
    source: "interface Wide { readonly messageKind: string }\nexport const out: Wide = { messageKind: row.messageKind };",
    field: "messageKind",
  },
  {
    name: "an optional string slot fed an optional read",
    source: "interface Wide { readonly kind?: string | undefined }\nexport const out: Wide = { kind: maybe?.kind };",
    field: "kind",
  },
  {
    name: "a projection returned through a declared result type",
    source: "interface Wide { readonly status: string }\nexport function project(): Wide {\n  return { status: row.status };\n}",
    field: "status",
  },
])("refuses $name", async ({ source, field }, { scratch }) => {
  expect(await findings(scratch, source)).toEqual([`Derive the projected ${field} field from its closed source vocabulary.`]);
});

test.for([
  { name: "a slot typed by the source vocabulary", source: "interface Narrow { readonly kind: ProbeKind }\nexport const out: Narrow = { kind: row.kind };" },
  {
    name: "a slot typed by an indexed access on the source",
    source: 'interface Narrow { readonly status: ProbeRow["status"] }\nexport const out: Narrow = { status: row.status };',
  },
  { name: "a non-axis field", source: "interface Wide { readonly label: string }\nexport const out: Wide = { label: row.label };" },
  {
    name: "a value read from a differently named source field",
    source: "interface Wide { readonly kind: string }\nexport const out: Wide = { kind: row.type };",
  },
  {
    name: "a value that is not a closed union",
    source: "interface Wide { readonly kind: string }\ndeclare const loose: { readonly kind: string };\nexport const out: Wide = { kind: loose.kind };",
  },
  { name: "an object with no declared slot", source: "export const out = { kind: row.kind };" },
])("passes $name", async ({ source }, { scratch }) => {
  expect(await findings(scratch, source)).toEqual([]);
});
