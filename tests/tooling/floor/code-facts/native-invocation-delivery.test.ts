// @subject tooling/src/floor/compiler/invocation-evidence-extract.ts
// @subject tooling/src/floor/code-facts/invocation-evidence-replay.ts
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path, { dirname, join } from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type {
  InventoryBuildRequest,
  InventoryInvocationPlan,
  InventorySpan,
  NativeInvocationEvidence,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  DEFAULT_INVENTORY_FAMILIES,
  invocationAtomSchema,
  invocationQuerySchema,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inventoryAuthoredFiles } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import {
  acquireInventoryReadLease,
  hasInventoryInvocationCoverage,
  readInventoryBindings,
  readInventoryInvocationEvidence,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader, ownedInventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { visitInventoryRecords } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { captureInvocationEvidence, encodeInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";
import { extractInventoryPartition } from "../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts";
import { createSemanticWorkspace, nativeCompilerSourceFiles } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { nativeTypeFactSession } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";
import type { NativeInventoryCoverage, NativeInventoryLifetime } from "../compiler/native-inventory-fixture.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";

const SOURCE = "tests/server/invocation.test.ts";
const TEXT = `import {mintTypeId} from '../../packages/kit/src/ids/index.ts';
import {bound} from '../../vendor/bound.ts';
const seeded=(prefix:string):string=>prefix;
declare const maybe:((prefix:string)=>string)|undefined;
export const built=mintTypeId.bind(null,'chat');
const rebound=built.bind(null,seeded);
bound();rebound();
mintTypeId.call(null,'chat',seeded);
mintTypeId.apply(null,['chat',seeded]);
mintTypeId(...['chat',seeded] as const);
mintTypeId('chat',maybe);mintTypeId('chat',UPSTREAM);
const ambient=Math.random.bind(Math);mintTypeId('chat',ambient);mintTypeId('chat',Math.random);
let written=mintTypeId.bind(null,'chat');written=mintTypeId.bind(null,'chat');written();
const LEFT=RIGHT;const RIGHT=LEFT;LEFT();
declare function merged():void;declare function merged(value:string):void;merged();
const args=['chat',seeded] as const;declare function escape(value:object):void;escape(args);mintTypeId.apply(null,args);
`;
const PLAN: InventoryInvocationPlan = {
  mode: "invocation",
  facets: ["module"],
  arguments: [
    { index: 0, facets: ["module", "global", "binding", "undefined", "string", "namespace", "stable"] },
    { index: 1, facets: ["module", "global", "binding", "undefined", "string", "namespace", "stable"] },
  ],
};
function span(node: MorphNode): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}
function setup(root: string, repoRoot: string): void {
  const write = (file: string, text: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\nvendor/\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [], lib: ["es2022"] },
      files: [SOURCE, "globals.ts"],
    }),
  );
  write(SOURCE, TEXT);
  write("globals.ts", "const UPSTREAM=Math.random;");
  write(
    "packages/kit/src/ids/index.ts",
    "export function mintTypeId(prefix:string,generate?:(prefix:string)=>string):string{return generate?.(prefix)??prefix;}",
  );
  write("vendor/bound.ts", "import {mintTypeId} from '../packages/kit/src/ids/index.ts';const PREFIX='chat';export const bound=mintTypeId.bind(null,PREFIX);");
  execFixtureGit(root, ["init", "-q"]);
}
function controls(root: string): {
  descriptor: ReturnType<typeof readCompilerPrograms>[number];
  source: import("ts-morph").SourceFile;
  calls: import("ts-morph").CallExpression[];
} {
  const descriptor = readCompilerPrograms(root).find(({ id }) => id === "tsconfig.json");
  const source = createSemanticWorkspace({ root }).program("tsconfig.json")?.sourceFile(SOURCE);
  if (descriptor === undefined || source === undefined) {
    throw new Error("native invocation fixture is missing");
  }
  return { descriptor, source, calls: source.getDescendantsOfKind(SyntaxKind.CallExpression) };
}
function snapshot(node: MorphNode, evidence: NativeInvocationEvidence): object {
  return encodeInvocationEvidence(node, PLAN, { ...evidence, sources: [node.getSourceFile()] }, span);
}

test("sealed invocation admission indexes private registrations and freshly checks caller plans", () => {
  const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
  const source = project.createSourceFile("/admission.ts", "one();two();three();four();");
  const nodes = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const first = nodes[0];
  const last = nodes[3];
  if (first === undefined || last === undefined) {
    throw new Error("invocation admission controls missing");
  }
  const acquire = vi.fn((): never => {
    throw new Error("admitted reader failure");
  });
  using session = nativeTypeFactSession(acquire);
  const plan: InventoryInvocationPlan = { mode: "invocation", facets: ["module"], arguments: [] };
  const other: InventoryInvocationPlan = { mode: "invocation", facets: ["global"], arguments: [] };
  for (const node of nodes) {
    session.request("first", { kind: "invocation-evidence", nodes: [node], plan });
  }
  session.request("first", { kind: "invocation-evidence", nodes: [last], plan: other });
  session.request("second", { kind: "invocation-evidence", nodes: [last], plan });
  session.request("dropped", { kind: "invocation-evidence", nodes: [first], plan });
  session.seal(new Set(["first", "second"]));
  plan.facets.push("binding");
  const caller: InventoryInvocationPlan = { mode: "invocation", facets: ["module"], arguments: [] };
  const parses = vi.spyOn(invocationQuerySchema, "parse");
  try {
    for (const [index, node] of [...nodes, ...nodes].entries()) {
      parses.mockClear();
      expect(() => session.invocationEvidence("first", [node], caller)).toThrow("admitted reader failure");
      expect(parses).toHaveBeenCalledTimes(index === 0 ? nodes.length + 2 : 1);
    }
    expect(() => session.invocationEvidence("first", [first], other)).toThrow("not registered by this owner");
    expect(() => session.invocationEvidence("first", [last], other)).toThrow("admitted reader failure");
    expect(() => session.invocationEvidence("second", [first], caller)).toThrow("not registered by this owner");
    expect(() => session.invocationEvidence("second", [last], caller)).toThrow("admitted reader failure");
    expect(() => session.invocationEvidence("dropped", [first], caller)).toThrow("not registered by this owner");
    const foreign = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true }).createSourceFile(source.getFilePath(), source.getFullText());
    expect(() => session.invocationEvidence("first", [foreign.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)], caller)).toThrow(
      "not registered by this owner",
    );
    caller.facets.push("undefined");
    expect(() => session.invocationEvidence("first", [first], caller)).toThrow("not registered by this owner");
    caller.facets.length = 1;
    caller.arguments.push({ index: 0, facets: [] }, { index: 0, facets: [] });
    expect(() => session.invocationEvidence("first", [first], caller)).toThrow("argument projection is ambiguous");
    caller.arguments.length = 0;
    expect(() => session.invocationEvidence("first", [first], caller)).toThrow("admitted reader failure");
    expect(acquire).toHaveBeenCalledTimes(1);
    session[Symbol.dispose]();
    expect(() => session.invocationEvidence("first", [first], caller)).toThrow("disposed");
  } finally {
    parses.mockRestore();
  }
});

