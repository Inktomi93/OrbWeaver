// D34: a Drizzle column's `enum` config DERIVES from a named tuple (an imported @orb/contracts / @orb/kit
// tuple, or a local `as const satisfies` one) — never an inline array literal re-spelling the union. The
// shared Drizzle fact owns builder identity, so the config is read off the resolved builder call rather
// than off every `enum:` PropertyAssignment the file happens to contain. THREE ARMS, no silent skip: an
// authored array literal is the finding, a named reference passes, anything else is REPORTED unresolved.
// HARD: zero live `@orb-gate-ignore db-enum-from-tuple` markers exist on the tree (rg, 2026-09-05, with a
// positive control proving the search reached packages/db), so the row has no suppression door to preserve.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { SchemaColumn } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { resolveModuleMemberOrigin, resolveStableExpression } from "../lib/reference-fact.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";
import { effectiveObjectProperty, SchemaRefusal, unwrapSchemaExpression } from "../lib/schema-fact-value.ts";
import { readStaticAuthoredScalar } from "../lib/static-authored-value.ts";

const ENUM_KEY = "enum";
const MESSAGE =
  "a Drizzle column `enum` config is an INLINE ARRAY LITERAL — a db enum must derive from an imported contracts/kit tuple (or a local `as const satisfies readonly <ContractsType>[]` tuple), never a re-spelled array (D34: db never re-spells a union). See Core-Path-Registry.md D34.";
const FIX =
  'reference a named tuple (`text("kind", { enum: MESSAGE_KINDS })`) — an imported contracts/kit tuple, or a local `as const satisfies readonly <ContractsType>[]` where no contracts home exists.';
const UNREADABLE = (column: string): string =>
  `the \`enum\` config of ${column} is a NAME the shared readers cannot resolve to a canonical tuple — it is neither an @orb/contracts / @orb/kit import nor a local \`as const\` array literal, so it may be a call result, a mutable binding, or a value from any other module, and the D34 derive claim CANNOT be established. Reported rather than passed (GATE-AUTHORING §5, #944): the spelling alone is not the identity.`;

// The two packages whose tuples ARE the union's one home (D34). Subpaths included.
const CANONICAL_TUPLE_MODULES: readonly string[] = ["@orb/contracts", "@orb/kit"];

// Does this identifier resolve to a member of a canonical vocabulary package? Origin, not spelling: a
// same-named `KINDS` imported from `./local-vocab` is a DIFFERENT tuple and does not satisfy D34.
function fromCanonicalModule(node: MorphNode): boolean {
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind !== "resolved") {
    return false;
  }
  const canonical = origin.value.canonical;
  const moduleSpecifier = canonical.kind === "external-door" ? canonical.moduleSpecifier : origin.value.moduleSpecifier;
  return CANONICAL_TUPLE_MODULES.some((home) => moduleSpecifier === home || moduleSpecifier.startsWith(`${home}/`));
}

/** Did the author freeze this array literal with `as const`? Walking UP from the terminal is what
 *  distinguishes a real tuple from a widened `string[]`: `const K = ["a"];` resolves to the same
 *  ArrayLiteralExpression, and only the `as const` wrapper makes it a tuple at all.
 *
 *  THE PARAMETER TYPE IS LOAD-BEARING, do not widen it to `Node`. `ts.ArrayLiteralExpression` extends
 *  `PrimaryExpression`, whose `parent` is non-optional, so ts-morph types this `getParent()` as `Node` and
 *  the first hop needs no undefined check. Widened to `Node`, the parent becomes `Node | undefined` (TS7
 *  reds TS2322) — and adding the undefined check back under the narrowed type is `no-unnecessary-condition`
 *  under eslint, measured both ways in this lane. Narrowing once, at the parameter, is the shape that
 *  satisfies both floors. */
function isFrozen(terminal: import("ts-morph").ArrayLiteralExpression): boolean {
  let wrapper: MorphNode = terminal.getParent();
  while (Node.isParenthesizedExpression(wrapper) || Node.isAsExpression(wrapper) || Node.isSatisfiesExpression(wrapper)) {
    if (Node.isAsExpression(wrapper) && wrapper.getTypeNode()?.getText() === "const") {
      return true;
    }
    wrapper = wrapper.getParent();
  }
  return false;
}

/** Is every MEMBER of an admitted tuple accounted for?
 *
 *  `as const` freezes the ARRAY; it says nothing about where a SPREAD's members came from, so
 *  `[...getKinds(), "x"] as const` is a frozen array over an unknowable vocabulary. Each spread source must
 *  therefore satisfy the same proof recursively, and each ordinary element must be an authored literal. A
 *  composed tuple whose base is proven (the live `AUTOMATION_FIRE_STORAGE_OUTCOMES` shape) still passes;
 *  one whose base is a call result or a widened array does not. */
