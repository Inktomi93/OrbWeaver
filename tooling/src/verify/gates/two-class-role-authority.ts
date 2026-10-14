// Participant-role enforcement belongs in the injected kernel (D121), including room-effect ceilings.
// Throwing conditions and canWrite/isInstallerHost fields are enforcement; viewer-byte projections and
// roster lookups remain separate. Shared role-vocabulary readers prove the axis and vocabulary identity.
// Population includes domain and entry; exact sanctioned kernel/shape/nominee grants remain centrally judged.
// Hoisted booleans, guard inversion and switches remain declared limits.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStaticString, staticMemberAccess } from "../../floor/code-facts/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { readAxisVerdict, readRoleComparison, vocabularyAtHome, vocabularyMembers } from "../lib/role-vocabulary.ts";
import { tupleVocabularyFact, tupleVocabularyReceipt } from "../lib/tuple-vocabulary-fact.ts";

const VOCABULARY = "PARTICIPANT_ROLES";
const VOCABULARY_HOME = "/packages/contracts/src/identity/";
const OPERATION = "enforcement-role-comparison";
const ENFORCEMENT_FIELDS: ReadonlySet<string> = new Set(["canWrite", "isInstallerHost"]);

const MESSAGE =
  "inline participant-role comparison in an ENFORCEMENT position — a throwing condition or room-effect authority ceiling. " +
  "Spine invariant #6: the privilege comparison lives at the domain's ONE cited authority chokepoint, so a " +
  "surface that relaxes (or tightens) its gate cannot drift from every other surface. A re-spelled compare " +
  "is also how a refusal's leak-free shape gets lost: the chokepoint owns not-found-vs-forbidden, the verb " +
  "does not. (tooling/src/verify/gates/GATE-AUTHORING.md)";
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
 *  branch throws. Room-effect ceiling fields are judged separately; viewer projection and roster lookup are not authority. */
function isEnforcementPosition(comparison: MorphNode): boolean {
  const root = conditionRoot(comparison);
  const parent = root.getParent();
  if (parent === undefined || !Node.isIfStatement(parent) || parent.getExpression() !== root) {
    return false;
  }
  return throws(parent.getThenStatement()) || throws(parent.getElseStatement());
}

function fieldValueRoot(comparison: MorphNode): MorphNode {
  const root = conditionRoot(comparison);
  const parent = root.getParent();
  if (parent !== undefined && Node.isReturnStatement(parent)) {
    const block = parent.getParent();
    const callable = block.getParent();
    if (Node.isBlock(block) && callable !== undefined && (Node.isArrowFunction(callable) || Node.isFunctionExpression(callable))) {
      return callable;
    }
  } else if (parent !== undefined && Node.isArrowFunction(parent) && parent.getBody() === root) {
    return parent;
  }
  return root;
}

function isEnforcementField(comparison: MorphNode): boolean {
  const root = fieldValueRoot(comparison);
  const parent = root.getParent();
  if (parent !== undefined && Node.isPropertyAssignment(parent) && parent.getInitializer() === root) {
    const name = parent.getNameNode();
    const key = Node.isIdentifier(name) ? name.getText() : readStaticString(Node.isComputedPropertyName(name) ? name.getExpression() : name);
    return typeof key === "string" ? ENFORCEMENT_FIELDS.has(key) : key.kind === "resolved" && ENFORCEMENT_FIELDS.has(key.value);
  }
  if (parent !== undefined && Node.isBinaryExpression(parent) && parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken && parent.getRight() === root) {
    const member = staticMemberAccess(parent.getLeft());
    return member !== undefined && ENFORCEMENT_FIELDS.has(member.name);
  }
  return false;
}

export const gate = defineGate({
  id: "two-class-role-authority",
  family: "role-vocabulary",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/domain/**", "packages/server/src/entry/**"] },
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
            const field = isEnforcementField(node);
            const comparison = readRoleComparison(node, field);
            if (comparison === undefined || !(field || isEnforcementPosition(node))) {
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
        "packages/server/src/domain/plugin/field.ts":
          'import type { ParticipantRole } from "../../../../contracts/src/identity/index.ts";\nconst KEY = "canWrite";\nexport function authority(member: { role: ParticipantRole }) { return { [KEY]: member["role"] === "host" }; }\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/plugin/field.ts" },
      why: "computed authority field and computed role read are the same operation ceiling",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/plugin/assigned.ts":
          'import type { ParticipantRole } from "../../../../contracts/src/identity/index.ts";\nexport function authority(role: ParticipantRole, scope: { canWrite: boolean }) { scope["canWrite"] = role === "host"; }\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/plugin/assigned.ts" },
      why: "writing an authority field after object creation is the same ceiling as its initializer",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/plugin/callback.ts":
          'import type { ParticipantRole } from "../../../../contracts/src/identity/index.ts";\nexport function authority(role: ParticipantRole) { return { isInstallerHost: async () => { return role === "host"; } }; }\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/plugin/callback.ts" },
      why: "a block-bodied installer-host callback cannot evade the expression-bodied field control",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/entry/compose/plugin.ts":
          'import type { ParticipantRole } from "../../../../contracts/src/identity/index.ts";\nexport function authority(role: ParticipantRole) { if (role !== "host") throw new Error("denied"); }\n',
        "packages/server/src/domain/anchor.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "packages/server/src/entry/compose/plugin.ts" },
      why: "entry wiring cannot become a second room-authority enforcement home",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/plugin/authority.ts":
          'import type { ParticipantRole } from "../../../../contracts/src/identity/index.ts";\nexport function authority(role: ParticipantRole) { return { canWrite: role === "host" }; }\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/plugin/authority.ts" },
      why: "canWrite carries an operation ceiling, not a hidden-content projection, even when the refusal is downstream",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n',
        "packages/server/src/domain/plugin/registrar.ts":
          'import type { ParticipantRole } from "../../../../contracts/src/identity/index.ts";\ndeclare function load(): Promise<ParticipantRole | null>;\nexport const registrar = { isInstallerHost: async () => (await load()) === "host" };\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/plugin/registrar.ts" },
      why: "the current installer-host callback compares a fresh call result, not an identifier spelled role",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/rpg/verbs/patch-actor.ts", operation: "enforcement-role-comparison" },
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
        "packages/server/src/entry/compose/view.ts":
          'import type { ParticipantRole } from "../../../../contracts/src/identity/index.ts";\nexport function view(role: ParticipantRole) { return { viewerIsHost: role === "host" }; }\n',
        "packages/server/src/domain/anchor.ts": "export {};\n",
      },
      why: "widening entry must not turn a viewer-byte projection into operation authority",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts": 'export const PARTICIPANT_ROLES = ["host", "member"] as const;\n',
        "packages/server/src/entry/compose/foreign.ts": 'export function authority(role: "host" | "guest") { return { canWrite: role === "host" }; }\n',
        "packages/server/src/domain/anchor.ts": "export {};\n",
      },
      why: "an enforcement-like field on a provably foreign role axis is not a participant-role comparison",
    },
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
