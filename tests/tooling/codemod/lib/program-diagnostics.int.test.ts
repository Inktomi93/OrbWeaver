// The codemod apply guard runs transformed bytes in their authored compiler world and includes real
// consumers whose own text did not change. Every assertion drives the public runCodemod harness.
import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { createSourceFile, deleteFiles, moveFiles } from "../../../../tooling/src/codemod/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { withTree } from "../_kit-tree.ts";

const NODE_OPTIONS = {
  target: "es2022",
  module: "esnext",
  moduleResolution: "bundler",
  allowImportingTsExtensions: true,
  lib: ["es2022"],
  strict: true,
  noEmit: true,
} as const;

const BROWSER_OPTIONS = { ...NODE_OPTIONS, lib: ["es2022", "dom"] } as const;

function config(compilerOptions: object, include: readonly string[]): string {
  return JSON.stringify({ compilerOptions, include });
}

describe("compiler-world diagnostics", () => {
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