test("invocation admission preserves registered versus caller refusal order without publishing partial indexes", () => {
  const source = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true }).createSourceFile("/refusal.ts", "one();");
  const node = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  const valid: InventoryInvocationPlan = { mode: "invocation", facets: [], arguments: [] };
  const duplicate: InventoryInvocationPlan = {
    ...valid,
    arguments: [
      { index: 0, facets: [] },
      { index: 0, facets: [] },
    ],
  };
  const malformed: InventoryInvocationPlan = { ...valid, facets: ["type-projection"] };
  const acquire = vi.fn((): never => {
    throw new Error("unexpected reader acquisition");
  });
  using session = nativeTypeFactSession(acquire);
  session.request("mixed", { kind: "invocation-evidence", nodes: [node], plan: valid });
  session.request("mixed", { kind: "invocation-evidence", nodes: [node], plan: duplicate });
  session.request("bad-first", { kind: "invocation-evidence", nodes: [node], plan: duplicate });
  session.request("other-kind", { kind: "global-bindings", nodes: [node] });
  expect(() => session.seal(new Set(["mixed", "bad-first", "other-kind"]))).not.toThrow();
  for (let retry = 0; retry < 2; retry++) {
    expect(() => session.invocationEvidence("mixed", [node], malformed)).toThrow("must name exactly its closed demand");
    expect(() => session.invocationEvidence("mixed", [node], valid)).toThrow("argument projection is ambiguous");
    expect(() => session.invocationEvidence("bad-first", [node], malformed)).toThrow("argument projection is ambiguous");
  }
  expect(() => session.invocationEvidence("missing", [node], malformed)).toThrow("not registered by this owner");
  expect(() => session.invocationEvidence("other-kind", [node], malformed)).toThrow("not registered by this owner");
  expect(session.invocationEvidence("mixed", [], malformed)).toEqual(new Map());
  expect(acquire).not.toHaveBeenCalled();
});

test(
  "native value queries distinguish same-span import specifiers and identifiers from their source file",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, source } = controls(scratch);
    const specifier = source.getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
    const identifier = specifier.getNameNode();
    expect([specifier.getStart(), specifier.getEnd()]).toEqual([identifier.getStart(), identifier.getEnd()]);
    expect(specifier.getKind()).not.toBe(identifier.getKind());
    const plan: InventoryInvocationPlan = { mode: "value", facets: ["module"], arguments: [] };
    const nodes = [specifier, identifier, source];
    using inventory = nativeInventoryFixture({
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"],
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: nodes.map((node) => ({ program: descriptor.id, query: { ...plan, node: span(node) } })),
    });
    for (const node of nodes) {
      const delivered = inventory.invocationEvidence(node, descriptor.id, plan);
      expect(encodeInvocationEvidence(node, plan, { ...delivered, sources: [source] }, span)).toEqual(
        encodeInvocationEvidence(node, plan, { ...captureInvocationEvidence(node, plan), sources: [source] }, span),
      );
      expect([...delivered.modules.keys()]).toEqual([node]);
    }
  },
  scaledBudget(30_000),
);

test(
  "native invocation graphs retain exact canonical wrapper order, capture markers, union predicates and nested refusal traces",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, source, calls } = controls(scratch);
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"] as const,
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: calls.map((node) => ({ program: descriptor.id, query: { ...PLAN, node: span(node) } })),
    };
    using inventory = nativeInventoryFixture(options);
    expect(DEFAULT_INVENTORY_FAMILIES).not.toContain("invocation-evidence");
    for (const call of calls) {
      expect(snapshot(call, inventory.invocationEvidence(call, descriptor.id, PLAN))).toEqual(snapshot(call, captureInvocationEvidence(call, PLAN)));
    }
    const bound = calls.find((call) => call.getText() === "bound()");
    const union = calls.find((call) => call.getText() === "mintTypeId('chat',maybe)");
    const written = calls.find((call) => call.getText() === "written()");
    const escaping = calls.find((call) => call.getText() === "mintTypeId.apply(null,args)");
    if (bound === undefined || union === undefined || written === undefined || escaping === undefined) {
      throw new Error("invocation controls are missing");
    }
    const fact = inventory.invocationEvidence(bound, descriptor.id, PLAN).invocation;
    expect(fact).toMatchObject({ kind: "resolved", value: { invocation: "call", arguments: { kind: "resolved" } } });
    if (fact?.kind !== "resolved" || fact.value.arguments.kind !== "resolved") {
      throw new Error("bound invocation is unresolved");
    }
    expect(fact.value.arguments.value.map((node) => node.getText())).toEqual(["PREFIX"]);
    expect(fact.value.arguments.value[0]?.getSourceFile().getFilePath()).toBe(join(scratch, "vendor/bound.ts"));
    const generator = union.getArguments()[1];
    if (generator === undefined) {
      throw new Error("undefined union control is missing");
    }
    expect(inventory.invocationEvidence(union, descriptor.id, PLAN).undefinedMembers.get(generator)).toBe(true);
    expect(inventory.invocationEvidence(written, descriptor.id, PLAN).invocation).toMatchObject({
      kind: "unresolved",
      reason: "write",
      capture: "native-bind",
    });
    expect(inventory.invocationEvidence(escaping, descriptor.id, PLAN).invocation).toMatchObject({
      kind: "resolved",
      value: { arguments: { kind: "unresolved", reason: "write" } },
    });
    for (const [argumentText, keys] of [
      ["ambient", ["invocation", "target", "callee", "arguments"]],
      ["Math.random", ["target", "callee", "arguments"]],
    ] as const) {
      const call = calls.find((node) => node.getText() === `mintTypeId('chat',${argumentText})`);
      const argument = call?.getArguments()[1];
      if (call === undefined || argument === undefined) {
        throw new Error("generator binding marker control is missing");
      }
      const binding = inventory.invocationEvidence(call, descriptor.id, PLAN).callableBindings.get(argument);
      if (binding?.kind !== "resolved") {
        throw new Error("generator binding marker is unresolved");
      }
      expect(Object.keys(binding.value)).toEqual(keys);
    }
    const upstreamCall = calls.find((node) => node.getText() === "mintTypeId('chat',UPSTREAM)");
    const upstream = source
      .getProject()
      .getSourceFileOrThrow(join(scratch, "globals.ts"))
      .getVariableDeclarationOrThrow("UPSTREAM")
      .getInitializerOrThrow()
      .asKindOrThrow(SyntaxKind.PropertyAccessExpression)
      .getExpression();
    if (upstreamCall === undefined) {
      throw new Error("upstream script binding control is missing");
    }
    expect(inventory.invocationEvidence(upstreamCall, descriptor.id, PLAN).declarations(upstream).map(span)).toEqual(
      captureInvocationEvidence(upstreamCall, PLAN).declarations(upstream).map(span),
    );
    expect(() => inventory.invocationEvidence(bound, "foreign", PLAN)).toThrow("partition is unavailable");
    const standalone = nativeCompilerSourceFiles(source.getProject().getProgram().compilerObject)
      .find((file) => file.getFilePath() === source.getFilePath())
      ?.getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((call) => call.getText() === "bound()");
    if (standalone === undefined) {
      throw new Error("standalone invocation control is missing");
    }
    expect(() => captureInvocationEvidence(standalone, PLAN)).toThrow("not permitted in this context");
    const syntax = new Project({ useInMemoryFileSystem: true });
    const replay = syntax.createSourceFile(join(scratch, SOURCE), TEXT);
    const replayCall = replay.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => call.getText() === "bound()");
    if (replayCall === undefined) {
      throw new Error("replay invocation is missing");
    }
    expect(inventory.invocationEvidence(replayCall, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    replay.replaceWithText(`${TEXT}\nexport const stale=1;`);
    expect(() => inventory.invocationEvidence(replay, descriptor.id, PLAN)).toThrow("source/epoch");
  },
  scaledBudget(60_000),
);

