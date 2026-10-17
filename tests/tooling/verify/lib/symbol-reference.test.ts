// symbol-reference.ts (#1506) — the spelling-independent reference readers, pinned. Every case below is a
// spelling that walked past a LIVE gate before this module existed (bracket access · namespace import · an
// identifier standing for a literal), and every case is asserted BESIDE its planted control — the spelling
// the gate always caught — so a reader that stops reading anything at all cannot look like a clean pass.
// The permissive direction is the dangerous one: these readers only ever WIDEN detection, and the tests
// that matter are the ones proving they still refuse a genuinely unreadable value.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import {
  importsModuleExport,
  moduleMemberReference,
  namedImportLocalNames,
  namespaceImportSpecifier,
  readsMemberNamed,
  referencesModuleExport,
} from "../../../../tooling/src/verify/lib/symbol-reference.ts";

function sourceOf(code: string): SourceFile {
  return new Project({ useInMemoryFileSystem: true }).createSourceFile("/repo/x.ts", code);
}

/** Every member access in the file, in document order — BOTH spellings, so a test cannot silently read
 *  only the family the old gates already saw. */
function accessesIn(code: string): readonly Node[] {
  const sf = sourceOf(code);
  return [...sf.getDescendants().filter((n) => n.isKind(SyntaxKind.PropertyAccessExpression) || n.isKind(SyntaxKind.ElementAccessExpression))];
}

/** The elements of the file's first array literal — the fixture shape for a "read each of these" table. */
function elementsIn(code: string): readonly Node[] {
  return sourceOf(code).getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)[0]?.getElements() ?? [];
}

test("readsMemberNamed answers a fixed vocabulary across spellings, and refuses a member outside it", () => {
  const writeVerbs = new Set(["insert", "update"]);
  expect(accessesIn('export const a = [db.insert, db["update"], db.select];\n').map((n) => readsMemberNamed(n, writeVerbs)?.name)).toEqual([
    "insert",
    "update",
    undefined,
  ]);
});

test("namespaceImportSpecifier resolves an `import * as` binding syntactically, and only that binding", () => {
  const refs = elementsIn('import * as schema from "@orb/db";\nimport { users } from "@orb/db";\nexport const a = [schema, users];\n');
  expect(refs.map((r) => namespaceImportSpecifier(r))).toEqual(["@orb/db", undefined]);
});

test("namedImportLocalNames carries an alias, and ignores a non-matching specifier", () => {
  const sf = sourceOf(
    'import { printResult as print } from "../floor/artifacts/artifacts.ts";\nimport { printResult } from "./elsewhere.ts";\nexport const a = 1;\n',
  );
  expect([...namedImportLocalNames(sf, "printResult", (s) => s.endsWith("floor/artifacts/artifacts.ts"))]).toEqual(["print"]);
});

test("moduleMemberReference: a NAMED import and a NAMESPACE member read are the same reference, in every spelling", () => {
  const isDb = (specifier: string): boolean => specifier === "@orb/db";
  const named = sourceOf('import { chatDigests } from "@orb/db";\nexport const a = chatDigests;\n').getDescendantsOfKind(SyntaxKind.ImportSpecifier);
  expect(named.map((n) => moduleMemberReference(n, isDb))).toEqual([
    expect.objectContaining({ kind: "named-import", name: "chatDigests", specifier: "@orb/db" }),
  ]);

  for (const code of [
    'import * as schema from "@orb/db";\nexport const a = schema.chatDigests;\n',
    'import * as schema from "@orb/db";\nexport const a = schema["chatDigests"];\n',
  ]) {
    // THE DEFECT: an ImportSpecifier-only gate sees NO node here at all — there is no specifier to visit.
    expect(accessesIn(code).map((n) => moduleMemberReference(n, isDb))).toEqual([
      expect.objectContaining({ kind: "namespace-member", name: "chatDigests", specifier: "@orb/db" }),
    ]);
  }
});

