import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { resolveModuleMemberOrigin } from "@orb/tooling/floor/code-facts/reference-fact";
import { inlineShapeNames } from "@orb/tooling/floor/code-facts/shape-declaration";
import { resolveTypePropertyOrigin } from "@orb/tooling/floor/code-facts/type-member-origin-core";
import { isFactoryCallFromPackage, resolveFactoryCallFromPackage, ZOD_PACKAGE } from "@orb/tooling/floor/code-facts/zod-origin";
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, SyntaxKind } from "ts-morph";
import { isZodCall } from "../../../../tooling/src/verify/lib/zod-origin.ts";

const STRING_FACTORY = "string";

test("canonical factory facts distinguish installed identity, another factory and unreadable nested provenance", ({ scratch, repoRoot }) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
  });
  project.createSourceFile(join(scratch, "barrel.ts"), 'export { z as schema } from "zod";\n');
  project.createSourceFile(
    join(scratch, "foreign.ts"),
    "export declare const bag: { readonly nested: any };\nexport const other = { nested: { string: () => ({}) } };\n",
  );
  const source = project.createSourceFile(
    join(scratch, "x.ts"),
    `import { z, string as text, object as shape } from "zod";
import { schema } from "./barrel.ts";
import { bag, other } from "./foreign.ts";
export const Direct = z.string();
export const Named = text();
export const Renamed = schema.string();
export const Wrapped = ((z.string))();
export const Numeric = z.number();
export const Counterfeit = other.nested.string();
export const Opaque = bag.nested.string();
export const ComputedOpaque = bag["nested"]["string"]();
export const WrappedOpaque = ((bag.nested.string))();
export const NonCall = 1;
export const DirectShape = shape({});
export const OpaqueShape = bag.nested.object({});
`,
  );
  expect(source.getImportDeclarations()[0]?.getModuleSpecifierSourceFile()?.getFilePath()).toContain("/node_modules/zod/");
  const initializers = new Map(source.getVariableDeclarations().map((declaration) => [declaration.getName(), declaration.getInitializerOrThrow()]));
  for (const [name, matches] of [
    ["Direct", true],
    ["Named", true],
    ["Renamed", true],
    ["Wrapped", true],
    ["Numeric", false],
    ["Counterfeit", false],
    ["NonCall", false],
  ] as const) {
    const initializer = initializers.get(name);
    if (initializer === undefined) {
      throw new Error(`the ${name} factory control is absent`);
    }
    expect(resolveFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE), name).toMatchObject({ kind: "resolved", value: matches });
    expect(isFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE), name).toBe(matches);
  }
  for (const name of ["Opaque", "ComputedOpaque", "WrappedOpaque"]) {
    const initializer = initializers.get(name);
    if (initializer === undefined) {
      throw new Error(`the ${name} opaque control is absent`);
    }
    const origin = resolveModuleMemberOrigin(initializer.asKindOrThrow(SyntaxKind.CallExpression).getExpression());
    expect(origin, name).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project" }, memberPath: ["nested", "string"] } });
    if (origin.kind === "unresolved" || origin.value.canonical.kind !== "project") {
      throw new Error("the opaque control must reach native property resolution");
    }
    const property = resolveTypePropertyOrigin(origin.value.canonical.declaration, origin.value.memberPath);
    expect(property.kind, name).toBe("unresolved");
    const fact = resolveFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE);
    expect(fact, name).toMatchObject({ kind: "unresolved", reason: "missing" });
    if (property.kind === "resolved" || fact.kind === "resolved") {
      throw new Error("the native property refusal must remain a factory refusal");
    }
    expect(fact.node, name).toBe(property.node);
    expect(fact.detail, name).toBe(property.detail);
    expect(isFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE), name).toBe(false);
    expect(isZodCall(initializer, STRING_FACTORY), name).toBe(false);
  }
  expect(
    source
      .getVariableStatements()
      .flatMap(inlineShapeNames)
      .map((name) => name.getText()),
  ).toEqual(["DirectShape"]);
});

test("positive-only factory callers keep unresolved relative and package doors separate from negative facts", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/factory-doors/x.ts",
    `import { z } from "zod";
import { z as missing } from "./missing.ts";
export const Package = z.string();
export const Relative = missing.string();
`,
  );
  for (const declaration of source.getVariableDeclarations()) {
    const initializer = declaration.getInitializerOrThrow();
    expect(resolveFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE), declaration.getName()).toMatchObject({
      kind: "unresolved",
      reason: "missing",
    });
    expect(isFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE), declaration.getName()).toBe(false);
  }
});
