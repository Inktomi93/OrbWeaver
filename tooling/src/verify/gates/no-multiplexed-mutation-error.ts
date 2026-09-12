// Two mutations' error slots multiplexed through one `??`/`||` — v5 errors are sticky until the next
// mutate, so this leaks one action's stale failure into another's surface. One error slot per mutation.
//
// THE SUBJECT IS A MUTATION-RESULT `error`, resolved through the property symbol's declaration home. The
// legacy gate compared `left.getName() === "error" && right.getName() === "error"`, so `a.error ?? b.error`
// on any two objects at all was the offense — the manifest's own row: "property-name equality is shadowable
// and cannot prove receiver identity". The two homes that DO carry the sticky semantics are the app's own
// `EntityMutationResult` and TanStack Query's result types.
//
// THREE ANSWERS, and BOTH operands must be one of the two reportable ones: a proven mutation-result `error`,
// a proven something-else (pass), or an `error` read whose receiver the checker cannot place — which is
// REPORTED (GATE-AUTHORING §5, #944). An `any`-typed receiver is unreadable, not innocent; passing it would
// make an untyped seam the one supported way past this law.
//
// EXECUTION IS entire-population BECAUSE THE ANCHOR IS A PROJECT FILE. The `EntityMutationResult` home is
// located in the effective population, so a narrowed selection that does not carry it DEFERS the policy
// loudly instead of silently passing every surface in the selection. If the home is renamed away, the
// population receipt resolves zero members and the run REFUSES — the §4.6 blindness tripwire as a receipt.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import { declaredByFile, declaredByPackage, resolveTypeMemberOrigin } from "../lib/type-member-origin.ts";
import { LOOKALIKE_HOME, tanstackQueryProof, vendorLookalikeProof } from "./_proof/client-vendors.ts";

const ERROR_MEMBER = "error";
const QUERY_CORE = "@tanstack/query-core";
/** The app's ONE mutation-result shape (`createEntityMutation`'s `{ error, clearError }` channel). */
const ENTITY_MUTATION_HOME = "packages/client/src/data/create-entity-mutation.ts";
const ENTITY_MUTATION_TYPE = "EntityMutationResult";

const MESSAGE =
  "multiplexed mutation errors — v5 errors are sticky until the next mutate, so this leaks one action's stale failure into another's surface. One error slot per mutation (createEntityMutation's { error, clearError }). See UI-Gates-and-Lessons.md §11.1.";
const UNREADABLE = `${MESSAGE} One of the two error reads has a receiver the checker cannot place, so whether both are sticky mutation slots CANNOT be established — reported rather than passed.`;

const MULTIPLEXING_OPERATORS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken]);

type OperandVerdict = "mutation" | "other" | "unreadable";

/** Classify one operand. THREE answers, like every sibling in this family: a proven mutation-result `error`,
 *  a proven something-else, or an `error` read whose receiver the checker cannot place — which is the fail-
 *  closed arm, not an innocent one. `declare const a: any; a.error ?? b.error` lives exactly there, and
 *  returning false for it would make an untyped seam the one way past this law. */
function operandVerdict(operand: MorphNode, home: SourceFile): OperandVerdict {
  const read = readMemberReference(operand);
  if (read.kind === "unresolved" || read.value.name !== ERROR_MEMBER) {
    // Not an `error` member read at all (a literal, a bare identifier, a different member) — never a candidate.
    return "other";
  }
  const origin = resolveTypeMemberOrigin(operand);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, operand);
  }
  return declaredByFile(origin.value.declarations, home) || declaredByPackage(origin.value.declarations, QUERY_CORE) ? "mutation" : "other";
}

/** The whole-expression verdict: `null` when this is not two error slots at all, otherwise which message the
 *  finding carries. BOTH sides must be candidates — one real mutation error beside a plain row is not
 *  multiplexing, and one beside an unreadable receiver still might be. */
function multiplexVerdict(node: MorphNode, home: SourceFile): "mutation" | "unreadable" | null {
  if (!Node.isBinaryExpression(node)) {
    return null;
  }
  const left = operandVerdict(node.getLeft(), home);
  const right = operandVerdict(node.getRight(), home);
  if (left === "other" || right === "other") {
    return null;
  }
  return left === "unreadable" || right === "unreadable" ? "unreadable" : "mutation";
}