test(
  "a late related-value replay after its anchor is forgotten admits unchanged text and refuses changed text",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const call = calls.find((node) => node.getText() === "bound()");
    if (call === undefined) {
      throw new Error("forgotten-anchor invocation is missing");
    }
    using inventory = nativeInventoryFixture({
      root: scratch,
      programs: [descriptor],
      families: ["bindings", "invocation-evidence", "global-origins", "computed-names"],
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
    });
    const evidence = inventory.invocationEvidence(call, descriptor.id, PLAN);
    const invoked = evidence.invocation;
    if (invoked?.kind !== "resolved" || invoked.value.arguments.kind !== "resolved") {
      throw new Error("forgotten-anchor bound argument is missing");
    }
    const argument = invoked.value.arguments.value[0];
    if (argument === undefined) {
      throw new Error("forgotten-anchor argument is missing");
    }
    const text = (node: MorphNode): string => node.getText();
    const declared = evidence.declarations(argument).map(text);
    call.forget();
    expect(call.wasForgotten()).toBe(true);
    expect(evidence.declarations(argument).map(text)).toEqual(declared);
    const owner = argument.getSourceFile();
    const at = span(argument);
    owner.insertText(owner.getEnd(), "\nexport const changed=1;\n");
    const fresh = owner.getDescendants().find((node) => node.getStart() === at.start && node.getEnd() === at.end && node.getKind() === at.kind);
    if (fresh === undefined) {
      throw new Error("forgotten-anchor argument did not survive the appended edit");
    }
    expect(() => evidence.declarations(fresh)).toThrow("replay source/epoch is stale");
  },
  scaledBudget(60_000),
);

test(
  "mixed full and invocation bindings preserve authored output and strict dependency ownership",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, source, calls } = controls(scratch);
    const call = calls.find((node) => node.getText() === "bound()");
    if (call === undefined) {
      throw new Error("dependency invocation is missing");
    }
    using complete = nativeInventoryFixture({ root: scratch, programs: [descriptor], families: ["bindings"] });
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const completePartition = readInventoryGeneration(db, complete.generation)[0];
    if (completePartition === undefined) {
      throw new Error("complete partition is missing");
    }
    const expected = [...readInventoryBindings(db, completePartition.id)];
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["bindings", "invocation-evidence", "global-origins", "computed-names"] as const,
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
    };
    using mixed = nativeInventoryFixture(options);
    const partition = readInventoryGeneration(db, mixed.generation)[0];
    if (partition === undefined) {
      throw new Error("mixed partition is missing");
    }
    expect([...readInventoryBindings(db, partition.id)]).toEqual(expected);
    const evidence = mixed.invocationEvidence(call, descriptor.id, PLAN);
    const invoked = evidence.invocation;
    if (invoked?.kind !== "resolved" || invoked.value.arguments.kind !== "resolved") {
      throw new Error("dependency bound argument is missing");
    }
    const argument = invoked.value.arguments.value[0];
    if (argument === undefined) {
      throw new Error("dependency argument is missing");
    }
    expect(evidence.declarations(argument).map((node) => node.getText())).toEqual(["PREFIX='chat'"]);
    expect(mixed.symbols(argument)).toEqual({ lexical: [], origins: [] });
    expect(complete.symbols(argument)).toEqual({ lexical: [], origins: [] });
    expect([...readInventoryBindings(db, partition.id, span(argument))]).toEqual([]);
    using stored = inventoryReader(scratch, mixed.generation, [partition], { db, dispose: () => undefined });
    for (const [sql, message] of [
      ["DELETE FROM inventory_invocation_source WHERE partition=?", "source ownership is incomplete"],
      ["DELETE FROM inventory_global_binding WHERE partition=?", "binding-source coverage is incomplete"],
      ["DELETE FROM inventory_fact WHERE partition=? AND kind='bindings'", "binding record is unavailable"],
      ["DELETE FROM inventory_source WHERE partition=?", "binding source ownership is unavailable"],
    ] as const) {
      db.exec("BEGIN IMMEDIATE;PRAGMA defer_foreign_keys=ON;");
      try {
        db.prepare(sql).run(partition.id);
        expect(() => stored.invocationEvidence(call, descriptor.id, PLAN)).toThrow(message);
      } finally {
        db.exec("ROLLBACK");
      }
    }
    expect(source.getFullText()).toBe(TEXT);
  },
  scaledBudget(60_000),
);

