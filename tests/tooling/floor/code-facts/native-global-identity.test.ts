import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createWrappedNode, Node, Project } from "ts-morph";
import { vi } from "vitest";
import { resolveGlobalMemberOrigin } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";

test("ambient identity preserves native aliases, shadows and refusals without acquiring a Project", ({ scratch }) => {
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
  const inputs = cases.map(([source, kind, value], index) => {
    const path = join(scratch, `ambient-${index}.ts`);
    writeFileSync(path, source);
    const nativeProject = new Project({ compilerOptions: { types: [], strict: true, lib: ["lib.es2022.d.ts", "lib.dom.d.ts"] } });
    const file = nativeProject.addSourceFileAtPath(path);
    const declaration = file.getVariableDeclarations().find((candidate) => candidate.getName() === "selected");
    const initializer = declaration?.getInitializer();
    if (initializer === undefined) {
      throw new Error("native ambient fixture is missing");
    }
    return {
      source,
      kind,
      value,
      initializer: initializer.compilerNode,
      sourceFile: file.compilerNode,
      checker: nativeProject.getTypeChecker().compilerObject,
    };
  });
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("ambient identity acquired a Project");
  });
  try {
    for (const { source, kind, value, initializer, sourceFile, checker } of inputs) {
      const wrapped = createWrappedNode(initializer, { typeChecker: checker, sourceFile });
      const read = resolveGlobalMemberOrigin(wrapped);
      expect(read.kind, source).toBe(kind);
      expect(read.kind === "resolved" ? [read.value.globalName, ...read.value.memberPath].join(".") : read.reason, source).toBe(value);
    }
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
});
