import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { AsExpression } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { canonicalIdBrand, ID_BRAND_HOME } from "../../../../tooling/src/floor/code-facts/id-brand.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as brandPositions } from "../../../../tooling/src/verify/gates/brand-in-name-position.ts";
import { gate as looseIds } from "../../../../tooling/src/verify/gates/no-loose-id-cast.ts";
import { gate as fabrication } from "../../../../tooling/src/verify/gates/no-test-fabrication.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, nativeTypeFactSession, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

function fixture(
  root: string,
  repoRoot: string,
  nodeFiles: Readonly<Record<string, string>>,
  options: { readonly domFiles?: Readonly<Record<string, string>>; readonly policies?: readonly string[] } = {},
): void {
  const { domFiles = {}, policies = ["no-test-fabrication"] } = options;
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
    JSON.stringify({ compilerOptions: { ...common, lib: ["es2022"], types: ["node"] }, files: policies.map((id) => `src/verify/gates/${id}.ts`) }),
  );
  for (const id of policies) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  for (const [path, text] of Object.entries({ ...nodeFiles, ...domFiles })) {
    write(path, text);
  }
  execFixtureGit(root, ["init", "-q"]);
}

test("tooling value casts need neither native relations nor a native service at both execution doors", async ({ scratch, repoRoot }) => {
  const path = "tests/tooling/artifact.test.ts";
  fixture(scratch, repoRoot, {
    [path]: "interface Artifact {readonly n:number} declare const raw:unknown; export const value=raw as Artifact;",
    "tests/tooling/plain.test.ts": "export const value=1;",
  });
  const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
  const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
  const original = contexts.projectCtx;
  const context = vi.spyOn(contexts, "projectCtx").mockImplementation((root) => {
    const { nativeTypeFacts: omitted, ...rest } = original(root);
    expect(omitted).toBeDefined();
    return rest;
  });
  const worker = vi.spyOn(workers, "runInventoryPartitionWorker");
  try {
    expect(await runStructure(scratch, ["--check=no-test-fabrication", `--file=${path}`])).toBe(0);
    expect(await runScopedCli(scratch, ["--scope", path])).toBe(0);
    expect(worker).not.toHaveBeenCalled();
  } finally {
    context.mockRestore();
    worker.mockRestore();
  }
});

test(
  "actual structure and scoped casts retain native Node and DOM timer meanings",
  async ({ scratch, repoRoot }) => {
    const nodePath = "tests/native/handle.test.ts";
    const domPath = "tests/native/handle.dom.test.ts";
    const source =
      "declare const useTimer:boolean; const fallback:number=0; const handle=useTimer?setTimeout(()=>{},0):fallback; export const result=handle as number;";
    fixture(scratch, repoRoot, { [nodePath]: source }, { domFiles: { [domPath]: source } });
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
      { domFiles: { [domPath]: source } },
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
    const { nativeTypeFacts: omitted, ...rest } = original(root);
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

test(
  "actual branded cast judgments preserve the importing native Node and DOM timer meanings",
  async ({ scratch, repoRoot }) => {
    const nodePath = "tests/native/brand.test.ts";
    const domPath = "tests/native/brand.dom.test.ts";
    const source =
      "import type {ChatId} from '@orb/kit/ids'; type Target=ReturnType<typeof setTimeout> extends number?ChatId:string; declare const raw:string; export const value=raw as unknown as Target;";
    fixture(scratch, repoRoot, { [nodePath]: source }, { domFiles: { [domPath]: source }, policies: ["no-loose-id-cast", "brand-in-name-position"] });
    const exits: number[] = [];
    for (const path of [nodePath, domPath]) {
      exits.push(await runStructure(scratch, ["--check=no-loose-id-cast", `--file=${path}`]));
    }
    for (const path of [nodePath, domPath]) {
      exits.push(await runScopedCli(scratch, ["--scope", path]));
    }
    expect(exits).toEqual([0, 1, 0, 1]);
  },
  scaledBudget(60_000),
);

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
  fixture(scratch, repoRoot, { [nodePath]: source }, { domFiles: { [domPath]: source } });
  const context = projectCtx(scratch);
  using relations = context.nativeTypeFacts?.();
  if (relations === undefined) {
    throw new Error("production native relation context missing");
  }
  const cast = (path: string): AsExpression =>
    context.project.getSourceFileOrThrow(join(scratch, path)).getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression);
  relations.request("control", { kind: "cast-relations", nodes: [cast(nodePath)] });
  expect(() => relations.castRelations("control", [cast(nodePath)])).toThrow("must be sealed");
  relations.seal(new Set(["control"]));
  expect(relations.castRelations("control", [cast(nodePath)]).get(cast(nodePath))).toMatchObject({ leftToRight: false });
  expect(() => relations.request("control", { kind: "cast-relations", nodes: [cast(domPath)] })).toThrow("registration is sealed");
  relations[Symbol.dispose]();
  expect(() => relations.castRelations("control", [cast(nodePath)])).toThrow("disposed");
});

