import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { removeReExport } from "@orb/tooling/codemod";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import ts from "typescript";
import { z } from "zod";
import { withTree } from "../_kit-tree.ts";

const SOURCE = "export class Subject {}\n";

test("exact removal separates source identity, exported aliases and whole/inline type arms", async () => {
  const barrel = [
    'export { Subject as Keep, Subject as Drop } from "./source.ts";',
    'export type { Subject as KeepType, Subject as DropType } from "./source.ts";',
    'export { type Subject as KeepInline, type Subject as DropInline } from "./source.ts";',
    'export { Subject as Drop } from "./other.ts";',
  ].join("\n");
  await withTree({ "source.ts": SOURCE, "other.ts": SOURCE, "index.ts": barrel }, async ({ run, read }) => {
    await run((ctx) => {
      ctx.plan(
        removeReExport(ctx, "index.ts", {
          moduleSpecifier: "./source.ts",
          exports: [
            { name: "Subject", exportedName: "Drop", isTypeOnly: false },
            { name: "Subject", exportedName: "DropType", isTypeOnly: true },
            { name: "Subject", exportedName: "DropInline", isTypeOnly: true },
          ],
        }),
      );
      const declarations = ctx.project.getSourceFileOrThrow("index.ts").getExportDeclarations();
      expect(declarations.map((decl) => [decl.getModuleSpecifierValue(), decl.getNamedExports().map((spec) => spec.getAliasNode()?.getText())])).toEqual([
        ["./source.ts", ["Keep"]],
        ["./source.ts", ["KeepType"]],
        ["./source.ts", ["KeepInline"]],
        ["./other.ts", ["Drop"]],
      ]);
    });
    expect(read("index.ts")).toBe(barrel);
    expect(read("source.ts")).toBe(SOURCE);
  });
});

test("an exact type selector leaves a value arm with the same exported name untouched", async () => {
  await withTree(
    {
      "source.ts": SOURCE,
      "index.ts": 'export { Subject as Shared } from "./source.ts";\nexport type { Subject as Shared } from "./source.ts";\n',
    },
    async ({ run }) => {
      await run((ctx) => {
        ctx.plan(
          removeReExport(ctx, "index.ts", {
            moduleSpecifier: "./source.ts",
            exports: [{ name: "Subject", exportedName: "Shared", isTypeOnly: true }],
          }),
        );
        const declarations = ctx.project.getSourceFileOrThrow("index.ts").getExportDeclarations();
        expect(declarations).toHaveLength(1);
        expect(declarations[0]?.isTypeOnly()).toBe(false);
        expect(declarations[0]?.getNamedExports()[0]?.getAliasNode()?.getText()).toBe("Shared");
      });
    },
  );
});

test.each([false, true])("last runtime removal preserves module evaluation with native verbatim emission %s", async (verbatimModuleSyntax) => {
  await withTree(
    {
      "source.ts": SOURCE,
      "index.ts": 'export { Subject } from "./source.ts";\nexport type { Subject as Shape } from "./source.ts";\n',
      "tsconfig.json": JSON.stringify({ compilerOptions: { module: "esnext", verbatimModuleSyntax } }),
    },
    async ({ run }) => {
      await run((ctx) => {
        ctx.plan(
          removeReExport(
            ctx,
            "index.ts",
            {
              moduleSpecifier: "./source.ts",
              exports: [
                { name: "Subject", exportedName: "Subject", isTypeOnly: false },
                { name: "Subject", exportedName: "Shape", isTypeOnly: true },
              ],
            },
            { ...(verbatimModuleSyntax ? { verbatimModuleSyntax: true } : {}) },
          ),
        );
        const barrel = ctx.project.getSourceFileOrThrow("index.ts");
        expect(barrel.getExportDeclarations().map((decl) => [decl.getModuleSpecifierValue(), decl.getNamedExports()])).toEqual(
          verbatimModuleSyntax ? [["./source.ts", []]] : [],
        );
        expect(barrel.getImportDeclarations().map((decl) => [decl.getModuleSpecifierValue(), decl.getImportClause()])).toEqual(
          verbatimModuleSyntax ? [] : [["./source.ts", undefined]],
        );
      });
    },
  );
});

