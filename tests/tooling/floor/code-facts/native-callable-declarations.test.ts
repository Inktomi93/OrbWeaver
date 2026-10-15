import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { resolveCallableDeclaration } from "../../../../tooling/src/floor/code-facts/reference-fact-call.ts";
import type { CallableDeclaration, ReferenceFact } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { createSemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory.ts";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { DEFAULT_INVENTORY_FAMILIES } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { extractInventoryPartition } from "../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts";
import { inventoryFileSystem } from "../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts";
import { runInventoryPartitionWorker } from "../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";

const NODE = "tests/server/callable.test.ts";
const BROWSER = "tests/client/callable.test.tsx";
const UNUSED = "packages/kit/src/unused.ts";
const SOURCE = `import {selected as imported} from '#platform';
import * as api from '#platform';
function stable():number{return 1;}
const alias=stable; alias();
const arrow=()=>1; arrow();
const expression=function(){return 1;}; expression();
function overload(x:number):number;
function overload(x:number){return x;} overload(1);
declare function bodyless():void; bodyless();
let mutable=stable; mutable();
function changed(){return 2;} changed=stable; changed();
const a=b; const b=a; a();
declare const bag:{picked:()=>void}; const {picked}=bag; picked();
missing(); imported(); api.selected(); stable.call(null);
export function run(fn:()=>void){fn();}
`;

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true };
  write("tsconfig.json", JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022"], types: ["node"] }, files: [NODE, UNUSED] }));
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022", "dom"], types: [], customConditions: ["browser"] }, files: [BROWSER] }),
  );
  write(
    "package.json",
    JSON.stringify({ name: "native-callable-fixture", type: "module", imports: { "#platform": { browser: "./browser.ts", default: "./node.ts" } } }),
  );
  write("node.ts", "export function selected():string{return 'node';}");
  write("browser.ts", "export const selected=():string=>'browser';");
  write(NODE, SOURCE);
  write(BROWSER, SOURCE);
  write(UNUSED, "declare function unrelated():void; unrelated();");
  execFixtureGit(root, ["init", "-q"]);
}

function span(node: MorphNode): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function snapshot(fact: ReferenceFact<CallableDeclaration>): object {
  return {
    trace: { origin: span(fact.trace.origin), declarations: fact.trace.declarations.map(span) },
    result:
      fact.kind === "resolved"
        ? {
            kind: fact.kind,
            declaration: span(fact.value.declaration),
            body: fact.value.body === undefined ? null : span(fact.value.body),
            file: fact.value.sourceFile.getFilePath(),
          }
        : { kind: fact.kind, reason: fact.reason, detail: fact.detail, node: span(fact.node) },
  };
}

test(
  "closed native callable demand preserves every canonical result and importing-world body while replaying exact syntax identity",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const workspace = createSemanticWorkspace({ root: scratch });
    const programs = readCompilerPrograms(scratch).filter(({ id }) => id === "tsconfig.json" || id === "tsconfig.tests-dom.json");
    const requests = (
      [
        ["tsconfig.json", NODE],
        ["tsconfig.tests-dom.json", BROWSER],
      ] as const
    ).flatMap(([program, path]) => {
      const source = workspace.program(program)?.sourceFile(path);
      if (source === undefined) {
        throw new Error("native callable source is missing");
      }
      return source.getDescendantsOfKind(SyntaxKind.CallExpression).map((call) => ({ program, call, node: span(call) }));
    });
    using inventory = createSemanticInventory({ root: scratch, programs, families: ["callable-declarations"], callableQueries: requests });
    expect(DEFAULT_INVENTORY_FAMILIES).not.toContain("callable-declarations");
    const syntax = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
    const nodeSource = syntax.createSourceFile(join(scratch, NODE), SOURCE);
    const browserSource = syntax.createSourceFile(join(scratch, BROWSER), SOURCE);
    const reasons = new Set<string>();
    const localReplays: boolean[] = [];
    for (const request of requests) {
      const source = request.program === "tsconfig.json" ? nodeSource : browserSource;
      const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getStart() === request.node.start);
      if (call === undefined) {
        throw new Error("callable replay query is missing");
      }
      const fact = inventory.callableDeclaration(call, request.program);
      expect(snapshot(fact)).toEqual(snapshot(resolveCallableDeclaration(request.call)));
      if (fact.kind === "unresolved") {
        reasons.add(fact.reason);
      } else if (fact.value.sourceFile.getFilePath() === source.getFilePath()) {
        localReplays.push(
          fact.value.sourceFile === source,
          fact.value.declaration.getProject() === syntax,
          (fact.value.body?.getSourceFile() ?? source) === source,
        );
      }
    }
    expect(localReplays.length).toBeGreaterThan(0);
    expect(localReplays.every(Boolean)).toBe(true);
    expect([...reasons].toSorted()).toEqual(["cycle", "dynamic", "missing", "unsupported", "write"]);
    const selected = requests.filter(({ call }) => call.getExpression().getText() === "imported");
    expect(
      selected.map(({ call, program }) => {
        const fact = inventory.callableDeclaration(call, program);
        return fact.kind === "resolved" ? fact.value.body?.getText() : fact.kind;
      }),
    ).toEqual(["{return 'node';}", "'browser'"]);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    for (const partition of readInventoryGeneration(db, latestInventoryGeneration(db))) {
      expect(db.prepare("SELECT COUNT(*) AS count FROM inventory_callable_declaration WHERE partition=?").get(partition.id)?.["count"]).toBe(
        requests.filter(({ program }) => program === partition.program).length,
      );
      expect(partition.roots).toContain(join(scratch, partition.program === "tsconfig.json" ? UNUSED : BROWSER));
    }
  },
  scaledBudget(60_000),
);

