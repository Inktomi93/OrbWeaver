import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { beginReferencePass, endReferencePass } from "@orb/tooling/floor/code-facts/reference-fact";
import { readReturnedDictionary, readValueDependencyContribution } from "@orb/tooling/floor/code-facts/value-dependency";
import type { ValueDependencyResult } from "@orb/tooling/floor/code-facts/value-dependency-contract";
import type { Node as MorphNode, SourceFile, ts } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { observeCallReturns } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import type { CallReturnObservations } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";

test.beforeEach(() => {
  beginReferencePass();
});
test.afterEach(() => {
  endReferencePass();
});

interface DependencyFixture {
  readonly source: SourceFile;
  readonly value: (name: string) => MorphNode;
  readonly read: (name: string) => ValueDependencyResult;
  readonly observations: CallReturnObservations;
  readonly terminals: ReadonlySet<ts.CallExpression>;
}

function fixture(root: string): DependencyFixture {
  mkdirSync(join(root, "packages/ui/src"), { recursive: true });
  writeFileSync(
    join(root, "packages/ui/tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM"], strict: true, types: [] }, files: ["src/dependency.ts"] }),
  );
  writeFileSync(
    join(root, "packages/ui/src/dependency.ts"),
    `
declare function signal(): number;
declare function textSignal(): string;
declare function opaque(value: number): number;
declare function rows(): readonly { readonly id: number }[];
declare function consume(value: readonly number[]): void;
declare function opaqueRows(): readonly { id: any }[];
function ignore(value: number) { return 10; }
function adjust(value: number) { return Math.min(value, 10); }
export function Live() { const value = signal(); return Math.min(value, 10); }
export function Projected() { return Math.min(signal(), 10).toString; }
export function StringLive() { return textSignal().trim(); }
export function StringProjected() { return textSignal().trim().toString; }
export function Forwarded() { return adjust(signal()); }
export function Erased() { signal(); return 10; }
export function Ignored() { return ignore(signal()); }
export function Opaque() { return opaque(signal()); }
export function Shadow() { const Math = { min(value: number, cap: number) { return cap; } }; return Math.min(signal(), 10); }
export function Mutable() { let value = signal(); value = 10; return value; }
export function EmptyLoop() { const out: number[] = []; for (const item of []) { out.push(signal()); } return out; }
export function EarlyReturn() { return []; const out: number[] = []; out.push(signal()); return out; }
export function Collected() { const out: number[] = []; for (const hit of rows()) { out.push(hit.id); } return out; }
export function OpaqueCollected() { const out: number[] = []; for (const hit of opaqueRows()) { out.push(hit.id); } return out; }
export function DeadAppend() { const out: number[] = []; return out; out.push(signal()); }
export function ConditionalAppend() { const out: number[] = []; if (false) { out.push(signal()); } return out; }
export function Cleared() { const out: number[] = []; out.push(signal()); out.length = 0; return out; }
export function Escaped() { const out: number[] = []; consume(out); out.push(signal()); return out; }
const ATTR_KEYS = ["size", "intent"] as const;
export function AttrMap(source: Readonly<Record<string, string | undefined>>) {
  const attrs: Record<string, string> = {};
  for (const axis of ATTR_KEYS) { const arm = source[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } }
  return attrs;
}
const absentMetadata: Readonly<Record<string, string | undefined>> = {};
const presentMetadata: Readonly<Record<string, string | undefined>> = { size: "large", intent: "info" };
export function AbsentMemberAttrMap() { const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { const arm = absentMetadata[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export function PresentMemberAttrMap() { const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { const arm = presentMetadata[axis]; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export function AnnotatedMemberAttrMap(source: { readonly size?: string }) { const attrs: Record<string, string> = {}; for (const axis of ["size"] as const) { const arm = source.size; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export function EmptyAttrMap(source: Readonly<Record<string, string | undefined>>) { const attrs: Record<string, string> = {}; for (const axis of [] as const) { attrs[\`data-\${axis}\`] = source[axis] ?? ""; } return attrs; }
export function FalseAttrMap() { const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { if (false) { attrs[\`data-\${axis}\`] = "x"; } } return attrs; }
export function PrefixAttrMap() { return {}; const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { attrs[\`data-\${axis}\`] = "x"; } return attrs; }
export function EscapedAttrMap() { const attrs: Record<string, string> = {}; opaqueDictionary(attrs); for (const axis of ATTR_KEYS) { attrs[\`data-\${axis}\`] = "x"; } return attrs; }
const MUTABLE_ATTR_KEYS = ["size", "intent"];
MUTABLE_ATTR_KEYS.push("other");
export function MutatedAttrMap() { const attrs: Record<string, string> = {}; for (const axis of MUTABLE_ATTR_KEYS) { attrs[\`data-\${axis}\`] = "x"; } return attrs; }
function erasedArm(): string | undefined { return undefined; }
export function ErasedAttrMap() { const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { const arm = erasedArm(); if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
declare function opaqueArm(): string | undefined;
export function OpaqueAttrMap() { const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { const arm = opaqueArm(); if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export function TypedOnlyConvertedAttrMap(source: Readonly<Record<string, string | undefined>>) { const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { const arm = String(source[axis] ?? ""); if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
function convertMetadata(value: unknown): string | undefined { if (typeof value !== "string") { return; } return String(value); }
export function NativeConvertedAttrMap(source: Readonly<Record<string, string | undefined>>) { const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { const arm = convertMetadata(source[axis]); if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export function AssertedAbsentAttrMap() { const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { const arm = undefined as string | undefined; if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export function ShadowConvertedAttrMap() { function String(value: string): string | undefined { return undefined; } const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { const arm = String(axis); if (arm !== undefined) { attrs[\`data-\${axis}\`] = arm; } } return attrs; }
export function ExtraAttrMap(key: string) { const attrs: Record<string, string> = {}; for (const axis of ATTR_KEYS) { attrs[key] = "x"; } return attrs; }
declare function opaqueDictionary(value: object): void;
export function ShadowAppend() { const out: number[] = []; out.push = () => 0; out.push(signal()); return out; }
`,
  );
  execFixtureGit(root, ["init", "-q"]);
  const workspace = createSemanticWorkspace({ root });
  const owner = workspace.program("packages/ui/tsconfig.json");
  const source = owner?.sourceFile("packages/ui/src/dependency.ts");
  if (owner === undefined || source === undefined) {
    throw new Error("missing native dependency source");
  }
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const observations = observeCallReturns(calls, source.getDescendantsOfKind(SyntaxKind.Identifier), { explicitAbsentReturns: true });
  const terminals = new Set(
    calls.filter((call) => ["signal", "textSignal", "rows", "opaqueRows"].includes(call.getExpression().getText())).map((call) => call.compilerNode),
  );
  const value = (name: string): MorphNode => {
    const result = source.getFunctionOrThrow(name).getBodyOrThrow().getDescendantsOfKind(SyntaxKind.ReturnStatement).at(-1)?.getExpression();
    if (result === undefined) {
      throw new Error("missing dependency return");
    }
    return result;
  };
  const read = (name: string): ValueDependencyResult => readValueDependencyContribution({ value: value(name), observations, terminals });
  return { source, value, read, observations, terminals };
}

