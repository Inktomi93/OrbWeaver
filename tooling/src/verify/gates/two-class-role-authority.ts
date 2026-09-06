// Gate: two-class-role-authority — an inline `role === "host"` comparison in an ENFORCEMENT position (its
// `if` throws) must route through the domain's ONE cited authority chokepoint. Spine invariant #6: `can()`
// is the only privilege-comparison site.
//
// THE TWO CLASSES (ruled 2026-08-03; both cross-cited in the code, cross-cites landed in 22389aff):
// (1) ENFORCEMENT — a role comparison that DECIDES whether an operation may proceed. Its home is the
//     domain's chokepoint: `domain/chat/substrate/auth/decide.ts` (`assertHost`/`permitsHost`, routing to
//     the injected `can()`), and `can()` itself at `domain/admin/guard.ts`. THIS is what the gate bites.
// (2) DATA PROJECTION — a role read that PRODUCES A PAYLOAD/VIEW FIELD consumers thread as DATA
//     (`substrate/member-visibility.ts::viewerReadsHidden`, `substrate/chat-detail.ts::viewerIsHost`,
//     D106-F1). Deliberately Principal-free and I/O-free; wiring them through `can()` would thread a
//     Principal into a pure projection for zero behavior change. The gate does NOT bite these, and that is
//     not an accident of the pattern — the ENFORCEMENT-POSITION test (the comparison must gate a `throw`)
//     is exactly the line between the classes, so a projection can never be "fixed" into a violation.
//
// THE CHOKEPOINT IS PER-DOMAIN, and it is CITED — that is the law this gate mints. A domain reaches the
// KERNEL only through its own chokepoint file, which owns the domain-coded, leak-free refusal shape
// (not-found vs forbidden) but never the comparison: chat's is `substrate/auth/decide.ts`, rpg's is its
// `guard.ts` (the ratified 9th-slot authority primitive, rpg-design/05 §4.4). Both now route the verdict
// through the injected `can()`, so `admin/guard.ts` is the ONE sanctioned comparison site left.
//
// STAGE R1 (2026-08-03) RETIRED THE SECOND SITE. `SANCTIONED_HOMES` used to carry `domain/rpg/guard.ts` as a
// transitional home, two-sided ON PURPOSE so the unification would self-red the commit that landed it — it
// did (`RpgContext` gained the injected `can`; `assertHostRole`/`assertOwnUserRef` became a catch-and-reword
// over the kernel, chat's `permits()` pattern), and the row was deleted in that same commit. The rpg refusal
// SENTENCES are unchanged byte-for-byte, pinned by tests/server/domain/rpg/authority.suite.int.test.ts, which
// passed UNMODIFIED across the reroute. The remedy this gate prints still says "route through your domain's
// cited chokepoint", not "call can()" — a verb reaches its chokepoint, and the chokepoint reaches the kernel.
//
// SCOPE: `packages/server/src/domain/**`. DECLARED BLIND SPOTS (measured, not assumed):
//   • `entry/compose/automation-plugin.ts` (2 sites) computes an authority PAYLOAD (`canWrite: role ===
//     "host"`) for the plugin realm off a direct `loadPresentRole` read — class (2), and outside domain/.
//   • `transport/trpc/stream/sources/automation.ts:54` compares `authority === "host"` where `authority` is
//     a StreamAuthority TIER string, not a `ParticipantRole` — a different axis that happens to share a
//     lexeme. A syntactic gate cannot tell those apart by type, which is why the scan root stops at
//     `domain/`: inside a domain, `<x>.role === "host"` IS the participant axis.
//   • a role compared through an alias (`const isHost = m.role === "host"` used later in a throwing `if`)
//     carries no throw in its own `if` — the literal-shape reader's honest limit, same class as
//     `no-hover-display-swap`'s runtime-assembled className;
//   • the GUARD-INVERSION spelling (`if (role === "host") { return; } throw …`) throws OUTSIDE the `if`, so
//     the enforcement test does not see it. Both limits are proven, not assumed — each has a mustPass row
//     stating it, so a future widening starts from a written baseline rather than a surprise.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";

const HOST_ROLE = "host";
const ROLE_IDENTIFIER = "role";
const DOMAIN_ROOT = "packages/server/src/domain/";

