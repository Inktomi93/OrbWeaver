// The codemod apply guard runs transformed bytes in their authored compiler world and includes real
// consumers whose own text did not change. Every assertion drives the public runCodemod harness.
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { describe, vi } from "vitest";
import { createSourceFile } from "../../../../tooling/src/codemod/index.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { withTree } from "../_kit-tree.ts";
import { BROWSER_OPTIONS, config, NODE_OPTIONS } from "./_program-diagnostics-support.ts";

const DIAGNOSTICS_TIMEOUT_MS = scaledBudget(20_000);
vi.setConfig({ testTimeout: DIAGNOSTICS_TIMEOUT_MS, hookTimeout: DIAGNOSTICS_TIMEOUT_MS });

describe("compiler-world diagnostics — transitional roots, aliases and workspace packages", () => {
  test("an unchanged browser-rooted Node-intended consumer uses its actual authored program during transition", async () => {
    const api = "export const value = 1;\n";
    const consumer = 'import { value } from "../../../packages/ui/src/lib.ts";\nexport const expected: number = value;\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/node-anchor.ts"] }),
        "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["tests/ui/lib/class-merge.test.ts"] }),
        "packages/ui/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/ui/src/lib.ts": api,
        "tests/node-anchor.ts": "export const node = 1;\n",
        "tests/ui/lib/class-merge.test.ts": consumer,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/ui/src/lib.ts");
        const { result } = await run(
          (ctx) => {
            ctx.plan({
              description: "safe prerequisite barrel edit",
              touchedFiles: [path],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(path).addStatements("export const added = 2;\n");
              },
            });
          },
          { apply: true },
        );
        expect(result).toMatchObject({ applied: true, diagnosticErrors: 0 });
        expect(read("packages/ui/src/lib.ts")).toContain("export const added = 2");
        expect(read("tests/ui/lib/class-merge.test.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("the same transitional consumer still refuses an introduced type error without writes", async () => {
    const api = "export const value = 1;\n";
    const consumer = 'import { value } from "../../../packages/ui/src/lib.ts";\nexport const expected: number = value;\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/node-anchor.ts"] }),
        "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["tests/ui/lib/class-merge.test.ts"] }),
        "packages/ui/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/ui/src/lib.ts": api,
        "tests/node-anchor.ts": "export const node = 1;\n",
        "tests/ui/lib/class-merge.test.ts": consumer,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/ui/src/lib.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "break the unchanged transitional consumer",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText("export const value = 'wrong';\n");
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("packages/ui/src/lib.ts")).toBe(api);
        expect(read("tests/ui/lib/class-merge.test.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("an existing package source uses its actual transitional root when predictive ownership differs", async () => {
    const api = "export const value = 1;\n";
    const consumer = 'import { value } from "./api.ts";\nexport const expected: number = value;\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: [] }),
        "tsconfig.transitional.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["packages/ui/src/consumer.ts"] }),
        "packages/ui/tsconfig.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["src/api.ts", "src/anchor.ts"] }),
        "packages/ui/src/anchor.ts": "export const anchor = 1;\n",
        "packages/ui/src/api.ts": api,
        "packages/ui/src/consumer.ts": consumer,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/ui/src/api.ts");
        const { result } = await run(
          (ctx) => {
            ctx.plan({
              description: "safe package prerequisite edit",
              touchedFiles: [path],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(path).addStatements("export const added = 2;\n");
              },
            });
          },
          { apply: true },
        );
        expect(result).toMatchObject({ applied: true, diagnosticErrors: 0 });
        expect(read("packages/ui/src/api.ts")).toContain("export const added = 2");
        expect(read("packages/ui/src/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("an in-repo alias mutation overlays the physical source seen by native consumers", async () => {
    const api = "export const value = 1;\n";
    const consumer = 'import { value } from "./inside/api.ts";\nexport const expected: number = value;\n';
    await withTree(
      {
        "tests/inside/api.ts": api,
        "tests/consumer.ts": consumer,
      },
      async ({ run, read, root }) => {
        symlinkSync(join(root, "tests/inside"), join(root, "tests/alias"), "dir");
        const aliasPath = join(root, "tests/alias/api.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "mutate through an in-repo physical alias",
                touchedFiles: [aliasPath],
                transform(inner): void {
                  const sourceFile = inner.project.getSourceFile(aliasPath) ?? inner.project.addSourceFileAtPath(aliasPath);
                  sourceFile.replaceWithText("export const value = 'wrong';\n");
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("tests/inside/api.ts")).toBe(api);
        expect(read("tests/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a workspace package wildcard export resolves a new virtual subpath with preserveSymlinks", async () => {
    const consumer = 'import { value } from "../packages/client/src/legacy.ts";\nexport const expected: number = value;\n';
    const routedConsumer = 'import { value } from "@orb/client/forms/editor";\nexport const expected: number = value;\n';
    await withTree(
      {
        "tsconfig.json": config({ ...NODE_OPTIONS, preserveSymlinks: true }, ["tests/**/*.ts"]),
        "packages/client/package.json": JSON.stringify({ name: "@orb/client", exports: { "./*": "./src/*/index.ts" } }),
        "packages/client/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/client/src/legacy.ts": "export const value = 1;\n",
        "tests/consumer.ts": consumer,
        "node_modules/@orb/.keep": "",
      },
      async ({ run, read, root }) => {
        symlinkSync(join(root, "packages/client"), join(root, "node_modules/@orb/client"), "dir");
        const consumerPath = join(root, "tests/consumer.ts");
        const { result } = await run(
          (ctx) => {
            ctx.plan(createSourceFile(ctx, "packages/client/src/forms/editor/index.ts", 'export { value } from "../../legacy.ts";\n'));
            ctx.plan({
              description: "route the consumer through the new package export",
              touchedFiles: [consumerPath],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(consumerPath).replaceWithText(routedConsumer);
              },
            });
          },
          { apply: true },
        );
        expect(result).toMatchObject({ applied: true, diagnosticErrors: 0 });
        expect(read("packages/client/src/forms/editor/index.ts")).toContain('from "../../legacy.ts"');
        expect(read("tests/consumer.ts")).toBe(routedConsumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a real error behind a new workspace export refuses without materializing the subpath", async () => {
    const consumer = 'import { value } from "../packages/client/src/legacy.ts";\nexport const expected: number = value;\n';
    const routedConsumer = 'import { value } from "@orb/client/forms/editor";\nexport const expected: number = value;\n';
    await withTree(
      {
        "tsconfig.json": config(NODE_OPTIONS, ["tests/**/*.ts"]),
        "packages/client/package.json": JSON.stringify({ name: "@orb/client", exports: { "./*": "./src/*/index.ts" } }),
        "packages/client/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/client/src/legacy.ts": "export const value = 1;\n",
        "tests/consumer.ts": consumer,
        "node_modules/@orb/.keep": "",
      },
      async ({ run, read, root }) => {
        symlinkSync(join(root, "packages/client"), join(root, "node_modules/@orb/client"), "dir");
        const consumerPath = join(root, "tests/consumer.ts");
        const invalidEntry = 'export const value: number = "wrong";\n';
        const plan = (ctx: Parameters<Parameters<typeof run>[0]>[0]): void => {
          ctx.plan(createSourceFile(ctx, "packages/client/src/forms/editor/index.ts", invalidEntry));
          ctx.plan({
            description: "route the consumer through the invalid package export",
            touchedFiles: [consumerPath],
            transform(inner): void {
              inner.project.getSourceFileOrThrow(consumerPath).replaceWithText(routedConsumer);
            },
          });
        };
        const preview = await run(plan);
        expect(preview.result).toMatchObject({ applied: false, diagnosticErrors: 2 });
        expect(preview.output).toContain("TS2322");
        expect(preview.output).not.toContain("TS2307");
        await expect(run(plan, { apply: true })).rejects.toThrow("Refused to apply");
        expect(existsSync(join(root, "packages/client/src/forms"))).toBe(false);
        expect(read("tests/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("preserveSymlinks retains an existing workspace target's unchanged consumer", async () => {
    const api = "export const value = 1;\n";
    const consumer = 'import { value } from "@orb/client/api";\nexport const expected: number = value;\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: { ...NODE_OPTIONS, preserveSymlinks: true }, files: ["tests/consumer.ts"] }),
        "packages/client/package.json": JSON.stringify({ name: "@orb/client", exports: { "./*": "./src/*.ts" } }),
        "packages/client/tsconfig.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["src/anchor.ts"] }),
        "packages/client/src/anchor.ts": "export const anchor = 1;\n",
        "packages/client/src/api.ts": api,
        "tests/consumer.ts": consumer,
        "node_modules/@orb/.keep": "",
      },
      async ({ run, read, root }) => {
        symlinkSync(join(root, "packages/client"), join(root, "node_modules/@orb/client"), "dir");
        const path = join(root, "packages/client/src/api.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "break the workspace target behind an unchanged alias consumer",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText("export const value = 'wrong';\n");
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("packages/client/src/api.ts")).toBe(api);
        expect(read("tests/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a real third-party package remains visible to native diagnostics", async () => {
    const consumer = "export const before = 1;\n";
    await withTree(
      {
        "tsconfig.json": config(NODE_OPTIONS, ["tests/**/*.ts"]),
        "tests/consumer.ts": consumer,
        "node_modules/vendor/package.json": JSON.stringify({ name: "vendor", exports: "./index.d.ts" }),
        "node_modules/vendor/index.d.ts": 'export declare const value: "wrong";\n',
      },
      async ({ run, read, root }) => {
        const consumerPath = join(root, "tests/consumer.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "introduce a third-party type error",
                touchedFiles: [consumerPath],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(consumerPath).replaceWithText('import { value } from "vendor";\nexport const expected: number = value;\n');
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("tests/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("an external package symlink stays on the native host", async () => {
    const external = mkdtempSync(join(realpathSync(tmpdir()), "orb-codemod-external-"));
    try {
      writeFileSync(join(external, "package.json"), JSON.stringify({ name: "external", exports: "./index.d.ts" }));
      writeFileSync(join(external, "index.d.ts"), "export declare const value: number;\n");
      await withTree(
        {
          ".gitignore": "node_modules/\n",
          "tsconfig.json": config(NODE_OPTIONS, ["tests/**/*.ts"]),
          "tests/consumer.ts": "export const before = 1;\n",
          "node_modules/.keep": "",
        },
        async ({ run, read, root }) => {
          symlinkSync(external, join(root, "node_modules/external"), "dir");
          const consumerPath = join(root, "tests/consumer.ts");
          const transformed = 'import { value } from "external";\nexport const expected: number = value;\n';
          const { result } = await run(
            (ctx) => {
              ctx.plan({
                description: "read an external package through the native host",
                touchedFiles: [consumerPath],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(consumerPath).replaceWithText(transformed);
                },
              });
            },
            { apply: true },
          );
          expect(result).toMatchObject({ applied: true, diagnosticErrors: 0 });
          expect(read("tests/consumer.ts")).toBe(transformed);
        },
        { skipDiagnosticsCheck: false },
      );
    } finally {
      rmSync(external, { recursive: true, force: true });
    }
  });
});
