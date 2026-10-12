// Write-chain subject controls in BOTH directions, and the middle answer is the point: `resolved(node)` is
// the table this chain names, `resolved(null)` is the honest NEGATIVE fact "there is no Drizzle write verb
// in this chain at all", and `unresolved` is a write verb the reader FOUND and could not follow. A consumer
// fails closed on the third and stays silent on the second, so collapsing them is exactly how an aliased or
// computed table walks past a column invariant — and only an independent pin holds that apart. The reader's
// one consumer (`gates/freeze-provenance-write-pairing.ts`) covers it transitively through its own rows;
// this file is the reader's own, so the boundary survives a change to that policy.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node, SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import { readDrizzleWriteTable } from "../../../../tooling/src/floor/code-facts/drizzle-write-chain.ts";

// The write verbs are drizzle's only when drizzle-orm declares them, so every fixture carries a drizzle module.
const DRIZZLE_SOURCE =
  "export declare class Db {\n  insert(table: unknown): Db;\n  update(table: unknown): Db;\n  delete(table: unknown): Db;\n  where(condition: unknown): Db;\n" +
  "  values(value: object): Db;\n  set(value: object): Db;\n}\n";
const PRELUDE = 'import { messageVariants } from "@orb/db";\nimport type { Db } from "drizzle-orm";\ndeclare const db: Db;\n';

function sourceOf(files: Readonly<Record<string, string>>, entry = "use.ts"): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/node_modules/drizzle-orm/index.ts", DRIZZLE_SOURCE);
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, source);
  }
  return project.getSourceFileOrThrow(`/repo/${entry}`);
}

function one(code: string): SourceFile {
  return sourceOf({ "use.ts": `${PRELUDE}${code}` });
}

/** The node a policy hands this reader: the RECEIVER of the write method (`x` in `x.set({…})`). */
function receiver(sf: SourceFile, name = "receiver"): Node {
  return sf.getVariableDeclarationOrThrow(name).getInitializerOrThrow();
}

function table(node: Node): string {
  const fact = readDrizzleWriteTable(node);
  if (fact.kind === "unresolved") {
    throw new Error(`expected a resolved table, got ${fact.reason}: ${fact.detail}`);
  }
  return fact.value === null ? "<no-write-chain>" : fact.value.getText();
}

function refusal(node: Node): { readonly reason: string; readonly detail: string } {
  const fact = readDrizzleWriteTable(node);
  if (fact.kind === "resolved") {
    throw new Error(`expected a refusal, got ${fact.value === null ? "<no-write-chain>" : fact.value.getText()}`);
  }
  return { reason: fact.reason, detail: fact.detail };
}

test("reads the table off `update` and `insert`, through any number of intervening chain links", () => {
  const sf = one(
    "export const receiver = db.update(messageVariants).where(cond);\n" +
      "export const inserted = db.insert(messageVariants).values({ id: 1 });\n" +
      "export const deep = db.update(messageVariants).where(cond).where(other);\n",
  );

  expect([table(receiver(sf)), table(receiver(sf, "inserted")), table(receiver(sf, "deep"))]).toEqual([
    "messageVariants",
    "messageVariants",
    "messageVariants",
  ]);
});

test("follows a hoisted builder local and a same-module factory that returns one", () => {
  const sf = one(
    "const q = db.update(messageVariants);\nexport const receiver = q;\n" +
      "function builder() {\n  return db.insert(messageVariants);\n}\nexport const viaFactory = builder();\n",
  );

  expect([table(receiver(sf)), table(receiver(sf, "viaFactory"))]).toEqual(["messageVariants", "messageVariants"]);
});

test("follows a factory through its IMPORT, and a wrapper that carries the builder in an ARGUMENT", () => {
  const sf = sourceOf({
    "b.ts":
      'import { messageVariants } from "@orb/db";\nimport type { Db } from "drizzle-orm";\ndeclare const db: Db;\nexport const updater = () => db.update(messageVariants);\n',
    "use.ts": `${PRELUDE}import { updater } from "./b.ts";\nexport const receiver = updater();\nexport const wrapped = run(db.update(messageVariants));\n`,
  });

  expect([table(receiver(sf)), table(receiver(sf, "wrapped"))]).toEqual(["messageVariants", "messageVariants"]);
});

test("hands the table argument back UNJUDGED — a member expression and an alias are the CALLER's law", () => {
  const sf = one("export const receiver = db.update(messageVariants.id);\nexport const computed = db.update(TABLES[k]);\n");

  expect([table(receiver(sf)), table(receiver(sf, "computed"))]).toEqual(["messageVariants.id", "TABLES[k]"]);
});

test("`delete` names a table but writes no columns, so it is NOT a write chain", () => {
  const sf = one("export const receiver = db.delete(messageVariants).where(cond);\n");

  expect(table(receiver(sf))).toBe("<no-write-chain>");
});

test("a foreign `.set` chain resolves to NO WRITE CHAIN rather than to a refusal", () => {
  const sf = one(
    "export function counter(m: Map<string, number>) {\n  return m;\n}\nexport const receiver = counter(new Map());\nexport const fluent = api.query(x);\n",
  );

  expect([table(receiver(sf)), table(receiver(sf, "fluent"))]).toEqual(["<no-write-chain>", "<no-write-chain>"]);
});

test("a verb on an object drizzle does not declare is NO WRITE CHAIN, and a receiver the checker cannot bind is a refusal", () => {
  const sf = one(
    "declare const store: { update(table: unknown): { set(value: object): void } };\nexport const receiver = store.update(messageVariants);\n" +
      "declare const unbound: Mystery;\nexport const unknown = unbound.update(messageVariants);\n",
  );

  expect(table(receiver(sf))).toBe("<no-write-chain>");
  expect(refusal(receiver(sf, "unknown")).reason).toBe("missing");
});

test("REFUSES a write verb that names no table at all", () => {
  const sf = one("export const receiver = db.update();\n");

  expect(refusal(receiver(sf))).toEqual({ reason: "missing", detail: expect.stringContaining("names no table") });
});

test("REFUSES a factory declared in an external package rather than assuming it holds no builder", () => {
  const sf = sourceOf({ "use.ts": `${PRELUDE}import { updater } from "some-package";\nexport const receiver = updater();\n` });

  expect(refusal(receiver(sf)).reason).toBe("unsupported");
});

test("REFUSES a self-referential factory instead of looping", () => {
  const sf = one("function loop(): unknown {\n  return loop();\n}\nexport const receiver = loop();\n");

  expect(refusal(receiver(sf)).reason).toBe("cycle");
});