test(
  "callable extraction invokes only demanded calls and reuses only partitions covering the closed query set",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
    const source = createSemanticWorkspace({ root: scratch }).program("tsconfig.json")?.sourceFile(NODE);
    const calls = source?.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => ["alias", "arrow"].includes(call.getExpression().getText()));
    const [firstCall, secondCall] = calls ?? [];
    if (descriptor === undefined || firstCall === undefined || secondCall === undefined) {
      throw new Error("closed callable demand is missing");
    }
    const readers = await import("../../../../tooling/src/floor/code-facts/reference-fact-call.ts");
    const original = readers.resolveCallableDeclaration;
    const resolve = vi.spyOn(readers, "resolveCallableDeclaration").mockImplementation((node) => {
      expect(node.getText()).toBe("alias()");
      return original(node);
    });
    try {
      const partition = extractInventoryPartition({
        root: scratch,
        descriptor,
        families: ["callable-declarations"],
        callableQueries: [span(firstCall)],
        destination: join(scratch, "unused.sqlite"),
      });
      expect(partition.callableDeclarations).toHaveLength(1);
      expect(partition.roots).toEqual(descriptor.files.map((path) => join(scratch, path)));
      expect(partition.references).toEqual([]);
      expect(resolve).toHaveBeenCalledTimes(1);
    } finally {
      resolve.mockRestore();
    }
    const options = { root: scratch, programs: [descriptor], families: ["callable-declarations"] as const };
    const first = { program: descriptor.id, node: span(firstCall) };
    const second = { program: descriptor.id, node: span(secondCall) };
    using before = createSemanticInventory({ ...options, callableQueries: [first] });
    expect(() => before.callableDeclaration(secondCall, descriptor.id)).toThrow("callable declaration span is unavailable");
    using expanded = createSemanticInventory({ ...options, callableQueries: [first, second] });
    expect(expanded.generation).toBeGreaterThan(before.generation);
    expect(expanded.callableDeclaration(secondCall, descriptor.id).kind).toBe("resolved");
    using reused = createSemanticInventory({ ...options, callableQueries: [second, first] });
    expect(reused.generation).toBe(expanded.generation);
    expect(before.callableDeclaration(firstCall, descriptor.id).kind).toBe("resolved");
    const altered = SOURCE.replace("return 1;", "return 9;");
    expect(altered).not.toBe(SOURCE);
    const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
      root: scratch,
      files: [{ path: join(scratch, NODE), text: altered }],
      deleted: [],
    });
    using overlay = createSemanticInventory({ ...options, callableQueries: [first], fileSystem, overlay: { addedPaths: [], deletedPaths: [] } });
    const overlaySource = overlay.sourceCorpus().getSourceFile(NODE);
    const overlayCall = overlaySource?.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getStart() === first.node.start);
    if (overlayCall === undefined) {
      throw new Error("callable overlay query is missing");
    }
    const overlayFact = overlay.callableDeclaration(overlayCall, descriptor.id);
    const originalFact = before.callableDeclaration(firstCall, descriptor.id);
    expect(overlayFact.kind === "resolved" && overlayFact.value.body?.getText()).toBe("{return 9;}");
    expect(originalFact.kind === "resolved" && originalFact.value.body?.getText()).toBe("{return 1;}");
    expect(overlayFact.kind === "resolved" && overlayFact.value.sourceFile).toBe(overlaySource);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(latestInventoryGeneration(db)).toBe(expanded.generation);
    expect(() => createSemanticInventory(options)).toThrow("require closed demand");
    expect(() => createSemanticInventory({ ...options, callableQueries: [{ ...first, program: "foreign" }] })).toThrow("require closed demand");
    const incompletePath = join(scratch, "incomplete.sqlite");
    expect(() =>
      createSemanticInventory({
        ...options,
        databasePath: incompletePath,
        callableQueries: [first],
        buildPartition: (request) => {
          runInventoryPartitionWorker(request);
          using staging = openInventoryDatabase(request.destination);
          staging.exec("BEGIN IMMEDIATE");
          staging.prepare("DELETE FROM inventory_callable_trace").run();
          staging.prepare("DELETE FROM inventory_callable_declaration").run();
          staging.exec("COMMIT");
        },
      }),
    ).toThrow("incomplete callable coverage");
    using incomplete = openInventoryDatabase(incompletePath);
    expect(latestInventoryGeneration(incomplete)).toBe(0);
  },
  scaledBudget(60_000),
);

