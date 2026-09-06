// The Drizzle client's identity is the called METHOD's declaration home, because the handle itself is a
// PARAMETER with no module-member origin. Both directions are planted: a receiver that is not named `db`
// still resolves, a same-named method on a local class does NOT, and a receiver the checker cannot bind
// answers `unresolved` — never "foreign", which the caller would read as innocence.
import { Project, SyntaxKind } from "ts-morph";
import { readDrizzleClientCall } from "../../../../tooling/src/verify/lib/drizzle-client-call.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
const DRIZZLE_MODULE = "node_modules/drizzle-orm/index.ts";
const DRIZZLE_SOURCE =
  "export declare class Db {\n  select(): Db;\n  insert(table: unknown): Promise<void>;\n  from(table: unknown): Promise<readonly unknown[]>;\n  query: { readonly chats: { findMany(): Promise<readonly unknown[]> } };\n}\n";

/** The call whose CALLEE text carries `needle` — never an index, which in the local-class fixture picks
 *  `Promise.resolve()` from the method body instead of the call under test. */
function callIn(files: Readonly<Record<string, string>>, path: string, needle: string): import("ts-morph").CallExpression {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [file, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${file}`, source);
  }
  const calls = project.getSourceFileOrThrow(`${ROOT}/${path}`).getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.find((candidate) => candidate.getExpression().getText().includes(needle));
  if (call === undefined) {
    throw new Error(`no call whose callee carries ${needle} in ${path}`);
  }
  return call;
}

test("a query method declared inside drizzle-orm is the client, whatever the receiver is named", () => {
  const verdict = readDrizzleClientCall(
    callIn(
      {
        [DRIZZLE_MODULE]: DRIZZLE_SOURCE,
        "use.ts": 'import type { Db } from "drizzle-orm";\nexport const w = (deps: { readonly handle: Db }): Promise<void> => deps.handle.insert({});\n',
      },
      "use.ts",
      "handle.insert",
    ),
  );

  expect(verdict).toMatchObject({ kind: "drizzle", method: "insert" });
});

test("the bracket spelling names the same method", () => {
  const verdict = readDrizzleClientCall(
    callIn(
      {
        [DRIZZLE_MODULE]: DRIZZLE_SOURCE,
        "use.ts": 'import type { Db } from "drizzle-orm";\nexport const w = (db: Db): Promise<void> => db["insert"]({});\n',
      },
      "use.ts",
      "insert",
    ),
  );

  expect(verdict).toMatchObject({ kind: "drizzle", method: "insert" });
});

test("the relational query API resolves too — no verb vocabulary is consulted", () => {
  const verdict = readDrizzleClientCall(
    callIn(
      {
        [DRIZZLE_MODULE]: DRIZZLE_SOURCE,
        "use.ts": 'import type { Db } from "drizzle-orm";\nexport const r = (db: Db): Promise<readonly unknown[]> => db.query.chats.findMany();\n',
      },
      "use.ts",
      "findMany",
    ),
  );

  expect(verdict).toMatchObject({ kind: "drizzle", method: "findMany" });
});

test("THE COUNTERFACTUAL — a same-named method on a LOCAL class is foreign, with drizzle loaded alongside", () => {
  const verdict = readDrizzleClientCall(
    callIn(
      {
        [DRIZZLE_MODULE]: DRIZZLE_SOURCE,
        "use.ts":
          "export class Cache {\n  insert(value: unknown): Promise<void> {\n    void value;\n    return Promise.resolve();\n  }\n}\nexport const w = (cache: Cache): Promise<void> => cache.insert({});\n",
      },
      "use.ts",
      "cache.insert",
    ),
  );

  expect(verdict).toMatchObject({ kind: "foreign", method: "insert" });
});

test("a receiver with no named property symbol is UNRESOLVED and still carries its anchor", () => {
  // An index-signature receiver — the untyped seam a real handle hides behind. `declarations.length === 0`,
  // so the reader refuses rather than answering "foreign", and it hands back the authored token anyway so a
  // fail-closed caller can still anchor a finding.
  const verdict = readDrizzleClientCall(
    callIn({ "use.ts": "export const w = (db: Record<string, (t: unknown) => Promise<void>>): Promise<void> => db.insert({});\n" }, "use.ts", "db.insert"),
  );

  expect(verdict.kind).toBe("unresolved");
  expect(verdict.kind === "unresolved" ? verdict.method : null).toBe("insert");
  expect(verdict.kind === "unresolved" ? verdict.nameNode?.getText() : null).toBe("insert");
});

test("a callee that is not a member read at all is UNRESOLVED with no method", () => {
  const verdict = readDrizzleClientCall(
    callIn({ "use.ts": "declare function run(): Promise<void>;\nexport const w = (): Promise<void> => run();\n" }, "use.ts", "run"),
  );

  expect(verdict.kind).toBe("unresolved");
  expect(verdict.kind === "unresolved" ? verdict.method : "unset").toBeNull();
});
