// Policy: two-class-role-authority — an inline participant-role comparison in an ENFORCEMENT position (its
// `if` throws) must route through the domain's ONE cited authority chokepoint. Spine invariant #6: `can()`
// is the only privilege-comparison site.
//
// THE TWO CLASSES (ruled 2026-08-03, cross-cited in the code at 22389aff):
// (1) ENFORCEMENT — a role comparison that DECIDES whether an operation may proceed. Its home is the
//     domain's chokepoint (`domain/chat/substrate/auth/decide.ts`, `domain/rpg/guard.ts`), both of which now
//     route the verdict through the injected `can()` at `domain/admin/guard.ts`. THIS is what the gate bites.
// (2) DATA PROJECTION — a role read that PRODUCES A PAYLOAD FIELD consumers thread as data
//     (`substrate/member-visibility.ts::viewerReadsHidden`, `substrate/chat-detail.ts::viewerIsHost`,
//     D106-F1). Principal-free and I/O-free by design; wiring them through `can()` would thread a Principal
//     into a pure projection for zero behavior change. The ENFORCEMENT-POSITION test (the comparison must
//     gate a `throw`) IS the line between the classes, so a projection can never be "fixed" into a violation.
//
// IDENTITY, NOT SPELLING, ON BOTH HALVES. The legacy reader hardcoded `"host"` inside the gate and matched
// the operand by NAME. The literal set is now read from `PARTICIPANT_ROLES`' own declaration through the
// shared `tupleVocabularyFact`, bound to its home in `packages/contracts/src/identity/` — so a third
// participant role is judged the day it lands, and a vocabulary that stops resolving takes the receipt to
// zero and WITHHOLDS the verdict instead of rendering a clean pass. The AXIS is then proven by the read's own
// TYPE, which is what retires the legacy header's second declared blind spot BY CONSTRUCTION: transport's
// `authority === "host"` compares a StreamAuthority TIER string that merely shares a lexeme, and its type is
// not the participant vocabulary.
//
// THE `role` NAME REMAINS PART OF THE SUBJECT, and three declared limits carry rows: a comparison hoisted
// into a boolean CONST used later in a throwing `if`, the GUARD-INVERSION spelling
// (`if (role === "host") { return; } throw …`) whose throw is outside the `if`, and a `switch (role)` whose
// CASE CLAUSE throws — the enforcement-position test reads an `if` condition, and a switch is a different
// statement shape with no comparison node to walk out of. All three are zero-instance on this tree.
//
// The AXIS test FAILS CLOSED: a read the checker types `any`, plain `string`, or a strict SUPERSET of the
// vocabulary is reported, because each MIGHT be the participant axis and the legacy name reader bit the
// `string` case. Only a closed literal union that provably omits a vocabulary member acquits.
//
// AUTHORITY IS reviewed-grant: both legacy tables were recurring repository PERMISSIONS, not per-occurrence
// mistakes — the `can()` seam's own comparison, and the ONE nominee TARGET-VALIDITY check that is not a
// caller gate. Each is one exact `(subject, operation)` row in the central reviewed-grant table, and the
// legacy both-ways stale arms are that table's own liveness: a home that stops carrying an enforcement
// comparison leaves its row consumed zero times, which is the central STALE alarm.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readAxisVerdict, readRoleComparison, vocabularyAtHome, vocabularyMembers } from "../lib/role-vocabulary.ts";
import { tupleVocabularyFact, tupleVocabularyReceipt } from "../lib/tuple-vocabulary-fact.ts";

const VOCABULARY = "PARTICIPANT_ROLES";
const VOCABULARY_HOME = "/packages/contracts/src/identity/";
const OPERATION = "enforcement-role-comparison";

const MESSAGE =
  "inline participant-role comparison in an ENFORCEMENT position — a role comparison that gates a `throw`. " +
  "Spine invariant #6: the privilege comparison lives at the domain's ONE cited authority chokepoint, so a " +
  "surface that relaxes (or tightens) its gate cannot drift from every other surface. A re-spelled compare " +
  "is also how a refusal's leak-free shape gets lost: the chokepoint owns not-found-vs-forbidden, the verb " +
  "does not.";
const FIX =
  "route it through your domain's CITED chokepoint: chat → `substrate/auth::assertHost`/`permitsHost`; rpg → `guard.ts::assertHostRole`/`resolveHost` — both ask the injected `can()` seam for the verdict and own only the refusal. If the comparison produces a PAYLOAD field rather than a decision it belongs in the data-projection class (`substrate/member-visibility.ts::viewerReadsHidden`, D106-F1) and must not gate a throw.";

/** Does this branch THROW? A block is scanned ONE LEVEL DEEP only: a `throw` nested inside a further `if`
 *  belongs to that inner condition's enforcement, not to this one's. */
function throws(node: MorphNode | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  if (Node.isThrowStatement(node)) {
    return true;
  }
  return Node.isBlock(node) && node.getStatements().some((statement) => Node.isThrowStatement(statement));
}

/** Walk OUT of a comparison through the boolean plumbing that keeps it ONE condition — parens, `!`, `&&`,
 *  `||` — and return the outermost expression still acting as that condition. */
