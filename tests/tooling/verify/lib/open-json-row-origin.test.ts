// Promise identity is a wrapper/owner fact, not proof that a value was loaded from storage.
// The JSON-write policy separately proves actual Drizzle producer bodies.

import { resolveModuleMemberOrigin } from "@orb/tooling/_shared/reference-fact";
import type { Expression, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { schemaRowOriginIdentity } from "../../../../tooling/src/verify/lib/open-json-row-origin.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function rowCall(
  options: { readonly augment?: boolean; readonly awaited?: boolean; readonly foreign?: string; readonly noLib?: boolean; readonly result?: string } = {},
): { readonly table: SourceFile; readonly call: Expression } {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: options.noLib === true ? { noLib: true } : { lib: ["lib.es2022.d.ts"] },
  });
  const table = project.createSourceFile(
    "/promise-row/table.ts",
    "export declare const records: { readonly $inferSelect: { selection: { fields: string[] } } };\n",
  );
  if (options.augment === true) {
    project.createSourceFile(
      "/promise-row/reset.d.ts",
      "interface Promise<T> { catch<TResult = never>(rejected?: (reason: unknown) => TResult): Promise<T | TResult> }\n",
    );
  }
  if (options.noLib === true) {
    project.createSourceFile("/promise-row/fake.d.ts", "interface Promise<T> { readonly value: T }\n");
  }
  const source = project.createSourceFile(
    "/promise-row/read.ts",
    [
      'import { records } from "./table.ts";',
      options.foreign ?? "",
      "type Row = typeof records.$inferSelect;",
      `declare function load(): Promise<${options.result ?? "Row | undefined"}>;`,
      options.awaited === true ? "async function read() { const pending = await load(); return pending; }" : "const pending = load();",
    ].join("\n"),
  );
  const pending = source.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((declaration) => declaration.getName() === "pending");
  if (pending === undefined) {
    throw new Error("fixture has no pending read");
  }
  return { table, call: pending.getInitializerOrThrow() };
}

function rowOwnerMatches(options: Parameters<typeof rowCall>[0] = {}): boolean {
  const { table, call } = rowCall(options);
  const reference = schemaRowOriginIdentity(call);
  expect(reference).toBeDefined();
  if (reference === undefined) {
    throw new Error("missing row owner");
  }
  const owner = resolveModuleMemberOrigin(reference);
  expect(owner.kind).toBe("resolved");
  if (owner.kind !== "resolved" || owner.value.canonical.kind !== "project") {
    throw new Error("row owner has no canonical project declaration");
  }
  return owner.value.canonical.declaration.compilerNode === table.getVariableDeclarationOrThrow("records").compilerNode;
}

test("a real library Promise preserves the row owner and undefined absence arm", () => {
  expect(rowOwnerMatches()).toBe(true);
});

test("the same trusted Promise remains recognized with a merged catch augmentation", () => {
  expect(rowOwnerMatches({ augment: true })).toBe(true);
});

test("an awaited augmented Promise checks the same canonical return-annotation owner", () => {
  expect(rowOwnerMatches({ augment: true, awaited: true })).toBe(true);
});

test.each([
  "interface Promise<T> { readonly value: T }",
  "class Promise<T> { declare readonly value: T }",
])("a foreign same-named Promise refuses: %s", (foreign) => {
  const { call } = rowCall({ foreign });
  expect(() => schemaRowOriginIdentity(call)).toThrow("cannot prove schema-row origin of mixed read");
});

test("an untrusted ambient Promise without a library anchor refuses", () => {
  const { call } = rowCall({ noLib: true });
  expect(() => schemaRowOriginIdentity(call)).toThrow("cannot prove schema-row origin of mixed read");
});

test("a standard Promise does not acquit a mixed row/payload union", () => {
  const { call } = rowCall({ result: 'Row | { kind: "payload"; selection: { fields: string[] } }' });
  expect(() => schemaRowOriginIdentity(call)).toThrow("cannot prove schema-row origin of mixed read");
});

test("a Promise carrying only absence has no schema-row owner", () => {
  const { call } = rowCall({ result: "undefined" });
  expect(schemaRowOriginIdentity(call)).toBeUndefined();
});