/** The domain chokepoints — the files whose enforcement comparison IS the sanctioned single site, each with
 *  the citation that makes it law. Both-ways ratchet: a home listed here that carries NO enforcement
 *  comparison any more is RED (the sanction has moved or died — delete the row), so this table can never
 *  become a standing exemption for a file that no longer earns it. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/server/src/domain/admin/guard.ts": {
    why: "the `can()` seam itself — spine invariant #6: `owner ⊇ admin` and `role === 'host'` are decided HERE and nowhere else (its own header states it).",
  },
};

/** Enforcement-shaped comparisons that are NOT a caller-privilege gate. Each carries the reason it survives.
 *  Same both-ways ratchet as the sanctioned homes. */
const ALLOWLIST: ExemptionTable = {
  "packages/server/src/domain/chat/verbs/participants.ts": {
    why: "the host compare is on the NOMINEE (`nominee.role === 'host'` → ChatNotFound) — a TARGET-VALIDITY check on the handoff candidate, not the caller's privilege (the caller's gate is the `requireHost` on the line above it).",
  },
};

const MESSAGE =
  'inline role comparison in an ENFORCEMENT position — a `role === "host"` that gates a `throw`. Spine ' +
  "invariant #6: the privilege comparison lives at the domain's ONE cited authority chokepoint, so a surface " +
  "that relaxes (or tightens) its gate cannot drift from every other surface. A re-spelled compare is also " +
  "how a refusal's leak-free shape gets lost: the chokepoint owns not-found-vs-forbidden, the verb does not. " +
  "The chokepoints: packages/server/src/domain/chat/substrate/auth/decide.ts (chat, via can()) and " +
  "packages/server/src/domain/rpg/guard.ts (rpg) — both of which route the verdict through the injected " +
  "can() seam, which is the ONE place the comparison lives.";

const FIX =
  "route it through your domain's CITED chokepoint: chat → `substrate/auth::assertHost`/`permitsHost`; rpg → " +
  "`guard.ts::assertHostRole(ctx.can, principal, role, reason)` / `resolveHost` — both of which ask the " +
  "injected `can()` seam for the verdict and own only the refusal. If the comparison " +
  "produces a PAYLOAD field rather than a decision, it belongs in the data-projection class instead " +
  "(`substrate/member-visibility.ts::viewerReadsHidden`, D106-F1) and must not gate a throw. A genuine " +
  "survivor (a TARGET-validity check, not a caller gate) takes an ALLOWLIST row WITH its reason.";

const STALE_HOME_PREFIX =
  "SANCTIONED_HOMES entry carries NO enforcement role comparison any more — the chokepoint moved or died " +
  "(ratchet down): delete the stale row in two-class-role-authority.ts: ";
const STALE_ALLOW_PREFIX =
  "ALLOWLIST entry carries NO enforcement role comparison any more (ratchet down): delete the stale row in two-class-role-authority.ts: ";
const GATE_SELF = "tooling/src/verify/gates/two-class-role-authority.ts";
/** The tell that a run's fileset IS the real tree: chat's enforcement chokepoint, which exists by law
 *  (spine §2a — every chat authority verdict routes through it). Absent ⇒ a synthetic/partial fileset, so
 *  the both-ways stale arms stay silent rather than claiming the chokepoints all disappeared. */
const REAL_TREE_ANCHOR = "packages/server/src/domain/chat/substrate/auth/decide.ts";

const LEADING_SLASH_RE = /^\/+/u;

function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path.replace(LEADING_SLASH_RE, "") : path.slice(idx + 1);
}

/** Is `node` the `"host"` string literal? */
function isHostLiteral(node: Node): boolean {
  return node.isKind(SyntaxKind.StringLiteral) && node.getLiteralText() === HOST_ROLE;
}

/** Is `node` a read of a `role` binding — the bare identifier (`role`) or any property access whose TAIL is
 *  `role` (`membership.role`, `authorized.role`, `viewer?.role`). Inside `domain/`, that tail IS the
 *  ParticipantRole axis (see the header's blind-spot note about the transport tier's different axis). */
function isRoleRead(node: Node): boolean {
  if (node.isKind(SyntaxKind.Identifier)) {
    return node.getText() === ROLE_IDENTIFIER;
  }
  if (node.isKind(SyntaxKind.PropertyAccessExpression)) {
    return node.getName() === ROLE_IDENTIFIER;
  }
  return false;
}

