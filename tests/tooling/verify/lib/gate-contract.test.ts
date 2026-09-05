import { Project } from "ts-morph";
import { inspectGateContract } from "../../../../tooling/src/verify/lib/gate-contract.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

function inspect(source: string, extraFiles: Readonly<Record<string, string>> = {}): ReturnType<typeof inspectGateContract> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(extraFiles)) {
    project.createSourceFile(`/repo/${path}`, text);
  }
  project.createSourceFile("/repo/tooling/src/verify/gates/example.ts", source);
  return inspectGateContract([project.getSourceFileOrThrow("/repo/tooling/src/verify/gates/example.ts")], "/repo");
}

const TS_MORPH_TYPES = `
  declare module "ts-morph" {
    export class Project {
      getSourceFile(path: string): SourceFile | undefined;
      getSourceFileOrThrow(path: string): SourceFile;
      getSourceFiles(): SourceFile[];
    }
    export interface SourceFile {
      getDescendants(): unknown[];
      getDescendantsOfKind(kind: number): unknown[];
      forEachDescendant(visitor: (node: unknown) => void): void;
    }
  }
`;

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
    ["descriptor-wrapper", "descriptor-wrapper", "legacy-field", "legacy-field", "legacy-field", "legacy-field", "legacy-field"].sort(),
  );
});

test("refuses descriptor spreads and computed keys, including statically resolved legacy names", () => {
  const report = inspect(`
    import { defineGate } from "../contract/gate.ts";
    const RUN = "run";
    const legacy = { scanRoot: () => true };
    export const gate = defineGate({
      ...legacy,
      [RUN]() {},
      create() { return { visitors: {} }; },
    });
  `);
  expect(report.findings.filter((finding) => finding.code === "descriptor-wrapper")).toHaveLength(2);
  expect(report.findings.filter((finding) => finding.code === "legacy-field").map((finding) => finding.detail)).toEqual([
    "legacy descriptor field `run` is forbidden",
  ]);
});

test("a dynamic computed descriptor key refuses instead of disappearing", () => {
  const report = inspect(`
    import { defineGate } from "../contract/gate.ts";
    export const gate = defineGate({
      [getFieldName()]() {},
      create() { return { visitors: {} }; },
    });
  `);
  expect(report.findings.filter((finding) => finding.code === "descriptor-wrapper").map((finding) => finding.detail)).toContain(
    "computed descriptor keys are forbidden; spell the required field directly",
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

test("follows ts-morph walk aliases and wrappers without accusing unrelated same-named methods", () => {
  const report = inspect(
    `
      import type { Project, SourceFile } from "ts-morph";
      import { defineGate } from "../contract/gate.ts";
      declare const sf: SourceFile;
      declare const ctx: { readonly project: Project };
      const walk = sf.getDescendantsOfKind;
      const bound = sf.forEachDescendant.bind(sf);
      const { getSourceFiles } = ctx.project;
      class LogicalRegistry { getSourceFiles() { return ["logical-record"]; } }
      export const gate = defineGate({
        create() {
          walk(1);
          bound(() => undefined);
          getSourceFiles();
          sf.getDescendants.call(sf);
          ctx.project.getSourceFileOrThrow("x.ts");
          new LogicalRegistry().getSourceFiles();
          return { visitors: {} };
        },
      });
    `,
    { "types/ts-morph.d.ts": TS_MORPH_TYPES },
  );
  expect(report.findings.filter((finding) => finding.code === "direct-walk")).toHaveLength(5);
});

test("follows the ts-morph Project constructor while respecting a shadowed constructor parameter", () => {
  const report = inspect(
    `
      import { Project as TsProject } from "ts-morph";
      import { defineGate } from "../contract/gate.ts";
      const Workspace = TsProject;
      function local(Project: new () => unknown) { return new Project(); }
      export const gate = defineGate({
        create() { new Workspace(); local(class Local {}); return { visitors: {} }; },
      });
    `,
    { "types/ts-morph.d.ts": TS_MORPH_TYPES },
  );
  expect(report.findings.filter((finding) => finding.code === "gate-owned-project")).toHaveLength(1);
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

test("follows mutation aliases and write forms without classifying a pure same-named method", () => {
  const report = inspect(`
    import { defineGate } from "../contract/gate.ts";
    const ADD = "add";
    const STATE = { nested: new Set<string>(), count: 0 };
    const IMMUTABLE = { add(value: string) { return { value }; } };
    function record() {
      const alias = STATE;
      alias.nested.add("one");
      STATE.nested[ADD]("two");
      delete STATE.count;
      Object.assign(STATE, { count: 1 });
      STATE.nested.add.call(STATE.nested, "three");
      IMMUTABLE.add("allowed");
    }
    export const gate = defineGate({ create() { record(); return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "module-mutation").map((finding) => finding.detail)).toEqual([
    expect.stringContaining("`STATE`"),
  ]);
});

test("reports baseline ledger paths", () => {
  const report = inspect(`
    import { defineGate } from "../contract/gate.ts";
    const BASELINE = "tooling/src/verify/gates/example.baseline.json";
    export const gate = defineGate({ create() { return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "baseline-ledger")).toHaveLength(1);
});

test("reports statically concatenated and templated baseline paths once each", () => {
  const report = inspect(`
    import { defineGate } from "../contract/gate.ts";
    const SUFFIX = ".json";
    const CONCAT = "tooling/src/verify/gates/one.baseline" + SUFFIX;
    const TEMPLATE = \`tooling/src/verify/gates/two.baseline\${SUFFIX}\`;
    export const gate = defineGate({ create() { return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "baseline-ledger")).toHaveLength(2);
});

test("the command refuses a zero-module corpus", { timeout: scaledBudget(30_000) }, async ({ runCli, scratch }) => {
  const result = await runCli("verify", ["gate-contract"], { cwd: scratch, timeoutMs: scaledBudget(30_000) });
  await expect(result).toExitWith(2);
  expect(result.stdout).toContain("0 finding(s) across 0 gate module(s)");
  expect(result.stderr).toContain("not a migration verdict");
});
