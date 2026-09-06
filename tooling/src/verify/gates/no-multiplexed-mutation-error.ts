// Two mutations' error slots multiplexed through one `??`/`||` — v5 errors are sticky until the next
// mutate, so this leaks one action's stale failure into another's surface. One error slot per mutation.
//
// THE SUBJECT IS A MUTATION-RESULT `error`, resolved through the property symbol's declaration home. The
// legacy gate compared `left.getName() === "error" && right.getName() === "error"`, so `a.error ?? b.error`
// on any two objects at all was the offense — the manifest's own row: "property-name equality is shadowable
// and cannot prove receiver identity". The two homes that DO carry the sticky semantics are the app's own
// `EntityMutationResult` and TanStack Query's result types.
//
// EXECUTION IS entire-population BECAUSE THE ANCHOR IS A PROJECT FILE. The `EntityMutationResult` home is
// read through `ctx.sourceFile`, so a narrowed selection that does not carry it DEFERS the policy loudly
// instead of silently passing every surface in the selection. If the home is renamed away, the population
// receipt resolves zero members and the run REFUSES — the §4.6 blindness tripwire as a receipt.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
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

const MULTIPLEXING_OPERATORS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken]);

/** Is this operand a mutation-result `error` read? */
function isMutationError(operand: MorphNode, home: SourceFile): boolean {
  const read = readMemberReference(operand);
  if (read.kind === "unresolved" || read.value.name !== ERROR_MEMBER) {
    return false;
  }
  const origin = resolveTypeMemberOrigin(operand);
  if (origin.kind === "unresolved") {
    return false;
  }
  return declaredByFile(origin.value.declarations, home) || declaredByPackage(origin.value.declarations, QUERY_CORE);
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
  fix: "render each mutation's own .error, or use createEntityMutation's per-mutation { error, clearError } channel",
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
          if (!Node.isBinaryExpression(node)) {
            continue;
          }
          if (isMutationError(node.getLeft(), home) && isMutationError(node.getRight(), home)) {
            // Anchored on the multiplexed member, not on the left receiver's name: `ctx.report.node` would
            // otherwise take the token from the first identifier (`a`), which names no position at all.
            ctx.report.node(node, { token: ERROR_MEMBER, offset: Math.max(node.getText().indexOf(ERROR_MEMBER), 0) });
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
  ],
});