test(
  "native callable storage refuses missing rows, trace tails, absent bodies and foreign body spans",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
    const source = createSemanticWorkspace({ root: scratch }).program("tsconfig.json")?.sourceFile(NODE);
    const call = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getExpression().getText() === "alias");
    if (descriptor === undefined || source === undefined || call === undefined) {
      throw new Error("callable corruption query is missing");
    }
    using inventory = createSemanticInventory({
      root: scratch,
      programs: [descriptor],
      families: ["callable-declarations"],
      callableQueries: [{ program: descriptor.id, node: span(call) }],
    });
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partition = readInventoryGeneration(db, inventory.generation)[0];
    if (partition === undefined) {
      throw new Error("callable corruption partition is missing");
    }
    using stored = inventoryReader(scratch, inventory.generation, [partition], { db, dispose: () => undefined });
    expect(inventory.callableDeclaration(call, descriptor.id).kind).toBe("resolved");
    for (const [sql, message] of [
      ["DELETE FROM inventory_callable_declaration WHERE partition=?", "callable declaration span is unavailable"],
      [
        "DELETE FROM inventory_callable_trace WHERE partition=? AND ordinal=(SELECT MAX(ordinal) FROM inventory_callable_trace WHERE partition=?)",
        "callable declaration trace is incomplete",
      ],
      ["UPDATE inventory_callable_declaration SET body=NULL WHERE partition=?", "callable declaration body is incomplete or foreign"],
      ["UPDATE inventory_callable_declaration SET body=declaration WHERE partition=?", "callable declaration body is incomplete or foreign"],
      ["UPDATE inventory_callable_declaration SET declaration=node,body=NULL WHERE partition=?", "callable declaration is not a function-like source"],
    ] as const) {
      db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
      try {
        db.prepare(sql).run(...Array.from({ length: sql.split("?").length - 1 }, () => partition.id));
        expect(() => stored.callableDeclaration(call, descriptor.id)).toThrow(message);
      } finally {
        db.exec("ROLLBACK");
      }
    }
    expect(() => inventory.callableDeclaration(call, "foreign")).toThrow("partition is unavailable");
    expect(() => inventory.callableDeclaration(call.getExpression(), descriptor.id)).toThrow("callable declaration span is unavailable");
    const changed = source.replaceWithText(`${SOURCE}\nexport const changed=1;`);
    expect(() => inventory.callableDeclaration(changed, descriptor.id)).toThrow("source/epoch");
    inventory[Symbol.dispose]();
    expect(() => inventory.callableDeclaration(changed, descriptor.id)).toThrow("disposed");
    expect(db.prepare("SELECT COUNT(*) AS count FROM inventory_callable_declaration WHERE partition=?").get(partition.id)?.["count"]).toBe(1);
  },
  scaledBudget(60_000),
);
