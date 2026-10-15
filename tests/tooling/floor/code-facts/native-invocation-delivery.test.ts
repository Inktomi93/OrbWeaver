// @subject tooling/src/floor/compiler/invocation-evidence-extract.ts
// @subject tooling/src/floor/code-facts/invocation-evidence-replay.ts
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { createSemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory.ts";
import type { InventoryInvocationPlan, InventorySpan, NativeInvocationEvidence } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { DEFAULT_INVENTORY_FAMILIES } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { readInventoryBindings } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { visitInventoryRecords } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { captureInvocationEvidence, encodeInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";
import { extractInventoryPartition } from "../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts";
import { inventoryFileSystem } from "../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts";
import { runInventoryPartitionWorker } from "../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts";
import { createSemanticWorkspace, nativeCompilerSourceFiles } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { nativeTypeFactSession } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";

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
    using inventory = createSemanticInventory({
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
    using inventory = createSemanticInventory(options);
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
  "mixed full and invocation bindings preserve authored output and strict dependency ownership",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, source, calls } = controls(scratch);
    const call = calls.find((node) => node.getText() === "bound()");
    if (call === undefined) {
      throw new Error("dependency invocation is missing");
    }
    using complete = createSemanticInventory({ root: scratch, programs: [descriptor], families: ["bindings"] });
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
    using mixed = createSemanticInventory(options);
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
    using before = createSemanticInventory({ ...options, invocationQueries: [{ program: descriptor.id, query: { ...small, node: span(call) } }] });
    expect(() => before.invocationEvidence(call, descriptor.id, PLAN)).toThrow("query is unavailable");
    using expanded = createSemanticInventory({ ...options, invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }] });
    using reused = createSemanticInventory({
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
    for (const [table, message] of [
      ["inventory_invocation_atom", "fact graph is incomplete"],
      ["inventory_invocation_source", "source ownership is incomplete"],
      ["inventory_global_binding", "binding-source coverage is incomplete"],
    ] as const) {
      const databasePath = join(scratch, `${table}.sqlite`);
      expect(() =>
        createSemanticInventory({
          ...options,
          databasePath,
          invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
          buildPartition: (request) => {
            runInventoryPartitionWorker(request);
            using stage = openInventoryDatabase(request.destination);
            stage.exec("PRAGMA foreign_keys=OFF");
            stage.exec(`DELETE FROM ${table}`);
          },
        }),
      ).toThrow(message);
      using failed = openInventoryDatabase(databasePath);
      expect(latestInventoryGeneration(failed)).toBe(0);
    }
    const failedWorkerPath = join(scratch, "failed-worker.sqlite");
    expect(() =>
      createSemanticInventory({
        ...options,
        databasePath: failedWorkerPath,
        invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
        buildPartition: () => {
          throw new Error("failed invocation worker");
        },
      }),
    ).toThrow("failed invocation worker");
    using failedWorker = openInventoryDatabase(failedWorkerPath);
    expect(latestInventoryGeneration(failedWorker)).toBe(0);
    const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
      root: scratch,
      files: [{ path: join(scratch, "vendor/bound.ts"), text: "export const bound=()=>1;" }],
      deleted: [],
    });
    using overlay = createSemanticInventory({
      ...options,
      fileSystem,
      overlay: { addedPaths: ["vendor/bound.ts"], deletedPaths: [] },
      invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
    });
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