/** A `<role read> ===/!== "host"` (either operand order) equality comparison. */
function isRoleHostComparison(node: Node): boolean {
  if (!node.isKind(SyntaxKind.BinaryExpression)) {
    return false;
  }
  const op = node.getOperatorToken().getKind();
  if (op !== SyntaxKind.EqualsEqualsEqualsToken && op !== SyntaxKind.ExclamationEqualsEqualsToken) {
    return false;
  }
  const left = node.getLeft();
  const right = node.getRight();
  return (isRoleRead(left) && isHostLiteral(right)) || (isHostLiteral(left) && isRoleRead(right));
}

/** Does this branch THROW? A block is scanned one level deep only: a `throw` nested inside a FURTHER `if`
 *  belongs to that inner condition's enforcement, not this one's. */
function throws(node: Node | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  if (node.isKind(SyntaxKind.ThrowStatement)) {
    return true;
  }
  return node.isKind(SyntaxKind.Block) && node.getStatements().some((s) => s.isKind(SyntaxKind.ThrowStatement));
}

/** Walk OUT of a comparison through the boolean plumbing that keeps it a condition — parens, `!`, `&&`,
 *  `||` — and return the outermost expression still acting as that one condition. */
function conditionRoot(node: Node): Node {
  let current = node;
  for (;;) {
    const parent = current.getParent();
    if (parent === undefined) {
      return current;
    }
    if (parent.isKind(SyntaxKind.ParenthesizedExpression)) {
      current = parent;
      continue;
    }
    if (parent.isKind(SyntaxKind.PrefixUnaryExpression) && parent.getOperatorToken() === SyntaxKind.ExclamationToken) {
      current = parent;
      continue;
    }
    if (parent.isKind(SyntaxKind.BinaryExpression)) {
      const op = parent.getOperatorToken().getKind();
      if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) {
        current = parent;
        continue;
      }
    }
    return current;
  }
}

/** ENFORCEMENT POSITION: the comparison (through the boolean plumbing above) is the condition of an `if`
 *  whose then/else branch throws. Everything else — a payload field, a ternary VALUE, a `.find()` predicate,
 *  a behavior branch that archives a row — is class (2) and is deliberately NOT this gate's business. */
function isEnforcementPosition(comparison: Node): boolean {
  const root = conditionRoot(comparison);
  const parent = root.getParent();
  if (parent === undefined || !parent.isKind(SyntaxKind.IfStatement) || parent.getExpression() !== root) {
    return false;
  }
  return throws(parent.getThenStatement()) || throws(parent.getElseStatement());
}

const passSeenHome = new Set<string>();
const passSeenAllowlisted = new Set<string>();

