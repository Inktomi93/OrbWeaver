import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { nativeTypeFactSession, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

function fixture(
  root: string,
  repoRoot: string,
  nodeFiles: Readonly<Record<string, string>>,
  options: { readonly domFiles?: Readonly<Record<string, string>>; readonly policies?: readonly string[] } = {},
): void {
  const { domFiles = {}, policies = ["no-loose-id-cast"] } = options;
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

test("both actual execution doors withhold typed verdicts when the native service is absent", async ({ scratch, repoRoot }) => {
  const path = "tests/native/value.test.ts";
  fixture(scratch, repoRoot, { [path]: "import type {ChatId} from '@orb/kit/ids';declare const value:string;export const result=value as unknown as ChatId;" });
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
    expect(await runStructure(scratch, ["--check=no-loose-id-cast", `--file=${path}`])).toBe(2);
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
  fixture(scratch, repoRoot, { [path]: "import type {ChatId} from '@orb/kit/ids';declare const value:string;export const result=value as unknown as ChatId;" });
  const workers: string[] = [];
  expect(await nativeVerifyFixture(scratch, "structure", ["--check=no-loose-id-cast", `--file=${path}`], { failWorker: true, workers })).toBe(2);
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
  const result = join(scratch, "runtime-session.json");
  const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, "runtime-session", implementation, scratch, result]);
  expect(completed.status, completed.stderr).toBe(0);
  expect(JSON.parse(readFileSync(result, "utf8"))).toMatchObject({
    beforeSeal: expect.stringContaining("must be sealed"),
    exports: expect.arrayContaining([expect.objectContaining({ name: "result" })]),
    registration: expect.stringContaining("registration is sealed"),
    disposed: expect.stringContaining("disposed"),
  });
});

test("registration seals only live owners, refuses cross-owner reads and retries no failed acquisition", ({ scratch, repoRoot }) => {
  const path = "tests/native/source.test.ts";
  fixture(scratch, repoRoot, { [path]: "declare const value:number|string;export const result=value as number;" });
  const source = projectCtx(scratch).project.getSourceFileOrThrow(join(scratch, path));
  const node = source.getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression);
  const acquire = vi.fn((): never => {
    throw new Error("acquisition failed");
  });
  using session = nativeTypeFactSession(acquire);
  session.request("failed-owner", { kind: "id-brands", nodes: [node.getTypeNodeOrThrow()] });
  session.request("live-owner", { kind: "id-brands", nodes: [node.getTypeNodeOrThrow()] });
  expect(() => session.idBrands("live-owner", [node.getTypeNodeOrThrow()])).toThrow("must be sealed");
  session.seal(new Set(["live-owner"]));
  expect(() => session.idBrands("failed-owner", [node.getTypeNodeOrThrow()])).toThrow("not registered by this owner");
  expect(acquire).not.toHaveBeenCalled();
  expect(() => session.idBrands("live-owner", [node.getTypeNodeOrThrow()])).toThrow("acquisition failed");
  expect(() => session.idBrands("live-owner", [node.getTypeNodeOrThrow()])).toThrow("acquisition failed");
  expect(acquire).toHaveBeenCalledTimes(1);
  expect(acquire.mock.calls[0]).toEqual([[{ kind: "id-brands", nodes: [node.getTypeNodeOrThrow()] }]]);
  expect(() => session.request("live-owner", { kind: "id-brands", nodes: [node.getTypeNodeOrThrow()] })).toThrow("registration is sealed");
});