test(
  "finite invocation demand, atom corruption, failed publication and pinned overlays refuse missing evidence",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const call = calls.find((node) => node.getText() === "bound()");
    if (call === undefined) {
      throw new Error("invocation demand is missing");
    }
    const small: InventoryInvocationPlan = { mode: "invocation", facets: ["module"], arguments: [] };
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"] as const,
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
    };
    using before = nativeInventoryFixture({ ...options, invocationQueries: [{ program: descriptor.id, query: { ...small, node: span(call) } }] });
    expect(() => before.invocationEvidence(call, descriptor.id, PLAN)).toThrow("query is unavailable");
    using expanded = nativeInventoryFixture({ ...options, invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }] });
    using reused = nativeInventoryFixture({
      ...options,
      invocationQueries: [
        { program: descriptor.id, query: { ...PLAN, facets: [...PLAN.facets].reverse(), arguments: [...PLAN.arguments].reverse(), node: span(call) } },
      ],
    });
    expect(expanded.generation).toBeGreaterThan(before.generation);
    expect(reused.generation).toBe(expanded.generation);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partition = readInventoryGeneration(db, expanded.generation)[0];
    if (partition === undefined) {
      throw new Error("invocation partition is missing");
    }
    using stored = inventoryReader(scratch, expanded.generation, [partition], { db, dispose: () => undefined });
    for (const [sql, message] of [
      ["DELETE FROM inventory_invocation_evidence WHERE partition=?", "query is unavailable"],
      ["DELETE FROM inventory_invocation_atom WHERE partition=? AND ordinal=(SELECT MAX(ordinal) FROM inventory_invocation_atom)", "fact graph is incomplete"],
      ["UPDATE inventory_invocation_atom SET parent=NULL WHERE partition=? AND ordinal=1", "atom sequence is incomplete"],
      ["UPDATE inventory_invocation_atom SET size=size+1 WHERE partition=? AND ordinal=0", "atom sequence is incomplete"],
      ["UPDATE inventory_invocation_atom SET key='\"missingModule\"' WHERE partition=? AND key='\"module\"'", "facet coverage is incomplete"],
    ] as const) {
      db.exec("BEGIN IMMEDIATE;PRAGMA defer_foreign_keys=ON;");
      try {
        db.prepare(sql).run(partition.id);
        expect(() => stored.invocationEvidence(call, descriptor.id, PLAN)).toThrow(message);
      } finally {
        db.exec("ROLLBACK");
      }
    }
    for (const [fault, message] of [
      ["invocation-atoms", "fact graph is incomplete"],
      ["invocation-sources", "source ownership is incomplete"],
      ["invocation-bindings", "binding-source coverage is incomplete"],
    ] as const) {
      const databasePath = join(scratch, `${fault}.sqlite`);
      const faults: string[] = [];
      expect(() =>
        nativeInventoryFixture(
          {
            ...options,
            databasePath,
            invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
          },
          { fault, faults },
        ),
      ).toThrow(message);
      expect(faults).toEqual([fault]);
      using failed = openInventoryDatabase(databasePath);
      expect(latestInventoryGeneration(failed)).toBe(0);
    }
    const failedWorkerPath = join(scratch, "failed-worker.sqlite");
    expect(() =>
      nativeInventoryFixture(
        {
          ...options,
          databasePath: failedWorkerPath,
          invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
        },
        { failWorker: true },
      ),
    ).toThrow("injected native worker exit");
    using failedWorker = openInventoryDatabase(failedWorkerPath);
    expect(latestInventoryGeneration(failedWorker)).toBe(0);
    const overlayRequests: InventoryBuildRequest[] = [];
    using overlay = nativeInventoryFixture(
      {
        ...options,
        invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
      },
      {
        projection: { root: scratch, files: [{ path: join(scratch, "vendor/bound.ts"), text: "export const bound=()=>1;" }], deleted: [] },
        requests: overlayRequests,
      },
    );
    expect(overlayRequests).toHaveLength(1);
    expect(overlayRequests[0]?.overlay?.files.find((file) => file.path === join(scratch, "vendor/bound.ts"))).toEqual({
      path: join(scratch, "vendor/bound.ts"),
      text: "export const bound=()=>1;",
    });
    expect(inventoryAuthoredFiles(scratch, overlayRequests[0]?.overlay).has(join(scratch, "vendor/bound.ts"))).toBe(false);
    expect(overlay.sourceCorpus().getSourceFile("vendor/bound.ts")?.getFullText()).toBe("export const bound=()=>1;");
    expect(() => overlay.invocationEvidence(call, descriptor.id, PLAN)).toThrow("replay source/epoch is stale");
    const overlayCall = overlay
      .sourceCorpus()
      .getSourceFile(SOURCE)
      ?.getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((node) => node.getText() === "bound()");
    if (overlayCall === undefined) {
      throw new Error("overlay invocation root is missing");
    }
    expect(overlay.invocationEvidence(overlayCall, descriptor.id, PLAN).invocation).toMatchObject({
      kind: "resolved",
      value: { target: { kind: "module", canonical: { exportedName: "bound" } } },
    });
    expect(expanded.invocationEvidence(call, descriptor.id, PLAN).invocation).toMatchObject({
      kind: "resolved",
      value: { target: { kind: "module", canonical: { exportedName: "mintTypeId" } } },
    });
    const acquire = vi.fn((): never => {
      throw new Error("failed invocation reader");
    });
    using session = nativeTypeFactSession(acquire);
    const registered = { ...small, facets: [...small.facets] };
    session.request("owner", { kind: "invocation-evidence", nodes: [call], plan: registered });
    registered.facets.push("global");
    expect(() => session.invocationEvidence("owner", [call], small)).toThrow("must be sealed");
    session.seal(new Set(["owner"]));
    expect(() => session.invocationEvidence("owner", [call], registered)).toThrow("not registered by this owner");
    expect(() => session.invocationEvidence("owner", [call], PLAN)).toThrow("not registered by this owner");
    expect(() => session.invocationEvidence("foreign", [call], small)).toThrow("not registered by this owner");
    expect(() => session.invocationEvidence("owner", [call], small)).toThrow("failed invocation reader");
    expect(() => session.invocationEvidence("owner", [call], small)).toThrow("failed invocation reader");
    expect(acquire).toHaveBeenCalledTimes(1);
    session[Symbol.dispose]();
    expect(() => session.invocationEvidence("owner", [call], small)).toThrow("disposed");
    expanded[Symbol.dispose]();
    expect(() => expanded.invocationEvidence(call, descriptor.id, PLAN)).toThrow("disposed");
  },
  scaledBudget(90_000),
);

