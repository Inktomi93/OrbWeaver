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
