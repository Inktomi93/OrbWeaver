// @subject tooling/src/floor/code-facts/semantic-inventory-loader.ts
import { join } from "node:path";
import { StatementSync } from "node:sqlite";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { vi } from "vitest";
import { readInventoryFacts } from "../../../../tooling/src/floor/code-facts/semantic-inventory-loader.ts";
import { inventoryExportsOf } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { initialize, readerFixture } from "./semantic-inventory-reader-fixture.ts";

function countStatements<T>(work: () => T): { readonly value: T; readonly statements: number } {
  let statements = 0;
  const { get, all, iterate } = StatementSync.prototype;
  const spies = [
    vi.spyOn(StatementSync.prototype, "get").mockImplementation(function (this: StatementSync, ...args) {
      statements++;
      return get.apply(this, args);
    }),
    vi.spyOn(StatementSync.prototype, "all").mockImplementation(function (this: StatementSync, ...args) {
      statements++;
      return all.apply(this, args);
    }),
    vi.spyOn(StatementSync.prototype, "iterate").mockImplementation(function (this: StatementSync, ...args) {
      statements++;
      return iterate.apply(this, args);
    }),
  ];
  try {
    return { value: work(), statements };
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
}

test("a pinned reader session answers repeated keys without asking SQLite again and refuses after disposal", ({ scratch }) => {
  initialize(scratch);
  using reader = readerFixture(scratch);
  const source = reader.sourceCorpus().getSourceFile("a.ts");
  const declaration = source?.getVariableDeclarationOrThrow("a");
  if (source === undefined || declaration === undefined) {
    throw new Error("pinned session fixture source missing");
  }
  const ask = (): unknown => ({ exports: [...reader.exports(source).keys()], symbols: reader.symbols(declaration) });
  const first = countStatements(ask);
  const repeated = countStatements(() => Array.from({ length: 20 }, ask));
  expect(first.statements).toBeGreaterThan(0);
  expect(repeated.statements).toBe(0);
  expect(repeated.value).toStrictEqual(Array.from({ length: 20 }, () => first.value));
  reader[Symbol.dispose]();
  // Disposal forgets the captured syntax, so a retained answer cannot outlive its session through either door.
  expect(() => reader.symbols(declaration)).toThrow("removed or forgotten");
  expect(() => reader.sourceCorpus().getSourceFile("a.ts")).toThrow("disposed");
});

test("a batched family read asks the same statements for many keys as for one and answers absent keys as absent", ({ scratch }) => {
  initialize(scratch);
  using reader = readerFixture(scratch);
  using db = openInventoryDatabase(join(scratch, ".cache/reader-fixture.sqlite"));
  const stored = readInventoryGeneration(db, reader.generation).find((row) => row.program === "tsconfig.a.json");
  if (stored === undefined) {
    throw new Error("batched read fixture partition missing");
  }
  const file = join(scratch, "a.ts");
  const one = countStatements(() => readInventoryFacts(db, inventoryExportsOf, stored.id, [file]));
  const many = countStatements(() => readInventoryFacts(db, inventoryExportsOf, stored.id, [file, join(scratch, "b.ts"), file, join(scratch, "absent.ts")]));
  expect(many.statements).toBe(one.statements);
  expect(many.value).toStrictEqual([one.value[0], undefined, one.value[0], undefined]);
  expect(one.value[0]?.map(({ name }) => name)).toStrictEqual(["a"]);
});

test("a borrowed reader session rereads live rows on every call", ({ scratch }) => {
  initialize(scratch);
  using pinned = readerFixture(scratch);
  using db = openInventoryDatabase(join(scratch, ".cache/reader-fixture.sqlite"));
  using borrowed = inventoryReader(scratch, pinned.generation, readInventoryGeneration(db, pinned.generation), { db, dispose: () => undefined });
  const source = borrowed.sourceCorpus().getSourceFile("a.ts");
  if (source === undefined) {
    throw new Error("borrowed session fixture source missing");
  }
  // The first call also materializes the declaration's carrier source; compare two steady-state calls.
  borrowed.exports(source);
  const first = countStatements(() => [...borrowed.exports(source).keys()]);
  const second = countStatements(() => [...borrowed.exports(source).keys()]);
  expect(second.value).toStrictEqual(first.value);
  expect(first.statements).toBeGreaterThan(0);
  expect(second.statements).toBe(first.statements);
});