test(
  "closed invocation extraction pins its existing Project owner independently of the corresponding language-service owner",
  async ({ scratch, repoRoot }) => {
    const captures = await import("../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts");
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const call = calls.find((node) => node.getText() === "bound()");
    if (call === undefined) {
      throw new Error("native owner invocation is missing");
    }
    const request = {
      root: scratch,
      descriptor,
      destination: join(scratch, "unused.sqlite"),
      families: ["invocation-evidence", "global-origins", "computed-names"] as const,
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: [{ ...PLAN, node: span(call) }],
    };
    const read = captures.captureInvocationEvidence;
    const captured = vi.spyOn(captures, "captureInvocationEvidence").mockImplementation((node, plan) => {
      const project = node.getProject();
      const native = project.getProgram().compilerObject;
      const language = project.getLanguageService().compilerObject.getProgram();
      expect(native).not.toBe(language);
      expect(native.getSourceFile(node.getSourceFile().getFilePath())).toBe(node.getSourceFile().compilerNode);
      expect(language?.getSourceFile(node.getSourceFile().getFilePath())?.text).toBe(node.getSourceFile().getFullText());
      return read(node, plan);
    });
    try {
      const partition = extractInventoryPartition(request);
      expect(partition.invocationEvidence).toHaveLength(1);
      const withoutRole = { ...partition, invocationEvidence: [] };
      expect(() => visitInventoryRecords(withoutRole, () => undefined)).toThrow("auxiliary binding source exceeds its closed invocation demand");
      expect(captured).toHaveBeenCalledTimes(1);
      captured.mockImplementation(read);
      const symbolFor = Node.prototype.getSymbol;
      const altered = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: MorphNode) {
        if (this.getText() === "seeded") {
          try {
            this.getProject();
          } catch {
            return;
          }
        }
        return symbolFor.call(this);
      });
      try {
        expect(() => extractInventoryPartition({ ...request, families: ["bindings", ...request.families] })).toThrow(
          "binding differs between its admitted Project and language-service owners",
        );
      } finally {
        altered.mockRestore();
      }
      captured.mockImplementation((node, plan) => {
        const fact = read(node, plan);
        node.getProject().createSourceFile(join(scratch, "foreign-owner.ts"), "export const changed=1;");
        return fact;
      });
      expect(() => extractInventoryPartition(request)).toThrow("Project source differs from its captured");
    } finally {
      captured.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "invocation staging validates shared binding sources once per closed demand snapshot",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, source, calls } = controls(scratch);
    const selected = calls.filter((call) => ["bound()", "rebound()", "written()"].includes(call.getText()));
    expect(selected).toHaveLength(3);
    const coverage: NativeInventoryCoverage[] = [];
    let inventory: ReturnType<typeof nativeInventoryFixture>;
    inventory = nativeInventoryFixture(
      {
        root: scratch,
        programs: [descriptor],
        families: ["invocation-evidence", "global-origins", "computed-names"],
        globalOriginQueries: [],
        globalBindingQueries: [],
        computedNameQueries: [],
        invocationQueries: selected.map((call) => ({ program: descriptor.id, query: { ...PLAN, node: span(call) } })),
      },
      { coverage },
    );
    const measured = coverage[0];
    if (measured === undefined) {
      throw new Error("native staging validation observation missing");
    }
    using retained = inventory;
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partition = readInventoryGeneration(db, retained.generation)[0];
    if (partition === undefined) {
      throw new Error("shared invocation partition is missing");
    }
    const facts = selected.flatMap((call) => [...readInventoryInvocationEvidence(db, partition.id, { ...PLAN, node: span(call) })]);
    const uniqueSources = new Set(facts.flatMap((fact) => fact.sources.map((captured) => captured.file)));
    expect(facts.reduce((count, fact) => count + fact.sources.length, 0)).toBeGreaterThan(uniqueSources.size);
    expect(measured.enumerations).toBe(uniqueSources.size);
    expect(measured.declarationPreparations).toBe(uniqueSources.size);
    expect(measured.closureKeys).toBeGreaterThan(0);
    expect(measured.closureLookups).toBe(measured.closureKeys);
    const queries = selected.map((call) => ({ ...PLAN, node: span(call) }));
    expect(hasInventoryInvocationCoverage(db, partition.id, queries)).toBe(true);
    expect(db.isTransaction).toBe(false);
    expect(hasInventoryInvocationCoverage(db, partition.id, [{ ...PLAN, node: { ...(queries[0]?.node ?? span(source)), start: -1 } }])).toBe(false);
    expect(db.isTransaction).toBe(false);
    for (const [change, error] of [
      ["UPDATE inventory_global_binding SET lexicalCount=lexicalCount+1 WHERE partition=?", "declarations are incomplete"],
      ["DELETE FROM inventory_source WHERE partition=?", "binding source ownership is unavailable"],
      ["DELETE FROM inventory_list WHERE partition=? AND kind='available'", "span is outside its captured source closure"],
      ["UPDATE inventory_source SET textLength=0 WHERE partition=?", "span is outside its captured source closure"],
      ["DELETE FROM inventory_fact WHERE partition=? AND kind='bindings'", "binding record is unavailable"],
      [
        "INSERT INTO inventory_source SELECT partition,ordinal+100000,file,path,consumerClass,authored,textVersion,textLength,textParts FROM inventory_source WHERE partition=? AND file IN (SELECT file FROM inventory_invocation_source WHERE partition=inventory_source.partition) LIMIT 1",
        "binding source ownership is unavailable",
      ],
      [
        "INSERT INTO inventory_fact SELECT partition,kind,ordinal+100000,file,name,node,target,dynamic,specifier FROM inventory_fact WHERE partition=? AND kind='bindings' LIMIT 1",
        "binding record is unavailable",
      ],
    ] as const) {
      db.exec("BEGIN IMMEDIATE;PRAGMA defer_foreign_keys=ON;");
      try {
        db.prepare(change).run(partition.id);
        expect(() => hasInventoryInvocationCoverage(db, partition.id, queries), change).toThrow(error);
        expect(db.isTransaction).toBe(true);
      } finally {
        db.exec("ROLLBACK");
      }
      expect(hasInventoryInvocationCoverage(db, partition.id, queries)).toBe(true);
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        "UPDATE inventory_invocation_source SET bindingCount=bindingCount+1 WHERE partition=? AND owner=(SELECT MAX(ordinal) FROM inventory_invocation_evidence WHERE partition=?)",
      ).run(partition.id, partition.id);
      db.prepare(
        "UPDATE inventory_invocation_atom SET number=number+1 WHERE partition=? AND owner=(SELECT MAX(ordinal) FROM inventory_invocation_evidence WHERE partition=?) AND key=? AND kind='number'",
      ).run(partition.id, partition.id, JSON.stringify("bindings"));
      expect(() => hasInventoryInvocationCoverage(db, partition.id, queries)).toThrow("binding-source coverage is incomplete");
      expect(db.isTransaction).toBe(true);
    } finally {
      db.exec("ROLLBACK");
    }
    expect(hasInventoryInvocationCoverage(db, partition.id, queries)).toBe(true);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        "UPDATE inventory_invocation_atom SET number=1000000 WHERE partition=? AND owner=(SELECT MAX(ordinal) FROM inventory_invocation_evidence WHERE partition=?) AND key=? AND kind='number'",
      ).run(partition.id, partition.id, JSON.stringify("end"));
      expect(() => hasInventoryInvocationCoverage(db, partition.id, queries)).toThrow("span is outside its captured source closure");
    } finally {
      db.exec("ROLLBACK");
    }
    expect(hasInventoryInvocationCoverage(db, partition.id, queries)).toBe(true);
    db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount+1 WHERE partition=?").run(partition.id);
    expect(() => hasInventoryInvocationCoverage(db, partition.id, queries)).toThrow("declarations are incomplete");
    expect(db.isTransaction).toBe(false);
    db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount-1 WHERE partition=?").run(partition.id);
    expect(hasInventoryInvocationCoverage(db, partition.id, queries)).toBe(true);
    expect(() => hasInventoryInvocationCoverage(db, "foreign", queries)).toThrow("family unavailable");
    expect(db.isTransaction).toBe(false);
  },
  scaledBudget(30_000),
);

