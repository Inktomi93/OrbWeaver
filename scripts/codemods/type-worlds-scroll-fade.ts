// Separate the scroll primitive's DOM effects from the Node-safe selector constants.
import { join } from "node:path";
import process from "node:process";
import { routeSymbolsByMap, runCodemod } from "@orb/tooling/codemod";

const SOURCE = "packages/ui/src/lib/scroll-fade.ts";
const DESTINATION = "packages/ui/src/primitives/scroll-area/scroll-fade.ts";
const LIB_INDEX = "packages/ui/src/lib/index.ts";
const PRIMITIVE_INDEX = "packages/ui/src/primitives/scroll-area/index.ts";
const HOOKS = ["useScrollFadeX", "useScrollFadeY"] as const;
const CONSTANTS = new Set(["SCROLL_FADE_X_CLASS", "SCROLL_FADE_Y_CLASS"]);

await runCodemod(
  "type-worlds-scroll-fade",
  (ctx) => {
    const source = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, SOURCE));
    const libIndex = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, LIB_INDEX));
    const primitiveIndex = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, PRIMITIVE_INDEX));
    const functions = HOOKS.map((name) => source.getFunctionOrThrow(name).getFullText());
    const constants = source
      .getVariableStatements()
      .filter((statement) => statement.getDeclarations().some((declaration) => CONSTANTS.has(declaration.getName())));
    const edge = source
      .getVariableStatements()
      .find((statement) => statement.getDeclarations().some((declaration) => declaration.getName() === "EDGE_EPSILON_PX"));
    if (constants.length !== 2 || edge === undefined) {
      throw new Error("Scroll-fade source no longer matches the reviewed split.");
    }
    const constantText = constants.map((statement) => statement.getFullText()).join("\n");
    const effectText = [...source.getImportDeclarations().map((declaration) => declaration.getFullText()), edge.getFullText(), ...functions].join("\n");
    ctx.plan({
      description: "Keep selector constants in lib; home scroll effects in the scroll-area primitive",
      touchedFiles: [SOURCE, DESTINATION, LIB_INDEX, PRIMITIVE_INDEX].map((path) => join(ctx.repoRoot, path)),
      transform(inner) {
        inner.project.createSourceFile(join(inner.repoRoot, DESTINATION), effectText);
        source.replaceWithText(`// Selector contracts remain available without importing DOM effects.\n${constantText}\n`);
        const exports = libIndex.getExportDeclarations().filter((declaration) => declaration.getModuleSpecifierValue() === "./scroll-fade.ts");
        for (const declaration of exports) {
          for (const exported of declaration.getNamedExports()) {
            if (HOOKS.some((name) => name === exported.getName())) {
              exported.remove();
            }
          }
        }
        primitiveIndex.addExportDeclaration({ moduleSpecifier: "./scroll-fade.ts", namedExports: [...HOOKS] });
      },
    });
    ctx.plan(routeSymbolsByMap(ctx, "@orb/ui/lib", Object.fromEntries(HOOKS.map((name) => [name, "@orb/ui/scroll-area"]))));
  },
  { argv: process.argv.slice(2), maxOutputLines: 100 },
);
