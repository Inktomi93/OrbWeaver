import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { resolveModuleMemberOrigin } from "@orb/tooling/floor/code-facts/reference-fact";
import { Project, SyntaxKind } from "ts-morph";

const DYNAMIC_ORIGIN_CASES = ["direct", "local", "destructured", "computed", "transitive"] as const;
const DYNAMIC_FILES = {
  "/repo/leaf.ts": "export function pick() { return 1; }\n",
  "/repo/barrel.ts": 'export { pick } from "./leaf.ts";\n',
  "/repo/bridge.ts": 'export * from "./barrel.ts";\n',
};

const LOCAL_FILES = {
  "/repo/leaf.ts": "export const record = () => 1; export const publicName = () => 2;\n",
  "/repo/default.ts": 'export { record as default } from "./leaf.ts";\n',
  "/repo/use.ts": 'import { publicName } from "./barrel.ts";\nexport const value = publicName;\n',
};

test.for(["default", "destructured"] as const)("the particular %s local export binding determines canonical identity", (scenario) => {
  const source =
    scenario === "default"
      ? 'import drive from "./default.ts";\nexport { drive as publicName };\n'
      : 'const { record: drive } = await import("./leaf.ts");\nexport { drive as publicName };\n';
  const fact = pickOrigin({ ...LOCAL_FILES, "/repo/barrel.ts": source });
  expect(fact).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
  expect(fact.trace.declarations.map((declaration) => declaration.getSourceFile().getFilePath())).toContain("/repo/barrel.ts");
});

const LOCAL_REFUSALS = ["missing", "wrong-member", "cycle", "write"] as const;
test.for(LOCAL_REFUSALS)("local export provenance refuses %s instead of borrowing the same-named leaf member", (scenario) => {
  const sources = {
    missing: 'import { record as drive } from "./missing.ts";\nexport { drive as publicName };\n',
    "wrong-member": 'import { absent as drive } from "./leaf.ts";\nexport { drive as publicName };\n',
    cycle: 'import { publicName as drive } from "./barrel.ts";\nexport { drive as publicName };\n',
    write: 'import { record } from "./leaf.ts";\nlet drive = record;\nexport { drive as publicName };\n',
  } satisfies Record<(typeof LOCAL_REFUSALS)[number], string>;
  const reasons = { missing: "missing", "wrong-member": "missing", cycle: "cycle", write: "write" } as const;
  expect(pickOrigin({ ...LOCAL_FILES, "/repo/barrel.ts": sources[scenario] })).toMatchObject({ kind: "unresolved", reason: reasons[scenario] });
});

test.for(DYNAMIC_ORIGIN_CASES)("dynamic namespace origin preserves its module path: %s", (scenario) => {
  const sources = {
    direct: 'export const value = (await import("./barrel.ts")).pick;\n',
    local: 'const namespace = await import("./barrel.ts");\nconst alias = namespace;\nexport const value = alias.pick;\n',
    destructured: 'const { pick } = await import("./barrel.ts");\nexport const value = pick;\n',
    computed: 'export const value = (await import("./barrel.ts"))["pick"];\n',
    transitive: 'export const value = (await import("./bridge.ts")).pick;\n',
  } satisfies Record<(typeof DYNAMIC_ORIGIN_CASES)[number], string>;
  const fact = pickOrigin({
    ...DYNAMIC_FILES,
    "/repo/use.ts": sources[scenario],
  });
  expect(fact).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "pick" } } });
  expect(fact.trace.declarations.map((declaration) => declaration.getSourceFile().getFilePath())).toContain("/repo/barrel.ts");
});

test.for(["missing", "nonliteral"] as const)("dynamic namespace origin refuses the %s door", (scenario) => {
  const source =
    scenario === "missing"
      ? 'export const value = (await import("./missing.ts")).pick;\n'
      : 'const route = "./barrel.ts";\nexport const value = (await import(route)).pick;\n';
  const fact = pickOrigin({ ...DYNAMIC_FILES, "/repo/use.ts": source });
  expect(fact).toMatchObject({ kind: "unresolved", reason: scenario === "missing" ? "missing" : "dynamic" });
});

function origin(barrel: string): ReturnType<typeof resolveModuleMemberOrigin> {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/leaf.ts", "export const record = () => 1; export const publicName = () => 2;");
  project.createSourceFile("/repo/barrel.ts", barrel);
  const source = project.createSourceFile("/repo/use.ts", 'import { publicName } from "./barrel"; export const value = publicName;');
  return resolveModuleMemberOrigin(source.getVariableDeclarationOrThrow("value").getInitializerOrThrow());
}

test("a namespace-qualified type reference resolves through the same module-origin reader as a value member", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/chat.ts", "export type ChatContentPart = { readonly type: string };\n");
  const source = project.createSourceFile("/repo/use.ts", 'import type * as chat from "./chat.ts";\nexport type Content = chat.ChatContentPart;\n');
  const qualified = source.getFirstDescendantByKindOrThrow(SyntaxKind.QualifiedName);

  expect(resolveModuleMemberOrigin(qualified)).toMatchObject({
    kind: "resolved",
    value: {
      moduleSpecifier: "./chat.ts",
      exportedName: "ChatContentPart",
      memberPath: [],
      canonical: { kind: "project", exportedName: "ChatContentPart" },
    },
  });
});