test(
  "invocation replay reuses only exact live physical syntax projections",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, source, calls } = controls(scratch);
    const call = calls.find((node) => node.getText() === "bound()");
    if (call === undefined) {
      throw new Error("physical projection invocation is missing");
    }
    using inventory = nativeInventoryFixture({
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"],
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
    });
    const positions = vi.spyOn(Node.prototype, "getDescendantAtPos");
    const ancestors = vi.spyOn(Node.prototype, "getAncestors");
    try {
      const first = inventory.invocationEvidence(call, descriptor.id, PLAN);
      expect(first.modules.has(call.getExpression())).toBe(true);
      const firstPositions = positions.mock.calls.length;
      const firstAncestors = ancestors.mock.calls.length;
      expect(firstPositions).toBeGreaterThan(0);
      expect(firstAncestors).toBeGreaterThan(0);
      const second = inventory.invocationEvidence(call, descriptor.id, PLAN);
      expect(second.modules.has(call.getExpression())).toBe(true);
      expect({ positions: positions.mock.calls.length - firstPositions, ancestors: ancestors.mock.calls.length - firstAncestors }).toEqual({
        positions: 0,
        ancestors: 0,
      });
    } finally {
      ancestors.mockRestore();
      positions.mockRestore();
    }
    const twin = new Project({ useInMemoryFileSystem: true }).createSourceFile(source.getFilePath(), TEXT);
    const twinCall = twin.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getText() === "bound()");
    if (twinCall === undefined) {
      throw new Error("same-span twin invocation is missing");
    }
    expect(span(twinCall)).toEqual(span(call));
    expect(twinCall.compilerNode).not.toBe(call.compilerNode);
    const twinEvidence = inventory.invocationEvidence(twinCall, descriptor.id, PLAN);
    expect(twinEvidence.modules.has(twinCall.getExpression())).toBe(true);
    expect(twinEvidence.modules.has(call.getExpression())).toBe(false);
    source.forgetDescendants();
    expect(call.wasForgotten()).toBe(true);
    const currentCall = (): import("ts-morph").CallExpression => {
      const current = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getText() === "bound()");
      if (current === undefined) {
        throw new Error("current projection invocation is missing");
      }
      return current;
    };
    const afterForget = currentCall();
    expect(inventory.invocationEvidence(afterForget, descriptor.id, PLAN).modules.has(afterForget.getExpression())).toBe(true);
    const previousEpoch = source.compilerNode;
    source.replaceWithText(TEXT);
    expect(source.compilerNode).not.toBe(previousEpoch);
    const replacement = currentCall();
    expect(inventory.invocationEvidence(replacement, descriptor.id, PLAN).modules.has(replacement.getExpression())).toBe(true);
    source.replaceWithText(TEXT + "\nexport const changed=1;");
    expect(() => inventory.invocationEvidence(currentCall(), descriptor.id, PLAN)).toThrow("source/epoch");
    source.replaceWithText(TEXT);
    const restored = currentCall();
    expect(inventory.invocationEvidence(restored, descriptor.id, PLAN).modules.has(restored.getExpression())).toBe(true);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partition = readInventoryGeneration(db, inventory.generation)[0];
    if (partition === undefined) {
      throw new Error("physical projection partition is missing");
    }
    const alias = join(scratch, "invocation-alias.ts");
    symlinkSync(source.getFilePath(), alias);
    db.prepare("UPDATE inventory_source SET path=? WHERE partition=? AND file=?").run(
      JSON.stringify(alias),
      partition.id,
      JSON.stringify(source.getFilePath()),
    );
    using borrowed = inventoryReader(scratch, inventory.generation, [partition], { db, dispose: () => undefined });
    const paths = [SOURCE, "tests/server/../server/invocation.test.ts", source.getFilePath(), alias];
    const resolution = vi.spyOn(path, "resolve");
    syncBuiltinESMExports();
    try {
      for (const input of paths) {
        expect(borrowed.canonicalPath(input)).toBe(source.getFilePath());
      }
      const cold = resolution.mock.calls.length;
      expect(cold).toBeGreaterThan(0);
      for (const input of paths) {
        expect(borrowed.canonicalPath(input)).toBe(source.getFilePath());
      }
      expect(resolution.mock.calls.length - cold).toBe(0);
    } finally {
      resolution.mockRestore();
      syncBuiltinESMExports();
    }
    const retained = borrowed.invocationEvidence(restored, descriptor.id, PLAN);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE inventory_span SET kind=? WHERE partition=? AND ordinal=(SELECT node FROM inventory_global_binding WHERE partition=? LIMIT 1)").run(
        SyntaxKind.EndOfFileToken,
        partition.id,
        partition.id,
      );
      expect(() => borrowed.invocationEvidence(restored, descriptor.id, PLAN)).toThrow("cannot materialize span");
    } finally {
      db.exec("ROLLBACK");
    }
    expect(borrowed.invocationEvidence(restored, descriptor.id, PLAN).modules.has(restored.getExpression())).toBe(true);
    borrowed[Symbol.dispose]();
    expect(borrowed.canonicalPath(alias)).toBe(alias);
    expect(() => retained.declarations(restored.getExpression())).toThrow("disposed");
    inventory[Symbol.dispose]();
    expect(() => inventory.invocationEvidence(restored, descriptor.id, PLAN)).toThrow("disposed");
  },
  scaledBudget(30_000),
);