function elementsProven(array: import("ts-morph").ArrayLiteralExpression, home: SourceFile, active: Set<object>): boolean {
  for (const element of array.getElements()) {
    if (Node.isSpreadElement(element)) {
      if (!derivesFromTuple(element.getExpression(), home, active)) {
        return false;
      }
      continue;
    }
    if (readStaticAuthoredScalar(element).kind !== "resolved") {
      return false;
    }
  }
  return true;
}

/** A NAMED reference that genuinely derives from the union's one home. Anything else — a call result, a
 *  mutable binding, a plain (non-`as const`) array, ANOTHER module's tuple, or a frozen array composed over
 *  an unproven source — is UNKNOWN, not a pass.
 *
 *  The local arm is fenced to the COLUMN'S OWN FILE deliberately. `resolveStableExpression` follows an
 *  import to its declaration, so without the fence a real `as const` tuple imported from a db-local
 *  `./local-vocab` would pass — a tuple that is nobody's one home, spelled exactly like one that is. The
 *  sanctioned local form is the co-located `as const` the db authors when no contracts home exists. */
function derivesFromTuple(value: MorphNode, home: SourceFile, active: Set<object>): boolean {
  if (fromCanonicalModule(value)) {
    return true;
  }
  const stable = resolveStableExpression(value);
  if (stable.kind !== "resolved") {
    return false;
  }
  const terminal = unwrapSchemaExpression(stable.value);
  if (!(Node.isArrayLiteralExpression(terminal) && terminal.getSourceFile() === home && isFrozen(terminal))) {
    return false;
  }
  if (active.has(terminal.compilerNode)) {
    return false;
  }
  active.add(terminal.compilerNode);
  const proven = elementsProven(terminal, home, active);
  active.delete(terminal.compilerNode);
  return proven;
}

function derivesFromCanonicalTuple(value: MorphNode, home: SourceFile): boolean {
  return derivesFromTuple(value, home, new Set<object>());
}

type EnumVerdict =
  | { readonly kind: "inline"; readonly node: MorphNode }
  | { readonly kind: "derived" }
  | { readonly kind: "unreadable"; readonly node: MorphNode };

/** Classify one column's `enum` config. The AUTHORED node is judged syntactically on purpose: the ban is on
 *  re-spelling the tuple AT THE COLUMN. A NAME then has to earn its pass through the shared readers —
 *  canonical `@orb/contracts` / `@orb/kit` origin, or a local `as const` array literal — because the SPELLING
 *  of an identifier says nothing about its identity (#1584 review, 2026-09-06). */
function enumVerdict(column: SchemaColumn): EnumVerdict | null {
  const config = column.builder.call.getArguments()[1];
  if (config === undefined) {
    return null;
  }
  let value: MorphNode | null;
  try {
    value = effectiveObjectProperty(config, ENUM_KEY, `Drizzle column ${column.identity.key} config`);
  } catch (error) {
    if (error instanceof SchemaRefusal) {
      return { kind: "unreadable", node: error.fact.node };
    }
    throw error;
  }
  if (value === null) {
    return null;
  }
  const authored = unwrapSchemaExpression(value);
  if (Node.isArrayLiteralExpression(authored)) {
    return { kind: "inline", node: authored };
  }
  const named = Node.isIdentifier(authored) || Node.isPropertyAccessExpression(authored) || Node.isElementAccessExpression(authored);
  return named && derivesFromCanonicalTuple(authored, column.builder.call.getSourceFile()) ? { kind: "derived" } : { kind: "unreadable", node: authored };
}

