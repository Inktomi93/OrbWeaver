// Gate: no-caller-user-id (D19 turn-identity / chat.md §12 #2). The caller is `Principal.userId`; a turn's
// RESPONSIBLE human is `triggeredBy` and the FUNDED identity is `runAsUserId`. The term `callerUserId`
// conflates caller with turn-identity (the neo bug class: the caller's id reaching `resolveCredential`/
// `loadUserSettings`). tsc cannot catch a NEWLY-INTRODUCED forbidden name, so this gate does — before the
// turn-running/engine chunks (where it's most tempting) accrete. AST identifiers only: comments + string
// literals that mention the term (e.g. the identity-doc "no `callerUserId`" note) are exempt.
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const FORBIDDEN = "callerUserId";

export const noCallerUserId: Check = {
  name: "no-caller-user-id",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
        if (id.getText() !== FORBIDDEN) {
          continue;
        }
        const abs = sf.getFilePath();
        violations.push({
          file: abs.startsWith(root) ? abs.slice(root.length + 1) : abs,
          line: id.getStartLineNumber(),
          message:
            "`callerUserId` is forbidden (D19): the caller is `Principal.userId`; use `triggeredBy` (the responsible human) / `runAsUserId` (the funded identity). Never route the caller's id into credential/settings resolution. See Spine-Identity-and-Auth.md (turn-identity: triggeredBy vs runAsUserId; D19).",
        });
      }
    }
    return violations;
  },
};
