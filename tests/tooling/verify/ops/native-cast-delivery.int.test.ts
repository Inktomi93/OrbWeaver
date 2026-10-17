import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type { InventoryBuildRequest } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { gate as looseIds } from "../../../../tooling/src/verify/gates/no-loose-id-cast.ts";
import { gate as fabrication } from "../../../../tooling/src/verify/gates/no-test-fabrication.ts";
import { nativeTypeFactSession, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativePolicyFixture, nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

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
      policies.length === 1 && id === "no-loose-id-cast"
        ? `import {gate as actual} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)}; import {defineGate} from ${JSON.stringify(new URL("../../../../tooling/src/verify/contract/policy.ts", import.meta.url).href)}; export const gate=defineGate({...actual,family:actual.id});`
        : `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
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
    fixture(scratch, repoRoot, { [nodePath]: source }, { domFiles: { [domPath]: source } });
    const exits: number[] = [];
    for (const path of [nodePath, domPath]) {
      exits.push(await nativeVerifyFixture(scratch, "structure", ["--check=no-test-fabrication", `--file=${path}`]));
    }
    for (const path of [nodePath, domPath]) {
      exits.push(await nativeVerifyFixture(scratch, "scoped", ["--scope", path]));
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
    const workers: string[] = [];
    const requests: InventoryBuildRequest[] = [];
    const observation = { workers, requests };
    expect(await nativeVerifyFixture(scratch, "structure", ["--check=no-test-fabrication", `--file=${syntaxPath}`], observation)).toBe(1);
    expect(await nativeVerifyFixture(scratch, "scoped", ["--scope", plainPath], observation)).toBe(0);
    expect(workers).toEqual([]);
    expect(await nativeVerifyFixture(scratch, "structure", ["--check=no-test-fabrication", `--file=${nodePath}`, `--file=${domPath}`], observation)).toBe(1);
    expect(
      requests.map((request) => ({ program: request.descriptor.id, families: request.families })).toSorted((a, b) => a.program.localeCompare(b.program)),
    ).toEqual([
      { program: "tsconfig.json", families: ["cast-relations"] },
      { program: "tsconfig.tests-dom.json", families: ["cast-relations"] },
    ]);
    workers.length = 0;
    expect(await nativeVerifyFixture(scratch, "scoped", ["--scope", "tests/native"], observation)).toBe(1);
    expect(workers).toEqual([]);
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
    fixture(scratch, repoRoot, { [nodePath]: source }, { domFiles: { [domPath]: source }, policies: ["no-loose-id-cast"] });
    const exits: number[] = [];
    for (const path of [nodePath, domPath]) {
      exits.push(await nativeVerifyFixture(scratch, "structure", ["--check=no-loose-id-cast", `--file=${path}`]));
    }
    for (const path of [nodePath, domPath]) {
      exits.push(await nativeVerifyFixture(scratch, "scoped", ["--scope", path]));
    }
    expect(exits).toEqual([0, 1, 0, 1]);
  },
  scaledBudget(60_000),
);

test("failed native workers withhold both entrypoint verdicts instead of falling back to the syntax checker", async ({ scratch, repoRoot }) => {
  const path = "tests/native/value.test.ts";
  fixture(scratch, repoRoot, { [path]: "declare const value:string|number; export const result=value as number;" });
  const workers: string[] = [];
  expect(await nativeVerifyFixture(scratch, "structure", ["--check=no-test-fabrication", `--file=${path}`], { failWorker: true, workers })).toBe(2);
  expect(await nativeVerifyFixture(scratch, "scoped", ["--scope", path], { failWorker: true, workers })).toBe(2);
  expect(workers).toEqual(["tsconfig.json", "tsconfig.json"]);
});

test("the run-owned context refuses late world demand and disposed reads", ({ scratch, repoRoot }) => {
  const nodePath = "tests/native/value.test.ts";
  const domPath = "tests/native/value.dom.test.ts";
  const source = "declare const value:string|number; export const result=value as number;";
  fixture(scratch, repoRoot, { [nodePath]: source }, { domFiles: { [domPath]: source } });
  const implementation = fileURLToPath(new URL("../../../../", import.meta.url));
  const entry = fileURLToPath(new URL("../../floor/compiler/native-inventory-adapter-cases.ts", import.meta.url));
  const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
  const result = join(scratch, "cast-session.json");
  const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, "cast-session", implementation, scratch, result]);
  expect(completed.status, completed.stderr).toBe(0);
  expect(JSON.parse(readFileSync(result, "utf8"))).toMatchObject({
    beforeSeal: expect.stringContaining("must be sealed"),
    relation: { leftToRight: false },
    registration: expect.stringContaining("registration is sealed"),
    disposed: expect.stringContaining("disposed"),
  });
});

test(
  "actual mixed brand and cast consumers share one closed generation in either evaluation order",
  ({ scratch, repoRoot }) => {
    const nodePath = "tests/native/cast.test.ts";
    const domPath = "tests/native/brand.dom.test.ts";
    fixture(
      scratch,
      repoRoot,
      {
        [nodePath]: "declare const choice:boolean; const value=choice?setTimeout(()=>{},0):0; export const result=value as number;",
      },
      {
        domFiles: { [domPath]: "import type {ChatId} from '@orb/kit/ids'; declare const raw:string; export const value=raw as unknown as ChatId;" },
        policies: ["no-test-fabrication", "no-loose-id-cast"],
      },
    );
    const observed = nativePolicyFixture("cast-orders", scratch);
    const expectedRows = expect.arrayContaining([
      expect.objectContaining({ id: looseIds.id, tokens: ["raw as unknown"] }),
      expect.objectContaining({ id: fabrication.id, tokens: ["number", "unknown"] }),
    ]);
    const programs = [
      { program: "tsconfig.json", families: ["cast-relations", "id-brands"] },
      { program: "tsconfig.tests-dom.json", families: ["cast-relations", "id-brands"] },
    ];
    expect(JSON.parse(observed.text)).toMatchObject({
      checkerReads: 0,
      sameGeneration: true,
      passes: [
        { errors: [], successes: true, rows: expectedRows, workers: 2, timeline: { programs } },
        { errors: [], successes: true, rows: expectedRows, workers: 0, timeline: { programs } },
      ],
    });
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