export const gate = defineGate({
  id: "db-enum-from-tuple",
  family: "drizzle-schema",
  authority: "hard",
  severity: "error",
  population: DRIZZLE_SCHEMA_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(drizzleSchemaFact).schema();
      recordReadySchemaFact(ctx, fact);
      for (const table of fact.value.tables) {
        for (const column of table.columns) {
          const verdict = enumVerdict(column);
          if (verdict?.kind === "inline") {
            ctx.report.node(verdict.node, { message: MESSAGE });
          } else if (verdict?.kind === "unreadable") {
            ctx.report.node(verdict.node, { message: UNREADABLE(column.identity.key) });
          }
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { k: text("k", { enum: ["a", "b"] }) });\n',
      },
      expect: { count: 1 },
      why: "the founding shape — an inline-array enum config re-spells a union that has one home (D34)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const CONFIG = { enum: ["a", "b"] };\n' +
          'export const t = sqliteTable("t", { k: text("k", { ...CONFIG }) });\n',
      },
      expect: { count: 1 },
      why: "a SPREAD-reached inline array is the same re-spelling — the shared reader resolves the effective config, so the escape a one-hop object bought is gone",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\ndeclare function build(): readonly string[];\nexport const t = sqliteTable("t", { k: text("k", { enum: build() }) });\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "FAIL-CLOSED (#944): a computed enum config is neither an inline literal nor a named tuple, so the derive claim is UNKNOWN — reported, never silently passed as the legacy syntactic check did",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const t = sqliteTable("t", { k: text("k", { enum: ["a"] }), j: text("j", { enum: ["b"] }) });\n',
      },
      expect: { count: 2 },
      why: "two inline configs on one table are TWO findings — the verdict is per COLUMN, not per table",
    },
    // ── the IDENTITY counterfactuals: same SPELLING, different identity. Each was a silent PASS while the
    // reader accepted any identifier, because `KINDS` LOOKS like a canonical tuple in all four.
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          "declare function build(): readonly string[];\n" +
          "const KINDS = build();\n" +
          'export const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "A COMPUTED local: `const KINDS = build()` is an identifier spelled exactly like a canonical tuple, and its VALUE is whatever the call returns — the derive claim is unknowable, so it fails closed",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'let KINDS = ["a", "b"] as const;\n' +
          'KINDS = ["c", "d"] as const;\n' +
          'export const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "A MUTABLE binding: a `let` that is reassigned has no one authored value, so the shared reader refuses it — a tuple that can change is not a union's one home",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/local-vocab.ts": 'export const KINDS = ["a", "b"] as const;\n',
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'import { KINDS } from "./local-vocab";\n' +
          'export const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "SAME NAME, WRONG ORIGIN: a real `as const` tuple imported from a db-LOCAL module is not the union's one home — D34 is about deriving from @orb/contracts / @orb/kit, and only the ORIGIN can tell the two apart",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const KINDS = ["a", "b"];\n' +
          'export const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "A LOCAL ARRAY WITHOUT `as const` widens to `string[]` — it is a mutable list of strings, not a tuple, and the `as const` wrapper is the only thing that distinguishes it from the frozen form the law names",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          "declare function getKinds(): readonly string[];\n" +
          'const KINDS = [...getKinds(), "x"] as const;\n' +
          'export const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE COMPOSED TUPLE'S SOURCE MUST ITSELF BE PROVEN: `as const` freezes the ARRAY, it says nothing about where the spread's members came from. Trusting the outer wrapper would admit an unknowable vocabulary through the one shape D34 sanctions — the composition arm's own counterfactual",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const BASE = ["a", "b"];\n' +
          'const KINDS = [...BASE, "x"] as const;\n' +
          'export const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "the same hole one hop quieter: the spread source is a real local array, but a WIDENED one — an `as const` wrapper around it cannot retroactively make `string[]` a tuple with one home",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/y.ts":
          'import { KINDS } from "@orb/contracts";\nimport { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      },
      why: "an imported contracts tuple identifier — the sanctioned derive-from-one-home idiom, and it must pass WITHOUT the external module being loadable",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/alias.ts":
          'import { KINDS as K } from "@orb/contracts/x";\nimport { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { k: text("k", { enum: K }) });\n',
      },
      why: "an IMPORT ALIAS of a canonical tuple: the local spelling `K` carries none of the identity, so only the resolved ORIGIN can admit it — a name-keyed reader would call it unreadable",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/ns.ts":
          'import * as c from "@orb/contracts/x";\nimport { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { k: text("k", { enum: c.KINDS }) });\n',
      },
      why: "a NAMESPACE member of a canonical module resolves to the same origin as the named import — the #1506 respelling class, on the admitting side",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/z.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const KINDS = ["text", "reasoning"] as const satisfies readonly string[];\n' +
          'export const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      },
      why: "a local `as const satisfies` tuple identifier — the sanctioned db idiom where no contracts home exists; the `as const` must be seen THROUGH the `satisfies` wrapper, and it is the only thing separating this from the widened `string[]` mustFlag row above",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/compose.ts":
          'import { OUTCOMES } from "@orb/contracts/automation";\n' +
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const STORAGE_OUTCOMES = [...OUTCOMES, "reserved"] as const;\n' +
          'export const t = sqliteTable("t", { k: text("k", { enum: STORAGE_OUTCOMES }) });\n',
      },
      why: "THE LIVE COMPOSED SHAPE (`AUTOMATION_FIRE_STORAGE_OUTCOMES` in packages/db/src/schema/automation.ts): a frozen local tuple that SPREADS the contracts tuple and adds one storage-only member. It derives from the one home and adds to it, which is what D34 sanctions — this row is the written baseline that composition is not a re-spelling",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/local.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const BASE = ["a", "b"] as const;\n' +
          'const KINDS = [...BASE, "x"] as const;\n' +
          'export const t = sqliteTable("t", { k: text("k", { enum: KINDS }) });\n',
      },
      why: "composition over a PROVEN local source: the spread reaches another co-located `as const` tuple, so the proof recurses and holds. This is the green twin of the two composition counterfactuals above",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/n.ts":
          'import * as vocab from "@orb/contracts";\nimport { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { k: text("k", { enum: vocab.KINDS }) });\n',
      },
      why: "a NAMESPACE-member tuple reference is the same derive — a dot-only-blind reader would have called it unreadable (#1506)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plain.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { k: text("k") });\n',
      },
      why: "a column with no config object at all has no enum obligation — the overwhelming majority of the corpus",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/json.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { k: text("k", { mode: "json" }).$type<{ a: string }>() });\n',
      },
      why: "a config carrying other keys but no `enum` is untouched — the ban is the enum arm, not the config object",
    },
  ],
});
