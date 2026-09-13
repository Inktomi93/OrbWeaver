import { Project } from "ts-morph";
import { readExpressionString, readExpressionStrings } from "../../../../tooling/src/verify/lib/config-static-read.ts";
import { inspectGateContract } from "../../../../tooling/src/verify/lib/gate-contract.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

function inspect(source: string, extraFiles: Readonly<Record<string, string>> = {}): ReturnType<typeof inspectGateContract> {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/tooling/src/verify/contract/policy.ts", "export function defineGate<T>(policy: T): T { return policy; }\n");
  for (const [path, text] of Object.entries(extraFiles)) {
    project.createSourceFile(`/repo/${path}`, text);
  }
  project.createSourceFile("/repo/tooling/src/verify/gates/example.ts", source);
  return inspectGateContract([project.getSourceFileOrThrow("/repo/tooling/src/verify/gates/example.ts")], "/repo");
}

const TS_MORPH_TYPES = `
  declare module "ts-morph" {
    export interface Node {
      getSourceFile(): SourceFile;
    }
    export class Project {
      getSourceFile(path: string): SourceFile | undefined;
      getSourceFileOrThrow(path: string): SourceFile;
      getSourceFiles(): SourceFile[];
    }
    export interface SourceFile extends Node {
      getDescendants(): unknown[];
      getDescendantsOfKind(kind: number): unknown[];
      getFirstDescendant(): unknown;
      getFirstDescendantByKind(kind: number): unknown;
      forEachDescendant(visitor: (node: unknown) => void): void;
    }
  }
`;

