import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createWrappedNode, Node } from "ts-morph";
import ts from "typescript";
import { vi } from "vitest";
import { readStaticAuthoredScalar } from "../../../../tooling/src/floor/code-facts/static-authored-value.ts";
import { resolveTypeMemberOrigin } from "../../../../tooling/src/floor/code-facts/type-member-origin.ts";

test("existing authored-scalar reads retain native aliases and refusals without acquiring a Project", ({ scratch }) => {
  const path = join(scratch, "input.ts");
  writeFileSync(join(scratch, "role.ts"), 'export const ROLE = "button";');
  writeFileSync(join(scratch, "role-barrel.ts"), 'export {ROLE} from "./role";');
  const cases = [
    ['export const selected = "button";', "resolved", "button"],
    ['const role = "button"; const alias = role; export const selected = alias;', "resolved", "button"],
    ['import {ROLE as role} from "./role"; export const selected = role;', "resolved", "button"],
    ['import {ROLE} from "./role-barrel"; const alias=ROLE; export const selected=alias;', "resolved", "button"],
    ['const role = (("button" as const) satisfies string)!; export const selected=role;', "resolved", "button"],
    ['declare const props: {role: "button"}; export const selected=props.role;', "unresolved", "dynamic"],
    ['let role = "button"; export const selected=role;', "unresolved", "write"],
    ['const role = "button"; role="link"; export const selected=role;', "unresolved", "write"],
    ["const first = second; const second = first; export const selected=first;", "unresolved", "cycle"],
    ["export const selected=missing;", "unresolved", "missing"],
    ['declare const cond:boolean; export const selected=cond ? "button" : undefined;', "unresolved", "dynamic"],
    ['const role={value:"button"};export const selected=role;', "unresolved", "unsupported"],
    ['const role=["button"];export const selected=role;', "unresolved", "unsupported"],
    ['const role=["button"];role.push("link");export const selected=role;', "unresolved", "dynamic"],
    ['export const selected = "list";', "resolved", "list"],
  ] as const;
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("scalar reader acquired a Project");
  });
  const conditionalReads: ReturnType<typeof readStaticAuthoredScalar>[] = [];
  try {
    for (const [source, kind, value] of cases) {
      writeFileSync(path, source);
      const program = ts.createProgram([path], {
        noLib: true,
        types: [],
        strict: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      });
      const checker = program.getTypeChecker();
      const file = program.getSourceFile(path);
      const declaration = file?.statements
        .filter(ts.isVariableStatement)
        .flatMap((statement) => [...statement.declarationList.declarations])
        .find((node) => node.name.getText(file) === "selected");
      const initializer = declaration?.initializer;
      if (file === undefined || initializer === undefined) {
        throw new Error("native scalar fixture input is missing");
      }
      const wrap = (node: ts.Node): Node => createWrappedNode(node, { typeChecker: checker, sourceFile: file });
      const read = readStaticAuthoredScalar(wrap(initializer));
      expect(read.kind, source).toBe(kind);
      expect(read.kind === "resolved" ? read.value : read.reason, source).toBe(value);
      expect(wrap(initializer).compilerNode).toBe(initializer);
      if (ts.isConditionalExpression(initializer)) {
        conditionalReads.push(readStaticAuthoredScalar(wrap(initializer.whenTrue)));
      }
    }
    expect(conditionalReads).toMatchObject([{ kind: "resolved", value: "button" }]);
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
});

test("existing member identity uses the actual native checker without Project acquisition", ({ scratch }) => {
  const path = join(scratch, "member.ts");
  writeFileSync(path, 'interface Result {readonly error:unknown} declare const result:Result|null; const KEY="error"; export const selected=result?.[KEY];');
  const program = ts.createProgram([path], { noLib: true, types: [], strict: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(path);
  const declaration = source?.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((node) => node.name.getText(source) === "selected");
  if (source === undefined || declaration?.initializer === undefined) {
    throw new Error("native member fixture is missing");
  }
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("member reader acquired a Project");
  });
  try {
    const wrapped = createWrappedNode(declaration.initializer, { typeChecker: checker, sourceFile: source });
    const read = resolveTypeMemberOrigin(wrapped);
    expect(read.kind).toBe("resolved");
    expect(read.kind === "resolved" ? read.value.declarations.map((node) => node.compilerNode.getSourceFile()) : []).toEqual([source]);
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
});
