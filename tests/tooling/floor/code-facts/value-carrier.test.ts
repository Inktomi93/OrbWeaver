// @subject tooling/src/floor/code-facts/value-carrier.ts
// @subject tooling/src/verify/gates/json-column-read-parsed.ts

import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns } from "@orb/tooling/floor/code-facts/call-returns";
import { readReturnedValue } from "@orb/tooling/floor/code-facts/value-carrier";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/json-column-read-parsed.ts";
import { isDirectParse } from "../../../../tooling/src/verify/lib/json-column-read.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const CONFIG = "packages/server/tsconfig.json";
const SOURCE = "packages/server/src/domain/plugin/persistence/plugins.ts";
const PARSED =
  "{ ...row, manifest: pluginManifestSchema.parse(row.manifest), grantedCapabilities: pluginManifestSchema.shape.capabilities.parse(row.grantedCapabilities) }";
const CASES = [
  {
    name: "parsed factory fields through genuine DB reader and installation caller",
    body: `function parsePluginRow(row: Row): Row { return ${PARSED}; }`,
    columns: [],
  },
  { name: "raw then parsed overrides remain validated", body: `function parsePluginRow(row: Row): Row { return { ...row, ...${PARSED} }; }`, columns: [] },
  {
    name: "parsed then raw spread replaces validation",
    body: `function parsePluginRow(row: Row): Row { return { ...${PARSED}, ...row }; }`,
    columns: ["grantedCapabilities", "manifest", "manifest"],
  },
  {
    name: "raw return alternative never borrows the parsed branch",
    body: `function parsePluginRow(row: Row): Row { if (row.id.length) return ${PARSED}; return row; }`,
    columns: ["grantedCapabilities", "manifest", "manifest"],
  },
  {
    name: "partial callable exit is unresolved not an empty proof",
    refusal: "unsupported",
    body: `function parsePluginRow(row: Row): Row | undefined { if (row.id.length) return ${PARSED}; }`,
    columns: ["grantedCapabilities", "manifest", "manifest"],
  },
  {
    name: "same-named custom parse is not Zod",
    body: "const custom = { parse: (value: PluginManifest): PluginManifest => value }; function parsePluginRow(row: Row): Row { return { ...row, manifest: custom.parse(row.manifest), grantedCapabilities: row.grantedCapabilities }; }",
    columns: ["grantedCapabilities", "manifest", "manifest"],
  },
  {
    name: "recursive return refuses rather than borrowing its parsed arm",
    refusal: "cycle",
    body: `function parsePluginRow(row: Row): Row { if (row.id.length) return ${PARSED}; return parsePluginRow(row); }`,
    columns: ["grantedCapabilities", "manifest", "manifest"],
  },
  {
    name: "computed later raw member replaces only that parsed field",
    body: `const KEY = 'manifest'; function parsePluginRow(row: Row): Row { return { ...${PARSED}, [KEY]: row.manifest }; }`,
    columns: ["manifest", "manifest"],
  },
  {
    name: "source epoch change refuses captured parser provenance",
    body: `function parsePluginRow(row: Row): Row { return ${PARSED}; }`,
    columns: [],
    snapshot: "source",
    refusal: "unsupported",
  },
  {
    name: "other native world refuses captured parser provenance",
    body: `function parsePluginRow(row: Row): Row { return ${PARSED}; }`,
    columns: [],
    snapshot: "world",
    refusal: "unsupported",
  },
  {
    name: "review conditional raw spread cannot discard present alternative",
    body: `function parsePluginRow(row: Row): Row { return { ...${PARSED}, ...(row.id.length ? row : {}) }; }`,
    columns: ["grantedCapabilities", "manifest", "manifest"],
  },
  {
    name: "review reversed conditional raw spread cannot discard present alternative",
    body: `function parsePluginRow(row: Row): Row { return { ...${PARSED}, ...(row.id.length ? {} : row) }; }`,
    columns: ["grantedCapabilities", "manifest", "manifest"],
  },
  {
    name: "review conditional parsed spread safely falls back to earlier parsed fields",
    body: `function parsePluginRow(row: Row): Row { return { ...${PARSED}, ...(row.id.length ? ${PARSED} : {}) }; }`,
    columns: [],
  },
  {
    name: "review raw conditional spread before parsed fields remains safe",
    body: `function parsePluginRow(row: Row): Row { return { ...(row.id.length ? row : {}), ...${PARSED} }; }`,
    columns: [],
  },
] as const;

function projectionSource(source: SourceFile, root: string, scenario: (typeof CASES)[number]): SourceFile {
  if ("snapshot" in scenario && scenario.snapshot === "source") {
    source.insertStatements(0, "// advance the source epoch after collecting native observations");
  }
  if ("snapshot" in scenario && scenario.snapshot === "world") {
    const foreignSource = createSemanticWorkspace({ root }).program(CONFIG)?.sourceFile(SOURCE);
    if (foreignSource === undefined) {
      throw new Error("the other genuine native world was not admitted");
    }
    return foreignSource;
  }
  return source;
}