test(
  "the historical verdict lease pins its private connection before any consumer fact read",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const selected = calls.filter((call) => ["bound()", "rebound()"].includes(call.getText()));
    expect(selected).toHaveLength(2);
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"] as const,
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: selected.map((call) => ({ program: descriptor.id, query: { ...PLAN, node: span(call) } })),
    };
    const databasePath = join(scratch, ".cache/semantic-inventory.sqlite");
    let connection: DatabaseSync | undefined;
    const prepare = DatabaseSync.prototype.prepare;
    const observation = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, ...args) {
      if (this.location() === databasePath) {
        connection = this;
      }
      return prepare.apply(this, args);
    });
    let inventory: ReturnType<typeof nativeInventoryFixture>;
    try {
      inventory = nativeInventoryFixture(options);
    } finally {
      observation.mockRestore();
    }
    using owned = inventory;
    const privateConnection = connection;
    if (privateConnection === undefined) {
      throw new Error("private inventory connection was not observed");
    }
    expect(privateConnection.isTransaction).toBe(true);
    expect(privateConnection.prepare("PRAGMA query_only").get()).toEqual({ ["query_only"]: 1 });
    expect(() => privateConnection.exec("UPDATE inventory_global_binding SET lexicalCount=lexicalCount+1")).toThrow("readonly");
    using db = openInventoryDatabase(databasePath);
    const partitions = readInventoryGeneration(db, owned.generation);
    const partition = partitions[0];
    if (partition === undefined) {
      throw new Error("owned lease partition is missing");
    }
    db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount+1 WHERE partition=?").run(partition.id);
    for (const call of selected) {
      expect(snapshot(call, owned.invocationEvidence(call, descriptor.id, PLAN))).toEqual(snapshot(call, captureInvocationEvidence(call, PLAN)));
    }
    using borrowed = inventoryReader(scratch, owned.generation, partitions, { db, dispose: () => undefined });
    for (const call of selected) {
      expect(() => borrowed.invocationEvidence(call, descriptor.id, PLAN)).toThrow("declarations are incomplete");
    }
    expect(() => nativeInventoryFixture(options)).toThrow("declarations are incomplete");
    db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount-1 WHERE partition=?").run(partition.id);
    for (const call of selected) {
      expect(borrowed.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    }
    owned[Symbol.dispose]();
    expect(privateConnection.isOpen).toBe(false);
    expect(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()).toMatchObject({ busy: 0 });
  },
  scaledBudget(30_000),
);

test(
  "owned replay indexes immutable closure membership once while borrowed metadata remains fresh",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const selected = calls.filter((call) => ["bound()", "rebound()", "written()"].includes(call.getText()));
    expect(selected).toHaveLength(3);
    using built = nativeInventoryFixture({
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"],
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: selected.map((call) => ({ program: descriptor.id, query: { ...PLAN, node: span(call) } })),
    });
    const databasePath = join(scratch, ".cache/semantic-inventory.sqlite");
    using db = openInventoryDatabase(databasePath);
    const partitions = readInventoryGeneration(db, built.generation);
    using privateDb = openInventoryDatabase(databasePath);
    using lease = acquireInventoryReadLease(privateDb, built.generation, partitions);
    const partition = lease.partitions[0];
    const borrowedPartition = partitions[0];
    const anchor = selected[0];
    if (partition === undefined || borrowedPartition === undefined || anchor === undefined) {
      throw new Error("closure membership fixture missing");
    }
    const scans = vi.spyOn(partition.available, "includes");
    const enumerations = vi.spyOn(partition.available, Symbol.iterator);
    try {
      using indexed = ownedInventoryReader(scratch, built.generation, lease, { db: privateDb, dispose: () => undefined });
      for (const selectedCall of [...selected, ...selected]) {
        expect(snapshot(selectedCall, indexed.invocationEvidence(selectedCall, descriptor.id, PLAN))).toEqual(
          snapshot(selectedCall, captureInvocationEvidence(selectedCall, PLAN)),
        );
      }
      expect(scans.mock.calls.length).toBe(0);
      expect(enumerations).toHaveBeenCalledTimes(1);
      const retained = indexed.invocationEvidence(anchor, descriptor.id, PLAN);
      using borrowed = inventoryReader(scratch, built.generation, partitions, { db, dispose: () => undefined });
      const file = anchor.getSourceFile().getFilePath();
      const at = borrowedPartition.available.indexOf(file);
      expect(at).toBeGreaterThanOrEqual(0);
      const removed = borrowedPartition.available.splice(at, 1);
      try {
        expect(() => borrowed.invocationEvidence(anchor, descriptor.id, PLAN)).toThrow("source is outside its native closure");
        expect(indexed.invocationEvidence(anchor, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
      } finally {
        borrowedPartition.available.splice(at, 0, ...removed);
      }
      expect(borrowed.invocationEvidence(anchor, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
      indexed[Symbol.dispose]();
      expect(() => retained.declarations(anchor.getExpression())).toThrow("disposed");
    } finally {
      enumerations.mockRestore();
      scans.mockRestore();
    }
  },
  scaledBudget(30_000),
);

test(
  "owned inventory lease validates complete raw bindings once across multiple public queries",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const selected = calls.filter((call) => ["bound()", "rebound()", "written()"].includes(call.getText()));
    expect(selected).toHaveLength(3);
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"] as const,
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: selected.map((call) => ({ program: descriptor.id, query: { ...PLAN, node: span(call) } })),
    };
    using first = nativeInventoryFixture(options);
    using second = nativeInventoryFixture(options);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, first.generation);
    const partition = partitions[0];
    if (partition === undefined) {
      throw new Error("raw binding work-count partition is missing");
    }
    const facts = selected.flatMap((call) => [...readInventoryInvocationEvidence(db, partition.id, { ...PLAN, node: span(call) })]);
    const unique = new Set(facts.flatMap((fact) => fact.sources.map(({ file }) => file)));
    expect(facts.reduce((count, fact) => count + fact.sources.length, 0)).toBeGreaterThan(unique.size);
    let enumerations = 0;
    const iterate = StatementSync.prototype.iterate;
    const observation = vi.spyOn(StatementSync.prototype, "iterate").mockImplementation(function (this: StatementSync, ...args) {
      if (this.sourceSQL.includes("b.lexicalCount,b.originCount FROM inventory_global_binding")) {
        enumerations++;
      }
      return iterate.apply(this, args);
    });
    let atomRows = 0;
    const all = StatementSync.prototype.all;
    const atoms = vi.spyOn(StatementSync.prototype, "all").mockImplementation(function (this: StatementSync, ...args) {
      const rows = all.apply(this, args);
      if (this.sourceSQL.includes("FROM inventory_invocation_atom")) {
        atomRows += rows.length;
      }
      return rows;
    });
    const extensions = vi.spyOn(invocationAtomSchema, "extend");
    try {
      for (const inventory of [first, second]) {
        for (const [index, call] of [...selected, ...selected].entries()) {
          const parses = vi.spyOn(invocationQuerySchema, "parse");
          let delivered: NativeInvocationEvidence;
          try {
            delivered = inventory.invocationEvidence(call, descriptor.id, PLAN);
            expect(parses).toHaveBeenCalledTimes(index < selected.length ? 2 : 1);
          } finally {
            parses.mockRestore();
          }
          expect(snapshot(call, delivered)).toEqual(snapshot(call, captureInvocationEvidence(call, PLAN)));
        }
        expect(enumerations).toBe(unique.size * (inventory === first ? 1 : 2));
      }
      using borrowed = inventoryReader(scratch, first.generation, partitions, { db, dispose: () => undefined });
      for (const call of selected) {
        borrowed.invocationEvidence(call, descriptor.id, PLAN);
      }
      expect(enumerations).toBeGreaterThan(unique.size * 2);
      expect(atomRows).toBeGreaterThan(selected.length);
      expect(extensions).toHaveBeenCalledTimes(0);
    } finally {
      extensions.mockRestore();
      atoms.mockRestore();
      observation.mockRestore();
    }
  },
  scaledBudget(30_000),
);

