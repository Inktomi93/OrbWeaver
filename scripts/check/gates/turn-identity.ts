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
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const BANNED_IMPORT = "Principal";
const BANNED_IDENTIFIER = "principal";
// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (a)) ──────────────────────────────────────────────
// Two arms, ONE reason (D19: the chat engine is Principal-BLIND): a `Principal` named import, or a
// lowercase `principal` identifier, inside domain/chat/engine/**. The offending TOKEN on each finding
// distinguishes the arms (owner ruling 2 — reason once, occurrences under). scanRoot mirrors the legacy
// ENGINE filter (the parity oracle).
const GATE_MESSAGE =
  "the chat engine is Principal-BLIND (D19 turn-identity): identity reaches it only as the resolved triple (runAsUserId + triggeredBy — engine/turn-identity.ts). Neither the `Principal` type nor a `principal` object may be NAMED in the engine; resolve the triple at the verb layer and pass it down (D16/D17/D19).";
const ENGINE_ANCHORED = /packages\/server\/src\/domain\/chat\/engine\//u;

/** Is this ImportSpecifier a `Principal` named import? */
function isPrincipalImport(spec: Node): boolean {
  return Node.isImportSpecifier(spec) && spec.getName() === BANNED_IMPORT;
}

export const gate: GateDescriptor = {
  name: "turn-identity",
  docRow: "ledger D16/D17/D19 (engine/turn-identity.ts)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: GATE_MESSAGE,
  fix: "resolve the identity triple (runAsUserId + triggeredBy) at the verb layer and pass it down; the caller's Principal stays at the verb layer.",
  scanRoot: (p) => ENGINE_ANCHORED.test(p),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.Identifier],
  visit: (node, _sf, ctx) => {
    if (isPrincipalImport(node)) {
      ctx.report(node, { token: BANNED_IMPORT, offset: 0 });
      return;
    }
    // The Identifier arm: a lowercase `principal` name. Skip the import-specifier's own name identifier
    // (handled above / not this arm's target — it bans the lowercase object name, not the `Principal` type).
    if (node.getKind() === SyntaxKind.Identifier && node.getText() === BANNED_IDENTIFIER) {
      ctx.report(node, { token: BANNED_IDENTIFIER, offset: 0 });
    }
  },
  mustFlag: [
    {
      files:
        'import { Principal } from "@orb/contracts/identity";\nexport const p: Principal = null as never;\n',
      at: "packages/server/src/domain/chat/engine/a.ts",
      why: "a `Principal` named import inside the engine — the caller's id type reaching the engine",
    },
    {
      files: "export function h(principal: unknown) {}\n",
      at: "packages/server/src/domain/chat/engine/b.ts",
      why: "a lowercase `principal` identifier inside the engine — the caller's id object named there",
    },
  ],
  mustPass: [
    {
      files: "export function ok(principal: unknown) {}\n",
      at: "packages/server/src/domain/chat/verbs/c.ts",
      why: "the same `principal` identifier OUTSIDE the engine (a verb) passes — only engine/ is blind",
    },
    {
      files:
        'import { Principal } from "@orb/contracts/identity";\nexport const p: Principal = null as never;\n',
      at: "packages/server/src/domain/chat/verbs/d.ts",
      why: "the `Principal` import OUTSIDE the engine (a verb) — the verb layer legitimately holds the caller's id, passes",
    },
  ],
};
