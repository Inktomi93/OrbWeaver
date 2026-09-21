// `repointAliasPaths` (tooling/src/codemod/lib/imports.ts) — the alias-path sweep.
//
// #1781b: it declared EVERY project file as `touchedFiles`. The declared set is what the harness
// snapshots AND what its pre-emit diagnostics filter narrows to, so one call widened that filter from
// a change's ~50 files to the whole workspace and buried the codemod's own signal under thousands of
// pre-existing unrelated errors. That is why the #1010 roster rename hand-rolled its own extension
// plan instead of calling this helper — the workaround the kit fix exists to retire.
//
// Asserted through the operator-visible preview: which files the plan says it touched.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import { describe, vi } from "vitest";
import { moduleStringArg, repointAliasPaths, routeSymbolsByMap } from "../../../../tooling/src/codemod/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { withTree } from "../_kit-tree.ts";

const DIAGNOSTICS_TIMEOUT_MS = scaledBudget(15_000);
vi.setConfig({ testTimeout: DIAGNOSTICS_TIMEOUT_MS, hookTimeout: DIAGNOSTICS_TIMEOUT_MS });

test("moduleStringArg follows the Vitest import binding rather than the receiver spelling", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const imported = project.createSourceFile("/imported.ts", 'import { vi as vitest } from "vitest";\nvitest.mock("#real/module");\n');
  const unrelated = project.createSourceFile("/unrelated.ts", 'const vi = { mock: (_value: string) => undefined };\nvi.mock("#unrelated/module");\n');
  const importedCall = imported.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  const unrelatedCall = unrelated.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);

  expect(moduleStringArg(importedCall)?.getLiteralValue()).toBe("#real/module");
  expect(moduleStringArg(unrelatedCall)).toBeNull();
});

const fourFiles = {
  "hit-one.ts": 'import { x } from "#old/x.ts";\n\nexport const one = x;\n',
  "hit-two.ts": 'import { x } from "#old/x.ts";\n\nexport const two = x;\n',
  "miss-one.ts": "export const missOne = 1;\n",
  "miss-two.ts": "export const missTwo = 2;\n",
};

