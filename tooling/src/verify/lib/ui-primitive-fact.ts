// One dispatcher-fed source index for the UI primitive family. Resource membership supplies topology;
// syntax facts preserve the legacy direct-export, literal-color and JSX-tag observation boundaries.
import type { ExportDeclaration, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import { blankTsComments } from "./comment-spans.ts";
import { testNarrationSpans } from "./test-narration.ts";

export interface SourceEvidence {
  readonly source: SourceFile;
  readonly code: string;
  readonly colorText: string;
  readonly tvExports: readonly VariableDeclaration[];
  readonly exports: readonly ExportDeclaration[];
  readonly jsx: readonly { readonly tag: string; readonly line: number; readonly node: Node }[];
}
interface CollectedSource {
  readonly source: SourceFile;
  readonly spans: { readonly pos: number; readonly end: number }[];
  readonly opens: { readonly tag: string; readonly line: number; readonly node: Node }[];
  readonly selfs: { readonly tag: string; readonly line: number; readonly node: Node }[];
}
export const uiPrimitiveFact = defineFact({
  id: "ui-primitive",
  population: { in: ["@ui", "@tests"], under: ["packages/ui/src/**", "tests/ui/**"] },
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const collected = new Map<SourceFile, CollectedSource>();
    function sourceRow(source: SourceFile): CollectedSource {
      let row = collected.get(source);
      if (row === undefined) {
        row = { source, spans: [], opens: [], selfs: [] };
        collected.set(source, row);
      }
      return row;
    }
    return {
      visitFile: (source) => {
        sourceRow(source);
      },
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression, SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
          visit: (node, source) => {
            const row = sourceRow(source);
            if (Node.isCallExpression(node)) {
              row.spans.push(...testNarrationSpans(node));
            } else if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
              const element = { tag: node.getTagNameNode().getText(), line: node.getStartLineNumber(), node };
              if (Node.isJsxOpeningElement(node)) {
                row.opens.push(element);
              } else {
                row.selfs.push(element);
              }
            }
          },
        },
      ],
      finish: () => {
        const sources = new Map<string, SourceEvidence>();
        for (const row of collected.values()) {
          const code = blankTsComments(row.source);
          let colorText = code;
          for (const span of row.spans.sort((a, b) => b.pos - a.pos)) {
            colorText = colorText.slice(0, span.pos) + colorText.slice(span.pos, span.end).replace(/[^\n]/gu, " ") + colorText.slice(span.end);
          }
          // These are direct source declarations, not descendant walks. This deliberately matches the
          // legacy variants-file grammar, including its literal tv callee rather than inferred aliases.
          const tvExports = row.source.getVariableDeclarations().filter((declaration) => {
            const initializer = declaration.getInitializer();
            return (
              declaration.isExported() && initializer !== undefined && Node.isCallExpression(initializer) && initializer.getExpression().getText() === "tv"
            );
          });
          sources.set(ctx.relativePath(row.source), {
            source: row.source,
            code,
            colorText,
            tvExports,
            exports: row.source.getExportDeclarations(),
            jsx: [...row.opens, ...row.selfs],
          });
        }
        ctx.receipt({ kind: "population", source: "ui-primitive-source-files", members: sources.size });
        return { sources };
      },
    };
  },
});
