import { Project } from "ts-morph";
import { inspectGateContract } from "../../../../tooling/src/verify/lib/gate-contract.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function inspect(source: string): ReturnType<typeof inspectGateContract> {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/tooling/src/verify/gates/example.ts", source);
  return inspectGateContract(project.getSourceFiles(), "/repo");
}

test("accepts the direct defineGate shape and invocation-local state", () => {
  const report = inspect(`
    import { defineGate } from "../contract/gate.ts";
    const VOCABULARY = new Set(["one"]);
    export const gate = defineGate({
      id: "example",
      family: "syntax",
      population: { roots: ["packages"] },
      analysis: "syntax",
      create() {
        const seen = new Set<string>();
        seen.add("one");
        return { visitors: {} };
      },
      mustFlag: [1],
      mustPass: [1],
    });
  `);
  expect(report).toEqual({ files: 1, findings: [] });
});

test("reports the legacy descriptor lifecycle and an indirect descriptor", () => {
  const report = inspect(`
    const descriptor = {
      ["scanRoot"]: () => true,
      scopeSafety: "whole-project",
      begin() {},
      finalize() {},
      run() {},
    };
    export const gate = descriptor;
  `);
  expect(report.findings.map((finding) => finding.code).sort()).toEqual(
    ["descriptor-wrapper", "legacy-field", "legacy-field", "legacy-field", "legacy-field", "legacy-field"].sort(),
  );
});

test("reports direct repository walks through property, optional, and computed access", () => {
  const report = inspect(`
    import { defineGate } from "../contract/gate.ts";
    export const gate = defineGate({
      create(ctx) {
        ctx.project["getSourceFiles"]();
        ctx.file?.getDescendantsOfKind(1);
        ctx.node.forEachDescendant(() => undefined);
        return { visitors: {} };
      },
    });
  `);
  expect(report.findings.filter((finding) => finding.code === "direct-walk").map((finding) => finding.detail)).toEqual([
    "gate modules cannot call `getSourceFiles`; use visitors, ctx.files, or a shared reader",
    "gate modules cannot call `getDescendantsOfKind`; use visitors, ctx.files, or a shared reader",
    "gate modules cannot call `forEachDescendant`; use visitors, ctx.files, or a shared reader",
  ]);
});

test("resolves named and namespace Project constructor aliases", () => {
  const report = inspect(`
    import { Project as Workspace } from "ts-morph";
    import * as Morph from "ts-morph";
    import { defineGate } from "../contract/gate.ts";
    new Workspace();
    new Morph["Project"]();
    export const gate = defineGate({ create() { return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "gate-owned-project")).toHaveLength(2);
});

test("reports provable module state while leaving immutable vocabulary and local state alone", () => {
  const report = inspect(`
    import { defineGate } from "../contract/gate.ts";
    let current = 0;
    const HITS = new Map<string, number>();
    const VOCABULARY = new Set(["one"]);
    function record() {
      HITS.set("one", 1);
      const local = new Set<string>();
      local.add("one");
    }
    export const gate = defineGate({ create() { record(); return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "module-let")).toHaveLength(1);
  expect(report.findings.filter((finding) => finding.code === "module-mutation")).toHaveLength(1);
});

test("reports baseline ledger paths", () => {
  const report = inspect(`
    import { defineGate } from "../contract/gate.ts";
    const BASELINE = "tooling/src/verify/gates/example.baseline.json";
    export const gate = defineGate({ create() { return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "baseline-ledger")).toHaveLength(1);
});
