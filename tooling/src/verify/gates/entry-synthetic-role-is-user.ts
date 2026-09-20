// Gate: entry-synthetic-role-is-user (#2382) — a synthetic Principal carrying a hardcoded
// `role: "user"` belongs ONLY in the entry layer (`packages/server/src/entry/`). A synthetic Principal
// is one whose `role` is a STRING LITERAL rather than read from a `users` row. The three current sites
// (compose/chat.ts, compose/imagery.ts, compose/search-discovery.ts) hardcode it for role-irrelevant ops
// (getCard, persona reads). A domain-layer file fabricating a Principal's role is a privilege-escalation
// surface (`Spine-Identity-and-Auth.md`: identity resolves ONCE at the edge) — it must receive its
// Principal from the caller.
//
// THE DISCRIMINATOR IS THE OBJECT SHAPE, NEVER FILE-LEVEL WORD CO-OCCURRENCE (the #2382 review defect,
// lane gate-scope-D 2026-09-19). The landed version asked two unrelated questions of the WHOLE FILE — does
// its text contain `Principal`, and does any line contain `role: "user"` — and reported the intersection.
// `role` is a shared word across two unrelated vocabularies: `Principal.role` (a UserRole) and a chat
// message's `role` (`user`/`assistant`/`system`). A domain file that carries a Principal in its signatures
// AND builds a `{ role: "user", content }` message is the COMMON shape, not a defect — and this policy's
// authority is `hard`, so a false positive here has NO waiver door at all. The tree was green only because
// the one file holding both spellings in CODE (`domain/chat/verbs/quiet-generate.ts:59`, a `role: "user"`
// message) happens to name `Principal` only in a COMMENT, which the blanking fence removed. Adding one
// `import type { Principal }` to that file — an edit with no security meaning whatever — would have turned
// a message literal into an unwaivable RED. Proven red-first at
// `packages/server/src/domain/chat/verbs/gd-probe-msg.ts` before this rewrite.
//
// DETECTION (AST, syntax tier — no checker): a `role` PropertyAssignment whose initializer is the string
// literal `"user"`, whose ENCLOSING OBJECT LITERAL is Principal-shaped. Principal-shaped means either
//   (a) the literal's own property names include BOTH `externalId` and `via` — the two fields of
//       `Principal` (`packages/contracts/src/identity/index.ts`) that no message shape carries, so the
//       full five-field mint is identified by its own body rather than by its file's other words; or
//   (b) the literal is annotated `Principal` at its declaration, cast, `satisfies`, or the enclosing
//       function's return type — which catches a SPREAD-built mint (`{ ...base, role: "user" }`) whose
//       body no longer spells the sibling fields.
// DECLARED LIMIT: a spread-built literal with NO annotation anywhere on the chain is not identified. It
// cannot be, at the syntax tier, without re-admitting the message false positive this rewrite exists to
// kill — and `one-principal-mint-population` (#2381) is the population seal that watches the mint sites
// themselves. The two policies are the pair; neither alone is the whole answer.
//
// POPULATION: `entry/` leaves through `notUnder` rather than an in-visitor path test, so the sanctioned
// home is a declared population fact the harness can read rather than a branch only the code knows.
//
// FAMILY: a declared SINGLETON under its own id. No shared reader — this is a layer-boundary check.
import type { ObjectLiteralExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const ENTRY_GLOB = "packages/server/src/entry/**";
const ROLE_PROPERTY = "role";
const SYNTHETIC_ROLE = "user";
/** The two `Principal` fields (`@orb/contracts/identity`) no message/turn shape in this repo carries. */
const PRINCIPAL_ONLY_FIELDS = ["externalId", "via"] as const;
const PRINCIPAL_TYPE = "Principal";
/** How far up the expression chain an annotation may sit: literal → paren/as/satisfies → return → fn. */
const ANNOTATION_HOPS = 5;

/** `yes` = annotated Principal · `no` = this chain cannot be one · `up` = keep walking. */
type AnnotationVerdict = "yes" | "no" | "up";

const MESSAGE =
  'a hardcoded `role: "user"` inside a Principal-shaped object literal outside `entry/` — a synthetic Principal with a fabricated role belongs only in the entry composition layer (compose/chat.ts, compose/imagery.ts, compose/search-discovery.ts). A domain verb that needs a Principal receives one from its caller.';

/** The name of a property assignment, with a string-literal key (`"role": x`) unquoted. */
function propertyName(node: Node): string {
  if (!(Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node))) {
    return "";
  }
  const name = node.getNameNode();
  return Node.isStringLiteral(name) ? name.getLiteralValue() : name.getText();
}

/** (a) the literal's OWN body carries both Principal-only fields. */
function hasPrincipalFields(literal: ObjectLiteralExpression): boolean {
  const names = new Set(literal.getProperties().map(propertyName));
  return PRINCIPAL_ONLY_FIELDS.every((field) => names.has(field));
}

/** A type node naming exactly `Principal` (an alias or a member access is a different type). */
function isPrincipalType(node: Node | undefined): boolean {
  return node?.getText() === PRINCIPAL_TYPE;
}

