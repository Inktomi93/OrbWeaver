import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { resolveGlobalMemberOrigin } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type { GlobalMemberOrigin, ReferenceFact } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
import { createSemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory.ts";
import type { InventoryNativeQuery, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { DEFAULT_INVENTORY_FAMILIES } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { inventoryString } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { extractInventoryPartition } from "../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts";
import { inventoryFileSystem } from "../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts";
import { runInventoryPartitionWorker } from "../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { nativeTypeFactSession } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SOURCE = "tests/server/globals.test.ts";
// eslint-disable-next-line orb/test-ambient-source-string -- This global-origin fixture is parsed into compiler worlds, never executed; remove with these origin controls.
const TEXT = `const D=Date; const CTOR=D;
const KEY='now'; export const now=D[KEY]();
export const draw=Math.random();
export const date=new CTOR();
export const absent=MISSING;
let written=Date; written=Date; export const unstable=written.now();
const LEFT=RIGHT;const RIGHT=LEFT;export const cycle=LEFT.now();
function shadow(Date:{now():number}){return Date.now();}
`;

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [], lib: ["es2022"] },
      files: [SOURCE, "augment.d.ts"],
    }),
  );
  write("augment.d.ts", "export {};declare global{interface Math{inspectionOnly:boolean;}}");
  write(SOURCE, TEXT);
  execFixtureGit(root, ["init", "-q"]);
}
function span(node: MorphNode): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}
function snapshot(fact: ReferenceFact<GlobalMemberOrigin>): object {
  return {
    trace: { origin: span(fact.trace.origin), declarations: fact.trace.declarations.map(span) },
    result:
      fact.kind === "resolved"
        ? { kind: fact.kind, globalName: fact.value.globalName, memberPath: fact.value.memberPath, declarations: fact.value.declarations.map(span) }
        : { kind: fact.kind, reason: fact.reason, detail: fact.detail, node: span(fact.node) },
  };
}

test(
  "native global origins retain implicit libs, augmentation, aliases and exact refusal traces",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
    const source = createSemanticWorkspace({ root: scratch }).program("tsconfig.json")?.sourceFile(SOURCE);
    if (descriptor === undefined || source === undefined) {
      throw new Error("native global source is missing");
    }
    const callees = [...source.getDescendantsOfKind(SyntaxKind.CallExpression), ...source.getDescendantsOfKind(SyntaxKind.NewExpression)].map((node) =>
      node.getExpression(),
    );
    const identifiers = source.getDescendantsOfKind(SyntaxKind.Identifier);
    const query = (node: MorphNode): InventoryNativeQuery => ({ program: descriptor.id, node: span(node) });
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["global-origins"] as const,
      globalOriginQueries: callees.map(query),
      globalBindingQueries: identifiers.map(query),
    };
    using inventory = createSemanticInventory(options);
    expect(DEFAULT_INVENTORY_FAMILIES).not.toContain("global-origins");
    expect(callees.map((node) => snapshot(inventory.globalOrigin(node, descriptor.id)))).toEqual(
      callees.map((node) => snapshot(resolveGlobalMemberOrigin(node))),
    );
    const first = callees[0];
    const math = callees.find((node) => node.getText() === "Math.random");
    const missing = identifiers.find((node) => node.getText() === "MISSING");
    if (first === undefined || math === undefined || missing === undefined) {
      throw new Error("native global controls are missing");
    }
    const ambient = inventory.globalOrigin(math, descriptor.id);
    expect(ambient.kind).toBe("resolved");
    expect(ambient.trace.declarations.some((node) => node.getSourceFile().getFilePath().includes("/node_modules/typescript/lib/lib."))).toBe(true);
    expect(ambient.trace.declarations.some((node) => node.getSourceFile().getFilePath() === join(scratch, "augment.d.ts"))).toBe(true);
    expect(inventory.globalBinding(missing, descriptor.id)).toEqual([]);
    expect(() => inventory.symbols(first)).toThrow("family unavailable: bindings");
    const syntax = new Project({ useInMemoryFileSystem: true });
    const replay = syntax.createSourceFile(join(scratch, SOURCE), TEXT);
    const replayCallee = replay.getDescendantsOfKind(SyntaxKind.CallExpression)[0]?.getExpression();
    if (replayCallee === undefined) {
      throw new Error("native global replay is missing");
    }
    const fact = inventory.globalOrigin(replayCallee, descriptor.id);
    expect(
      fact.trace.declarations.filter((node) => node.getSourceFile().getFilePath() === replay.getFilePath()).every((node) => node.getSourceFile() === replay),
    ).toBe(true);
    expect(() => inventory.globalOrigin(first, "foreign")).toThrow("partition is unavailable");
    const resolve = vi.spyOn(await import("../../../../tooling/src/floor/code-facts/reference-fact.ts"), "resolveGlobalMemberOrigin");
    try {
      const partition = extractInventoryPartition({
        root: scratch,
        descriptor,
        families: ["global-origins"],
        globalOriginQueries: [span(first)],
        globalBindingQueries: [span(missing)],
        destination: join(scratch, "unused.sqlite"),
      });
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(partition.globalOrigins).toHaveLength(1);
      expect(partition.bindings).toEqual([{ node: span(missing), symbols: { lexical: [], origins: [] } }]);
      expect(partition.families).toEqual(["global-origins"]);
      expect(partition.roots).toEqual(descriptor.files.map((path) => join(scratch, path)));
      expect(partition.available).toEqual(partition.sources.map(({ file }) => file));
    } finally {
      resolve.mockRestore();
    }
    replay.replaceWithText(`${TEXT}\nexport const changed=1;`);
    expect(() => inventory.globalOrigin(replay, "tsconfig.json")).toThrow("source/epoch");
  },
  scaledBudget(60_000),
);

