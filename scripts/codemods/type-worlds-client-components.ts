// Home cross-feature rendered components outside the pure lib/data front doors.
import { join } from "node:path";
import process from "node:process";
import { assert, DEFAULT_GLOBS, moveFiles, repointAliasPaths, routeSymbolsByMap, runCodemod } from "@orb/tooling/codemod";

const MOVES = [
  ["packages/client/src/lib/weave-glyph.tsx", "packages/client/src/components/weave-glyph.tsx"],
  ["packages/client/src/data/query-boundary.tsx", "packages/client/src/components/query-boundary.tsx"],
  ["tests/client/lib/weave-glyph.ct.tsx", "tests/client/components/weave-glyph.ct.tsx"],
  ["tests/client/data/query-boundary.ct.tsx", "tests/client/components/query-boundary.ct.tsx"],
] as const;

await runCodemod(
  "type-worlds-client-components",
  (ctx) => {
    const components = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "packages/client/src/components/index.ts"));
    for (const [tier, leaf] of [
      ["lib", "weave-glyph"],
      ["data", "query-boundary"],
    ] as const) {
      const source = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, `packages/client/src/${tier}/index.ts`));
      const declarations = source.getExportDeclarations().filter((declaration) => declaration.getModuleSpecifierValue() === `./${leaf}.tsx`);
      if (declarations.length !== 2) {
        throw new Error(`Expected value and props exports for ${leaf}.`);
      }
      const structures = declarations.map((declaration) => declaration.getStructure());
      ctx.plan({
        description: `Transfer ${leaf} exports to components`,
        touchedFiles: [source.getFilePath(), components.getFilePath()],
        transform() {
          for (const declaration of declarations) {
            declaration.remove();
          }
          components.addExportDeclarations(structures);
        },
      });
    }
    ctx.plan(moveFiles(ctx, MOVES));
    const seals = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "tooling/src/verify/gates/query-machine-seals.ts"));
    ctx.plan({
      description: "Anchor data-seal liveness to the data front door",
      touchedFiles: [seals.getFilePath()],
      transform() {
        seals.getVariableDeclarationOrThrow("ANCHOR").setInitializer('"packages/client/src/data/index.ts"');
      },
    });
    for (const from of ["#lib", "@orb/client/lib"]) {
      ctx.plan(
        routeSymbolsByMap(ctx, from, {
          WeaveGlyph: from.startsWith("#") ? "#components" : "@orb/client/components",
          WeaveGlyphProps: from.startsWith("#") ? "#components" : "@orb/client/components",
        }),
      );
    }
    for (const from of ["#data", "@orb/client/data"]) {
      ctx.plan(
        routeSymbolsByMap(ctx, from, {
          QueryBoundary: from.startsWith("#") ? "#components" : "@orb/client/components",
          QueryBoundaryProps: from.startsWith("#") ? "#components" : "@orb/client/components",
        }),
      );
    }
    const siblings = ["background-source-field.tsx", "character-picker.tsx", "library-surface.tsx"].map((name) =>
      ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "packages/client/src/components", name)),
    );
    ctx.plan({
      description: "Keep same-owner component imports off their own barrel",
      touchedFiles: siblings.map((source) => source.getFilePath()),
      transform() {
        for (const source of siblings) {
          const declaration = source.getImportDeclarationOrThrow("#components");
          const named = declaration.getNamedImports();
          assert(named.length === 1 && named[0]?.getName() === "QueryBoundary", `Unexpected sibling import in ${source.getBaseName()}.`);
          declaration.setModuleSpecifier("./query-boundary.tsx");
        }
      },
    });
    // Gate anchors and synthetic fixture strings are outside the compiler's resolved import graph.
    ctx.plan(
      repointAliasPaths(ctx, [
        [/lib\/weave-glyph/gu, "components/weave-glyph"],
        [/data\/query-boundary/gu, "components/query-boundary"],
      ]),
    );
  },
  {
    argv: process.argv.slice(2),
    setup: { replaceGlobs: [...DEFAULT_GLOBS, "tooling/src/**/*.ts", "!scripts/codemods/type-worlds-client-components.ts"] },
    maxOutputLines: 500,
  },
);