function conditionRoot(node: MorphNode): MorphNode {
  let current = node;
  for (;;) {
    const parent: MorphNode | undefined = current.getParent();
    if (parent === undefined) {
      return current;
    }
    if (Node.isParenthesizedExpression(parent)) {
      current = parent;
      continue;
    }
    if (Node.isPrefixUnaryExpression(parent) && parent.getOperatorToken() === SyntaxKind.ExclamationToken) {
      current = parent;
      continue;
    }
    const logical =
      Node.isBinaryExpression(parent) &&
      (parent.getOperatorToken().getKind() === SyntaxKind.AmpersandAmpersandToken || parent.getOperatorToken().getKind() === SyntaxKind.BarBarToken);
    if (!logical) {
      return current;
    }
    current = parent;
  }
}

/** ENFORCEMENT POSITION: the comparison is (through that plumbing) the condition of an `if` whose then/else
 *  branch throws. A payload field, a ternary VALUE, a `.find()` predicate and a behavior branch are class (2)
 *  and are deliberately not this policy's business. */
function isEnforcementPosition(comparison: MorphNode): boolean {
  const root = conditionRoot(comparison);
  const parent = root.getParent();
  if (parent === undefined || !Node.isIfStatement(parent) || parent.getExpression() !== root) {
    return false;
  }
  return throws(parent.getThenStatement()) || throws(parent.getElseStatement());
}

