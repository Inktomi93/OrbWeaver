// Gate: turn-identity (ledger D16/D17/D19) — the turn pipeline runs as the HOST (`runAsUserId`:
// whose box/creds/wallet fund it) with `triggeredBy` as the responsible human; the CALLER's
// `Principal.userId` does its work at the VERB layer (membership, CSRF, authorUserId stamping) and
// must never leak into the engine, where it could reach credential resolution or settings loads and
// silently re-fund a turn from the wrong wallet (the neo class D19 dissolved).
//
// The enforceable core: `domain/chat/engine/**` is PRINCIPAL-BLIND. Identity reaches the engine
// ONLY as the resolved triple (`engine/turn-identity.ts` — runAsUserId + triggeredBy + the speaker
// axes). Two arms:
//   • no import of the `Principal` type (from `@orb/contracts/identity` or anywhere) inside engine/
//   • no `principal` IDENTIFIER (param/var/property access) inside engine/ — comments are free to
//     cite the concept; code cannot hold the object.
// If the caller's id can't be NAMED in the engine, it can't flow to `resolveCredential`/
// `loadUserSettings` through it — the dataflow half of the deferred-gate row, enforced by
// unconstructability rather than flow analysis (the same posture as D60's Principal-less agents).
// Sibling: the `no-caller-user-id` gate (the banned D19 term, repo-wide).
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const ENGINE = /\/packages\/server\/src\/domain\/chat\/engine\//u;
const BANNED_IMPORT = "Principal";
const BANNED_IDENTIFIER = "principal";
const IMPORT_MESSAGE =
  "the chat engine is Principal-BLIND (D19 turn-identity): identity reaches it only as the resolved triple (runAsUserId + triggeredBy — engine/turn-identity.ts). Resolve the triple at the verb layer and pass it down; never hand the engine a Principal.";
const IDENTIFIER_MESSAGE =
  "a `principal` identifier inside the chat engine — the engine runs as runAsUserId (host funding) with triggeredBy (responsibility); the caller's Principal stays at the verb layer (D16/D17/D19; engine/turn-identity.ts is the one identity seam).";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** `Principal` named-imports in an engine file. */
function principalImports(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const decl of sf.getImportDeclarations()) {
    for (const named of decl.getNamedImports()) {
      if (named.getName() === BANNED_IMPORT) {
        out.push({ file: rel, line: named.getStartLineNumber(), message: IMPORT_MESSAGE });
      }
    }
  }
  return out;
}

/** `principal` identifiers (params/vars/property names) in an engine file. */
function principalIdentifiers(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() === BANNED_IDENTIFIER) {
      out.push({ file: rel, line: id.getStartLineNumber(), message: IDENTIFIER_MESSAGE });
    }
  }
  return out;
}

export const turnIdentity: Check = {
  name: "turn-identity",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!ENGINE.test(path)) {
        continue;
      }
      const rel = relPath(root, path);
      violations.push(...principalImports(sf, rel), ...principalIdentifiers(sf, rel));
    }
    return violations;
  },
};