test("accepts a direct defineGate import from the final policy contract", () => {
  const report = inspect(`
    import { defineGate } from "../contract/policy.ts";
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

test("accepts an aliased defineGate import from the final policy contract", () => {
  const report = inspect(`
    import { defineGate as declareGate } from "../contract/policy.ts";
    export const gate = declareGate({ create() { return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "descriptor-wrapper")).toHaveLength(0);
});

test("follows a re-export of the final defineGate", () => {
  const report = inspect(
    `
      import { defineGate as declareGate } from "./policy-door.ts";
      export const gate = declareGate({ create() { return { visitors: {} }; } });
    `,
    { "tooling/src/verify/gates/policy-door.ts": 'export { defineGate } from "../contract/policy.ts";\n' },
  );
  expect(report.findings.filter((finding) => finding.code === "descriptor-wrapper")).toHaveLength(0);
});

test("follows visible aliases through an unambiguous re-export chain", () => {
  const report = inspect(
    `
      import { defineGate } from "./policy-door.ts";
      export const gate = defineGate({ create() { return { visitors: {} }; } });
    `,
    {
      "tooling/src/verify/gates/policy-door.ts": 'export { gateFactory as defineGate } from "./inner-door.ts";\n',
      "tooling/src/verify/gates/inner-door.ts": 'export { defineGate as gateFactory } from "../contract/policy.ts";\n',
    },
  );
  expect(report.findings.filter((finding) => finding.code === "descriptor-wrapper")).toHaveLength(0);
});

test("refuses ambiguous explicit, star-mixed, and multi-hop re-export origins", () => {
  const consumer = `
    import { defineGate } from "./policy-door.ts";
    export const gate = defineGate({ create() { return { visitors: {} }; } });
  `;
  const explicit = inspect(consumer, {
    "tooling/src/verify/gates/policy-door.ts": 'export { defineGate } from "../contract/policy.ts";\nexport { defineGate } from "./wrong.ts";\n',
    "tooling/src/verify/gates/wrong.ts": "export function defineGate<T>(policy: T): T { return policy; }\n",
  });
  const starMixed = inspect(consumer, {
    "tooling/src/verify/gates/policy-door.ts": 'export * from "../contract/policy.ts";\nexport { defineGate } from "./wrong.ts";\n',
    "tooling/src/verify/gates/wrong.ts": "export function defineGate<T>(policy: T): T { return policy; }\n",
  });
  const multiHop = inspect(consumer, {
    "tooling/src/verify/gates/policy-door.ts": 'export { defineGate } from "./inner-door.ts";\n',
    "tooling/src/verify/gates/inner-door.ts": 'export { defineGate } from "../contract/policy.ts";\nexport { defineGate } from "./wrong.ts";\n',
    "tooling/src/verify/gates/wrong.ts": "export function defineGate<T>(policy: T): T { return policy; }\n",
  });
  for (const report of [explicit, starMixed, multiHop]) {
    expect(report.findings.filter((finding) => finding.code === "descriptor-wrapper")).toHaveLength(1);
  }
});

test("refuses namespace, computed, and dynamic defineGate call shapes", () => {
  const namespace = inspect(`
    import * as Policy from "../contract/policy.ts";
    export const gate = Policy.defineGate({ create() { return { visitors: {} }; } });
  `);
  const computed = inspect(`
    import * as Policy from "../contract/policy.ts";
    export const gate = Policy["defineGate"]({ create() { return { visitors: {} }; } });
  `);
  const dynamic = inspect(`
    import { defineGate } from "../contract/policy.ts";
    export const gate = (true ? defineGate : defineGate)({ create() { return { visitors: {} }; } });
  `);
  for (const report of [namespace, computed, dynamic]) {
    expect(report.findings.filter((finding) => finding.code === "descriptor-wrapper")).toHaveLength(1);
  }
});

test("refuses local, legacy, and wrong-module defineGate lookalikes", () => {
  const local = inspect(`
    function defineGate<T>(policy: T): T { return policy; }
    export const gate = defineGate({ create() { return { visitors: {} }; } });
  `);
  const legacy = inspect(
    `
      import { defineGate } from "../contract/gate.ts";
      export const gate = defineGate({ create() { return { visitors: {} }; } });
    `,
    { "tooling/src/verify/contract/gate.ts": "export function defineGate<T>(policy: T): T { return policy; }\n" },
  );
  const wrong = inspect(
    `
      import { defineGate } from "./lookalike.ts";
      export const gate = defineGate({ create() { return { visitors: {} }; } });
    `,
    { "tooling/src/verify/gates/lookalike.ts": "export function defineGate<T>(policy: T): T { return policy; }\n" },
  );
  for (const report of [local, legacy, wrong]) {
    expect(report.findings.filter((finding) => finding.code === "descriptor-wrapper")).toHaveLength(1);
  }
});

test("accepts the final defineGate when the same module also imports the legacy helper", () => {
  const report = inspect(
    `
      import { defineGate as finalDefineGate } from "../contract/policy.ts";
      import { defineGate as legacyDefineGate } from "../contract/gate.ts";
      void legacyDefineGate;
      export const gate = finalDefineGate({ create() { return { visitors: {} }; } });
    `,
    { "tooling/src/verify/contract/gate.ts": "export function defineGate<T>(policy: T): T { return policy; }\n" },
  );
  expect(report.findings.filter((finding) => finding.code === "descriptor-wrapper")).toHaveLength(0);
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
    import { defineGate } from "../contract/policy.ts";
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
    import { defineGate } from "../contract/policy.ts";
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
  const report = inspect(
    `
    import type { Project, SourceFile } from "ts-morph";
    import { defineGate } from "../contract/policy.ts";
    declare const ctx: { project: Project; file: SourceFile; node: SourceFile };
    export const gate = defineGate({
      create() {
        ctx.project["getSourceFiles"]();
        ctx.file?.getDescendantsOfKind(1);
        ctx.node.forEachDescendant(() => undefined);
        return { visitors: {} };
      },
    });
  `,
    { "types/ts-morph.d.ts": TS_MORPH_TYPES },
  );
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
    import { defineGate } from "../contract/policy.ts";
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
      import { defineGate } from "../contract/policy.ts";
      declare const sf: SourceFile;
      declare const ctx: { readonly project: Project };
      const FIRST = "getFirstDescendantByKind";
      const walk = sf.getDescendantsOfKind;
      const bound = sf.forEachDescendant.bind(sf);
      const { getSourceFiles } = ctx.project;
      class LogicalRegistry { getSourceFiles() { return ["logical-record"]; } }
      declare const unresolved: any;
      export const gate = defineGate({
        create() {
          walk(1);
          bound(() => undefined);
          getSourceFiles();
          sf.getDescendants.call(sf);
          sf.getFirstDescendant.apply(sf);
          sf[FIRST](1);
          ctx.project.getSourceFile("x.ts");
          ctx.project.getSourceFileOrThrow("x.ts");
          new LogicalRegistry().getSourceFiles();
          unresolved.getDescendants();
          return { visitors: {} };
        },
      });
    `,
    { "types/ts-morph.d.ts": TS_MORPH_TYPES },
  );
  expect(report.findings.filter((finding) => finding.code === "direct-walk")).toHaveLength(8);
});

test("proves Project source look walks through mapped and indexed-access views", () => {
  const report = inspect(
    `
      import type { Node, Project } from "ts-morph";
      import { defineGate } from "../contract/policy.ts";
      declare const picked: Pick<Project, "getSourceFile" | "getSourceFiles">;
      declare const structural: {
        getSourceFile: Project["getSourceFile"];
        getSourceFiles: Project["getSourceFiles"];
      };
      declare const node: Node;
      export const gate = defineGate({
        create() {
          picked.getSourceFile("one.ts");
          picked.getSourceFiles();
          structural.getSourceFile("two.ts");
          structural.getSourceFiles();
          node.getSourceFile();
          return { visitors: {} };
        },
      });
    `,
    { "types/ts-morph.d.ts": TS_MORPH_TYPES },
  );
  expect(report.findings.filter((finding) => finding.code === "direct-walk")).toHaveLength(4);
});

test("follows the ts-morph Project constructor while respecting a shadowed constructor parameter", () => {
  const report = inspect(
    `
      import { Project as TsProject } from "ts-morph";
      import { defineGate } from "../contract/policy.ts";
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

test("resolves destructured, wrapped, and re-exported ts-morph Project constructors", () => {
  const report = inspect(
    `
      import * as Morph from "ts-morph";
      import { Project as Reexported } from "./project-door.ts";
      import { defineGate } from "../contract/policy.ts";
      const { Project: Destructured } = Morph;
      export const gate = defineGate({
        create() {
          new (Destructured as typeof Destructured)();
          new Reexported();
          return { visitors: {} };
        },
      });
    `,
    {
      "types/ts-morph.d.ts": TS_MORPH_TYPES,
      "tooling/src/verify/gates/project-door.ts": 'export { Project } from "ts-morph";\n',
    },
  );
  expect(report.findings.filter((finding) => finding.code === "gate-owned-project")).toHaveLength(2);
});

test("reports provable module state while leaving immutable vocabulary and local state alone", () => {
  const report = inspect(`
    import { defineGate } from "../contract/policy.ts";
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
    import { defineGate } from "../contract/policy.ts";
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

test("proves each supported module mutation shape by declaration origin", () => {
  const report = inspect(`
    import { defineGate } from "../contract/policy.ts";
    const PUSH = "push";
    const VIA_ALIAS = new Set<string>();
    const VIA_COMPUTED: string[] = [];
    const VIA_CALL = new Set<string>();
    const VIA_APPLY = new Map<string, number>();
    const VIA_ASSIGN = { count: 0 };
    const VIA_DELETE = { count: 0 };
    const VIA_UPDATE = { count: 0 };
    function record() {
      const alias = VIA_ALIAS;
      alias.add("one");
      VIA_COMPUTED[PUSH]("two");
      VIA_CALL.add.call(VIA_CALL, "three");
      VIA_APPLY.set.apply(VIA_APPLY, ["four", 4]);
      Object.assign(VIA_ASSIGN, { count: 1 });
      delete VIA_DELETE.count;
      VIA_UPDATE.count++;
    }
    export const gate = defineGate({ create() { record(); return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "module-mutation")).toHaveLength(7);
});

test("creating an unused bound mutator is not itself a mutation", () => {
  const report = inspect(`
    import { defineGate } from "../contract/policy.ts";
    const VOCABULARY = new Set<string>();
    const addLater = VOCABULARY.add.bind(VOCABULARY);
    export const gate = defineGate({ create() { return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "module-mutation")).toHaveLength(0);
});

test("reports baseline ledger paths", () => {
  const report = inspect(`
    import { defineGate } from "../contract/policy.ts";
    const BASELINE = "tooling/src/verify/gates/example.baseline.json";
    export const gate = defineGate({ create() { return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "baseline-ledger")).toHaveLength(1);
});

test("reports statically concatenated and templated baseline paths once each", () => {
  const report = inspect(`
    import { defineGate } from "../contract/policy.ts";
    const SUFFIX = ".json";
    const CONCAT = "tooling/src/verify/gates/one.baseline" + SUFFIX;
    const TEMPLATE = \`tooling/src/verify/gates/two.baseline\${SUFFIX}\`;
    export const gate = defineGate({ create() { return { visitors: {} }; } });
  `);
  expect(report.findings.filter((finding) => finding.code === "baseline-ledger")).toHaveLength(2);
});

test("batch static-string reads preserve singular results across files, aliases, and escaped mutable collections", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const first = project.createSourceFile(
    "/repo/first.ts",
    `
      const LITERAL = "one.baseline.json";
      const ALIAS = LITERAL;
      const MUTABLE = ["hidden.baseline.json"];
      const escaped = MUTABLE;
      escaped.push("changed");
      const READ = MUTABLE;
      export {};
    `,
  );
  const second = project.createSourceFile(
    "/repo/second.ts",
    `
      const LITERAL = "two.baseline.json";
      const ALIAS = LITERAL;
      const SAFE = ["visible.baseline.json"];
      export {};
    `,
  );
  const candidates = [
    first.getVariableDeclarationOrThrow("LITERAL").getInitializerOrThrow(),
    first.getVariableDeclarationOrThrow("ALIAS").getInitializerOrThrow(),
    first.getVariableDeclarationOrThrow("READ").getInitializerOrThrow(),
    second.getVariableDeclarationOrThrow("LITERAL").getInitializerOrThrow(),
    second.getVariableDeclarationOrThrow("ALIAS").getInitializerOrThrow(),
    second.getVariableDeclarationOrThrow("SAFE").getInitializerOrThrow(),
  ];

  expect(readExpressionStrings(candidates)).toEqual(candidates.map((candidate) => readExpressionString(candidate)));
  expect(readExpressionStrings(candidates).map(({ values, unresolved }) => ({ values, unresolved: unresolved.map(({ kind }) => kind) }))).toEqual([
    { values: ["one.baseline.json"], unresolved: [] },
    { values: ["one.baseline.json"], unresolved: [] },
    { values: [], unresolved: ["Reference:write"] },
    { values: ["two.baseline.json"], unresolved: [] },
    { values: ["two.baseline.json"], unresolved: [] },
    { values: ["visible.baseline.json"], unresolved: [] },
  ]);
});

test("the command refuses a zero-module corpus", { timeout: scaledBudget(30_000) }, async ({ runCli, scratch }) => {
  const result = await runCli("verify", ["gate-contract"], { cwd: scratch, timeoutMs: scaledBudget(30_000) });
  await expect(result).toExitWith(2);
  expect(result.stdout).toContain("0 finding(s) across 0 gate module(s)");
  expect(result.stderr).toContain("not a migration verdict");
});