test("an unrelated same-named leaf export cannot validate a local import/export alias", () => {
  const explicit = origin('export { record as publicName } from "./leaf";');
  const local = origin('import { record as internal } from "./leaf"; export { internal as publicName };');

  expect(explicit).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
  expect(local).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
});

test("local value exports retain their public name while wrapped imported aliases retain the particular binding", () => {
  const authored = origin("const implementation = () => 1; export { implementation as publicName };");
  const aliased = origin('import { record } from "./leaf"; const alias = ((record as typeof record)!); export { alias as publicName };');

  expect(authored).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "publicName" } } });
  if (authored.kind === "unresolved") {
    throw new Error(authored.detail);
  }
  expect(authored.value.canonical.declaration.getSourceFile().getBaseName()).toBe("barrel.ts");
  expect(authored.value.canonical.declaration.getText()).toBe("implementation = () => 1");
  expect(aliased).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
});

test.each(["namespace.record", 'namespace["record"]'])("an exported member alias %s retains its particular binding", (expression) => {
  const aliased = origin(`import * as namespace from "./leaf"; const alias = (${expression}); export { alias as publicName };`);

  expect(aliased).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: "record" } } });
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
 *  conformance project cannot reach a real installed `node_modules` overload set (the schema-fact family's #1584 conversion record),
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

// Named and namespace re-exports retain their actual imported door, including when the local name changes.
test("a name-preserving barrel over an imported binding resolves to the leaf's own declaration", () => {
  const fact = pickOrigin({
    "/repo/leaf.ts": "export const pick = (): number => 1;\n",
    "/repo/barrel.ts": 'import { pick } from "./leaf.ts";\nexport { pick };\n',
    "/repo/use.ts": 'import { pick } from "./barrel.ts";\nexport const value = pick;\n',
  });

  expect(fact).toMatchObject({ kind: "resolved", value: { moduleSpecifier: "./barrel.ts", canonical: { kind: "project", exportedName: "pick" } } });
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  const canonical = fact.value.canonical;
  // The authored door stays `./barrel.ts` (re-export traversal never rewrites it); the CANONICAL home is the leaf.
  expect(canonical.kind === "project" && canonical.sourceFile.getBaseName()).toBe("leaf.ts");
});

test("a name-preserving NAMESPACE re-export behind a package door resolves to the namespace's module", () => {
  const fact = pickOrigin({
    "/node_modules/vendor/package.json": VENDOR_PACKAGE,
    "/node_modules/vendor/index.d.ts": 'import * as pick from "./external";\nexport { pick };\n',
    "/node_modules/vendor/external.d.ts": "export declare function record(value: string): string;\n",
    "/repo/use.ts": 'import { pick } from "vendor";\nexport const value = pick;\n',
  });

  expect(fact).toMatchObject({ kind: "resolved", value: { moduleSpecifier: "vendor", canonical: { kind: "project", exportedName: "pick" } } });
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  const canonical = fact.value.canonical;
  // A namespace object has no single leaf declaration: its home is the MODULE it names.
  expect(canonical.kind === "project" && canonical.sourceFile.getFilePath()).toBe("/node_modules/vendor/external.d.ts");
});

test.each([
  [
    // The leaf's unrelated `pick` cannot stand in for the particular imported `record` binding.
    "a barrel whose import hop renames the leaf's export",
    {
      "/repo/leaf.ts": "export const record = (): number => 1;\nexport const pick = (): string => 'other';\n",
      "/repo/barrel.ts": 'import { record as pick } from "./leaf.ts";\nexport { pick };\n',
      "/repo/use.ts": 'import { pick } from "./barrel.ts";\nexport const value = pick;\n',
    },
    "record",
    "/repo/leaf.ts",
  ],
  [
    // A namespace alias retains the module it imported, not a guessed same-named leaf member.
    "a namespace re-export renamed at the export hop",
    {
      "/node_modules/vendor/package.json": VENDOR_PACKAGE,
      "/node_modules/vendor/index.d.ts": 'import * as internal from "./external";\nexport { internal as pick };\n',
      "/node_modules/vendor/external.d.ts": "export declare function record(value: string): string;\n",
      "/repo/use.ts": 'import { pick } from "vendor";\nexport const value = pick;\n',
    },
    "pick",
    "/node_modules/vendor/external.d.ts",
  ],
])("%s retains its particular canonical home", (_label, files, name, home) => {
  const fact = pickOrigin(files);
  expect(fact).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project", exportedName: name } } });
  if (fact.kind === "unresolved" || fact.value.canonical.kind !== "project") {
    throw new Error("expected a resolved project binding");
  }
  expect(fact.value.canonical.sourceFile.getFilePath()).toBe(home);
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
