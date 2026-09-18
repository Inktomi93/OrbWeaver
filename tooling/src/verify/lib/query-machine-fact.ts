// Shared source facts for the raw TanStack query-machine seals. The collector preserves the
// frozen named-import grammar and leaves authority and liveness judgments to the family owners.
import type { ImportDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";

const QUERY_MACHINE_MODULE = "@tanstack/react-query";
const QUERY_MACHINE_NAMES = ["useMutation", "useInfiniteQuery"] as const;
/** Byte-for-byte port of the legacy harness population under `scanRoot: () => true`, with its
 * `.test.tsx?` scope subtraction. `@showcase` is explicit because it is deliberately outside
 * `@authored` while the harness still loads that workspace package. */
export const QUERY_MACHINE_POPULATION = {
  in: ["@authored", "@showcase"],
  notNamed: ["*.test.ts", "*.test.tsx"],
} as const;
// @orb-waive no-inline-types(QueryMachineName): derived from the module-private QUERY_MACHINE_NAMES tuple; splitting the axis from the fact creates a cross-module coupling worse than the lib/ home; ends when the fact moves to contract/
export type QueryMachineName = (typeof QUERY_MACHINE_NAMES)[number];

interface QueryMachineImport {
  readonly node: ImportDeclaration;
  readonly file: string;
  readonly names: readonly QueryMachineName[];
}

export const queryMachineFact = defineFact({
  id: "query-machine-imports",
  population: QUERY_MACHINE_POPULATION,
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const paths = new Set<string>();
    const sources = new Map<string, SourceFile>();
    const imports: QueryMachineImport[] = [];
    return {
      visitFile: (source) => {
        const file = ctx.relativePath(source);
        paths.add(file);
        sources.set(file, source);
      },
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration],
          visit: (node, source) => {
            if (!Node.isImportDeclaration(node) || node.getModuleSpecifierValue() !== QUERY_MACHINE_MODULE) {
              return;
            }
            const names = node
              .getNamedImports()
              .map((specifier) => specifier.getName())
              .filter((name): name is QueryMachineName => QUERY_MACHINE_NAMES.some((candidate) => candidate === name));
            if (names.length > 0) {
              imports.push({ node, file: ctx.relativePath(source), names });
            }
          },
        },
      ],
      finish: () => {
        ctx.receipt({ kind: "population", source: "query-machine-source-files", members: ctx.files.length });
        return { paths, sources, imports };
      },
    };
  },
});
