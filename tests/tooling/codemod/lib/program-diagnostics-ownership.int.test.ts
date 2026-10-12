// The codemod apply guard runs transformed bytes in their authored compiler world and includes real
// consumers whose own text did not change. Every assertion drives the public runCodemod harness.
import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { describe, vi } from "vitest";
import { createSourceFile, moveFiles } from "../../../../tooling/src/codemod/index.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { withTree } from "../_kit-tree.ts";
import { BROWSER_OPTIONS, config, NODE_OPTIONS } from "./_program-diagnostics-support.ts";

const DIAGNOSTICS_TIMEOUT_MS = scaledBudget(20_000);
vi.setConfig({ testTimeout: DIAGNOSTICS_TIMEOUT_MS, hookTimeout: DIAGNOSTICS_TIMEOUT_MS });

describe("compiler-world diagnostics — program ownership of moved and created files", () => {
  test("a legitimate browser transform applies under the browser package program", async () => {
    const original = "export const title = 'ok';\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: [] }),
        "packages/ui/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/ui/src/view.ts": original,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/ui/src/view.ts");
        const { result } = await run(
          (ctx) => {
            ctx.plan({
              description: "valid DOM use",
              touchedFiles: [path],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(path).addStatements("document.title = title;\n");
              },
            });
          },
          { apply: true },
        );
        expect(result).toMatchObject({ applied: true, diagnosticErrors: 0 });
        expect(read("packages/ui/src/view.ts")).toContain("document.title = title");
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a moved destination is checked in its intended destination world, not its former owner", async () => {
    await withTree(
      {
        "tsconfig.json": config(NODE_OPTIONS, ["tests/**/*.ts"]),
        "packages/ui/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/ui/src/anchor.ts": "export const anchor = 1;\n",
        "packages/ui/src/consumer.ts": 'import { title } from "../../../tests/view.ts";\nexport const current = title;\n',
        "tests/view.ts": "export const title = 'ok';\n",
      },
      async ({ run, read, root }) => {
        const destination = join(root, "packages/ui/src/view.ts");
        const { result } = await run(
          (ctx) => {
            ctx.plan(moveFiles(ctx, [["tests/view.ts", "packages/ui/src/view.ts"]]));
            ctx.plan({
              description: "use the destination's browser world",
              touchedFiles: [destination],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(destination).addStatements("document.title = title;\n");
              },
            });
          },
          { apply: true },
        );
        expect(result).toMatchObject({ applied: true, diagnosticErrors: 0 });
        expect(read("packages/ui/src/view.ts")).toContain("document.title = title");
        expect(read("packages/ui/src/consumer.ts")).toContain('from "./view.ts"');
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("an autosave type contract relocated within the DOM tree keeps its actual post-move owner", async () => {
    const original = "export const title = document.title;\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/node-anchor.ts"] }),
        "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, include: ["tests/client/**/*.ts"] }),
        "tests/node-anchor.ts": "export const node = 1;\n",
        "tests/client/forms/autosave-model.test-d.ts": original,
      },
      async ({ run, read }) => {
        const { result } = await run(
          (ctx) => {
            ctx.plan(moveFiles(ctx, [["tests/client/forms/autosave-model.test-d.ts", "tests/client/forms/editor/autosave-contract.test-d.ts"]]));
          },
          { apply: true },
        );
        expect(result).toMatchObject({ applied: true, diagnosticErrors: 0 });
        expect(read("tests/client/forms/editor/autosave-contract.test-d.ts")).toBe(original);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a post-move root reached through an in-repo config alias owns the physical destination", async () => {
    const original = "export const title = document.title;\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/node-anchor.ts"] }),
        "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, include: ["client-alias/**/*.ts"] }),
        "tests/node-anchor.ts": "export const node = 1;\n",
        "tests/client/forms/autosave-model.test-d.ts": original,
      },
      async ({ run, read, root }) => {
        symlinkSync(join(root, "tests/client"), join(root, "client-alias"), "dir");
        const { result } = await run(
          (ctx) => {
            ctx.plan(moveFiles(ctx, [["tests/client/forms/autosave-model.test-d.ts", "tests/client/forms/editor/autosave-contract.test-d.ts"]]));
          },
          { apply: true },
        );
        expect(result).toMatchObject({ applied: true, diagnosticErrors: 0 });
        expect(read("tests/client/forms/editor/autosave-contract.test-d.ts")).toBe(original);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("canonical and alias roots in one program count as one exclusive owner", async () => {
    const original = "export const value = 1;\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/client/existing.ts", "client-alias/existing.ts"] }),
        "tests/client/existing.ts": original,
      },
      async ({ run, read, root }) => {
        symlinkSync(join(root, "tests/client"), join(root, "client-alias"), "dir");
        const path = join(root, "tests/client/existing.ts");
        const { result } = await run(
          (ctx) => {
            ctx.plan({
              description: "edit one physical test through its canonical root",
              touchedFiles: [path],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(path).addStatements("export const added = 2;\n");
              },
            });
          },
          { apply: true },
        );
        expect(result).toMatchObject({ applied: true, diagnosticErrors: 0 });
        expect(read("tests/client/existing.ts")).toContain("export const added = 2");
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a browser helper relocated into the Node root reports its real DOM error without writes", async () => {
    const original = "export const title = document.title;\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/node-anchor.ts"], include: ["tests/support/node/**/*.ts"] }),
        "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, include: ["tests/support/browser/**/*.ts"] }),
        "tests/node-anchor.ts": "export const node = 1;\n",
        "tests/support/browser/helper.ts": original,
      },
      async ({ run, read, root }) => {
        const plan = (ctx: Parameters<Parameters<typeof run>[0]>[0]): void => {
          ctx.plan(moveFiles(ctx, [["tests/support/browser/helper.ts", "tests/support/node/helper.ts"]]));
        };
        const preview = await run(plan);
        expect(preview.result).toMatchObject({ applied: false, diagnosticErrors: 1 });
        expect(preview.output).toContain("TS2584");
        await expect(run(plan, { apply: true })).rejects.toThrow("Refused to apply");
        expect(read("tests/support/browser/helper.ts")).toBe(original);
        expect(existsSync(join(root, "tests/support/node/helper.ts"))).toBe(false);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a moved test with no actual post-move root owner is refused", async () => {
    const original = "export const value = 1;\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/node-anchor.ts"] }),
        "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, include: ["tests/client/**/*.ts"] }),
        "tests/node-anchor.ts": "export const node = 1;\n",
        "tests/client/original.test-d.ts": original,
      },
      async ({ run, read, root }) => {
        await expect(
          run((ctx) => {
            ctx.plan(moveFiles(ctx, [["tests/client/original.test-d.ts", "tests/unowned/moved.test.ts"]]));
          }),
        ).rejects.toThrow("No authored compiler program owns moved destination tests/unowned/moved.test.ts");
        expect(read("tests/client/original.test-d.ts")).toBe(original);
        expect(existsSync(join(root, "tests/unowned/moved.test.ts"))).toBe(false);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a moved test with overlapping actual post-move roots is refused", async () => {
    const original = "export const value = 1;\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/node-anchor.ts"], include: ["tests/shared/**/*.ts"] }),
        "tsconfig.other.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/other-anchor.ts"], include: ["tests/shared/**/*.ts"] }),
        "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, include: ["tests/client/**/*.ts"] }),
        "tests/node-anchor.ts": "export const node = 1;\n",
        "tests/other-anchor.ts": "export const other = 1;\n",
        "tests/client/original.test-d.ts": original,
      },
      async ({ run, read, root }) => {
        await expect(
          run((ctx) => {
            ctx.plan(moveFiles(ctx, [["tests/client/original.test-d.ts", "tests/shared/moved.test.ts"]]));
          }),
        ).rejects.toThrow("Conflicting compiler ownership");
        expect(read("tests/client/original.test-d.ts")).toBe(original);
        expect(existsSync(join(root, "tests/shared/moved.test.ts"))).toBe(false);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a created file excluded from every post-transform root is refused without writes", async () => {
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/anchor.ts"] }),
        "tests/anchor.ts": "export const anchor = 1;\n",
      },
      async ({ run, root }) => {
        await expect(
          run(
            (ctx) => {
              ctx.plan(createSourceFile(ctx, "tests/unowned.ts", "export const value: number = 1;\n"));
            },
            { apply: true },
          ),
        ).rejects.toThrow("No authored compiler program owns created path tests/unowned.ts");
        expect(existsSync(join(root, "tests/unowned.ts"))).toBe(false);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a created file included by an actual post-transform root applies", async () => {
    await withTree(
      {
        "tsconfig.json": config(NODE_OPTIONS, ["tests/**/*.ts"]),
        "tests/anchor.ts": "export const anchor = 1;\n",
      },
      async ({ run, read }) => {
        const { result } = await run(
          (ctx) => {
            ctx.plan(createSourceFile(ctx, "tests/included.ts", "export const value: number = 1;\n"));
          },
          { apply: true },
        );
        expect(result).toMatchObject({ applied: true, filesCreated: 1, diagnosticErrors: 0 });
        expect(read("tests/included.ts")).toBe("export const value: number = 1;\n");
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a failed create apply does not even materialize its destination directory", async () => {
    await withTree(
      {
        "tests/anchor.ts": "export const anchor = 1;\n",
      },
      async ({ run, root }) => {
        await expect(
          run(
            (ctx) => {
              ctx.plan(createSourceFile(ctx, "tests/new/bad.ts", "export const bad: number = 'wrong';\n"));
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(existsSync(join(root, "tests/new"))).toBe(false);
        const { result } = await run(
          (ctx) => {
            ctx.plan(createSourceFile(ctx, "tests/new/good.ts", "export const good: number = 1;\n"));
          },
          { apply: true },
        );
        expect(result.applied).toBe(true);
        expect(existsSync(join(root, "tests/new/good.ts"))).toBe(true);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("missing and conflicting exclusive ownership refuse instead of selecting a convenient program", async () => {
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: [] }),
        "packages/ui/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/ui/src/anchor.ts": "export const anchor = 1;\n",
        "mystery/value.ts": "export const value = 1;\n",
      },
      async ({ run, root }) => {
        const path = join(root, "mystery/value.ts");
        await expect(
          run((ctx) => {
            ctx.plan({
              description: "unowned edit",
              touchedFiles: [path],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(path).addStatements("export const changed = 2;\n");
              },
            });
          }),
        ).rejects.toThrow("No authored compiler program owns mystery/value.ts");
      },
      { skipDiagnosticsCheck: false },
    );

    await withTree(
      {
        "tsconfig.json": config(NODE_OPTIONS, ["tests/**/*.ts"]),
        "tsconfig.other.json": config(NODE_OPTIONS, ["tests/**/*.ts"]),
        "tests/ambiguous.ts": "export const value = 1;\n",
      },
      async ({ run, root }) => {
        const path = join(root, "tests/ambiguous.ts");
        await expect(
          run((ctx) => {
            ctx.plan({
              description: "ambiguous edit",
              touchedFiles: [path],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(path).addStatements("export const changed = 2;\n");
              },
            });
          }),
        ).rejects.toThrow("Conflicting compiler ownership");
      },
      { skipDiagnosticsCheck: false },
    );
  });
});