test("legacy source-name callers still select only the first value declaration", async () => {
  await withTree(
    {
      "source.ts": SOURCE,
      "index.ts":
        'export type { Subject } from "./source.ts";\nexport { Subject as Drop } from "./source.ts";\nexport { Subject as Keep } from "./source.ts";\n',
    },
    async ({ run }) => {
      await run((ctx) => {
        ctx.plan(removeReExport(ctx, "index.ts", { moduleSpecifier: "./source.ts", names: ["Subject"] }));
        const declarations = ctx.project.getSourceFileOrThrow("index.ts").getExportDeclarations();
        expect(declarations.map((decl) => [decl.isTypeOnly(), decl.getNamedExports()[0]?.getAliasNode()?.getText()])).toEqual([
          [true, undefined],
          [false, "Keep"],
        ]);
      });
    },
  );
});

test("an inline-only type export preserves its verbatim module request", async () => {
  await withTree({ "source.ts": SOURCE, "index.ts": 'export { type Subject as Shape } from "./source.ts";\n' }, async ({ run }) => {
    await run((ctx) => {
      ctx.plan(
        removeReExport(
          ctx,
          "index.ts",
          {
            moduleSpecifier: "./source.ts",
            exports: [{ name: "Subject", exportedName: "Shape", isTypeOnly: true }],
          },
          { verbatimModuleSyntax: true },
        ),
      );
      const barrel = ctx.project.getSourceFileOrThrow("index.ts");
      expect(barrel.getImportDeclarations()).toHaveLength(0);
      expect(barrel.getExportDeclarations()[0]?.getModuleSpecifierValue()).toBe("./source.ts");
    });
  });
});

test("string-literal public aliases are selected by their name, not their quoted source text", async () => {
  await withTree({ "source.ts": SOURCE, "index.ts": 'export { Subject as "public-name", Subject as Keep } from "./source.ts";\n' }, async ({ run }) => {
    await run((ctx) => {
      ctx.plan(
        removeReExport(ctx, "index.ts", {
          moduleSpecifier: "./source.ts",
          exports: [{ name: "Subject", exportedName: "public-name", isTypeOnly: false }],
        }),
      );
      expect(
        ctx.project
          .getSourceFileOrThrow("index.ts")
          .getExportDeclarations()[0]
          ?.getNamedExports()
          .map((spec) => spec.getAliasNode()?.getText()),
      ).toEqual(["Keep"]);
    });
  });
});

test("an exact selector cannot be widened by the legacy whole-declaration override", async () => {
  await withTree({ "source.ts": SOURCE, "index.ts": 'export { Subject as Drop, Subject as Keep } from "./source.ts";\n' }, async ({ run, read }) => {
    const original = read("index.ts");
    await expect(
      run((ctx) =>
        ctx.plan(
          removeReExport(
            ctx,
            "index.ts",
            {
              moduleSpecifier: "./source.ts",
              exports: [{ name: "Subject", exportedName: "Drop", isTypeOnly: false }],
            },
            { removeWholeDeclaration: true },
          ),
        ),
      ),
    ).rejects.toThrow("exact selectors cannot remove a whole declaration");
    expect(read("index.ts")).toBe(original);
  });
});

test("an adjudicated pure module can explicitly erase its final runtime re-export", async () => {
  await withTree({ "source.ts": SOURCE, "index.ts": 'export { Subject } from "./source.ts";\n' }, async ({ run }) => {
    await run((ctx) => {
      ctx.plan(
        removeReExport(
          ctx,
          "index.ts",
          {
            moduleSpecifier: "./source.ts",
            exports: [{ name: "Subject", exportedName: "Subject", isTypeOnly: false }],
          },
          { preserveModuleEvaluation: false },
        ),
      );
      expect(ctx.project.getSourceFileOrThrow("index.ts").getStatements()).toHaveLength(0);
      expect(ctx.project.getSourceFileOrThrow("source.ts").getFullText()).toBe(SOURCE);
    });
  });
});