describe("repointAliasPaths declares only what it rewrites (#1781)", () => {
  test("the preview lists the two matching files and neither of the two that do not match", async () => {
    await withTree(fourFiles, async ({ run }) => {
      const { result, output } = await run((ctx) => {
        ctx.plan(repointAliasPaths(ctx, [[/#old\/x\.ts/gu, "#new/x.ts"]]));
      });
      expect(result.filesChanged).toBe(2);
      expect(output).toContain("~ hit-one.ts");
      expect(output).toContain("~ hit-two.ts");
      expect(output).not.toContain("miss-one.ts");
      expect(output).not.toContain("miss-two.ts");
      // The count rides in the description, so an operator reading the preview sees the blast radius
      // without counting lines.
      expect(output).toContain("Alias-path sweep (1 pattern, 2 files)");
    });
  });

  test("a sweep that matches nothing declares nothing and changes nothing", async () => {
    await withTree(fourFiles, async ({ run }) => {
      const { result, output } = await run((ctx) => {
        ctx.plan(repointAliasPaths(ctx, [[/#absent\/y\.ts/gu, "#new/y.ts"]]));
      });
      expect(result.filesChanged).toBe(0);
      expect(output).toContain("Alias-path sweep (1 pattern, 0 files)");
    });
  });

  test("the rewrite still lands on disk under --apply", async () => {
    // POSITIVE CONTROL for the narrowing above: a plan that declares fewer files must still DO the work.
    await withTree(fourFiles, async ({ run, read }) => {
      await run(
        (ctx) => {
          ctx.plan(repointAliasPaths(ctx, [[/#old\/x\.ts/gu, "#new/x.ts"]]));
        },
        { apply: true },
      );
      expect(read("hit-one.ts")).toContain('"#new/x.ts"');
      expect(read("miss-one.ts")).toBe(fourFiles["miss-one.ts"]);
    });
  });
});

const VERBATIM_TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "es2022",
    module: "esnext",
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    strict: true,
    noEmit: true,
  },
});

function enableVerbatimDiagnostics(root: string): void {
  writeFileSync(join(root, "tsconfig.json"), VERBATIM_TSCONFIG);
}

function route(symbol: string, destination: string): Readonly<Record<string, string>> {
  return Object.fromEntries([[symbol, destination]]);
}

describe("routeSymbolsByMap preserves import syntax and declarations", () => {
  test("a whole-declaration type import stays type-only after routing", async () => {
    await withTree(
      {
        "source.ts": "export interface Shape { value: number }\n",
        "destination.ts": 'export type { Shape } from "./source.ts";\n',
        "consumer.ts": 'import type { Shape } from "./source.ts";\nexport const use = (value: Shape): Shape => value;\n',
      },
      async ({ root, run, read }) => {
        enableVerbatimDiagnostics(root);
        const { result } = await run((ctx) => ctx.plan(routeSymbolsByMap(ctx, "./source.ts", route("Shape", "./destination.ts"))), { apply: true });
        expect(result.diagnosticErrors).toBe(0);
        expect(read("consumer.ts")).toMatch(/import (?:type )?\{\s*(?:type )?Shape\s*\} from "\.\/destination\.ts"/u);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a value route preserves an existing type-only destination import", async () => {
    await withTree(
      {
        "source.ts": "export const make = (): number => 1;\n",
        "destination.ts": 'export { make } from "./source.ts";\nexport interface Existing { value: number }\n',
        "consumer.ts":
          'import { make } from "./source.ts";\nimport type { Existing } from "./destination.ts";\nexport const value: Existing = { value: make() };\n',
      },
      async ({ root, run, read }) => {
        enableVerbatimDiagnostics(root);
        const { result } = await run((ctx) => ctx.plan(routeSymbolsByMap(ctx, "./source.ts", route("make", "./destination.ts"))), { apply: true });
        expect(result.diagnosticErrors).toBe(0);
        expect(read("consumer.ts")).toContain('import { type Existing, make } from "./destination.ts";');
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a namespace destination gets a separate named import", async () => {
    await withTree(
      {
        "source.ts": "export const make = (): number => 1;\n",
        "destination.ts": 'export { make } from "./source.ts";\nexport const other = 2;\n',
        "consumer.ts":
          'import { make } from "./source.ts";\nimport * as destination from "./destination.ts";\nexport const value = make() + destination.other;\n',
      },
      async ({ root, run, read }) => {
        enableVerbatimDiagnostics(root);
        const { result } = await run((ctx) => ctx.plan(routeSymbolsByMap(ctx, "./source.ts", route("make", "./destination.ts"))), { apply: true });
        expect(result.diagnosticErrors).toBe(0);
        const output = read("consumer.ts");
        expect(output).toContain('import * as destination from "./destination.ts";');
        expect(output).toContain('import { make } from "./destination.ts";');
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("a whole-type-only default destination gets a separate named type import", async () => {
    await withTree(
      {
        "source.ts": "export interface Shape { value: number }\n",
        "destination.ts": 'export default interface Default { id: string }\nexport type { Shape } from "./source.ts";\n',
        "consumer.ts": 'import type { Shape } from "./source.ts";\nimport type Default from "./destination.ts";\nexport type Combined = Shape & Default;\n',
      },
      async ({ root, run, read }) => {
        enableVerbatimDiagnostics(root);
        const { result } = await run((ctx) => ctx.plan(routeSymbolsByMap(ctx, "./source.ts", route("Shape", "./destination.ts"))), { apply: true });
        expect(result.diagnosticErrors).toBe(0);
        const output = read("consumer.ts");
        expect(output).toContain('import type Default from "./destination.ts";');
        expect(output).toContain('import { type Shape } from "./destination.ts";');
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("distinct local aliases for one export both survive routing", async () => {
    await withTree(
      {
        "source.ts": "export const Item = 1;\n",
        "destination.ts": 'export { Item } from "./source.ts";\n',
        "consumer.ts": 'import { Item as B } from "./source.ts";\nimport { Item as A } from "./destination.ts";\nexport const value = A + B;\n',
      },
      async ({ root, run, read }) => {
        enableVerbatimDiagnostics(root);
        const { result } = await run((ctx) => ctx.plan(routeSymbolsByMap(ctx, "./source.ts", route("Item", "./destination.ts"))), { apply: true });
        expect(result.diagnosticErrors).toBe(0);
        expect(read("consumer.ts")).toContain('import { Item as A, Item as B } from "./destination.ts";');
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("only actual mapped importers are declared, and a same-source destination is a no-op", async () => {
    await withTree(
      {
        "source.ts": "export interface Shape { value: number }\nexport const unmapped = 1;\n",
        "destination.ts": 'export type { Shape } from "./source.ts";\n',
        "mapped.ts": 'import type { Shape } from "./source.ts";\nexport type Mapped = Shape;\n',
        "unchanged.ts": 'import { unmapped } from "./source.ts";\nexport const value = unmapped;\n',
      },
      async ({ run, read }) => {
        const original = read("mapped.ts");
        const routed = await run((ctx) => ctx.plan(routeSymbolsByMap(ctx, "./source.ts", route("Shape", "./destination.ts"))));
        expect(routed.result.filesChanged).toBe(1);
        expect(routed.output).toContain("~ mapped.ts");
        expect(routed.output).not.toContain("unchanged.ts");

        const noOp = await run((ctx) => ctx.plan(routeSymbolsByMap(ctx, "./source.ts", route("Shape", "./source.ts"))), { apply: true });
        expect(noOp.result.filesChanged).toBe(0);
        expect(read("mapped.ts")).toBe(original);
      },
    );
  });
});
