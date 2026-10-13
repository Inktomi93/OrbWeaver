import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { SyntaxKind } from "ts-morph";
import { findExportedDeclaration, listExports, renameExportedSymbol } from "../../../../tooling/src/codemod/index.ts";
import { withTree } from "../_kit-tree.ts";

test("export queries retain aliased, default and overloaded declaration identities through a barrel", async () => {
  await withTree(
    {
      "origin.ts":
        "export function convert(value: string): string;\n" +
        "export function convert(value: number): number;\n" +
        "export function convert(value: string | number): string | number { return value; }\n" +
        "export interface Shape { value: number }\n" +
        "export default convert;\n",
      "barrel.ts": 'export { convert as Public, default } from "./origin.ts";\nexport type { Shape as PublicShape } from "./origin.ts";\n',
    },
    async ({ run }) => {
      const { result } = await run((ctx) => {
        const origin = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "origin.ts"));
        const barrel = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "barrel.ts"));
        const exports = new Map(listExports(barrel).map(({ name, declarations }) => [name, declarations]));
        const overloads = origin.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);

        expect([...exports.keys()].toSorted()).toEqual(["Public", "PublicShape", "default"]);
        expect(exports.get("Public")).toEqual(overloads);
        expect(exports.get("default")).toEqual(overloads);
        expect(findExportedDeclaration(barrel, "Public")).toBe(overloads[0]);
        expect(findExportedDeclaration(barrel, "PublicShape")).toBe(origin.getInterfaces()[0]);
        expect(findExportedDeclaration(barrel, "convert")).toBeUndefined();
      });
      expect(result.filesChanged).toBe(0);
    },
  );
});

test("native rename leaves public aliases intact and subsequent export reads see the unsaved transaction", async () => {
  await withTree(
    {
      "origin.ts": "export const Original = 1;\n",
      "barrel.ts": 'export { Original as Public } from "./origin.ts";\n',
      "consumer.ts": 'import { Public as Local } from "./barrel.ts";\nexport const answer = Local;\n',
    },
    async ({ run, read }) => {
      const { result, output } = await run((ctx) => {
        ctx.plan(renameExportedSymbol(ctx, "origin.ts", { oldName: "Original", newName: "Renamed" }));
        const workspace = ctx.semantic();
        const origin = workspace.sourceViews("origin.ts")[0]?.sourceFile;
        const barrel = workspace.sourceViews("barrel.ts")[0]?.sourceFile;
        expect(origin).toBeDefined();
        expect(barrel).toBeDefined();
        if (origin === undefined || barrel === undefined) {
          throw new Error("native transaction lost an authored fixture source");
        }
        expect(findExportedDeclaration(origin, "Original")).toBeUndefined();
        expect(findExportedDeclaration(barrel, "Public")).toBe(findExportedDeclaration(origin, "Renamed"));
        expect(listExports(barrel).map(({ name }) => name)).toEqual(["Public"]);
      });

      expect(result.filesChanged).toBe(2);
      expect(output).toContain("~ origin.ts");
      expect(output).toContain("~ barrel.ts");
      expect(output).not.toContain("~ consumer.ts");
      expect(read("origin.ts")).toBe("export const Original = 1;\n");
      expect(read("barrel.ts")).toBe('export { Original as Public } from "./origin.ts";\n');
    },
  );
});
