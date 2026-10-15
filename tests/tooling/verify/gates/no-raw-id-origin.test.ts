import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { resolveCallableOrigin } from "@orb/tooling/floor/code-facts/reference-fact-call";
import { declaredByPackage } from "@orb/tooling/floor/code-facts/type-member-origin";
import { resolveTypePropertyOrigin } from "@orb/tooling/floor/code-facts/type-member-origin-core";
import { ZOD_PACKAGE } from "@orb/tooling/floor/code-facts/zod-origin";
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, SyntaxKind } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/no-raw-id.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

function drive(project: Project, root: string): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
}

test("raw id fields follow installed Zod declarations through renamed and namespace barrels without admitting lookalikes", ({ scratch, repoRoot }) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
  });
  const root = join(scratch, "packages/contracts/src");
  const barrel = project.createSourceFile(join(root, "barrel.ts"), 'export { z } from "zod";\n');
  project.createSourceFile(join(root, "renamed.ts"), 'export { z as schema } from "./barrel.ts";\n');
  project.createSourceFile(join(root, "counterfeit.ts"), "export const z = { string: () => ({}) };\n");
  const source = project.createSourceFile(
    join(root, "x.ts"),
    `import { z as direct, string as text } from "zod";
import * as namespace from "zod";
import { z as viaBarrel } from "./barrel.ts";
import { schema as renamed } from "./renamed.ts";
import { z as fake } from "./counterfeit.ts";
export const schema = {
  directId: direct.string(),
  namedId: text(),
  barrelId: viaBarrel.string(),
  renamedId: renamed.string().nullable().optional(),
  namespaceId: namespace.z["string"](),
  numberId: direct.number(),
  counterfeitId: fake.string(),
};
{
  const direct = { string: () => ({}) };
  const value = { shadowId: direct.string() };
}
`,
  );
  expect(barrel.getExportDeclarations()[0]?.getModuleSpecifierSourceFile()?.getFilePath()).toContain("/node_modules/zod/");
  const call = source
    .getVariableDeclarationOrThrow("schema")
    .getInitializerOrThrow()
    .asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    .getPropertyOrThrow("barrelId")
    .asKindOrThrow(SyntaxKind.PropertyAssignment)
    .getInitializerOrThrow();
  const origin = resolveCallableOrigin(call);
  expect(origin).toMatchObject({ kind: "resolved", value: { target: { moduleSpecifier: "./barrel.ts", canonical: { kind: "project" } } } });
  if (origin.kind === "unresolved" || origin.value.target.kind !== "module" || origin.value.target.canonical.kind !== "project") {
    throw new Error("the barrel must resolve an installed declaration while retaining its importing door");
  }
  const target = origin.value.target;
  expect(declaredByPackage([target.canonical.declaration], ZOD_PACKAGE)).toBe(true);
  const property = resolveTypePropertyOrigin(target.canonical.declaration, target.memberPath);
  expect(property.kind).toBe("resolved");
  if (property.kind === "unresolved") {
    throw new Error(property.detail);
  }
  expect(declaredByPackage(property.value, ZOD_PACKAGE)).toBe(true);
  expect(property.value.every((declaration) => declaration.getType().getCallSignatures().length > 0)).toBe(true);

  const result = drive(project, scratch);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ token, message }) => ({ token, message: message ?? gate.message }))).toEqual(
    ["directId", "namedId", "barrelId", "renamedId", "namespaceId"].map((token) => ({ token, message: gate.message })),
  );
});

test("a resolvable package spelling mapped to a counterfeit declaration is not installed Zod", ({ scratch }) => {
  const counterfeit = join(scratch, "counterfeit.ts");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext, paths: { [ZOD_PACKAGE]: [counterfeit] } },
  });
  project.createSourceFile(counterfeit, "export const z = { string: () => ({}) };\n");
  const source = project.createSourceFile(
    join(scratch, "packages/contracts/src/x.ts"),
    'import { z } from "zod"; export const schema = { counterfeitId: z.string() };\n',
  );
  expect(source.getImportDeclarations()[0]?.getModuleSpecifierSourceFile()?.getFilePath()).toBe(counterfeit);
  const result = drive(project, scratch);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("missing relative and package declarations and opaque builders retain the unreadable verdict", ({ scratch, repoRoot }) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.createSourceFile(
    join(scratch, "packages/contracts/src/x.ts"),
    `import { z as relative } from "./missing.ts";
import { z as absent } from "missing-zod-package";
declare const opaque: any;
export const schema = { relativeId: relative.string(), packageId: absent.string(), opaqueId: opaque.string() };
`,
  );
  const result = drive(project, scratch);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(["relativeId", "packageId", "opaqueId"]);
  expect(result.authority.effectiveFindings.every(({ message }) => message?.includes("CANNOT be established") === true)).toBe(true);
});

test("an unresolved Zod package door cannot prove raw-string identity from its spelling", () => {
  const root = "/unresolved-zod";
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(`${root}/packages/contracts/src/x.ts`, 'import { z } from "zod"; export const schema = { userId: z.string() };\n');
  expect(source.getImportDeclarations()[0]?.getModuleSpecifierSourceFile()).toBeUndefined();
  const result = drive(project, root);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ token: "userId", message: expect.stringContaining("CANNOT be established") }]);
});