test("moduleMemberReference keys on the IMPORTED name, so aliasing the local binding buys nothing", () => {
  const isDb = (specifier: string): boolean => specifier === "@orb/db";
  const specifiers = sourceOf('import { chatDigests as t } from "@orb/db";\nexport const a = t;\n').getDescendantsOfKind(SyntaxKind.ImportSpecifier);
  expect(specifiers.map((n) => moduleMemberReference(n, isDb)?.name)).toEqual(["chatDigests"]);
});

// Canonical registration remains identical through named, namespace and computed import spellings.
const IS_POLICY = (specifier: string): boolean => specifier.includes("contract/policy");

test("importsModuleExport sees a named import AND a namespace import of the same module", () => {
  expect(importsModuleExport(sourceOf('import { defineGate } from "../contract/policy.ts";\n'), "defineGate", IS_POLICY)).toBe(true);
  expect(
    importsModuleExport(sourceOf('import { defineGate as define } from "../contract/policy.ts";\n'), "defineGate", IS_POLICY),
    "an alias is still the import",
  ).toBe(true);
  // THE DEFECT: `getNamedImports()` answers [] here, so the file read as "does not import it".
  expect(importsModuleExport(sourceOf('import * as p from "../contract/policy.ts";\n'), "defineGate", IS_POLICY)).toBe(true);
});

test("importsModuleExport refuses a different module and a different export — the widening is not a blanket yes", () => {
  expect(importsModuleExport(sourceOf('import { defineGate } from "../lib/other.ts";\n'), "defineGate", IS_POLICY), "wrong module").toBe(false);
  expect(importsModuleExport(sourceOf('import { somethingElse } from "../contract/policy.ts";\n'), "defineGate", IS_POLICY), "wrong export").toBe(false);
  expect(importsModuleExport(sourceOf("export const a = 1;\n"), "defineGate", IS_POLICY), "no import at all").toBe(false);
});

test("referencesModuleExport answers for a CALLEE in both import spellings and every member spelling", () => {
  const calleeOf = (code: string): Node | undefined => sourceOf(code).getDescendantsOfKind(SyntaxKind.CallExpression)[0]?.getExpression();
  for (const code of [
    'import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({});\n',
    'import { defineGate as define } from "../contract/policy.ts";\nexport const gate = define({});\n',
    'import * as p from "../contract/policy.ts";\nexport const gate = p.defineGate({});\n',
    'import * as p from "../contract/policy.ts";\nexport const gate = p["defineGate"]({});\n',
  ]) {
    const callee = calleeOf(code);
    expect(callee === undefined ? "no callee" : referencesModuleExport(callee, "defineGate", IS_POLICY), code).toBe(true);
  }
});

test("referencesModuleExport refuses a same-named LOCAL and a same-named import from elsewhere", () => {
  const calleeOf = (code: string): Node | undefined => sourceOf(code).getDescendantsOfKind(SyntaxKind.CallExpression)[0]?.getExpression();
  for (const code of [
    "function defineGate(x: unknown): unknown {\n  return x;\n}\nexport const gate = defineGate({});\n",
    'import { defineGate } from "../lib/other.ts";\nexport const gate = defineGate({});\n',
    'import * as p from "../lib/other.ts";\nexport const gate = p.defineGate({});\n',
  ]) {
    const callee = calleeOf(code);
    expect(callee === undefined ? "no callee" : referencesModuleExport(callee, "defineGate", IS_POLICY), code).toBe(false);
  }
});

test("moduleMemberReference: a local object and another module's import are NOT references", () => {
  const isDb = (specifier: string): boolean => specifier === "@orb/db";
  expect(accessesIn("const schema = { chatDigests: 1 };\nexport const a = schema.chatDigests;\n").map((n) => moduleMemberReference(n, isDb))).toEqual([
    undefined,
  ]);
  const other = sourceOf('import { chatDigests } from "@orb/other";\nexport const a = chatDigests;\n').getDescendantsOfKind(SyntaxKind.ImportSpecifier);
  expect(other.map((n) => moduleMemberReference(n, isDb))).toEqual([undefined]);
});
