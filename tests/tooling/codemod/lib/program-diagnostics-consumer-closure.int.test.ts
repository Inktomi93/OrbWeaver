// The codemod apply guard runs transformed bytes in their authored compiler world and includes real
// consumers whose own text did not change. Every assertion drives the public runCodemod harness.
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { describe, vi } from "vitest";
import { deleteFiles } from "../../../../tooling/src/codemod/index.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { withTree } from "../_kit-tree.ts";
import { BROWSER_OPTIONS, config, NODE_OPTIONS } from "./_program-diagnostics-support.ts";

const DIAGNOSTICS_TIMEOUT_MS = scaledBudget(20_000);
vi.setConfig({ testTimeout: DIAGNOSTICS_TIMEOUT_MS, hookTimeout: DIAGNOSTICS_TIMEOUT_MS });

describe("compiler-world diagnostics — unchanged consumers and the import closure", () => {
  test("an existing source excluded as a root is still diagnosed through a post-transform import closure", async () => {
    const consumer = "export const before = 1;\n";
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/consumer.ts"] }),
        "packages/client/tsconfig.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["src/anchor.ts"] }),
        "packages/client/src/anchor.ts": "export const anchor = 1;\n",
        "packages/client/src/excluded.ts": "export const title = document.title;\n",
        "tests/consumer.ts": consumer,
      },
      async ({ run, read, root }) => {
        const consumerPath = join(root, "tests/consumer.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "import the virtual browser leaf from the Node root",
                touchedFiles: [consumerPath],
                transform(inner): void {
                  inner.project
                    .getSourceFileOrThrow(consumerPath)
                    .replaceWithText('import { title } from "../packages/client/src/excluded.ts";\nexport const current: string = title;\n');
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("tests/consumer.ts")).toBe(consumer);
        expect(read("packages/client/src/excluded.ts")).toBe("export const title = document.title;\n");
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a resolution-mode change diagnoses the newly selected conditional export", async () => {
    const before = 'import type { Value } from "@orb/lib" with { "resolution-mode": "import" };\nexport const value: Value = 1;\n';
    const after = 'import type { Value } from "@orb/lib" with { "resolution-mode": "require" };\nexport const value: Value = 1;\n';
    const nodeNext = { target: "es2022", module: "nodenext", moduleResolution: "nodenext", strict: true, noEmit: true } as const;
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: nodeNext, files: ["tests/consumer.ts"] }),
        "packages/lib/package.json": JSON.stringify({ name: "@orb/lib", exports: { ".": { import: "./src/good.ts", require: "./src/bad.ts" } } }),
        "packages/lib/tsconfig.json": JSON.stringify({ compilerOptions: nodeNext, files: ["src/anchor.ts"] }),
        "packages/lib/src/anchor.ts": "export const anchor = 1;\n",
        "packages/lib/src/good.ts": "export type Value = number;\n",
        "packages/lib/src/bad.ts": 'export type Value = number;\nexport const broken: number = "wrong";\n',
        "tests/consumer.ts": before,
        "node_modules/@orb/.keep": "",
      },
      async ({ run, read, root }) => {
        symlinkSync(join(root, "packages/lib"), join(root, "node_modules/@orb/lib"), "dir");
        const path = join(root, "tests/consumer.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "select the require conditional export",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText(after);
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("tests/consumer.ts")).toBe(before);
        expect(read("packages/lib/src/bad.ts")).toContain('broken: number = "wrong"');
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("an added triple-slash path diagnoses the referenced authored source", async () => {
    const before = "export const loaded = true;\n";
    const after = '/// <reference path="./excluded/bad.ts" />\nexport const loaded = true;\n';
    const bad = 'export const broken: number = "wrong";\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/consumer.ts"] }),
        "tests/consumer.ts": before,
        "tests/excluded/bad.ts": bad,
      },
      async ({ run, read, root }) => {
        const path = join(root, "tests/consumer.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "add an authored path reference",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText(after);
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("tests/consumer.ts")).toBe(before);
        expect(read("tests/excluded/bad.ts")).toBe(bad);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("an export change that breaks an unchanged consumer refuses the whole apply", async () => {
    const api = "export const value = 1;\n";
    const consumer = 'import { value } from "./api.ts";\nexport const doubled: number = value * 2;\n';
    await withTree(
      {
        "tests/api.ts": api,
        "tests/consumer.ts": consumer,
      },
      async ({ run, read, root }) => {
        const path = join(root, "tests/api.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "break the exported type",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText("export const value = 'bad';\n");
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("tests/api.ts")).toBe(api);
        expect(read("tests/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("deleting an imported module checks the unchanged consumer before writing", async () => {
    const api = "export const value = 1;\n";
    const consumer = 'import { value } from "./api.ts";\nexport const doubled = value * 2;\n';
    await withTree(
      {
        "tests/api.ts": api,
        "tests/consumer.ts": consumer,
      },
      async ({ run, read }) => {
        await expect(
          run(
            (ctx) => {
              ctx.plan(deleteFiles(ctx, ["tests/api.ts"], { confirm: true }));
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("tests/api.ts")).toBe(api);
        expect(read("tests/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a public custom Plan deletion retains its pre-transform consumer", async () => {
    const api = "export const value = 1;\n";
    const consumer = 'import { value } from "./api.ts";\nexport const doubled = value * 2;\n';
    await withTree(
      {
        "tests/api.ts": api,
        "tests/consumer.ts": consumer,
      },
      async ({ run, read, root }) => {
        const path = join(root, "tests/api.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "delete through the public Plan contract",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).delete();
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("tests/api.ts")).toBe(api);
        expect(read("tests/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("deleting an ambient declaration expands diagnostics to its whole containing program", async () => {
    const ambient = "declare const sharedValue: number;\n";
    const consumer = "export const doubled = sharedValue * 2;\n";
    await withTree(
      {
        "globals.d.ts": ambient,
        "tests/consumer.ts": consumer,
      },
      async ({ run, read, root }) => {
        const path = join(root, "globals.d.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "delete a global input",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).delete();
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("globals.d.ts")).toBe(ambient);
        expect(read("tests/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a module augmentation expands diagnostics to consumers of the augmented module", async () => {
    const augmentation = 'import "./vendor";\ndeclare module "./vendor" { interface Thing { x: number } }\n';
    const consumer = 'import type { Thing } from "./vendor";\ndeclare const thing: Thing;\nexport const x: number = thing.x;\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: [] }),
        "packages/client/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/client/src/vendor.ts": "export interface Thing { readonly value: number }\n",
        "packages/client/src/augment.ts": augmentation,
        "packages/client/src/consumer.ts": consumer,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/client/src/augment.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "change an externally consumed module augmentation",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText('import "./vendor";\ndeclare module "./vendor" { interface Thing { y: number } }\n');
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("packages/client/src/augment.ts")).toBe(augmentation);
        expect(read("packages/client/src/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("pre-transform consumers include dynamic imports and import types", async () => {
    const api = "export interface Shape { readonly value: number }\nexport const value = 1;\n";
    const dynamicConsumer = 'export const load = () => import("./api.ts");\n';
    const typeConsumer = 'export type Imported = import("./api.ts").Shape;\n';
    await withTree(
      {
        "tests/api.ts": api,
        "tests/dynamic-consumer.ts": dynamicConsumer,
        "tests/type-consumer.ts": typeConsumer,
      },
      async ({ run, read, root }) => {
        const path = join(root, "tests/api.ts");
        const { result } = await run((ctx) => {
          ctx.plan({
            description: "preview a custom deletion",
            touchedFiles: [path],
            transform(inner): void {
              inner.project.getSourceFileOrThrow(path).delete();
            },
          });
        });
        expect(result).toMatchObject({ applied: false, diagnosticErrors: 2 });
        expect(read("tests/api.ts")).toBe(api);
        expect(read("tests/dynamic-consumer.ts")).toBe(dynamicConsumer);
        expect(read("tests/type-consumer.ts")).toBe(typeConsumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a changed source is diagnosed inside every compiler program that actually imports it", async () => {
    const view = "export const title = 'ok';\n";
    await withTree(
      {
        "tsconfig.json": config(NODE_OPTIONS, ["tests/**/*.ts"]),
        "packages/ui/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/ui/src/view.ts": view,
        "tests/consumer.ts": 'import { title } from "../packages/ui/src/view.ts";\nexport const current: string = title;\n',
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/ui/src/view.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "valid in UI, invalid in the importing node program",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).addStatements("document.title = title;\n");
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("packages/ui/src/view.ts")).toBe(view);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("replaceGlobs cannot hide an authored unchanged consumer", async () => {
    const api = "export const value = 1;\n";
    const consumer = 'import { value } from "../tests/api.ts";\nexport const expected: number = value;\n';
    await withTree(
      {
        "tsconfig.json": config(NODE_OPTIONS, ["tests/**/*.ts", "app/**/*.ts"]),
        "tests/api.ts": api,
        "app/consumer.ts": consumer,
      },
      async ({ run, read, root }) => {
        const path = join(root, "tests/api.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "change an export outside the narrowed consumer view",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText("export const value = 'wrong';\n");
                },
              });
            },
            { apply: true, replaceGlobs: [`${root}/tests/**/*.ts`] },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("tests/api.ts")).toBe(api);
        expect(read("app/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a sparse-root program retains import-only consumers across multiple hops", async () => {
    const api = "export const value = 1;\n";
    const middle = 'import { value } from "./api.ts";\nexport const middle = value;\n';
    const entry = 'import { middle } from "./middle.ts";\nexport const expected: number = middle;\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: [] }),
        "packages/server/tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["src/entry.ts"] }),
        "packages/server/src/api.ts": api,
        "packages/server/src/middle.ts": middle,
        "packages/server/src/entry.ts": entry,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/server/src/api.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "break a consumer behind an import-only intermediate",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText("export const value = 'wrong';\n");
                },
              });
            },
            { apply: true, replaceGlobs: [path] },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("packages/server/src/api.ts")).toBe(api);
        expect(read("packages/server/src/middle.ts")).toBe(middle);
        expect(read("packages/server/src/entry.ts")).toBe(entry);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a sparse browser closure keeps its import-only middle in the actual DOM program", async () => {
    const api = 'export const title = "ok";\ndocument.title = title;\n';
    const middle = 'import { title } from "../../packages/ui/src/api.ts";\nexport const current: string = title;\n';
    const entry = 'import { current } from "../shared/middle.ts";\nexport const expected: string = current;\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/node-anchor.ts"] }),
        "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["tests/e2e/entry.ts"] }),
        "packages/ui/tsconfig.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["src/api.ts", "src/anchor.ts"] }),
        "packages/ui/src/api.ts": api,
        "packages/ui/src/anchor.ts": "export const anchor = 1;\n",
        "tests/node-anchor.ts": "export const node = 1;\n",
        "tests/e2e/entry.ts": entry,
        "tests/shared/middle.ts": middle,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/ui/src/api.ts");
        const { result } = await run(
          (ctx) => {
            ctx.plan({
              description: "harmless browser API edit",
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
        expect(read("tests/shared/middle.ts")).toBe(middle);
        expect(read("tests/e2e/entry.ts")).toBe(entry);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a real error through the same sparse browser closure refuses without writes", async () => {
    const api = 'export const title = "ok";\ndocument.title = title;\n';
    const middle = 'import { title } from "../../packages/ui/src/api.ts";\nexport const current: string = title;\n';
    const entry = 'import { current } from "../shared/middle.ts";\nexport const expected: string = current;\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: ["tests/node-anchor.ts"] }),
        "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["tests/e2e/entry.ts"] }),
        "packages/ui/tsconfig.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["src/api.ts", "src/anchor.ts"] }),
        "packages/ui/src/api.ts": api,
        "packages/ui/src/anchor.ts": "export const anchor = 1;\n",
        "tests/node-anchor.ts": "export const node = 1;\n",
        "tests/e2e/entry.ts": entry,
        "tests/shared/middle.ts": middle,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/ui/src/api.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "break sparse browser consumer",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText("export const title = 42;\ndocument.title = String(title);\n");
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("packages/ui/src/api.ts")).toBe(api);
        expect(read("tests/shared/middle.ts")).toBe(middle);
        expect(read("tests/e2e/entry.ts")).toBe(entry);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("an augmentation reached as a reverse consumer expands its whole program", async () => {
    const api = "export const flag = 1;\n";
    const augmentation = 'import { flag } from "./api";\nimport "./vendor";\ndeclare module "./vendor" { interface Thing { x: typeof flag } }\n';
    const consumer = 'import type { Thing } from "./vendor";\ndeclare const thing: Thing;\nexport const x: number = thing.x;\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: NODE_OPTIONS, files: [] }),
        "packages/client/tsconfig.json": config(BROWSER_OPTIONS, ["src/**/*.ts"]),
        "packages/client/src/api.ts": api,
        "packages/client/src/vendor.ts": "export interface Thing { readonly value: number }\n",
        "packages/client/src/augment.ts": augmentation,
        "packages/client/src/consumer.ts": consumer,
      },
      async ({ run, read, root }) => {
        const path = join(root, "packages/client/src/api.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "change a type consumed through an augmentation",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText("export const flag = 'wrong';\n");
                },
              });
            },
            { apply: true },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("packages/client/src/api.ts")).toBe(api);
        expect(read("packages/client/src/augment.ts")).toBe(augmentation);
        expect(read("packages/client/src/consumer.ts")).toBe(consumer);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a narrowed edit diagnoses an alias-only unchanged intermediate consumer", async () => {
    const api = "export const value = 1;\n";
    const middle = 'import { value } from "./api.ts";\nexport const expected: number = value;\n';
    const entry = 'import "@orb/client/middle";\nexport const loaded = true;\n';
    await withTree(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: { ...NODE_OPTIONS, preserveSymlinks: true }, files: ["tests/entry.ts"] }),
        "packages/client/package.json": JSON.stringify({ name: "@orb/client", exports: { "./*": "./src/*.ts" } }),
        "packages/client/tsconfig.json": JSON.stringify({ compilerOptions: BROWSER_OPTIONS, files: ["src/anchor.ts"] }),
        "packages/client/src/anchor.ts": "export const anchor = 1;\n",
        "packages/client/src/api.ts": api,
        "packages/client/src/middle.ts": middle,
        "tests/entry.ts": entry,
        "node_modules/@orb/.keep": "",
      },
      async ({ run, read, root }) => {
        symlinkSync(join(root, "packages/client"), join(root, "node_modules/@orb/client"), "dir");
        const path = join(root, "packages/client/src/api.ts");
        await expect(
          run(
            (ctx) => {
              ctx.plan({
                description: "break the workspace leaf behind an alias-only intermediate",
                touchedFiles: [path],
                transform(inner): void {
                  inner.project.getSourceFileOrThrow(path).replaceWithText("export const value = 'wrong';\n");
                },
              });
            },
            { apply: true, replaceGlobs: [path] },
          ),
        ).rejects.toThrow("Refused to apply");
        expect(read("packages/client/src/api.ts")).toBe(api);
        expect(read("packages/client/src/middle.ts")).toBe(middle);
        expect(read("tests/entry.ts")).toBe(entry);
      },
      { skipDiagnosticsCheck: false },
    );
  });
});
