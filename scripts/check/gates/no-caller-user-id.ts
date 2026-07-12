// Gate: no-caller-user-id (D19 turn-identity / chat.md §12 #2). The caller is `Principal.userId`; a turn's
// RESPONSIBLE human is `triggeredBy` and the FUNDED identity is `runAsUserId`. The term `callerUserId`
// conflates caller with turn-identity (the neo bug class: the caller's id reaching `resolveCredential`/
// `loadUserSettings`). tsc cannot catch a NEWLY-INTRODUCED forbidden name, so this gate does — before the
// turn-running/engine chunks (where it's most tempting) accrete. AST identifiers only: comments + string
// literals that mention the term (e.g. the identity-doc "no `callerUserId`" note) are exempt.
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const FORBIDDEN = "callerUserId";

const MESSAGE =
  "`callerUserId` is forbidden (D19): the caller is `Principal.userId`; use `triggeredBy` (the responsible human) / `runAsUserId` (the funded identity). Never route the caller's id into credential/settings resolution. See Spine-Identity-and-Auth.md (turn-identity: triggeredBy vs runAsUserId; D19).";

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
          message: MESSAGE,
        });
      }
    }
    return violations;
  },
};

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (a)) ──────────────────────────────────────────────
// The same predicate as the legacy Check, re-expressed as an Identifier subscription: no project loop,
// no getDescendantsOfKind sweep — the runner's ONE walk feeds each Identifier to `visit`. Per-occurrence
// (each banned identifier is its own finding; a bare identifier IS a single token). Kept ALONGSIDE the
// legacy export while the old runner stays authoritative; itemized parity proves the SITE set matches.
export const gate: GateDescriptor = {
  name: "no-caller-user-id",
  docRow: "D19 turn-identity / chat.md §12 #2",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "use `triggeredBy` (the responsible human) or `runAsUserId` (the funded identity) — never the caller's id in credential/settings resolution.",
  // Pinned to packages+tests: the §2.2 fold-in globs scripts/check/gates/** into the workspace, but
  // no-caller-user-id.ts's own `const FORBIDDEN = "callerUserId"` is a STRING (AST identifiers only), so
  // this pin is defense-in-depth keeping the scanner off the gate corpus (findings byte-identical).
  scanRoot: (p) => !p.startsWith("scripts/check/gates/"),
  kinds: [SyntaxKind.Identifier],
  visit: (node, _sf, ctx) => {
    if (node.getText() === FORBIDDEN) {
      ctx.report(node, { token: FORBIDDEN, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export function f(callerUserId: string) {\n  return callerUserId;\n}\n",
      at: "packages/server/src/domain/chat/x.ts",
      expect: { count: 2 },
      why: "the banned D19 term as a code identifier — every occurrence (param + use) is its own finding",
    },
  ],
  mustPass: [
    {
      files: "// callerUserId is forbidden (D19)\nexport const doc = 'route the callerUserId';\n",
      at: "packages/server/src/domain/chat/y.ts",
      why: "the term in a COMMENT / string literal — AST identifiers only; documentation is exempt",
    },
  ],
};
