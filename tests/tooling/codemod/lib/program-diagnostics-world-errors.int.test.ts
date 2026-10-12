// The codemod apply guard runs transformed bytes in their authored compiler world and includes real
// consumers whose own text did not change. Every assertion drives the public runCodemod harness.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { describe, vi } from "vitest";
import { scaledBudget } from "../../_load-budget.ts";
import { withTree } from "../_kit-tree.ts";
import { BROWSER_OPTIONS, config, NODE_OPTIONS } from "./_program-diagnostics-support.ts";

const DIAGNOSTICS_TIMEOUT_MS = scaledBudget(20_000);
vi.setConfig({ testTimeout: DIAGNOSTICS_TIMEOUT_MS, hookTimeout: DIAGNOSTICS_TIMEOUT_MS });

describe("compiler-world diagnostics — refusals, dry-run and error reporting", () => {
  test("a new browser-world error refuses and the failed apply writes nothing", async () => {
    const original = "export const title = 'ok';\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: [] }),
        "packages/ui/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/ui/src/view.ts": original,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/ui/src/view.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "invalid DOM assignment",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).addStatements("document.title = 42;\n");
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("packages/ui/src/view.ts")).toBe(original);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("dry-run performs the same browser-world check and writes no bytes", async () => {
    const original = "export const title = 'ok';\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: [] }),
        "packages/ui/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/ui/src/view.ts": original,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/ui/src/view.ts");
        const { result } = await run((ctx) => {
          ctx.plan({
            description: "valid DOM preview",
            touchedFiles: [path],
            transform(inner): void {
              inner.project.getSourceFileOrThrow(path).addStatements("document.title = title;\n");
            },
          });
        });
        expect(result).toMatchObject({ applied: false, diagnosticErrors: 0 });
        expect(read("packages/ui/src/view.ts")).toBe(original);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a locationless native program error is reported with config and code context", async () => {
    const original = "export const value = 1;\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: { ...NODE_OPTIONS, types: ["missing-codemod-type"] }, files: ["tests/probe.ts"] }),
        "tests/probe.ts": original,
      },
      async ({ run, read, root }) => {
        const path = join(root, "tests/probe.ts");
        const plan = (ctx: Parameters<Parameters<typeof run>[0]>[0]): void => {
          ctx.plan({
            description: "exercise the affected program's native diagnostics",
            touchedFiles: [path],
            transform(inner): void {
              inner.project.getSourceFileOrThrow(path).addStatements("export const added = 2;\n");
            },
          });
        };
        const preview = await run(plan);
        expect(preview.output).toContain("tsconfig.json: <program> TS2688");
        await expect(run(plan, { apply: true })).rejects.toThrow("Refused to apply");
        expect(read("tests/probe.ts")).toBe(original);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a declaration-only diagnostic does not block a program that emits no declarations", async () => {
    const original = "export const value = 1;\n";
    const declarationOnly = "export const make = () => class { private value = 1; read(): number { return this.value; } };\n";
    await withTree(
      {
        "tsconfig.json": config(NODE_OPTIONS, ["tests/**/*.ts"]),
        "tests/probe.ts": original,
      },
      async ({ run, read, root }) => {
        const path = join(root, "tests/probe.ts");
        const { result } = await run(
          (ctx) => {
            ctx.plan({
              description: "declaration-portability is outside this authored program",
              touchedFiles: [path],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(path).replaceWithText(declarationOnly);
              },
            });
          },
          { apply: true },
        );
        expect(result).toMatchObject({ applied: true, diagnosticErrors: 0 });
        expect(read("tests/probe.ts")).toBe(declarationOnly);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("the same declaration diagnostic refuses when the authored program enables declarations", async () => {
    const original = "export const value = 1;\n";
    const declarationOnly = "export const make = () => class { private value = 1; read(): number { return this.value; } };\n";
    await withTree(
      {
        "tsconfig.json": config({ ...NODE_OPTIONS, declaration: true }, ["tests/**/*.ts"]),
        "tests/probe.ts": original,
      },
      async ({ run, read, root }) => {
        const path = join(root, "tests/probe.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "declaration-portability belongs to this authored program",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText(declarationOnly);
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("tests/probe.ts")).toBe(original);
      },
      { skipDiagnosticsCheck: false },
    );
  });
});
