import { Project } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../../../tooling/src/verify/lib/reference-fact.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function origin(barrel: string): ReturnType<typeof resolveModuleMemberOrigin> {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/leaf.ts", "export const record = () => 1; export const publicName = () => 2;");
  project.createSourceFile("/repo/barrel.ts", barrel);
  const source = project.createSourceFile("/repo/use.ts", 'import { publicName } from "./barrel"; export const value = publicName;');
  return resolveModuleMemberOrigin(source.getVariableDeclarationOrThrow("value").getInitializerOrThrow());
}

test("an unrelated same-named leaf export cannot validate a local import/export alias", () => {
  const explicit = origin('export { record as publicName } from "./leaf";');
  const local = origin('import { record as internal } from "./leaf"; export { internal as publicName };');

  expect(explicit).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
  expect(local).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("local value exports retain their public name while wrapped imported aliases refuse", () => {
  const authored = origin("const implementation = () => 1; export { implementation as publicName };");
  const aliased = origin('import { record } from "./leaf"; const alias = ((record as typeof record)!); export { alias as publicName };');

  expect(authored).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "publicName" } } });
  if (authored.kind === "unresolved") {
    throw new Error(authored.detail);
  }
  expect(authored.value.canonical.declaration.getSourceFile().getBaseName()).toBe("barrel.ts");
  expect(authored.value.canonical.declaration.getText()).toBe("implementation = () => 1");
  expect(aliased).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test.each(["namespace.record", 'namespace["record"]'])("an exported member alias %s remains an explicit refusal", (expression) => {
  const aliased = origin(`import * as namespace from "./leaf"; const alias = (${expression}); export { alias as publicName };`);

  expect(aliased).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

/** Resolve `pick` (or `choose`) as imported by `/repo/use.ts` from an arbitrary file map. */
function pickOrigin(files: Readonly<Record<string, string>>): ReturnType<typeof resolveModuleMemberOrigin> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(path, source);
  }
  const source = project.getSourceFileOrThrow("/repo/use.ts");
  return resolveModuleMemberOrigin(source.getVariableDeclarationOrThrow("value").getInitializerOrThrow());
}

const SAME_FILE_OVERLOADS =
  "export function pick(value: string): string;\nexport function pick(value: number): number;\nexport function pick(value: unknown): unknown { return value; }\n";
const USE_PICK = 'import { pick } from "./api.ts";\nexport const value = pick;\n';
/** A package door with types, so a BARE specifier really resolves to the planted `.d.ts`. The virtual
 *  conformance project cannot reach a real installed `node_modules` overload set (schema-fact-family-1584.md),
 *  so the shape is planted; the `project` canonical below IS the control that the plant resolved — an
 *  unresolvable door answers `external-door` and would prove nothing about declaration counting. */
const VENDOR_PACKAGE = '{"name":"vendor","version":"1.0.0","types":"index.d.ts"}';

test("a same-file function-overload set resolves to ONE home at its implementation, carrying the declaration count", () => {
  const fact = pickOrigin({ "/repo/api.ts": SAME_FILE_OVERLOADS, "/repo/use.ts": USE_PICK });

  expect(fact).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "pick" } } });
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  const canonical = fact.value.canonical;
  expect(canonical.kind === "project" && canonical.sourceFile.getBaseName()).toBe("api.ts");
  // The IMPLEMENTATION is the home, not the first signature: a consumer reading the declaration wants the
  // one that carries the body.
  expect(canonical.declaration.getKindName()).toBe("FunctionDeclaration");
  expect(canonical.declaration.getText()).toContain("return value");
});

test("an ambient declare-function overload set behind a package door resolves to its declaring .d.ts", () => {
  const fact = pickOrigin({
    "/node_modules/vendor/package.json": VENDOR_PACKAGE,
    "/node_modules/vendor/index.d.ts": "export declare function pick(value: string): string;\nexport declare function pick(value: number): number;\n",
    "/repo/use.ts": 'import { pick } from "vendor";\nexport const value = pick;\n',
  });

  expect(fact).toMatchObject({ kind: "resolved", value: { moduleSpecifier: "vendor", canonical: { kind: "project" } } });
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  const canonical = fact.value.canonical;
  expect(canonical.kind === "project" && canonical.sourceFile.getFilePath()).toBe("/node_modules/vendor/index.d.ts");
});

test("a LOCAL export specifier over a same-file overload set resolves the same way", () => {
  const fact = pickOrigin({
    "/repo/api.ts":
      "function pick(value: string): string;\nfunction pick(value: number): number;\nfunction pick(value: unknown): unknown { return value; }\nexport { pick as choose };\n",
    "/repo/use.ts": 'import { choose } from "./api.ts";\nexport const value = choose;\n',
  });

  expect(fact).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "choose" } } });
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  // The HOME is the implementation, not a signature — the same claim the same-file row makes, through the
  // local-export-specifier path, which is the one the augmentation counterfactual below also travels.
  expect(fact.value.canonical.declaration.getText()).toContain("return value");
});

test.each([
  [
    "two files of one package fanned in by export *",
    {
      "/node_modules/vendor/package.json": VENDOR_PACKAGE,
      "/node_modules/vendor/index.d.ts": 'export * from "./a";\nexport * from "./b";\n',
      "/node_modules/vendor/a.d.ts": "export declare function pick(value: string): string;\n",
      "/node_modules/vendor/b.d.ts": "export declare function pick(value: number): number;\n",
      "/repo/use.ts": 'import { pick } from "vendor";\nexport const value = pick;\n',
    },
  ],
  [
    // THE SAME-FILE GUARD'S OWN ROW. Every other counterfactual here is answered EARLIER — the `export *`
    // fan-in by `resolveStarExport`'s candidate count, the merges by the kind check — so without this shape
    // the guard is an arm no row turns red (measured: dropping it left the spec 11/11 green). A module
    // AUGMENTATION adds a second `pick` declaration from another file, and a LOCAL export specifier is the
    // one path whose `getAliasedSymbol()` sees both: same kind, one implementation, TWO homes. An overload
    // set split across files has no unique home, so it refuses.
    "an augmentation adding an overload from another file, read through a local export specifier",
    {
      "/node_modules/vendor/package.json": VENDOR_PACKAGE,
      "/node_modules/vendor/index.d.ts": "export declare function pick(value: string): string;\n",
      "/repo/augment.d.ts": 'declare module "vendor" {\n  export function pick(value: number): number;\n}\nexport {};\n',
      "/repo/barrel.ts": 'import { pick } from "vendor";\nexport { pick };\n',
      "/repo/use.ts": 'import { pick } from "./barrel.ts";\nexport const value = pick;\n',
    },
  ],
  [
    "an interface merged with a value of the same name",
    { "/repo/api.ts": "export interface pick { tag: string }\nexport const pick = (): number => 1;\n", "/repo/use.ts": USE_PICK },
  ],
  [
    "a function merged with a namespace of the same name",
    { "/repo/api.ts": "export function pick(): number { return 1; }\nexport namespace pick { export const version = 1; }\n", "/repo/use.ts": USE_PICK },
  ],
  [
    "two implementations of the same name in one file",
    {
      "/repo/api.ts": "export function pick(value: string): string { return value; }\nexport function pick(value: number): number { return value; }\n",
      "/repo/use.ts": USE_PICK,
    },
  ],
])("%s stays ambiguous — several declarations with no ONE home", (_label, files) => {
  expect(pickOrigin(files)).toMatchObject({ kind: "unresolved", reason: "ambiguous" });
});
