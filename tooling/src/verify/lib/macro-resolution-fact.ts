// Preserve the legacy name-keyed boundary: resolver imports and bare calls are evidence;
// tokenizer calls and namespace/dynamic calls are outside this policy's declared grammar.
import type { Node } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";

export const MACRO_RESOLVERS = ["resolveRowMacros", "processMacros", "createMacroContext", "evaluateMacros", "renderMessageForDisplay"] as const;
const RESOLVERS = new Set<string>(MACRO_RESOLVERS);
interface MacroUse {
  readonly node: Node;
  readonly file: string;
  readonly line: number;
  readonly name: string;
}
export const macroResolutionFact = defineFact({
  id: "macro-resolution",
  population: ["@kit", "@client", "@ui"],
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const declared = new Set<string>();
    const uses: MacroUse[] = [];
    return {
      visitFile: (source) => {
        const file = ctx.relativePath(source);
        if (file.startsWith("packages/kit/src/") || file.startsWith("packages/client/src/")) {
          // getFunction(name) in the frozen policy only admitted direct source declarations.
          for (const declaration of source.getFunctions()) {
            const name = declaration.getName();
            if (name !== undefined && RESOLVERS.has(name)) {
              declared.add(name);
            }
          }
        }
      },
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression],
          visit: (node, source) => {
            const file = ctx.relativePath(source);
            if (!(file.startsWith("packages/client/src/") || file.startsWith("packages/ui/src/"))) {
              return;
            }
            let name: string | undefined;
            if (MorphNode.isImportSpecifier(node)) {
              name = node.getName();
            } else if (MorphNode.isCallExpression(node)) {
              name = node.getExpression().getText();
            }
            if (name !== undefined && RESOLVERS.has(name)) {
              uses.push({ node, file, line: node.getStartLineNumber(), name });
            }
          },
        },
      ],
      finish: () => {
        ctx.receipt({ kind: "population", source: "macro-resolution-source-files", members: ctx.files.length });
        return { declared, uses };
      },
    };
  },
});
