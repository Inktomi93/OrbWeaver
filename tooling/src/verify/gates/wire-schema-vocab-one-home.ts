// Policy: wire-schema-vocab-one-home (D93) — a JSON-Schema keyword table
// belongs only in the wire-subset engine and its inverse lift reader. The vocabulary is read from the
// engine's authored const arrays; string occurrences are collected by the dispatcher, so this policy owns
// no project walk. The two permanent homes are exact reviewed grants. Central reconciliation therefore
// owns both stale shapes: a moved home and a home that stops spelling the vocabulary consume no row.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { WIRE_SCHEMA_ENGINE, WIRE_SCHEMA_VOCABULARY_NAMES, wireSchemaVocabularyFact } from "../lib/wire-schema-vocabulary-fact.ts";

const ENGINE_REL = WIRE_SCHEMA_ENGINE;
const LIFT_REL = "packages/kit/src/json-schema/lift.ts";
const VOCAB_CONSTS = WIRE_SCHEMA_VOCABULARY_NAMES;
const TABLE_FENCE = 2;
const OPERATION = "wire-schema-vocabulary-home";
const MESSAGE =
  "a JSON-Schema wire keyword vocabulary is spelled outside the one scrub engine and its inverse lift reader (D93, a reserved main-era ruling; the engine is packages/contracts/src/inference/wire-subset.ts).";
const FIX = "call scrubWireSchema with the WireSchemaMode this wire speaks; a new subset belongs as a mode in wire-subset.ts, never as a local keyword walk.";

function vocabularyAnchor(nodes: readonly MorphNode[], vocabulary: ReadonlySet<string>): MorphNode | undefined {
  const matched = new Map<string, MorphNode>();
  for (const node of nodes) {
    if (!(Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))) {
      continue;
    }
    const value = node.getLiteralText();
    if (vocabulary.has(value) && !matched.has(value)) {
      matched.set(value, node);
    }
  }
  return matched.size < TABLE_FENCE ? undefined : [...matched.values()].toSorted((left, right) => left.getStart() - right.getStart())[0];
}

export const gate = defineGate({
  id: "wire-schema-vocab-one-home",
  family: "wire-schema-vocab-one-home",
  authority: "reviewed-grant",
  severity: "error",
  // `@inference` ADDED 2026-09-20 (lane cb-gate-reach, the §12 EXTRACTION AUDIT of
  // `docs/design/orbweaver-inference-package.md`). ~104 source files left `packages/server/src/infra/providers/`
  // for the new `@orb/inference` workspace package, and every `@server`-scoped policy stopped judging them the
  // day they moved, silently. D93 keeps the JSON-Schema keyword table in the wire-subset engine and its inverse lift reader. The
  // backends that CONSUME the projected schema moved into this package, which is where a second copy of the
  // keyword table would be written if anyone wrote one. Measured at the widening: ZERO findings.
  population: { in: ["@server", "@kit", "@inference"], notUnder: ["**/*.test.ts", "**/*.test.tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [wireSchemaVocabularyFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const strings = new Map<string, MorphNode[]>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
          visit: (node, sourceFile) => {
            const path = ctx.relativePath(sourceFile);
            const values = strings.get(path) ?? [];
            values.push(node);
            strings.set(path, values);
          },
        },
      ],
      evaluate: () => {
        const vocabulary = ctx.fact(wireSchemaVocabularyFact).values;
        ctx.receipt({ kind: "population", source: "wire-schema-keywords", members: vocabulary.size });
        for (const [path, nodes] of [...strings].toSorted(([left], [right]) => left.localeCompare(right))) {
          const anchor = path === ENGINE_REL ? undefined : vocabularyAnchor(nodes, vocabulary);
          if (anchor !== undefined) {
            reportReviewedGrantCandidates(ctx.report, [{ node: anchor, subject: path, operation: OPERATION }], {
              message: MESSAGE,
              fix: FIX,
              unreadableMessage: MESSAGE,
            });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "packages/server/src/infra/providers/backends/newvendor/schema.ts", operation: OPERATION },
      files: {
        [ENGINE_REL]:
          'const BOUND_KEYWORDS = ["minLength", "maxLength"] as const;\nconst META_KEYWORDS = ["$schema"] as const;\nconst ANNOTATION_KEYWORDS = ["title", "default"] as const;\n',
        [LIFT_REL]: 'export const bounds = ["minLength"];\n',
        "packages/server/src/infra/providers/backends/newvendor/schema.ts": 'export const DROP = ["minLength", "maxLength", "$schema"];\n',
      },
      expect: { count: 1 },
      why: "a backend re-spells the engine vocabulary instead of calling the scrub engine",
    },
    {
      mode: "types",
      grant: { subject: "packages/kit/src/wire/subset2.ts", operation: OPERATION },
      files: {
        [ENGINE_REL]:
          'const BOUND_KEYWORDS = ["minLength", "maxLength"] as const;\nconst META_KEYWORDS = ["$schema"] as const;\nconst ANNOTATION_KEYWORDS = ["title", "default"] as const;\n',
        [LIFT_REL]: 'export const bounds = ["minLength"];\n',
        "packages/kit/src/wire/subset2.ts": 'export const TABLE = ["minLength", "title"];\n',
      },
      expect: { count: 1 },
      why: "a second kit engine is the same drift shape as a backend-local table",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ENGINE_REL]:
          'const BOUND_KEYWORDS = ["minLength", "maxLength"] as const;\nconst META_KEYWORDS = ["$schema"] as const;\nconst ANNOTATION_KEYWORDS = ["title", "default"] as const;\n',
        [LIFT_REL]: 'export const bounds = ["minLength"];\n',
        "packages/server/src/domain/credentials/verbs/add.ts": 'const DEFAULT_LABEL = "default";\n',
      },
      why: "the two reviewed homes and a file containing only one ordinary-English keyword are clean",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/other.ts": "export const unrelated = 1;\n",
        "packages/server/src/infra/providers/backends/newvendor/schema.ts": 'export const DROP = ["title", "default"];\n',
      },
      expect: { messageIncludes: `wire-schema-vocabulary: ${ENGINE_REL} has no ${VOCAB_CONSTS[0]} initializer` },
      why: "without the engine the policy cannot derive the vocabulary and refuses",
    },
    {
      mode: "types",
      files: { [ENGINE_REL]: "export const nothing = 1;\n", [LIFT_REL]: 'export const bounds = ["minLength", "maxLength"];\n' },
      expect: { messageIncludes: `has no ${VOCAB_CONSTS[0]} initializer` },
      why: "an engine whose vocabulary declarations disappeared is blindness, not clean",
    },
  ],
});