export const gate: GateDescriptor = {
  name: "two-class-role-authority",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  // Sanctioned homes are SCANNED, not scoped out (the macro-resolution-home precedent): the only exemption
  // is a CITED row, so a moved/renamed chokepoint goes RED instead of carrying its sanction along.
  scanRoot: (p) => p.includes(DOMAIN_ROOT),
  kinds: [SyntaxKind.BinaryExpression],

  begin: () => {
    passSeenHome.clear();
    passSeenAllowlisted.clear();
  },

  visit: (node, sf, ctx) => {
    if (!(isRoleHostComparison(node) && isEnforcementPosition(node))) {
      return;
    }
    const rel = repoRel(sf.getFilePath());
    if (rel in SANCTIONED_HOMES) {
      passSeenHome.add(rel);
      return;
    }
    if (rel in ALLOWLIST) {
      passSeenAllowlisted.add(rel);
      return;
    }
    ctx.report(node);
  },

  finalize: (ctx) => {
    // The stale arms are WHOLE-TREE claims: never below project scope (§4.4), and never on a fileset that
    // is not the real tree. The second guard is the `verify-registry-parity` real-manifest idiom — a
    // synthetic conformance mini-project also reports `scope.kind === "project"`, so without an anchor the
    // gate's own self-proof examples would each "prove" that every chokepoint had vanished.
    if (ctx.scope.kind !== "project" || !ctx.files.some((sf) => sf.getFilePath().endsWith(REAL_TREE_ANCHOR))) {
      return;
    }
    for (const rel of Object.keys(SANCTIONED_HOMES)) {
      if (!passSeenHome.has(rel)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `${STALE_HOME_PREFIX}"${rel}" — tooling/src/verify/gates/two-class-role-authority.ts` });
      }
    }
    for (const rel of Object.keys(ALLOWLIST)) {
      if (!passSeenAllowlisted.has(rel)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `${STALE_ALLOW_PREFIX}"${rel}" — tooling/src/verify/gates/two-class-role-authority.ts` });
      }
    }
  },

  mustFlag: [
    {
      files: `export function f(role: string): void {\n  if (role !== "host") {\n    throw new Error("nope");\n  }\n}\n`,
      at: "packages/server/src/domain/rpg/verbs/patch-actor.ts",
      expect: { count: 1 },
      why: "the founding shape — a verb re-spelling its domain chokepoint's comparison to raise its own refusal (the six rpg verbs collapsed onto `assertHostRole`)",
    },
    {
      files: `export function f(m: { role: string }, n: number): void {\n  if (m.role !== "host" && n > 1) {\n    throw new Error("nope");\n  }\n}\n`,
      at: "packages/server/src/domain/chat/verbs/fork.ts",
      expect: { count: 1 },
      why: "the COMPOSITE gate (`role !== 'host' && presentHumanCount > 1` — the real fork gate): the `&&` plumbing must not hide the comparison from the enforcement test",
    },
    {
      files: `export function f(m: { role: string }): void {\n  if (!(m.role === "host")) {\n    throw new Error("nope");\n  }\n}\n`,
      at: "packages/server/src/domain/chat/verbs/x.ts",
      why: "negated + parenthesized — the same gate read backwards; the condition walk climbs `!` and parens",
    },
    {
      files: `export function f(role: string): void {\n  if ("host" !== role) {\n    throw new Error("nope");\n  }\n}\n`,
      at: "packages/server/src/domain/admin/x.ts",
      why: "operand order reversed — a literal-first comparison is the same privilege decision",
    },
  ],
  mustPass: [
    {
      files: `export function viewerReadsHidden(viewer: { role: string }): boolean {\n  return viewer.role === "host";\n}\n`,
      at: "packages/server/src/domain/chat/substrate/member-visibility.ts",
      why: "class (2), the D106-F1 DATA PROJECTION home: a payload verdict consumers thread as data — it decides nothing and throws nothing",
    },
    {
      files: `export function detail(viewer: { role: string } | undefined): { viewerIsHost: boolean } {\n  return { viewerIsHost: viewer?.role === "host" };\n}\n`,
      at: "packages/server/src/domain/chat/substrate/chat-detail.ts",
      why: "class (2) again — the `viewerIsHost` payload FIELD (the other sanctioned projection file)",
    },
    {
      files: `export function host(roster: readonly { role: string; userId: string | null }[]): string | null {\n  return roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;\n}\n`,
      at: "packages/server/src/domain/chat/verbs/read.ts",
      why: "a roster LOOKUP (who is the host?) — the single most common shape in chat; it selects a row, it does not gate an operation",
    },
    {
      files: `export async function leave(m: { role: string }, archive: () => Promise<void>): Promise<void> {\n  if (m.role === "host") {\n    await archive();\n  }\n}\n`,
      at: "packages/server/src/domain/chat/verbs/roster.ts",
      why: "a BEHAVIOR branch (the host leaving archives the room) — no throw, no privilege decision; the enforcement-position test is what keeps it legal",
    },
    {
      files: `export function floor(m: { role: string; joinSeq: number }): number {\n  return m.role === "host" ? 0 : m.joinSeq;\n}\n`,
      at: "packages/server/src/domain/chat/substrate/auth/clamp.ts",
      why: "the history-floor POLICY resolver — a value-producing ternary, the clamp class ([[history-floor-authority-is-clamp-resolver]]), not a gate",
    },
    {
      files: `export function f(kind: string): void {\n  if (kind !== "host") {\n    throw new Error("nope");\n  }\n}\n`,
      at: "packages/server/src/domain/chat/verbs/z.ts",
      why: 'a non-`role` binding compared to the same lexeme (`kind`) — the gate keys on the ParticipantRole vocabulary, not on the word "host"',
    },
    {
      files: `export function f(m: { role: string }): void {\n  if (m.role === "host") {\n    return;\n  }\n  throw new Error("nope");\n}\n`,
      at: "packages/server/src/domain/chat/verbs/y.ts",
      why: "DECLARED LIMIT, proven not assumed: the GUARD-INVERSION spelling throws OUTSIDE the `if`, so the enforcement test does not see it. There are zero instances on the tree; this row is the written baseline a future widening starts from",
    },
  ],
};