export const gate = defineGate({
  id: "no-multiplexed-mutation-error",
  family: "tanstack-query-origin",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], notNamed: ["*.test.ts", "*.test.tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "render each mutation's own .error, or use createEntityMutation's per-mutation { error, clearError } " +
    "channel. A deliberate site is waived with `@orb-waive no-multiplexed-mutation-error(<position>): " +
    "<reason>` on the line above, where <position> is the literal `error` — the multiplexed `.error` member.",
  create: (ctx) => {
    const candidates: MorphNode[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.BinaryExpression],
          visit: (node): void => {
            if (Node.isBinaryExpression(node) && MULTIPLEXING_OPERATORS.has(node.getOperatorToken().getKind())) {
              candidates.push(node);
            }
          },
        },
      ],
      evaluate: (): void => {
        // Located by scanning the effective population rather than through `ctx.sourceFile`, which THROWS on
        // an absent path: a missing home is a receipt refusal this policy authors, not an exception it
        // swallows, and a swallowed one would be an unproven caught-failure site besides.
        const home = ctx.files.find((file) => ctx.relativePath(file) === ENTITY_MUTATION_HOME);
        const declared = home?.getExportSymbols().filter((symbol) => symbol.getName() === ENTITY_MUTATION_TYPE) ?? [];
        // ZERO members is a REFUSAL, not a clean pass: the app's mutation-result shape moved or was renamed,
        // and half this policy's identity claim silently retired with it.
        ctx.receipt({ kind: "population", source: ENTITY_MUTATION_TYPE, members: declared.length, unresolved: 0 });
        if (home === undefined || declared.length === 0) {
          return;
        }
        for (const node of candidates) {
          const verdict = multiplexVerdict(node, home);
          if (verdict !== null) {
            // Anchored on the multiplexed member, not on the left receiver's name: `ctx.report.node` would
            // otherwise take the token from the first identifier (`a`), which names no position at all.
            ctx.report.node(node, {
              ...(verdict === "unreadable" ? { message: UNREADABLE } : {}),
              token: ERROR_MEMBER,
              offset: Math.max(node.getText().indexOf(ERROR_MEMBER), 0),
            });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n  readonly clearError: () => void;\n}\n",
        "packages/client/src/features/x/x.tsx":
          'import type { EntityMutationResult } from "../../data/create-entity-mutation.ts";\nexport const g = (a: EntityMutationResult, b: EntityMutationResult): unknown => a.error ?? b.error;\n',
      },
      expect: { count: 1 },
      why: "the founding shape — two entity mutations' sticky error slots collapsed into one surface channel through `??`",
    },
    {
      mode: "types",
      files: {
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n  readonly clearError: () => void;\n}\n",
        "packages/client/src/features/x/x.tsx":
          'import type { EntityMutationResult } from "../../data/create-entity-mutation.ts";\nexport const g = (a: EntityMutationResult, b: EntityMutationResult): unknown => a.error || b.error;\n',
      },
      expect: { count: 1 },
      why: "the `||` spelling of the same multiplexing — both operators, kept from the legacy proof",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n}\n",
        "packages/client/src/features/x/x.tsx":
          'import type { MutationObserverResult } from "@tanstack/react-query";\nexport const g = (a: MutationObserverResult, b: MutationObserverResult): unknown => a.error ?? b.error;\n',
      },
      expect: { count: 1 },
      why: "the RAW TanStack result carries the same sticky semantics, so the second home is part of the identity and not an afterthought",
    },
    {
      mode: "types",
      files: {
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n}\n",
        "packages/client/src/features/x/x.tsx":
          'import type { EntityMutationResult } from "../../data/create-entity-mutation.ts";\nexport const g = (a: EntityMutationResult, b: EntityMutationResult): unknown => a["error"] ?? b["error"];\n',
      },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL spelling of both operands — the shared member reader normalizes it, where the legacy `getName()` pair was offered nothing (#1506)",
    },
    {
      mode: "types",
      files: {
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n}\n",
        "packages/client/src/features/x/x.tsx": "declare const a: any;\ndeclare const b: any;\nexport const g: unknown = a.error ?? b.error;\n",
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "FAIL-CLOSED (#944): an `any`-typed receiver has no readable identity, so whether these are two sticky mutation slots is UNKNOWN. Returning false here would make an untyped seam the one supported way past this law — the review's own reproduction",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n}\n",
        "packages/client/src/features/x/x.tsx":
          'import type { EntityMutationResult } from "../../data/create-entity-mutation.ts";\nexport const g = (a: EntityMutationResult): unknown => a.error;\n',
      },
      why: "one mutation's own error slot rendered on its own — the shape this policy exists to preserve",
    },
    {
      mode: "types",
      files: {
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n}\n",
        "packages/client/src/features/x/x.tsx":
          "interface Row {\n  readonly error: string | null;\n}\nexport const g = (a: Row, b: Row): unknown => a.error ?? b.error;\n",
      },
      why: "SAME PROPERTY NAME, NO MUTATION: two plain rows with an `error` field carry no sticky semantics at all. The legacy name-equality check RED this — the manifest's recorded shadow",
    },
    {
      mode: "types",
      files: {
        ...vendorLookalikeProof(),
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n}\n",
        "packages/client/src/features/x/x.tsx":
          'import type { MutationObserverResult } from "vendor-lookalike";\nexport const g = (a: { error: unknown }, b: { error: unknown }): unknown => a.error ?? b.error;\nexport type Unused = MutationObserverResult;\n',
      },
      why: `an unrelated package's result type (${LOOKALIKE_HOME}) does not lend its identity to inline object operands — only the declaring home admits`,
    },
    {
      mode: "types",
      files: {
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n}\n",
        "packages/client/src/features/x/x.tsx":
          'import type { EntityMutationResult } from "../../data/create-entity-mutation.ts";\ninterface Row {\n  readonly error: string | null;\n}\nexport const g = (a: EntityMutationResult, b: Row): unknown => a.error ?? b.error;\n',
      },
      why: "MIXED OPERANDS: one real mutation error beside a plain row is not two sticky slots multiplexed. BOTH sides must be proven, which is what the per-operand identity buys",
    },
    {
      mode: "types",
      files: {
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n  readonly clearError: () => void;\n}\n",
        "packages/client/src/features/x/x.tsx":
          'import type { EntityMutationResult } from "../../data/create-entity-mutation.ts";\n// @orb-waive no-multiplexed-mutation-error(error): the proof\'s stand-in reason; ends when this fixture stops flagging.\nexport const g = (a: EntityMutationResult, b: EntityMutationResult): unknown => a.error ?? b.error;\n',
      },
      why: 'POSITIONAL IDENTITY: the report anchors the whole BinaryExpression but overrides the token to `error` at `indexOf("error")`, i.e. the LEFT operand\'s member — deliberately, because a derived token would have taken the receiver name (`a`), which names no position. So an author waives `error`, never `a` and never the `??`. The fixture is mustFlag[0] (:126, count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes',
    },
    {
      mode: "types",
      files: {
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n  readonly clearError: () => void;\n}\n",
        "packages/client/src/features/x/x.tsx":
          'import type { EntityMutationResult } from "../../data/create-entity-mutation.ts";\nexport const g = (a: EntityMutationResult, b: EntityMutationResult): unknown => a.error && b.error;\n',
      },
      why: "#1999 — THE OPERATOR-SET FENCE, PINNED: `MULTIPLEXING_OPERATORS` (:37) admits only `??`/`||`; a plain `&&` is not the sticky-multiplex shape and must pass untouched. Cutting the `MULTIPLEXING_OPERATORS.has(...)` check at :92 turns this red",
    },
    {
      mode: "types",
      files: {
        [ENTITY_MUTATION_HOME]: "export interface EntityMutationResult {\n  readonly error: unknown;\n  readonly clearError: () => void;\n}\n",
        "packages/client/src/features/x/x.tsx":
          'import type { EntityMutationResult } from "../../data/create-entity-mutation.ts";\nexport const g = (a: EntityMutationResult, b: EntityMutationResult): unknown => a.clearError ?? b.clearError;\n',
      },
      why: "#1999 — THE MEMBER-NAME FENCE, PINNED: `operandVerdict` (:46-56) only judges an `error` member read; `clearError` is a real member of the SAME mutation-result home and must pass. Cutting `read.value.name !== ERROR_MEMBER` at :47 turns this red",
    },
  ],
});
