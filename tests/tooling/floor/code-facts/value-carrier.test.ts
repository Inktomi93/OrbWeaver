// @subject tooling/src/floor/code-facts/value-carrier.ts
// @subject tooling/src/verify/gates/json-column-read-parsed.ts

import assert from "node:assert/strict";
import { readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns } from "@orb/tooling/floor/code-facts/call-returns";
import { beginReferencePass, endReferencePass } from "@orb/tooling/floor/code-facts/reference-fact";
import { readReturnedValue } from "@orb/tooling/floor/code-facts/value-carrier";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
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

test("opted-in native memo and closed cached receiver retain possible authored results without changing strict interpretation", async ({
  plantedTree,
  repoRoot,
}) => {
  const config = "packages/ui/tsconfig.json";
  const path = "packages/ui/src/native-channel.ts";
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    "platform.d.ts": readFileSync(join(repoRoot, "platform.d.ts"), "utf8"),
    ".gitignore": "node_modules\n",
    [config]: JSON.stringify({
      compilerOptions: { strict: true, skipLibCheck: true, target: "ESNext", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2025", "DOM"], types: [] },
      files: ["src/native-channel.ts", "../../platform.d.ts"],
    }),
    [path]: `import {useMemo as memo} from "react";
const cache = new WeakMap<object, Map<string, {readonly marker:string}>>();
function cached(items:object,key:string) {
 const byConfig = cache.getOrInsertComputed(items, () => new Map<string, {readonly marker:string}>());
 const hit = byConfig.get(key);
 if(hit !== undefined) return hit as {readonly marker:string};
 const built = {marker:"cached"};
 byConfig.set(key,built);
 return built;
}
export function Actual(items:object,key:string) { return memo(() => cached(items,key),[items,key]); }
export function MapProjection(items:readonly {id:string}[],key:string) { const byId = new Map(items.map(it=>[it.id,it] as const)); return byId.get(key); }
export function EmptyProjection(key:string) { const byId = new Map(([] as {id:string}[]).map(it=>[it.id,it] as const)); return byId.get(key); }
export function ErasedProjection(items:readonly {id:string}[],key:string) { const byId = new Map(items.map(it=>[it.id,undefined] as const)); return byId.get(key); }
declare function consumeMap(value:object):void;
function liveWriter() { const table = new Map<string,{marker:string}>(); table.set("k",{marker:"live"}); const hit=table.get("k"); if(hit!==undefined) return hit; throw new Error("absent"); }
function deadWriter() { const table = new Map<string,{marker:string}>(); if(false) table.set("k",{marker:"dead"}); const hit=table.get("k"); if(hit!==undefined) return hit; throw new Error("absent"); }
function afterReturnWriter() { const table = new Map<string,{marker:string}>(); return table.get("k"); table.set("k",{marker:"dead"}); }
function afterThrowWriter() { const table = new Map<string,{marker:string}>(); const hit=table.get("k"); if(hit!==undefined) return hit; throw new Error("absent"); table.set("k",{marker:"dead"}); }
export function AfterReturnWriter() { return afterReturnWriter(); }
export function AfterThrowWriter() { return afterThrowWriter(); }
export function LiveWriter() { return liveWriter(); }
export function DeadWriter() { return deadWriter(); }
export function Overwritten(key:string) { const table = new Map<string,{readonly marker:string}|undefined>(); table.set(key,{marker:"erased"}); table.set(key,undefined); return table.get(key); }
export function EscapedMap(key:string) { const table = new Map<string,{readonly marker:string}>(); consumeMap(table); table.set(key,{marker:"escaped"}); return table.get(key); }
export function OtherKey(key:string) { const table = new Map<string,{readonly marker:string}>(); table.set("different",{marker:"unrelated"}); return table.get(key); }
export function CyclicMemo():object { const factory = ():object => memo(factory,[]); return memo(factory,[]); }
export function IfDeadMemo() {return memo(()=>{if(false) return {marker:"dead"};throw new Error("stop");},[]);}
export function ElseDeadMemo() {return memo(()=>{if(true) return undefined;else {throw new Error("stop");return {marker:"dead"};}},[]);}
export function EarlyMemo() {return memo(()=>{return undefined;return {marker:"dead"};},[]);}
export function ExpressionDeadMemo() {return memo(()=>false ? {marker:"dead"} : undefined,[]);}
export function ThrowMemo() {return memo(()=>{throw new Error("stop");return {marker:"dead"};},[]);}
export function AsyncMemo() { return memo(async()=>({marker:"promise"}),[]); }
export function Direct() { return memo(() => ({marker:"direct"}),[]); }
export function Erased() { return memo(() => { ({marker:"erased"}); return undefined; },[]); }
export function Shadow() { const memo = (factory:()=>object) => ({marker:"shadow"}); return memo(() => ({marker:"discarded"})); }
`,
  });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  const source = createSemanticWorkspace({ root }).program(config)?.sourceFile(path);
  if (source === undefined) {
    throw new Error("missing native UI channel source");
  }
  expect(source.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  beginReferencePass();
  try {
    const observations = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendantsOfKind(SyntaxKind.Identifier), {
      nativeValueTransfers: true,
    });
    const value = (name: string): import("ts-morph").Expression => {
      const body = source.getFunctionOrThrow(name).getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
      const returned = body.getStatements().filter(Node.isReturnStatement).at(-1);
      if (returned === undefined) {
        throw new Error("missing actual outer return");
      }
      return returned.getExpressionOrThrow();
    };
    const actual = value("Actual");
    const direct = value("Direct");
    const strict = readReturnedValue(direct, [], observations, new Set());
    expect(strict.kind).toBe("unresolved");
    const directFact = readReturnedValue(direct, ["marker"], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true });
    expect(directFact.kind, directFact.kind === "unresolved" ? directFact.detail : "native callback return").toBe("resolved");
    expect(directFact.kind === "resolved" && directFact.value.map((item) => item.value.getText())).toEqual(['"direct"']);
    const projected = value("MapProjection");
    const empty = value("EmptyProjection");
    const erased = value("ErasedProjection");
    const mapped = readReturnedValue(projected, [], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true });
    expect(mapped.kind, mapped.kind === "unresolved" ? mapped.detail : "actual mapped value").toBe("resolved");
    expect(
      mapped.kind === "resolved" &&
        mapped.value.some(
          (item) => item.present && item.nativeIteration?.collection.getText() === "items" && item.nativeIteration.parameter.getText() === "it",
        ),
    ).toBe(true);
    const missing = readReturnedValue(empty, [], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true });
    expect(missing.kind === "resolved" && missing.value.every((item) => !item.present)).toBe(true);
    expect(readReturnedValue(erased, [], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true }).kind).toBe("unresolved");
    for (const name of [
      "Overwritten",
      "EscapedMap",
      "OtherKey",
      "CyclicMemo",
      "AsyncMemo",
      "ThrowMemo",
      "DeadWriter",
      "AfterReturnWriter",
      "AfterThrowWriter",
    ]) {
      const unsafe = value(name);
      expect(readReturnedValue(unsafe, ["marker"], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true }).kind, name).toBe(
        "unresolved",
      );
    }
    const shadow = value("Shadow");
    const erasedMemo = value("Erased");
    const shadowFact = readReturnedValue(shadow, ["marker"], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true });
    expect(shadowFact.kind === "resolved" && shadowFact.value.map((item) => item.value.getText())).toEqual(['"shadow"']);
    const erasedFact = readReturnedValue(erasedMemo, ["marker"], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true });
    expect(erasedFact.kind === "resolved" && erasedFact.value.some((item) => item.present && item.path.length === 0)).toBe(false);
    for (const name of ["IfDeadMemo", "ElseDeadMemo", "EarlyMemo", "ExpressionDeadMemo"]) {
      const dead = value(name);
      const fact = readReturnedValue(dead, ["marker"], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true });
      expect(fact.kind === "resolved" && fact.value.some((item) => item.present && item.path.length === 0), name).toBe(false);
    }
    const liveWriterFact = readReturnedValue(value("LiveWriter"), ["marker"], observations, {
      terminals: new Set(),
      bindings: new Map(),
      nativeValueTransfers: true,
    });
    assert(liveWriterFact.kind === "resolved");
    expect(liveWriterFact.value.map((item) => ({ present: item.present, path: item.path, text: item.value.getText() }))).toEqual([
      { present: true, path: [], text: '"live"' },
    ]);

    const uncaptured = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression));
    expect(readReturnedValue(direct, [], uncaptured, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true }).kind).toBe("unresolved");
    const cachedFact = readReturnedValue(actual, ["marker"], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true });
    expect(cachedFact.kind, cachedFact.kind === "unresolved" ? `${cachedFact.detail} at ${cachedFact.node.getText()}` : "actual cache alternatives").toBe(
      "resolved",
    );
    expect(
      cachedFact.kind === "resolved" && cachedFact.value.every((item) => item.present && item.path.length === 0 && item.value.getText() === '"cached"'),
    ).toBe(true);
    const foreign = createSemanticWorkspace({ root })
      .program(config)
      ?.sourceFile(path)
      ?.getFunctionOrThrow("Direct")
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .at(-1)
      ?.getExpressionOrThrow();
    if (foreign === undefined) {
      throw new Error("missing foreign native channel");
    }
    expect(readReturnedValue(foreign, [], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true }).kind).toBe("unresolved");
    source.insertStatements(0, "export const nextNativeEpoch = 1;");
    expect(readReturnedValue(direct, [], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true }).kind).toBe("unresolved");
  } finally {
    endReferencePass();
  }
});
