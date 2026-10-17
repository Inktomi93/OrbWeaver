import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createWrappedNode, Node } from "ts-morph";
import ts from "typescript";
import { vi } from "vitest";
import { resolveGlobalMemberOrigin } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";

test("ambient identity preserves native aliases, shadows and refusals without acquiring a Project", ({ scratch }) => {
  const path = join(scratch, "ambient.ts");
  const cases = [
    ["export const selected=Date.now;", "resolved", "Date.now"],
    ["const clock=Date;export const selected=clock.now;", "resolved", "Date.now"],
    ["const {now:clock}=Date;export const selected=clock;", "resolved", "Date.now"],
    ["const {random}=Math;export const selected=random;", "resolved", "Math.random"],
    ["const KEY='random';const math=Math;export const selected=math[KEY];", "resolved", "Math.random"],
    ["export const selected=window.localStorage;", "resolved", "localStorage"],
    ["export const selected=globalThis.Intl.DateTimeFormat;", "resolved", "Intl.DateTimeFormat"],
    ["const Math={random:()=>0};export const selected=Math.random;", "unresolved", "dynamic"],
    ["declare const clock:DateConstructor;export const selected=clock.now;", "unresolved", "missing"],
    ["declare function opaque():Math;export const selected=opaque().random;", "unresolved", "dynamic"],
    ["let math=Math;export const selected=math.random;", "unresolved", "write"],
    ["Date.now=()=>0;export const selected=Date.now;", "unresolved", "write"],
    ["const first=second;const second=first;export const selected=first;", "unresolved", "cycle"],
  ] as const;
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("ambient identity acquired a Project");
  });
  try {
    for (const [source, kind, value] of cases) {
      writeFileSync(path, source);
      const program = ts.createProgram([path], { types: [], strict: true, lib: ["lib.es2022.d.ts", "lib.dom.d.ts"] });
      const checker = program.getTypeChecker();
      const file = program.getSourceFile(path);
      const declaration = file?.statements
        .filter(ts.isVariableStatement)
        .flatMap((statement) => [...statement.declarationList.declarations])
        .find((node) => node.name.getText(file) === "selected");
      if (file === undefined || declaration?.initializer === undefined) {
        throw new Error("native ambient fixture is missing");
      }
      const wrapped = createWrappedNode(declaration.initializer, { typeChecker: checker, sourceFile: file });
      const read = resolveGlobalMemberOrigin(wrapped);
      expect(read.kind, source).toBe(kind);
      expect(read.kind === "resolved" ? [read.value.globalName, ...read.value.memberPath].join(".") : read.reason, source).toBe(value);
    }
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
});
