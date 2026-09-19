// Shared evidence for the dialog-via-composite error owner. This preserves the legacy boundary: client
// feature TSX, the literal dialog module, named imports only, and the first exported-name Dialog specifier
// in each file.
//
// THE `debt` PARTITION IS GONE WITH ITS OWNER (#2393, 2026-09-18). #2350 migrated both chat-lane raw Dialog
// paths to `FormDialog` and left `DIALOG_DEBT_PATHS` an EMPTY set, which made the `dialog-via-composite-debt`
// sibling a policy that could never flag — and `mustFlag` is required nonempty
// (`lib/policy-validation-proofs.ts` `assertProofArm`), so its one row ("a raw Dialog import in a chat debt
// path MUST be caught") had become an unsatisfiable claim that failed `policy-conformance` as a TOOL ERROR.
// That gate is deleted under the retirement clause its own catalog row carries ("retire the debt classifier
// when complete"), and the flag it carried on every occurrence retired with it: with no debt set, every
// occurrence is the error owner's, which is exactly what the sibling's regression guards asked for. The two
// ex-debt paths keep their guards as `dialog-via-composite` `mustFlag` rows.
import type { ImportSpecifier } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";

const DIALOG_MODULE = "@orb/ui/dialog";
const FEATURES = "packages/client/src/features/";

interface DialogRootImportOccurrence {
  readonly node: ImportSpecifier;
  readonly path: string;
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
              occurrences.push({ node: named, path });
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