export const gate = defineGate({
  id: "two-class-role-authority",
  family: "role-vocabulary",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/domain/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [tupleVocabularyFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: { readonly node: MorphNode; readonly read: MorphNode; readonly value: string; readonly subject: string }[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.BinaryExpression],
          visit: (node, sourceFile: SourceFile) => {
            const comparison = readRoleComparison(node);
            if (comparison === undefined || !isEnforcementPosition(node)) {
              return;
            }
            candidates.push({ node, read: comparison.read, value: comparison.value, subject: ctx.relativePath(sourceFile) });
          },
        },
      ],
      evaluate: () => {
        const vocabulary = vocabularyAtHome(ctx.fact(tupleVocabularyFact).read(VOCABULARY), VOCABULARY, VOCABULARY_HOME);
        ctx.receipt({ kind: "population", ...tupleVocabularyReceipt(vocabulary) });
        const members = vocabularyMembers(vocabulary);
        if (members.size === 0) {
          return;
        }
        const reported = new Map<string, MorphNode>();
        for (const candidate of candidates) {
          // FAIL-CLOSED on an axis the checker could not close: a read typed `any`/`string`, or one whose
          // type is a strict SUPERSET still carrying the whole vocabulary, MIGHT be the participant axis —
          // and the legacy name reader bit the `string` case, so passing it would be a narrowing. Only a
          // proven other axis (a closed literal union missing a member) acquits.
          if (!(members.has(candidate.value) && readAxisVerdict(candidate.read, members) !== "foreign")) {
            continue;
          }
          // ONE finding per carrier: a reviewed grant licenses one `(subject, operation)`.
          if (!reported.has(candidate.subject)) {
            reported.set(candidate.subject, candidate.node);
          }
        }
        for (const [subject, node] of [...reported].toSorted(([left], [right]) => left.localeCompare(right))) {
          ctx.report.node(node, { subject, operation: OPERATION, message: `${MESSAGE} Comparer: ${subject}.`, fix: FIX });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/rpg/verbs/patch-actor.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(role: ParticipantRole): void {\n  if (role !== "host") {\n    throw new Error("nope");\n  }\n}\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/rpg/verbs/patch-actor.ts" },
      why: "the founding shape — a verb re-spelling its domain chokepoint's comparison to raise its own refusal (the six rpg verbs collapsed onto `assertHostRole`); the message carries the exact grant SUBJECT",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/fork.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(m: { role: ParticipantRole }, n: number): void {\n  if (m.role !== "host" && n > 1) {\n    throw new Error("nope");\n  }\n}\n',
      },
      expect: { count: 1 },
      why: "the COMPOSITE gate (the real fork gate, `role !== 'host' && presentHumanCount > 1`): the `&&` plumbing must not hide the comparison from the enforcement test",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/negated.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(m: { role: ParticipantRole }): void {\n  if (!(m.role === "host")) {\n    throw new Error("nope");\n  }\n}\n',
      },
      expect: { count: 1 },
      why: "negated + parenthesized — the same gate read backwards; the condition walk climbs `!` and parens",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/admin/verbs/reversed.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(role: ParticipantRole): void {\n  if ("host" !== role) {\n    throw new Error("nope");\n  }\n}\n',
      },
      expect: { count: 1 },
      why: "operand order reversed — a literal-first comparison is the same privilege decision",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/other-member.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(m: { role: ParticipantRole }): void {\n  if (m.role === "member") {\n    throw new Error("nope");\n  }\n}\n',
      },
      expect: { count: 1 },
      why: 'THE VOCABULARY IS DATA: `member` is the other participant role and gating a throw on it is the same lattice re-spelling. The legacy hardcoded `"host"` set could not see it, and a third role added tomorrow is judged without editing this policy',
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/twice.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function a(m: { role: ParticipantRole }): void {\n  if (m.role !== "host") {\n    throw new Error("a");\n  }\n}\nexport function b(m: { role: ParticipantRole }): void {\n  if (m.role !== "host") {\n    throw new Error("b");\n  }\n}\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two enforcement comparisons in one carrier are ONE finding, because a reviewed grant licenses one `(subject, operation)` and two matching findings make the row OVER-BROAD and license neither",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/loose.ts":
          'export function f(m: { role: string }): void {\n  if (m.role !== "host") {\n    throw new Error("nope");\n  }\n}\n',
      },
      expect: { count: 1 },
      why: "FAIL-CLOSED on a `string`-typed carrier — the shape the LEGACY name reader bit. Passing it would make the conversion a narrowing rather than an identity upgrade",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/superset.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(m: { role: ParticipantRole | "observer" }): void {\n  if (m.role !== "host") {\n    throw new Error("nope");\n  }\n}\n',
      },
      expect: { count: 1 },
      why: "FAIL-CLOSED on a strict SUPERSET — a type that still carries every participant role is the axis plus something, not another axis",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/opaque.ts":
          'export function f(m: any): void {\n  if (m.role !== "host") {\n    throw new Error("nope");\n  }\n}\n',
      },
      expect: { count: 1 },
      why: "FAIL-CLOSED on an `any` receiver — the silent open a boolean axis test left in a family whose other arms all fail closed",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/guest-axis.ts":
          'export function f(m: { role: "host" | "guest" }): void {\n  if (m.role !== "host") {\n    throw new Error("nope");\n  }\n}\n',
      },
      why: "THE AXIS COUNTERFACTUAL, and the row the identity-swap probe measures: the `role` NAME, the `host` literal that IS a vocabulary member, and an enforcement position — everything the detector keys on except the one thing that matters, a CLOSED literal union that omits `member`. Replacing the axis comparison with a name comparison turns this row RED",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/switched.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(role: ParticipantRole): void {\n  switch (role) {\n    case "member":\n      throw new Error("nope");\n    default:\n      return;\n  }\n}\n',
      },
      why: "DECLARED LIMIT, proven not assumed: a `switch (role)` whose CASE CLAUSE throws is the same enforcement decision, but it carries no comparison node for the condition walk to climb out of — the enforcement test reads an `if` condition. Zero instances on this tree; this row is the written baseline a future widening starts from",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/substrate/member-visibility.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function viewerReadsHidden(viewer: { role: ParticipantRole }): boolean {\n  return viewer.role === "host";\n}\n',
      },
      why: "class (2), the D106-F1 DATA PROJECTION home: a payload verdict consumers thread as data — it decides nothing and throws nothing",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/roster.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport async function leave(m: { role: ParticipantRole }, archive: () => Promise<void>): Promise<void> {\n  if (m.role === "host") {\n    await archive();\n  }\n}\n',
      },
      why: "a BEHAVIOR branch (the host leaving archives the room) — no throw, no privilege decision; the enforcement-position test is what keeps it legal",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/read.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function host(roster: readonly { role: ParticipantRole; userId: string | null }[]): string | null {\n  return roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;\n}\n',
      },
      why: "a roster LOOKUP (who is the host?) — the single most common shape in chat; it selects a row, it does not gate an operation",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/automation/tier.ts":
          'export function gate(authority: "owner" | "host" | "guest"): void {\n  if (authority === "host") {\n    throw new Error("nope");\n  }\n}\n',
      },
      why: "THE AXIS COUNTERFACTUAL, and the legacy header's second DECLARED BLIND SPOT retired by construction: a StreamAuthority TIER string shares the `host` lexeme and gates a throw, but its type is not the participant vocabulary. A syntactic gate could not tell them apart, which is exactly why the legacy scan root had to stop at `domain/`",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/kind.ts":
          'export function f(kind: "host" | "guest"): void {\n  if (kind !== "host") {\n    throw new Error("nope");\n  }\n}\n',
      },
      why: 'a non-`role` binding compared to the same lexeme — the subject keys on the participant-role vocabulary, not on the word "host"',
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/inverted.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(m: { role: ParticipantRole }): void {\n  if (m.role === "host") {\n    return;\n  }\n  throw new Error("nope");\n}\n',
      },
      why: "DECLARED LIMIT, proven not assumed: the GUARD-INVERSION spelling throws OUTSIDE the `if`, so the enforcement test does not see it. There are zero instances on the tree; this row is the written baseline a future widening starts from",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/chat/verbs/hoisted.ts":
          'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(m: { role: ParticipantRole }): void {\n  const isHost = m.role === "host";\n  if (!isHost) {\n    throw new Error("nope");\n  }\n}\n',
      },
      why: "DECLARED LIMIT — a comparison hoisted into a boolean const carries no throw in its own `if`, the same class as `no-hover-display-swap`'s runtime-assembled className. Written down so a future widening starts from a baseline rather than a surprise",
    },
  ],
});