test(
  "actual mixed brand and cast consumers share one closed generation in either evaluation order",
  async ({ scratch, repoRoot }) => {
    const nodePath = "tests/native/cast.test.ts";
    const domPath = "tests/native/brand.dom.test.ts";
    const namePath = "tests/native/name.test.ts";
    fixture(
      scratch,
      repoRoot,
      {
        [nodePath]: "declare const choice:boolean; const value=choice?setTimeout(()=>{},0):0; export const result=value as number;",
        [namePath]: "export function accept(chatId:string,unrelatedId:string):void{void chatId;void unrelatedId;}",
      },
      {
        domFiles: { [domPath]: "import type {ChatId} from '@orb/kit/ids'; declare const raw:string; export const value=raw as unknown as ChatId;" },
        policies: ["no-test-fabrication", "no-loose-id-cast", "brand-in-name-position"],
      },
    );
    const kitPath = join(scratch, ID_BRAND_HOME);
    mkdirSync(dirname(kitPath), { recursive: true });
    writeFileSync(kitPath, readFileSync(join(repoRoot, ID_BRAND_HOME), "utf8"));
    writeFileSync(
      join(scratch, "packages/kit/tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["es2022"], types: [], skipLibCheck: true },
        files: ["src/ids/index.ts"],
      }),
    );
    const kitOwner = createSemanticWorkspace({ root: scratch }).program("packages/kit/tsconfig.json");
    if (kitOwner === undefined) {
      throw new Error("missing native kit fixture owner");
    }
    const kit = kitOwner.project();
    const expectedPositions = kit
      .getSourceFileOrThrow(kitPath)
      .getTypeAliases()
      .filter((alias) => {
        const target = alias.getTypeNodeOrThrow();
        return canonicalIdBrand(target.getType(), target, kit.getTypeChecker()) !== null;
      }).length;
    const context = projectCtx(scratch);
    const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
    const worker = vi.spyOn(workers, "runInventoryPartitionWorker");
    const legacy = vi.spyOn(context.project, "getTypeChecker").mockImplementation(() => {
      throw new Error("ported consumers requested the syntax checker");
    });
    const policies = [fabrication, looseIds, brandPositions];
    const generations: number[] = [];
    const builds: number[] = [];
    try {
      for (const order of [policies, policies.toReversed()]) {
        const pass = runPolicyPass({
          root: scratch,
          project: context.project,
          ...nativeTypeFactOptions(context),
          knownPolicies: policies,
          policies: order,
          reviewedGrants: [],
          failOnWarnings: false,
        });
        expect(pass.toolErrors).toEqual([]);
        expect(pass.policies.map(({ owner }) => owner.status)).toEqual(["success", "success", "success"]);
        expect(pass.policies.find(({ id }) => id === brandPositions.id)).toMatchObject({
          findings: [{ token: "chatId" }],
          receipts: [{ source: "kit-id-brand-positions", members: expectedPositions }],
        });
        expect(pass.policies.find(({ id }) => id === looseIds.id)?.findings.map(({ token }) => token)).toEqual(["raw as unknown"]);
        expect(
          pass.policies
            .find(({ id }) => id === fabrication.id)
            ?.findings.map(({ token }) => token)
            .toSorted(),
        ).toEqual(["number", "unknown"]);
        using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
        const current = latestInventoryGeneration(database);
        expect(
          readInventoryGeneration(database, current)
            .map(({ program, families }) => ({ program, families }))
            .toSorted((a, b) => a.program.localeCompare(b.program)),
        ).toEqual([
          { program: "packages/kit/tsconfig.json", families: ["cast-relations", "id-brands"] },
          { program: "tsconfig.json", families: ["cast-relations", "id-brands"] },
          { program: "tsconfig.tests-dom.json", families: ["cast-relations", "id-brands"] },
        ]);
        generations.push(current);
        builds.push(worker.mock.calls.length);
        worker.mockClear();
      }
      expect(legacy).not.toHaveBeenCalled();
      expect(generations).toHaveLength(2);
      expect(new Set(generations).size).toBe(1);
      expect(builds).toEqual([3, 0]);
    } finally {
      worker.mockRestore();
      legacy.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test("registration seals only live owners, refuses cross-owner reads and retries no failed acquisition", ({ scratch, repoRoot }) => {
  const path = "tests/native/source.test.ts";
  fixture(scratch, repoRoot, { [path]: "declare const value:number|string;export const result=value as number;" });
  const source = projectCtx(scratch).project.getSourceFileOrThrow(join(scratch, path));
  const node = source.getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression);
  const acquire = vi.fn((): never => {
    throw new Error("acquisition failed");
  });
  using session = nativeTypeFactSession(acquire);
  session.request("failed-owner", { kind: "cast-relations", nodes: [node] });
  session.request("live-owner", { kind: "id-brands", nodes: [node.getTypeNodeOrThrow()] });
  expect(() => session.idBrands("live-owner", [node.getTypeNodeOrThrow()])).toThrow("must be sealed");
  session.seal(new Set(["live-owner"]));
  expect(() => session.castRelations("failed-owner", [node])).toThrow("not registered by this owner");
  expect(acquire).not.toHaveBeenCalled();
  expect(() => session.idBrands("live-owner", [node.getTypeNodeOrThrow()])).toThrow("acquisition failed");
  expect(() => session.idBrands("live-owner", [node.getTypeNodeOrThrow()])).toThrow("acquisition failed");
  expect(acquire).toHaveBeenCalledTimes(1);
  expect(acquire.mock.calls[0]).toEqual([[{ kind: "id-brands", nodes: [node.getTypeNodeOrThrow()] }]]);
  expect(() => session.request("live-owner", { kind: "cast-relations", nodes: [node] })).toThrow("registration is sealed");
});