test(
  "closed global binding demand cannot impersonate full bindings or lose pinned overlay ownership",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
    const source = createSemanticWorkspace({ root: scratch }).program("tsconfig.json")?.sourceFile(SOURCE);
    const callee = source?.getDescendantsOfKind(SyntaxKind.CallExpression)[0]?.getExpression();
    const identifiers = source?.getDescendantsOfKind(SyntaxKind.Identifier);
    const first = identifiers?.[0];
    const second = identifiers?.[1];
    if (descriptor === undefined || source === undefined || callee === undefined || first === undefined || second === undefined) {
      throw new Error("native global demand is missing");
    }
    const query = (node: MorphNode): InventoryNativeQuery => ({ program: descriptor.id, node: span(node) });
    const options = { root: scratch, programs: [descriptor], families: ["global-origins"] as const, globalOriginQueries: [query(callee)] };
    using before = createSemanticInventory({ ...options, globalBindingQueries: [query(first)] });
    expect(() => before.globalBinding(second, descriptor.id)).toThrow("binding span is unavailable");
    using expanded = createSemanticInventory({ ...options, globalBindingQueries: [query(first), query(second)] });
    using reused = createSemanticInventory({ ...options, globalBindingQueries: [query(second), query(first)] });
    expect(expanded.generation).toBeGreaterThan(before.generation);
    expect(reused.generation).toBe(expanded.generation);
    using complete = createSemanticInventory({ root: scratch, programs: [descriptor], families: ["bindings"] });
    expect(complete.generation).toBeGreaterThan(expanded.generation);
    expect(complete.symbols(first).lexical).toHaveLength(1);
    using mixed = createSemanticInventory({ ...options, families: ["bindings", "global-origins"], globalBindingQueries: [query(first)] });
    expect(mixed.symbols(second)).toEqual(complete.symbols(second));
    expect(mixed.globalBinding(first, descriptor.id)).toHaveLength(1);
    expect(() => before.symbols(first)).toThrow("family unavailable: bindings");
    const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
      root: scratch,
      files: [{ path: join(scratch, SOURCE), text: TEXT.replace("D=Date", "D=Math") }],
      deleted: [],
    });
    using overlay = createSemanticInventory({ ...options, globalBindingQueries: [query(first)], fileSystem, overlay: { addedPaths: [], deletedPaths: [] } });
    const overlaySource = overlay.sourceCorpus().getSourceFile(SOURCE);
    const overlayCallee = overlaySource?.getDescendantsOfKind(SyntaxKind.CallExpression)[0]?.getExpression();
    if (overlayCallee === undefined) {
      throw new Error("native global overlay is missing");
    }
    expect(overlay.globalOrigin(overlayCallee, descriptor.id)).toMatchObject({ kind: "unresolved" });
    expect(before.globalOrigin(callee, descriptor.id)).toMatchObject({ kind: "resolved", value: { globalName: "Date" } });
    expect(() =>
      createSemanticInventory({
        ...options,
        globalBindingQueries: identifiers?.map(query) ?? [],
        buildPartition: () => {
          throw new Error("failed global worker");
        },
      }),
    ).toThrow("failed global worker");
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(latestInventoryGeneration(db)).toBe(mixed.generation);
    expect(() => createSemanticInventory({ ...options })).toThrow("require closed demand");
    before[Symbol.dispose]();
    expect(() => before.globalBinding(first, descriptor.id)).toThrow("disposed");
  },
  scaledBudget(60_000),
);

