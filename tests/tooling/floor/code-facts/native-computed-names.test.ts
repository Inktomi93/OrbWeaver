import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { computedNameNeedsBindings, referenceResolutionServices } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import type { ReferenceFact } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";
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
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { nativeTypeFactSession } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";

const SOURCE = "tests/server/keys.test.ts";
const TEXT = `import {KEY as IMPORTED} from './key';
declare const object:Record<string,object>;
const CONST='only'; const ALIAS=CONST; let LET='each';
object[CONST]; object[ALIAS]; object[LET]; object[IMPORTED];
object['literal']; object[(-1)]; object[+(2)]; object[void 0];
let WRITE='only'; WRITE='describe'; object[WRITE];
const LEFT=RIGHT; const RIGHT=LEFT; object[LEFT];
function AMBIG(){} namespace AMBIG{export const value=1;} object[AMBIG];
object[MISSING]; object[getKey()];
function shadow(){const CONST='skip';object[CONST];}
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
      files: [SOURCE, "tests/server/key.ts"],
    }),
  );
  write("tests/server/key.ts", "export const KEY='imported';");
  write(SOURCE, TEXT);
  execFixtureGit(root, ["init", "-q"]);
}

function span(node: MorphNode): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function snapshot(fact: ReferenceFact<string>): object {
  return {
    trace: { origin: span(fact.trace.origin), declarations: fact.trace.declarations.map(span) },
    result:
      fact.kind === "resolved" ? { kind: fact.kind, value: fact.value } : { kind: fact.kind, reason: fact.reason, detail: fact.detail, node: span(fact.node) },
  };
}

test(
  "native computed names preserve scalar/refusal traces, stable bindings, imports and shadows",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
    const source = createSemanticWorkspace({ root: scratch }).program("tsconfig.json")?.sourceFile(SOURCE);
    if (descriptor === undefined || source === undefined) {
      throw new Error("computed-name native source is missing");
    }
    const keys = source
      .getDescendantsOfKind(SyntaxKind.ElementAccessExpression)
      .map((node) => node.getArgumentExpression())
      .filter((node) => node !== undefined);
    const requests = keys.map((node) => ({ program: descriptor.id, node: span(node) }));
    using inventory = nativeInventoryFixture({ root: scratch, programs: [descriptor], families: ["computed-names"], computedNameQueries: requests });
    expect(DEFAULT_INVENTORY_FAMILIES).not.toContain("computed-names");
    const syntax = new Project({ useInMemoryFileSystem: true });
    const replay = syntax.createSourceFile(join(scratch, SOURCE), TEXT);
    const expected = keys.map((key) => snapshot(referenceResolutionServices.readComputedName(key)));
    const replayChecks: boolean[] = [];
    const actual = keys.map((key) => {
      const target = replay.getDescendantAtPos(key.getStart());
      const node = [target, ...(target?.getAncestors() ?? [])].find(
        (candidate) => candidate?.getStart() === key.getStart() && candidate.getEnd() === key.getEnd() && candidate.getKind() === key.getKind(),
      );
      if (node === undefined) {
        throw new Error("computed-name replay span is missing");
      }
      const fact = inventory.computedName(node, descriptor.id);
      for (const traceNode of [fact.trace.origin, ...fact.trace.declarations]) {
        if (traceNode.getSourceFile().getFilePath() === replay.getFilePath()) {
          replayChecks.push(traceNode.getSourceFile() === replay && traceNode.getProject() === syntax);
        }
      }
      return snapshot(fact);
    });
    expect(actual).toEqual(expected);
    expect(replayChecks.length).toBeGreaterThan(0);
    expect(replayChecks.every(Boolean)).toBe(true);
    const facts = keys.map((key) => inventory.computedName(key, descriptor.id));
    expect(facts.filter((fact) => fact.kind === "resolved").map((fact) => fact.value)).toEqual([
      "only",
      "only",
      "each",
      "imported",
      "literal",
      "-1",
      "2",
      "skip",
    ]);
    expect(facts.filter((fact) => fact.kind === "unresolved").map((fact) => fact.reason)).toEqual([
      "dynamic",
      "write",
      "cycle",
      "ambiguous",
      "dynamic",
      "dynamic",
    ]);
    const symbolFor = Node.prototype.getSymbol;
    const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: MorphNode) {
      if (this.getProject() === syntax) {
        throw new Error("primitive computed name read a syntax symbol");
      }
      return symbolFor.call(this);
    });
    try {
      const primitive = replay
        .getDescendantsOfKind(SyntaxKind.ElementAccessExpression)
        .map((node) => node.getArgumentExpression())
        .filter((node) => node !== undefined)
        .filter((node) => !computedNameNeedsBindings(node));
      expect(primitive.map((node) => referenceResolutionServices.readComputedName(node).kind)).toEqual([
        "resolved",
        "resolved",
        "resolved",
        "unresolved",
        "unresolved",
      ]);
    } finally {
      symbols.mockRestore();
    }
    const imported = keys.find((key) => key.getText() === "IMPORTED");
    if (imported === undefined) {
      throw new Error("computed-name imported key is missing");
    }
    source.getProject().getSourceFileOrThrow(join(scratch, "tests/server/key.ts")).replaceWithText("export const KEY='stale';");
    expect(() => inventory.computedName(imported, descriptor.id)).toThrow("replay source/epoch is stale");
  },
  scaledBudget(60_000),
);

test(
  "computed-name demand, publication, pinned overlays and corrupted evidence refuse incomplete ownership",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
    const source = createSemanticWorkspace({ root: scratch }).program("tsconfig.json")?.sourceFile(SOURCE);
    const keys = source
      ?.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)
      .map((node) => node.getArgumentExpression())
      .filter((node) => node !== undefined);
    const [first, second] = keys ?? [];
    if (descriptor === undefined || source === undefined || first === undefined || second === undefined) {
      throw new Error("computed-name demand is missing");
    }
    const options = { root: scratch, programs: [descriptor], families: ["computed-names"] as const };
    const firstQuery = { program: descriptor.id, node: span(first) };
    const secondQuery = { program: descriptor.id, node: span(second) };
    const resolve = vi.spyOn(referenceResolutionServices, "readComputedName");
    try {
      const partition = extractInventoryPartition({
        root: scratch,
        descriptor,
        families: ["computed-names"],
        computedNameQueries: [firstQuery.node],
        destination: join(scratch, "unused.sqlite"),
      });
      expect(partition.computedNames).toHaveLength(1);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(partition.roots).toEqual(descriptor.files.map((path) => join(scratch, path)));
    } finally {
      resolve.mockRestore();
    }
    using before = nativeInventoryFixture({ ...options, computedNameQueries: [firstQuery] });
    expect(() => before.computedName(second, descriptor.id)).toThrow("computed-name span is unavailable");
    using expanded = nativeInventoryFixture({ ...options, computedNameQueries: [firstQuery, secondQuery] });
    using reused = nativeInventoryFixture({ ...options, computedNameQueries: [secondQuery, firstQuery] });
    expect(expanded.generation).toBeGreaterThan(before.generation);
    expect(reused.generation).toBe(expanded.generation);
    const third = keys?.[2];
    if (third === undefined) {
      throw new Error("computed-name new demand is missing");
    }
    expect(() =>
      nativeInventoryFixture(
        {
          ...options,
          computedNameQueries: [firstQuery, secondQuery, { program: descriptor.id, node: span(third) }],
        },
        { failWorker: true },
      ),
    ).toThrow("injected native worker exit");
    const altered = TEXT.replace("CONST='only'", "CONST='skip'");
    using overlay = nativeInventoryFixture(
      { ...options, computedNameQueries: [firstQuery] },
      {
        projection: { root: scratch, files: [{ path: join(scratch, SOURCE), text: altered }], deleted: [] },
      },
    );
    const overlaySource = overlay.sourceCorpus().getSourceFile(SOURCE);
    const overlayKey = overlaySource?.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)[0]?.getArgumentExpression();
    if (overlayKey === undefined) {
      throw new Error("computed-name overlay key is missing");
    }
    expect(overlay.computedName(overlayKey, descriptor.id)).toMatchObject({ kind: "resolved", value: "skip" });
    expect(before.computedName(first, descriptor.id)).toMatchObject({ kind: "resolved", value: "only" });
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(latestInventoryGeneration(db)).toBe(expanded.generation);
    const partition = readInventoryGeneration(db, before.generation)[0];
    if (partition === undefined) {
      throw new Error("computed-name corruption partition is missing");
    }
    using stored = inventoryReader(scratch, before.generation, [partition], { db, dispose: () => undefined });
    for (const [sql, message] of [
      ["DELETE FROM inventory_computed_name WHERE partition=?", "computed-name span is unavailable"],
      ["DELETE FROM inventory_computed_trace WHERE partition=?", "computed-name trace is incomplete"],
    ] as const) {
      db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
      try {
        db.prepare(sql).run(partition.id);
        expect(() => stored.computedName(first, descriptor.id)).toThrow(message);
      } finally {
        db.exec("ROLLBACK");
      }
    }
    expect(() => nativeInventoryFixture(options)).toThrow("require closed demand");
    expect(() => before.computedName(first, "foreign")).toThrow("partition is unavailable");
    const acquire = vi.fn((): never => {
      throw new Error("unsealed computed-name acquisition");
    });
    using session = nativeTypeFactSession(acquire);
    session.request("owner", { kind: "computed-names", nodes: [first] });
    expect(() => session.computedNames("owner", [first])).toThrow("must be sealed");
    session.seal(new Set(["owner"]));
    expect(() => session.computedNames("other", [first])).toThrow("not registered by this owner");
    session[Symbol.dispose]();
    expect(() => session.computedNames("owner", [first])).toThrow("disposed");
    expect(acquire).not.toHaveBeenCalled();
    const failedPath = join(scratch, "failed.sqlite");
    const faults: string[] = [];
    expect(() =>
      nativeInventoryFixture(
        {
          ...options,
          computedNameQueries: [firstQuery],
          databasePath: failedPath,
        },
        { fault: "computed-coverage", faults },
      ),
    ).toThrow("incomplete computed-name coverage");
    expect(faults).toEqual(["computed-coverage"]);
    using failed = openInventoryDatabase(failedPath);
    expect(latestInventoryGeneration(failed)).toBe(0);
    source.replaceWithText(`${TEXT}\nexport const changed=1;`);
    expect(() => before.computedName(source, descriptor.id)).toThrow("source/epoch");
    before[Symbol.dispose]();
    expect(() => before.computedName(source, descriptor.id)).toThrow("disposed");
  },
  scaledBudget(60_000),
);