for (const scenario of CASES) {
  test(`native returned JSON value: ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const root = await plantedTree({
      "package.json": '{"type":"module"}',
      ".gitignore": "node_modules\n",
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: {
          strict: true,
          skipLibCheck: true,
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          types: ["node"],
          paths: { "@orb/db": ["./packages/db/src/index.ts"], "@orb/contracts/plugin": ["./packages/contracts/src/plugin/index.ts"] },
        },
      }),
      [CONFIG]: '{"extends":"../../tsconfig.base.json","include":["src/**/*.ts"]}',
      "packages/contracts/src/plugin/index.ts": `import { z } from 'zod'; export const pluginCapabilitySchema = z.enum(['net', 'kv']); export const pluginManifestSchema = z.object({name: z.string().transform((value) => value.trim()), capabilities: z.array(pluginCapabilitySchema)}); export type PluginManifest = z.infer<typeof pluginManifestSchema>; export type PluginCapability = z.infer<typeof pluginCapabilitySchema>;`,
      "packages/db/src/schema/plugin.ts": `import {sqliteTable,text} from 'drizzle-orm/sqlite-core'; import type {PluginManifest,PluginCapability} from '@orb/contracts/plugin'; export const plugins = sqliteTable('plugins',{id:text('id').primaryKey(),manifest:text('manifest',{mode:'json'}).$type<PluginManifest>().notNull(),grantedCapabilities:text('granted_capabilities',{mode:'json'}).$type<PluginCapability[]>().notNull()});`,
      "packages/db/src/index.ts": `export * from './schema/plugin.js'; import * as schema from './schema/plugin.js'; import type {LibSQLDatabase} from 'drizzle-orm/libsql'; export type Db = LibSQLDatabase<typeof schema>;`,
      [SOURCE]: `import { plugins, type Db } from '@orb/db'; import {pluginManifestSchema,type PluginManifest} from '@orb/contracts/plugin'; type Row = typeof plugins.$inferSelect; ${scenario.body}
export function view(stored: Row) { const row = parsePluginRow(stored); if (row === undefined) return undefined; return {name: row.manifest.name, capabilities: row.manifest.capabilities, grants: row.grantedCapabilities}; }
export function installationInput(input: Row) { return view(input); }
export async function persistedInput(db: Db) { const row = await db.select().from(plugins).get(); return row === undefined ? undefined : view(row); }`,
    });
    symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
    execFixtureGit(root, ["init", "--quiet", "--template="]);
    const program = createSemanticWorkspace({ root }).program(CONFIG);
    if (program === undefined) {
      throw new Error("the native JSON fixture program was not admitted");
    }
    const project = program.project();
    expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
    const source = program.sourceFile(SOURCE);
    const from = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => call.getExpression().getText().endsWith(".from"));
    const parse = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => call.getExpression().getText() === "pluginManifestSchema.parse");
    if (source === undefined || from === undefined) {
      throw new Error("the actual DB reader's native from call is missing");
    }
    const declarations = from.getExpression().getSymbol()?.getDeclarations() ?? [];
    expect(declarations).not.toHaveLength(0);
    expect(declarations.every((node) => node.getSourceFile().getFilePath().includes("/drizzle-orm/"))).toBe(true);
    const parserOrigins = parse?.getExpression().getSymbol()?.getDeclarations() ?? [];
    expect(parserOrigins.length > 0).toBe(scenario.name !== "same-named custom parse is not Zod");
    expect(parserOrigins.every((node) => node.getSourceFile().getFilePath().includes("/zod/"))).toBe(true);
    const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
    expect(result.toolErrors).toEqual([]);
    expect(result.policies[0]?.owner.status).toBe("success");
    expect(result.authority.authorityAlarms).toEqual([]);
    const view = source.getFunction("view");
    if (view === undefined) {
      throw new Error("the actual view consumer is missing");
    }
    expect(
      result.authority.effectiveFindings
        .filter(({ line }) => line === view.getStartLineNumber())
        .map(({ token }) => token)
        .toSorted((left, right) => (left ?? "").localeCompare(right ?? "")),
    ).toEqual(scenario.columns);
    expect(result.authority.effectiveFindings.length === 0).toBe(scenario.columns.length === 0);
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const parsers = new Set(calls.filter(isDirectParse).map((call) => call.compilerNode));
    const observations = observeCallReturns(calls);
    const readSource = projectionSource(source, root, scenario);
    const read = readSource
      .getFunctionOrThrow("view")
      .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .find((node) => node.getText() === "row.manifest");
    if (read === undefined) {
      throw new Error("the actual returned manifest consumer is missing");
    }
    const fact = readReturnedValue(read, [], observations, parsers);
    expect(fact.kind === "unresolved" ? [fact.reason] : []).toEqual("refusal" in scenario ? [scenario.refusal] : []);
    expect(
      fact.kind === "resolved" &&
        fact.value.length > 0 &&
        fact.value.every(({ value, present }) => present && value.isKind(SyntaxKind.CallExpression) && parsers.has(value.compilerNode)),
    ).toBe(scenario.columns.length === 0 && !("snapshot" in scenario));
  });
}
