// Shared evidence for the dialog-via-composite error owner and its two-path warning-debt sibling.
// This preserves the legacy boundary: client feature TSX, the literal dialog module, named imports only,
// and the first exported-name Dialog specifier in each file.
import type { ImportSpecifier } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";

const DIALOG_MODULE = "@orb/ui/dialog";
const FEATURES = "packages/client/src/features/";

export const DIALOG_DEBT_PATHS: ReadonlySet<string> = new Set([
  "packages/client/src/features/chat/components/invite-dialog.tsx",
  "packages/client/src/features/chat/components/rename-chat-dialog.tsx",
]);

export interface DialogRootImportOccurrence {
  readonly node: ImportSpecifier;
  readonly path: string;
  readonly debt: boolean;
}

export const dialogRootImportFact = defineFact({
  id: "dialog-root-import",
  population: "@client",
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const occurrences: DialogRootImportOccurrence[] = [];
    const seen = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration],
          visit: (node) => {
            if (!Node.isImportDeclaration(node) || node.getModuleSpecifierValue() !== DIALOG_MODULE) {
              return;
            }
            const path = ctx.relativePath(node.getSourceFile());
            if (seen.has(path) || !path.startsWith(FEATURES) || !path.endsWith(".tsx")) {
              return;
            }
            const named = node.getNamedImports().find((specifier) => specifier.getName() === "Dialog");
            if (named !== undefined) {
              seen.add(path);
              occurrences.push({ node: named, path, debt: DIALOG_DEBT_PATHS.has(path) });
            }
          },
        },
      ],
      finish: () => {
        ctx.receipt({ kind: "population", source: "client source modules", members: ctx.files.length });
        return { sources: ctx.files.length, occurrences };
      },
    };
  },
});
