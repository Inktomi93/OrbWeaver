import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { AsExpression } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

function fixture(root: string, repoRoot: string, nodeFiles: Readonly<Record<string, string>>, domFiles: Readonly<Record<string, string>> = {}): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const common = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true };
  write("tsconfig.json", JSON.stringify({ compilerOptions: { ...common, lib: ["es2022"], types: ["node"] }, files: Object.keys(nodeFiles) }));
  if (Object.keys(domFiles).length > 0) {
    write("tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...common, lib: ["es2022", "dom"], types: [] }, files: Object.keys(domFiles) }));
  }
  write(
    "tooling/tsconfig.json",
    JSON.stringify({ compilerOptions: { ...common, lib: ["es2022"], types: ["node"] }, files: ["src/verify/gates/no-test-fabrication.ts"] }),
  );
  write(
    "tooling/src/verify/gates/no-test-fabrication.ts",
    `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/gates/no-test-fabrication.ts")).href)};`,
  );
  for (const [path, text] of Object.entries({ ...nodeFiles, ...domFiles })) {
    write(path, text);
  }
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "actual structure and scoped casts retain native Node and DOM timer meanings",
  async ({ scratch, repoRoot }) => {
    const nodePath = "tests/native/handle.test.ts";
    const domPath = "tests/native/handle.dom.test.ts";
    const source =
      "declare const useTimer:boolean; const fallback:number=0; const handle=useTimer?setTimeout(()=>{},0):fallback; export const result=handle as number;";
    fixture(scratch, repoRoot, { [nodePath]: source }, { [domPath]: source });
    const exits: number[] = [];
    for (const path of [nodePath, domPath]) {
      exits.push(await runStructure(scratch, ["--check=no-test-fabrication", `--file=${path}`]));
    }
    for (const path of [nodePath, domPath]) {
      exits.push(await runScopedCli(scratch, ["--scope", path]));
    }
    expect(exits).toEqual([1, 0, 1, 0]);
  },
  scaledBudget(60_000),
);

test(
  "one actual selection pins both native worlds, without starting workers for syntax-only or unrelated selections",
  async ({ scratch, repoRoot }) => {
    const nodePath = "tests/native/handle.test.ts";
    const domPath = "tests/native/handle.dom.test.ts";
    const syntaxPath = "tests/native/syntax.test.ts";
    const plainPath = "tests/native/plain.test.ts";
    const source =
      "import type {Count} from './count'; declare const choice:boolean; const handle=choice?setTimeout(()=>{},0):0; export const result=handle as Count;";
    fixture(
      scratch,
      repoRoot,
      {
        [nodePath]: source,
        [syntaxPath]: "declare const value:unknown; export const erased=value as any;",
        [plainPath]: "export const value=1;",
        "tests/native/count.ts": "export type Count=number;",
      },
      { [domPath]: source },
    );
    const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
    const worker = vi.spyOn(workers, "runInventoryPartitionWorker");
    try {
      expect(await runStructure(scratch, ["--check=no-test-fabrication", `--file=${syntaxPath}`])).toBe(1);
      expect(await runScopedCli(scratch, ["--scope", plainPath])).toBe(0);
      expect(worker).not.toHaveBeenCalled();
      expect(await runStructure(scratch, ["--check=no-test-fabrication", `--file=${nodePath}`, `--file=${domPath}`])).toBe(1);
      expect(
        worker.mock.calls
          .map(([request]) => ({ program: request.descriptor.id, families: request.families }))
          .toSorted((a, b) => a.program.localeCompare(b.program)),
      ).toEqual([
        { program: "tsconfig.json", families: ["cast-relations"] },
        { program: "tsconfig.tests-dom.json", families: ["cast-relations"] },
      ]);
      worker.mockClear();
      expect(await runScopedCli(scratch, ["--scope", "tests/native"])).toBe(1);
      expect(worker).not.toHaveBeenCalled();
    } finally {
      worker.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test("both actual execution doors withhold typed verdicts when the native service is absent", async ({ scratch, repoRoot }) => {
  const path = "tests/native/value.test.ts";
  fixture(scratch, repoRoot, { [path]: "declare const value:string|number; export const result=value as number;" });
  const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
  const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
  const original = contexts.projectCtx;
  const context = vi.spyOn(contexts, "projectCtx").mockImplementation((root) => {
    const { nativeCastRelations: omitted, ...rest } = original(root);
    expect(omitted).toBeDefined();
    return rest;
  });
  const worker = vi.spyOn(workers, "runInventoryPartitionWorker");
  try {
    expect(await runStructure(scratch, ["--check=no-test-fabrication", `--file=${path}`])).toBe(2);
    expect(await runScopedCli(scratch, ["--scope", path])).toBe(2);
    expect(worker).not.toHaveBeenCalled();
  } finally {
    context.mockRestore();
    worker.mockRestore();
  }
});

test("failed native workers withhold both entrypoint verdicts instead of falling back to the syntax checker", async ({ scratch, repoRoot }) => {
  const path = "tests/native/value.test.ts";
  fixture(scratch, repoRoot, { [path]: "declare const value:string|number; export const result=value as number;" });
  const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
  const worker = vi.spyOn(workers, "runInventoryPartitionWorker").mockImplementation(() => {
    throw new Error("native worker control failure");
  });
  try {
    expect(await runStructure(scratch, ["--check=no-test-fabrication", `--file=${path}`])).toBe(2);
    expect(await runScopedCli(scratch, ["--scope", path])).toBe(2);
    expect(worker).toHaveBeenCalledTimes(2);
  } finally {
    worker.mockRestore();
  }
});

test("the run-owned context refuses late world demand and disposed reads", ({ scratch, repoRoot }) => {
  const nodePath = "tests/native/value.test.ts";
  const domPath = "tests/native/value.dom.test.ts";
  const source = "declare const value:string|number; export const result=value as number;";
  fixture(scratch, repoRoot, { [nodePath]: source }, { [domPath]: source });
  const context = projectCtx(scratch);
  using relations = context.nativeCastRelations?.();
  if (relations === undefined) {
    throw new Error("production native relation context missing");
  }
  const cast = (path: string): AsExpression =>
    context.project.getSourceFileOrThrow(join(scratch, path)).getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression);
  expect(relations.read([cast(nodePath)]).get(cast(nodePath))).toMatchObject({ leftToRight: false });
  expect(() => relations.read([cast(domPath)])).toThrow("demand changed after generation pinning");
  relations[Symbol.dispose]();
  expect(() => relations.read([cast(nodePath)])).toThrow("disposed");
});
