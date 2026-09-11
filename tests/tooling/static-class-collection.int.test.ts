import { ModuleKind, ModuleResolutionKind, Project, ScriptKind, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../../tooling/src/verify/contract/gate.ts";
import { beginHookOwnerCollection, collectHookOwners, hookOwnerWork, visitHookOwnerNode } from "../../tooling/src/verify/lib/css-family-source-provenance.ts";
import { runPass } from "../../tooling/src/verify/lib/pass.ts";
import { STATIC_CLASS_KINDS } from "../../tooling/src/verify/lib/static-class-expression.ts";
import { expect, test } from "../support/tool-fixtures.ts";

const ROOT = "/repo";

function project(): Project {
  const workspace = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext, jsx: 4 },
  });
  workspace.createSourceFile(`${ROOT}/packages/ui/src/classes.ts`, 'export const CLASS_NAME = "probe-shared";\n');
  workspace.createSourceFile(`${ROOT}/packages/ui/src/wrappers.ts`, 'import { clsx } from "clsx";\nexport const forward = (value: string) => clsx(value);\n');
  workspace.createSourceFile(
    `${ROOT}/packages/client/src/view.tsx`,
    [
      'import { clsx } from "clsx";',
      'import { CLASS_NAME } from "../../ui/src/classes.ts";',
      'import { forward } from "../../ui/src/wrappers.ts";',
      'const Child = ({ className: renamed }: { className: string }) => <div className={clsx("probe-child-base", renamed)} />;',
      'export const View = <><div className={CLASS_NAME} /><div className={forward("probe-forwarded")} /><Child className="probe-callsite" /></>;',
    ].join("\n"),
    { scriptKind: ScriptKind.TSX },
  );
  return workspace;
}

function context(workspace: Project): Omit<GateRunCtx, "report" | "scan"> {
  return {
    root: ROOT,
    project: workspace,
    scope: { kind: "project" },
    files: workspace.getSourceFiles(),
    checker: () => workspace.getTypeChecker(),
  };
}

function countWalk(source: import("ts-morph").SourceFile, counter: { sourceWalks: number }): void {
  const original = source.forEachDescendant.bind(source);
  source.forEachDescendant = ((visitor: Parameters<typeof original>[0]) => {
    counter.sourceWalks += 1;
    return original(visitor);
  }) as typeof source.forEachDescendant;
}

test("bounds one pass to one source walk and no project-wide import-resolution arrays", () => {
  const workspace = project();
  const files = workspace.getSourceFiles();
  const base = context(workspace);
  const counter = { sourceWalks: 0 };
  let projectArrays = 0;
  for (const source of files) {
    countWalk(source, counter);
  }
  const originalGetSourceFiles = workspace.getSourceFiles.bind(workspace);
  workspace.getSourceFiles = (() => {
    projectArrays += 1;
    return originalGetSourceFiles();
  }) as typeof workspace.getSourceFiles;

  const fingerprints: string[] = [];
  const work: Array<{ readonly dispatchedNodes: number; readonly rootEvaluations: number }> = [];
  const gate = (name: string): GateDescriptor => ({
    name,
    docRow: "test control",
    status: "active",
    scopeSafety: "whole-project",
    message: "test control",
    mustFlag: [],
    mustPass: [],
    begin: beginHookOwnerCollection,
    kinds: STATIC_CLASS_KINDS,
    visit: visitHookOwnerNode,
    finalize: (ctx) => {
      const expected = ctx.project
        .getSourceFileOrThrow(`${ROOT}/packages/ui/src/classes.ts`)
        .getVariableDeclarationOrThrow("CLASS_NAME")
        .getInitializerIfKindOrThrow(SyntaxKind.StringLiteral)
        .getLiteralText();
      const owners = collectHookOwners(ctx);
      fingerprints.push(JSON.stringify([...owners.keys()].filter((key) => key.startsWith("class:probe-")).sort()));
      work.push(hookOwnerWork(ctx));
      expect(owners.has(`class:${expected}`)).toBe(true);
      expect(owners.has("class:probe-forwarded")).toBe(true);
      expect(owners.has("class:probe-child-base")).toBe(true);
      expect(owners.has("class:probe-callsite")).toBe(true);
    },
  });
  const { finalize: omittedFinalize, ...unfinished } = gate("probe-static-class-unfinished");
  expect(omittedFinalize).toEqual(expect.any(Function));

  const unfinishedPass = runPass([unfinished], base);
  expect(unfinishedPass.toolErrors).toEqual([]);
  expect(counter.sourceWalks).toBe(files.length);

  workspace.getSourceFileOrThrow(`${ROOT}/packages/ui/src/classes.ts`).replaceWithText('export const CLASS_NAME = "probe-changed";\n');
  const firstPass = runPass([gate("probe-static-class-a"), gate("probe-static-class-b")], base);
  expect(firstPass.toolErrors).toEqual([]);
  expect(counter.sourceWalks).toBe(files.length * 2);
  expect(projectArrays).toBe(0);
  expect(fingerprints[0]).toBe('["class:probe-callsite","class:probe-changed","class:probe-child-base","class:probe-forwarded"]');
  expect(fingerprints[0]).toBe(fingerprints[1]);
  expect(work[0]).toEqual(work[1]);
  expect(work[0]).toEqual({ evaluators: 1, dispatchedNodes: 37, rootEvaluations: 7 });

  workspace.getSourceFileOrThrow(`${ROOT}/packages/ui/src/classes.ts`).replaceWithText('export const CLASS_NAME = "probe-after-pass";\n');
  const secondPass = runPass([gate("probe-static-class-a"), gate("probe-static-class-b")], base);
  expect(secondPass.toolErrors).toEqual([]);
  expect(counter.sourceWalks).toBe(files.length * 3);
  expect(fingerprints.at(-1)).toBe('["class:probe-after-pass","class:probe-callsite","class:probe-child-base","class:probe-forwarded"]');
});