test("returned dependency proves native result transfer, not presence, erased arguments, opaque calls, shadows or mutation", ({ scratch }) => {
  const { read } = fixture(scratch);
  const live = read("Live");
  expect(live.kind, live.kind === "unqualified" ? live.reason : "native result contribution").toBe("qualified");
  if (live.kind !== "qualified") {
    throw new Error("missing actual terminal contribution");
  }
  expect(live.contributions.map(({ terminal }) => terminal.getText())).toEqual(["signal()"]);
  expect(read("StringLive").kind).toBe("qualified");
  const names = ["Erased", "Ignored", "Opaque", "Shadow", "Mutable", "Projected", "StringProjected"];
  expect(names.map((name) => [name, read(name).kind])).toEqual(names.map((name) => [name, "unqualified"]));
});

test("captured dependency refuses stale source and program epochs before reading a terminal", ({ scratch }) => {
  const { source, value, observations, terminals } = fixture(scratch);
  const current = value("Live");
  source.insertStatements(0, "export const changed = 1;");
  expect(readValueDependencyContribution({ value: current, observations, terminals })).toMatchObject({
    kind: "unqualified",
    reason: expect.stringContaining("stale"),
  });
});

test("closed native appends retain actual iterator result contribution but clearing, escape and shadow mutation refuse", ({ scratch }) => {
  const { read } = fixture(scratch);
  const collected = read("Collected");
  expect(collected.kind, collected.kind === "unqualified" ? collected.reason : "closed native append").toBe("qualified");
  if (collected.kind !== "qualified") {
    throw new Error("missing iterator result contribution");
  }
  expect(collected.contributions.map(({ terminal }) => terminal.getText())).toEqual(["rows()"]);
  const names = ["Cleared", "Escaped", "ShadowAppend", "DeadAppend", "ConditionalAppend", "EmptyLoop", "EarlyReturn"];
  expect(names.map((name) => [name, read(name).kind])).toEqual(names.map((name) => [name, "unqualified"]));
});

