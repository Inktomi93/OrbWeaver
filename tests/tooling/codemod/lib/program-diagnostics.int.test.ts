// The codemod apply guard runs transformed bytes in their authored compiler world and includes real
// consumers whose own text did not change. Every assertion drives the public runCodemod harness.
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, vi } from "vitest";
import { createSourceFile, deleteFiles, moveFiles } from "../../../../tooling/src/codemod/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { withTree } from "../_kit-tree.ts";

const DIAGNOSTICS_TIMEOUT_MS = scaledBudget(20_000);
vi.setConfig({ testTimeout: DIAGNOSTICS_TIMEOUT_MS, hookTimeout: DIAGNOSTICS_TIMEOUT_MS });

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