test(
  "global origin and normalized binding corruption refuse before reading or publication",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
    const source = createSemanticWorkspace({ root: scratch }).program("tsconfig.json")?.sourceFile(SOURCE);
    const callee = source?.getDescendantsOfKind(SyntaxKind.CallExpression)[0]?.getExpression();
    const binding = source?.getVariableDeclaration("D")?.getNameNode();
    if (descriptor === undefined || source === undefined || callee === undefined || binding === undefined) {
      throw new Error("native global corruption control is missing");
    }
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["global-origins"] as const,
      globalOriginQueries: [{ program: descriptor.id, node: span(callee) }],
      globalBindingQueries: [{ program: descriptor.id, node: span(binding) }],
    };
    using before = createSemanticInventory(options);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partition = readInventoryGeneration(db, before.generation)[0];
    if (partition === undefined) {
      throw new Error("native global corruption partition is missing");
    }
    using stored = inventoryReader(scratch, before.generation, [partition], { db, dispose: () => undefined });
    for (const [sql, read, message] of [
      [
        "DELETE FROM inventory_global_origin WHERE partition=?",
        (): ReferenceFact<GlobalMemberOrigin> => stored.globalOrigin(callee, descriptor.id),
        "origin span is unavailable",
      ],
      [
        "DELETE FROM inventory_global_declaration WHERE partition=?",
        (): ReferenceFact<GlobalMemberOrigin> => stored.globalOrigin(callee, descriptor.id),
        "declarations are incomplete",
      ],
      [
        "DELETE FROM inventory_global_member WHERE partition=?",
        (): ReferenceFact<GlobalMemberOrigin> => stored.globalOrigin(callee, descriptor.id),
        "member path is incomplete",
      ],
      [
        "DELETE FROM inventory_global_binding WHERE partition=?",
        (): readonly MorphNode[] => stored.globalBinding(binding, descriptor.id),
        "binding span is unavailable",
      ],
      [
        "DELETE FROM inventory_fact WHERE partition=? AND kind='bindings'",
        (): readonly MorphNode[] => stored.globalBinding(binding, descriptor.id),
        "binding record is unavailable",
      ],
      [
        "DELETE FROM inventory_declaration WHERE partition=? AND kind='bindings'",
        (): readonly MorphNode[] => stored.globalBinding(binding, descriptor.id),
        "binding declarations are incomplete",
      ],
    ] as const) {
      db.exec("BEGIN IMMEDIATE;PRAGMA defer_foreign_keys=ON;");
      try {
        db.prepare(sql).run(partition.id);
        expect(read).toThrow(message);
      } finally {
        db.exec("ROLLBACK");
      }
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        "UPDATE inventory_span SET file=? WHERE partition=? AND ordinal=(SELECT node FROM inventory_global_declaration WHERE partition=? AND role='value' ORDER BY ordinal LIMIT 1)",
      ).run(inventoryString("/foreign/lib.d.ts"), partition.id, partition.id);
      expect((): ReferenceFact<GlobalMemberOrigin> => stored.globalOrigin(callee, descriptor.id)).toThrow("outside its native closure");
    } finally {
      db.exec("ROLLBACK");
    }
    for (const [table, message] of [
      ["inventory_global_origin", "incomplete global-origin/binding coverage"],
      ["inventory_global_binding", "incomplete global-origin/binding coverage"],
      ["inventory_fact", "binding record is unavailable"],
    ] as const) {
      const databasePath = join(scratch, `${table}.sqlite`);
      expect(() =>
        createSemanticInventory({
          ...options,
          databasePath,
          buildPartition: (request) => {
            runInventoryPartitionWorker(request);
            using staging = openInventoryDatabase(request.destination);
            staging.exec("PRAGMA foreign_keys=OFF");
            staging.exec(`DELETE FROM ${table}`);
          },
        }),
      ).toThrow(message);
      using failed = openInventoryDatabase(databasePath);
      expect(latestInventoryGeneration(failed)).toBe(0);
    }
    const acquire = vi.fn((): never => {
      throw new Error("global reader failed");
    });
    using session = nativeTypeFactSession(acquire);
    session.request("owner", { kind: "global-origins", nodes: [callee] });
    session.request("owner", { kind: "global-bindings", nodes: [binding] });
    expect(() => session.globalBindings("owner", [binding])).toThrow("must be sealed");
    session.seal(new Set(["owner"]));
    expect(() => session.globalBindings("foreign", [binding])).toThrow("not registered by this owner");
    expect(() => session.globalOrigins("owner", [callee])).toThrow("global reader failed");
    expect(() => session.globalBindings("owner", [binding])).toThrow("global reader failed");
    expect(acquire).toHaveBeenCalledTimes(1);
    session[Symbol.dispose]();
    expect(() => session.globalOrigins("owner", [callee])).toThrow("disposed");
  },
  scaledBudget(60_000),
);