test(
  "owned inventory leaves borrowed savepoints, unfinished writes and DDL reads fresh",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const call = calls.find((node) => node.getText() === "bound()");
    if (call === undefined) {
      throw new Error("borrowed freshness call is missing");
    }
    using owned = nativeInventoryFixture({
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"],
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
    });
    const captured = owned.invocationEvidence(call, descriptor.id, PLAN);
    const declarations = captured.declarations(call.getExpression());
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, owned.generation);
    const partition = partitions[0];
    if (partition === undefined) {
      throw new Error("borrowed freshness partition missing");
    }
    using borrowed = inventoryReader(scratch, owned.generation, partitions, { db, dispose: () => undefined });
    expect(borrowed.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    db.exec("BEGIN IMMEDIATE;SAVEPOINT beforeWrite");
    try {
      db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount+1 WHERE partition=?").run(partition.id);
      const changed = db.prepare("SELECT total_changes() AS count").get();
      expect(() => borrowed.invocationEvidence(call, descriptor.id, PLAN)).toThrow("declarations are incomplete");
      db.exec("ROLLBACK TO beforeWrite");
      expect(db.prepare("SELECT total_changes() AS count").get()).toEqual(changed);
      expect(borrowed.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
      db.exec("SAVEPOINT beforeDdl;ALTER TABLE inventory_global_binding RENAME TO displaced_binding");
      expect(() => borrowed.invocationEvidence(call, descriptor.id, PLAN)).toThrow("no such table");
      db.exec("ROLLBACK TO beforeDdl");
      expect(borrowed.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    } finally {
      db.exec("ROLLBACK");
    }
    const before = db.prepare("SELECT total_changes() AS count").get();
    const pending = db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount+1 WHERE partition=? RETURNING ordinal").iterate(partition.id);
    pending.next();
    try {
      expect(db.isTransaction).toBe(false);
      expect(db.prepare("SELECT total_changes() AS count").get()).toEqual(before);
      expect(() => borrowed.invocationEvidence(call, descriptor.id, PLAN)).toThrow("declarations are incomplete");
      expect(captured.declarations(call.getExpression())).toEqual(declarations);
      expect(owned.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    } finally {
      pending.return?.();
    }
    db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount-1 WHERE partition=?").run(partition.id);
    expect(borrowed.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    db.exec("BEGIN IMMEDIATE");
    borrowed[Symbol.dispose]();
    expect(db.isTransaction).toBe(true);
    db.exec("ROLLBACK");
  },
  scaledBudget(30_000),
);

test(
  "owned inventory overlay closes its query-only lease before removing isolated storage",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const call = calls.find((node) => node.getText() === "bound()");
    if (call === undefined) {
      throw new Error("overlay lease call missing");
    }
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"] as const,
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
    };
    using main = nativeInventoryFixture(options);
    const lifetime: NativeInventoryLifetime[] = [];
    const overlayRequests: InventoryBuildRequest[] = [];
    using overlay = nativeInventoryFixture(options, {
      projection: { root: scratch, files: [{ path: join(scratch, "vendor/bound.ts"), text: "export const bound=()=>1;" }], deleted: [] },
      lifetime,
      requests: overlayRequests,
    });
    expect(overlayRequests).toHaveLength(1);
    expect(overlayRequests[0]?.overlay?.files.find((file) => file.path === join(scratch, "vendor/bound.ts"))).toEqual({
      path: join(scratch, "vendor/bound.ts"),
      text: "export const bound=()=>1;",
    });
    expect(inventoryAuthoredFiles(scratch, overlayRequests[0]?.overlay).has(join(scratch, "vendor/bound.ts"))).toBe(false);
    expect(overlay.sourceCorpus().getSourceFile("vendor/bound.ts")?.getFullText()).toBe("export const bound=()=>1;");
    expect(lifetime).toEqual([{ transaction: true, queryOnly: 1, existed: true, closed: true, removed: true }]);
    const source = overlay.sourceCorpus().getSourceFile(SOURCE);
    const overlayCall = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getText() === "bound()");
    if (overlayCall === undefined) {
      throw new Error("overlay captured call missing");
    }
    expect(overlay.invocationEvidence(overlayCall, descriptor.id, PLAN).invocation).toMatchObject({
      kind: "resolved",
      value: { target: { kind: "module", canonical: { exportedName: "bound" } } },
    });
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(latestInventoryGeneration(db)).toBe(main.generation);
    overlay[Symbol.dispose]();
    expect(() => overlay.invocationEvidence(overlayCall, descriptor.id, PLAN)).toThrow("disposed");
  },
  scaledBudget(30_000),
);