test("exact named removal never converts an unmatched star or namespace export into a deletion", async () => {
  const barrel = 'export * from "./source.ts";\nexport * as namespace from "./source.ts";\n';
  await withTree({ "source.ts": SOURCE, "index.ts": barrel }, async ({ run }) => {
    const { result } = await run((ctx) =>
      ctx.plan(
        removeReExport(ctx, "index.ts", {
          moduleSpecifier: "./source.ts",
          exports: [{ name: "Subject", exportedName: "Subject", isTypeOnly: false }],
        }),
      ),
    );
    expect(result.filesChanged).toBe(0);
  });
});

test.each([
  { verbatimModuleSyntax: false, form: "value" },
  { verbatimModuleSyntax: true, form: "value" },
  { verbatimModuleSyntax: false, form: "inline-only" },
  { verbatimModuleSyntax: true, form: "inline-only" },
  { verbatimModuleSyntax: false, form: "mixed" },
  { verbatimModuleSyntax: true, form: "mixed" },
])("emitted ESM matches original evaluation for $form with native verbatim emission $verbatimModuleSyntax", async ({ verbatimModuleSyntax, form }) => {
  const moduleUrl = (source: string): string => `data:text/javascript,${encodeURIComponent(source)}`;
  const graph = (phase: string): { readonly traceUrl: string; readonly sourceUrl: string; readonly barrel: string } => {
    const traceUrl = moduleUrl(`export const order = []; // ${form}/${verbatimModuleSyntax}/${phase}`);
    const effectUrl = (name: string): string =>
      moduleUrl(`import { order } from ${JSON.stringify(traceUrl)}; order.push(${JSON.stringify(name)}); export const subject = ${JSON.stringify(name)};`);
    const sourceUrl = effectUrl("source");
    const names = form === "inline-only" ? "type subject as shape" : "subject as drop";
    const survivor = form === "mixed" ? ", type subject as shape" : "";
    const barrel = [
      `export { subject as before } from ${JSON.stringify(effectUrl("before"))};`,
      `export { ${names}${survivor} } from ${JSON.stringify(sourceUrl)};`,
      `export { subject as after } from ${JSON.stringify(effectUrl("after"))};`,
    ].join("\n");
    return { traceUrl, sourceUrl, barrel };
  };
  const original = graph("original");
  const changed = graph("changed");
  const originalEmit = ts.transpileModule(original.barrel, {
    compilerOptions: { module: ts.ModuleKind.ESNext, verbatimModuleSyntax },
  }).outputText;
  await import(moduleUrl(originalEmit));
  const originalTrace = z.object({ order: z.array(z.string()) }).parse(await import(original.traceUrl));
  let emitted = "";
  await withTree(
    { "index.ts": changed.barrel, "tsconfig.json": JSON.stringify({ compilerOptions: { module: "esnext", verbatimModuleSyntax } }) },
    async ({ run, root }) => {
      const nativeVerbatim = readCompilerPrograms(root)[0]?.commandLine.options.verbatimModuleSyntax;
      expect(nativeVerbatim).toBe(verbatimModuleSyntax);
      await run((ctx) => {
        ctx.plan(
          removeReExport(
            ctx,
            "index.ts",
            {
              moduleSpecifier: changed.sourceUrl,
              exports: [{ name: "subject", exportedName: form === "inline-only" ? "shape" : "drop", isTypeOnly: form === "inline-only" }],
            },
            { ...(nativeVerbatim === true ? { verbatimModuleSyntax: true } : {}) },
          ),
        );
        emitted = ts.transpileModule(ctx.project.getSourceFileOrThrow("index.ts").getFullText(), {
          compilerOptions: { module: ts.ModuleKind.ESNext, verbatimModuleSyntax },
        }).outputText;
      });
    },
  );
  const exports = z
    .object({ before: z.literal("before"), after: z.literal("after") })
    .strict()
    .parse(await import(moduleUrl(emitted)));
  expect(exports).toEqual({ before: "before", after: "after" });
  const trace = z.object({ order: z.array(z.string()) }).parse(await import(changed.traceUrl));
  expect(trace.order).toEqual(originalTrace.order);
});
