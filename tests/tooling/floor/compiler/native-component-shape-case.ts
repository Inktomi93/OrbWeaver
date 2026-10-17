import { writeFileSync } from "node:fs";
import process from "node:process";

const root = process.argv[2];
const result = process.argv[3];
if (root === undefined || result === undefined) {
  throw new Error("native component shape case requires its subject and result paths");
}
const { createSemanticWorkspace, canonicalCompilerPath } = await import("../../../../tooling/src/floor/compiler/ts-workspace.ts");
const { captureComponentTypeHomeView, componentTypeHome } = await import("../../../../tooling/src/floor/code-facts/component-type-home.ts");
const { createSemanticInventory } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
const { bindShapeInventory, collectShapeQueries } = await import("../../../../tooling/src/floor/code-facts/shape-inventory-scope.ts");
const owner = createSemanticWorkspace({ root }).program("packages/client/tsconfig.json");
const path = "packages/client/src/panel.tsx";
const source = owner?.sourceFile(path);
const lower = source
  ?.getImportDeclarations()
  .find((node) => node.getModuleSpecifierValue().endsWith("/wire.ts"))
  ?.getModuleSpecifierSourceFile();
if (owner === undefined || source === undefined || lower === undefined) {
  throw new Error("native component lower-data source owner missing");
}
const view = captureComponentTypeHomeView({ program: owner, sourceFile: source, canonicalPath: canonicalCompilerPath(root, path) });
const read = (name: string): ReturnType<typeof componentTypeHome> =>
  componentTypeHome({ declaration: source.getInterfaceOrThrow(name), path, view, lowerDeclarations: [lower.getInterfaceOrThrow("Wire")] });
const sources = [source, lower];
using inventory = createSemanticInventory({
  root,
  shapePlan: {
    sources,
    owners: new Map(sources.map((value) => [value, owner.descriptor])),
    prepare: (catalog) => {
      using _scope = bindShapeInventory(sources, catalog);
      return collectShapeQueries(catalog, () => {
        read("CopyProps");
        read("Derived");
      });
    },
  },
});
using _scope = bindShapeInventory(sources, inventory);
const copy = read("CopyProps");
const derived = read("Derived");
writeFileSync(
  result,
  JSON.stringify({
    copy:
      copy.kind === "refused"
        ? { kind: copy.kind, reason: copy.reason }
        : {
            kind: copy.kind,
            lowerData: {
              kind: copy.lowerData.kind,
              ...(copy.lowerData.kind === "unqualified"
                ? { comparisons: copy.lowerData.comparisons.map(({ shared, agreeing, exact }) => ({ shared, agreeing, exact })) }
                : {}),
            },
          },
    derived: derived.kind === "refused" ? { kind: derived.kind, reason: derived.reason } : { kind: derived.kind, lowerData: { kind: derived.lowerData.kind } },
  }),
);