test("an opaque projected value may carry actual dependency while its native data trust stays explicitly unqualified", ({ scratch }) => {
  const { read } = fixture(scratch);
  const result = read("OpaqueCollected");
  expect(result.kind, result.kind === "unqualified" ? result.reason : "opaque data contribution").toBe("qualified");
  if (result.kind !== "qualified") {
    throw new Error("missing opaque data contribution");
  }
  expect(result.dataTrust).toMatchObject({ kind: "unqualified", boundaries: [{ kind: "any" }] });
  expect(result.contributions.map(({ terminal }) => terminal.getText())).toEqual(["opaqueRows()"]);
});

test("captured authored parameter bindings retain the same actual native result contribution through a helper", ({ scratch }) => {
  const { read } = fixture(scratch);
  const result = read("Forwarded");
  expect(result.kind, result.kind === "unqualified" ? result.reason : "bound native contribution").toBe("qualified");
  if (result.kind !== "qualified") {
    throw new Error("missing bound contribution");
  }
  expect(result.contributions.map(({ terminal }) => terminal.getText())).toEqual(["signal()"]);
  expect(result.dataTrust.kind).toBe("unqualified");
});

test("returned metadata maps retain finite authored keys and optional writes, not metadata trust or unsupported effects", ({ scratch }) => {
  const { source, value, observations } = fixture(scratch);
  const result = readReturnedDictionary({ value: value("PresentMemberAttrMap"), observations });
  expect(result.kind, result.kind === "unqualified" ? result.reason : "finite native map").toBe("qualified");
  if (result.kind !== "qualified") {
    throw new Error("missing actual returned dictionary");
  }
  expect(result.keys).toEqual(["data-size", "data-intent"]);
  expect(result.writes.map((write) => write.optional)).toEqual([true]);
  expect(result.dataTrust.kind).toBe("unqualified");
  expect(readReturnedDictionary({ value: value("PresentMemberAttrMap"), observations }).kind).toBe("qualified");
  expect(readReturnedDictionary({ value: value("NativeConvertedAttrMap"), observations }).kind).toBe("qualified");
  for (const name of [
    "EmptyAttrMap",
    "FalseAttrMap",
    "PrefixAttrMap",
    "EscapedAttrMap",
    "ExtraAttrMap",
    "MutatedAttrMap",
    "ErasedAttrMap",
    "OpaqueAttrMap",
    "ShadowConvertedAttrMap",
    "TypedOnlyConvertedAttrMap",
    "AssertedAbsentAttrMap",
    "AbsentMemberAttrMap",
    "AttrMap",
    "AnnotatedMemberAttrMap",
  ]) {
    expect(readReturnedDictionary({ value: value(name), observations }).kind, name).toBe("unqualified");
  }
  const stale = value("PresentMemberAttrMap");
  source.insertStatements(0, "export const nextMetadataEpoch = 1;");
  expect(readReturnedDictionary({ value: stale, observations }).kind).toBe("unqualified");
});