/** One hop of the annotation walk, so the loop itself stays a plain three-way dispatch. */
function annotationVerdict(current: Node): AnnotationVerdict {
  if (Node.isAsExpression(current) || Node.isSatisfiesExpression(current)) {
    return isPrincipalType(current.getTypeNode()) ? "yes" : "up";
  }
  if (Node.isVariableDeclaration(current) || Node.isPropertyDeclaration(current)) {
    return isPrincipalType(current.getTypeNode()) ? "yes" : "no";
  }
  if (Node.isReturnTyped(current)) {
    return isPrincipalType(current.getReturnTypeNode()) ? "yes" : "no";
  }
  // A `return { … }` reaches its function through the enclosing Block, so the Block is a transit node,
  // not a verdict — omit it and the spread-mint narrowing row goes silent (measured, conformance).
  if (Node.isParenthesizedExpression(current) || Node.isReturnStatement(current) || Node.isBlock(current)) {
    return "up";
  }
  return "no";
}

/** (b) an annotation on the chain above the literal names `Principal`. */
function isPrincipalAnnotated(literal: ObjectLiteralExpression): boolean {
  let current: Node | undefined = literal.getParent();
  for (let hop = 0; hop < ANNOTATION_HOPS; hop += 1) {
    if (current === undefined) {
      return false;
    }
    const verdict = annotationVerdict(current);
    if (verdict !== "up") {
      return verdict === "yes";
    }
    current = current.getParent();
  }
  return false;
}

/** The synthetic-role property assignment inside a Principal-shaped literal, or `null`. */
function syntheticRoleName(node: Node): Node | null {
  if (!Node.isPropertyAssignment(node) || propertyName(node) !== ROLE_PROPERTY) {
    return null;
  }
  const initializer = node.getInitializer();
  if (!Node.isStringLiteral(initializer) || initializer.getLiteralValue() !== SYNTHETIC_ROLE) {
    return null;
  }
  const literal = node.getParent();
  if (!Node.isObjectLiteralExpression(literal)) {
    return null;
  }
  return hasPrincipalFields(literal) || isPrincipalAnnotated(literal) ? node.getNameNode() : null;
}

export const gate = defineGate({
  id: "entry-synthetic-role-is-user",
  family: "entry-synthetic-role-is-user",
  authority: "hard",
  severity: "error",
  // `@inference` ADDED 2026-09-20 (lane cb-gate-reach, the §12 EXTRACTION AUDIT of
  // `docs/design/orbweaver-inference-package.md`). ~104 source files left `packages/server/src/infra/providers/`
  // for the new `@orb/inference` workspace package, and every `@server`-scoped policy stopped judging them the
  // day they moved, silently. `entry/` is the only sanctioned home for a hardcoded `role`, and the inference package is not it. The
  // package is also the tree's densest source of the OTHER `role` vocabulary (a chat message's
  // `role: "user"`), which is precisely the shared word this policy's object-shape discriminator was rewritten
  // to tell apart — so the widening also exercises that discriminator against the corpus most able to break it.
  // Measured at the widening: ZERO findings.
  population: { in: ["@server", "@inference"], notUnder: [ENTRY_GLOB] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: 'receive the Principal from the caller (every domain verb already takes one) instead of building a literal with a hardcoded `role: "user"`. The entry composition layer is the only sanctioned home for a synthetic Principal.',
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAssignment],
        visit: (node) => {
          const name = syntheticRoleName(node);
          if (name !== null) {
            ctx.report.node(name, { token: ROLE_PROPERTY, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/sneaky.ts":
          'import type { Principal } from "@orb/contracts/identity";\nconst p: Principal = { userId: "x", role: "user", handle: "x", externalId: null, via: "fallback" };\nexport const x = p;\n',
      },
      expect: { count: 1, token: ROLE_PROPERTY },
      why: "the full five-field synthetic Principal minted in a domain verb — the privilege-escalation surface this gate closes; identified by discriminator (a), its own `externalId` + `via` body",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/spread.ts":
          'import type { Principal } from "@orb/contracts/identity";\nexport function elevate(base: Principal): Principal {\n  return { ...base, role: "user" };\n}\n',
      },
      expect: { count: 1, token: ROLE_PROPERTY },
      why: "THE NARROWING ROW for discriminator (b): a SPREAD-built mint whose body no longer spells `externalId`/`via` is reached only through the enclosing function's `Principal` return annotation — drop the annotation walk and this row goes silent",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/message.ts":
          'import type { Principal } from "@orb/contracts/identity";\nexport function turn(caller: Principal, text: string) {\n  return { role: "user", content: text, by: caller.userId };\n}\n',
      },
      why: 'THE DEFECT ROW (#2382 review, lane gate-scope-D): a CHAT MESSAGE `role: "user"` in a file that genuinely imports and uses `Principal`. The landed file-level word-co-occurrence discriminator flagged this under HARD authority, which has no waiver door. Reproduced red-first on the tree before the rewrite; revert to the file-level fence and this row reds',
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/msg.ts": 'const msg = { role: "user", content: "hello" };\nexport const x = msg;\n',
      },
      why: "a message literal in a file that never names Principal — no Principal fields, no annotation, no finding",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/comment.ts":
          '// The Principal gets role: "user" from the DB, never externalId/via fabricated here.\nexport const x = 1;\n',
      },
      why: "a comment spelling the whole shape is not an object literal — the AST reads declarations, never prose",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/quoted.ts":
          'export const q = { "role": "user", content: "x" };\nexport const s = \'{ "role": "user", "externalId": null, "via": "fallback" }\';\n',
      },
      why: "THE NARROWING ROW for the string boundary: a quoted KEY is still a property assignment (and correctly not Principal-shaped here), while a whole Principal spelled inside a STRING is not an object literal at all",
    },
  ],
});
