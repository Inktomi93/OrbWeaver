// D124: `ne(T.col, …)` / `notInArray(T.col, …)` on a column the Drizzle schema declares NULLABLE, with
// nothing deciding the NULLs. SQL is three-valued — `NULL <> 'x'` is NULL, not TRUE — so every unset row
// silently VANISHES, and widening a NOT NULL column to nullable converts every such predicate into a silent
// row-dropper with no typecheck and no test failure. Nullability comes from the shared Drizzle fact, and the
// drizzle callee identity from the shared module-origin reader, so a local same-named `ne` is not SQL and an
// aliased/namespaced import still is. DECLARED LIMITS live in the mustPass rows.
//
// FAMILY `drizzle-schema` — the shared reader is `lib/schema-fact.ts` (`drizzleSchemaFact`), which owns
// the column model this policy's nullability verdict rests on; the drizzle callee identity comes from the
// other shared reader, `lib/reference-fact.ts` (`resolveModuleMemberOrigin`). The POPULATION is this
// policy's own rather than the provider's, because the SUBJECT is a query anywhere in the cake while the
// FACT is the schema directory — the derivation and its measured delta are at
// `NULLABLE_INEQUALITY_POPULATION` below.
// The legacy `nullable-column-inequality` descriptor is 521780ac67160db90e8ff0a0bab4fad850443c6c, the
// PARENT of this module's own conversion commit `66d28b127` (verified 2026-09-12 to hold a
// `GateDescriptor` carrying the `scanRoot` quoted at that population constant).
import type { CallExpression, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { SchemaColumn, SchemaModel } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { resolveModuleMemberOrigin } from "../lib/reference-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

const DRIZZLE_MODULE = "drizzle-orm";
/** The two predicates whose SQL form is an INEQUALITY over a column — the shapes NULL silently defeats.
 *  `not(eq(...))` is the same defect one wrapper out; it appears nowhere on the tree and is a DECLARED
 *  LIMIT with its own mustPass row. */
const COLUMN_ARG_COUNT: Readonly<Record<string, number>> = { ne: 2, notInArray: 1 };
/** The explicit null-guards that make the predicate total: `or(isNull(c), ne(c, x))` keeps the NULLs,
 *  `and(isNotNull(c), ne(c, x))` drops them ON PURPOSE. */
const NULL_GUARD_FNS = new Set(["isNull", "isNotNull"]);
/** The drizzle boolean COMBINATORS. A guard only guards through one of these: it has to participate in the
 *  same controlling boolean expression as the inequality, not merely sit near it. */
const COMBINATOR_FNS = new Set(["and", "or"]);

const MESSAGE =
  "an inequality predicate (`ne` / `notInArray`) is applied to a column that is NULLABLE in " +
  "packages/db/src/schema/** and nothing guards the NULLs. SQL is three-valued: `NULL <> 'x'` evaluates to " +
  "NULL, not TRUE, so every row whose column is NULL is silently DROPPED from the result — the predicate " +
  "reads as 'everything except x' and behaves as 'everything except x, and also nothing that is unset'. " +
  "Widening a NOT NULL column to nullable converts every such predicate into a silent row-dropper with no " +
  "typecheck and no test failure (Tier-1-DB.md, D124).";

const FIX =
  "decide what the NULL rows mean and SAY it in the predicate: `or(isNull(T.col), ne(T.col, x))` keeps them " +
  "(the usual intent — 'not x' includes 'unset'), `and(isNotNull(T.col), ne(T.col, x))` drops them " +
  "deliberately. If a fact outside this statement already excludes them (an inner join on that same column, " +
  "a post-commit non-null invariant), attach `@orb-waive nullable-column-inequality(<the reported token>): " +
  "<why the NULLs cannot reach here, and what would end it>` to that exact occurrence.";

/** The legacy `scanRoot` was `p.startsWith("packages/") || p.startsWith("tests/")`, and its separate marker
 *  sweep fenced `tooling/src/` out as the vocabulary home. Both become POPULATION: the central waiver engine
 *  derives its marker universe from the effective population, so a tool file MENTIONING the grammar is
 *  outside the policy entirely and needs no gate-owned fence.
 *
 *  RECORDED DELTA, measured on the frozen 7,138-path candidate set: legacy admitted 6,113 paths, this
 *  expression admits 6,112. The single dropped path is `packages/showcase-plugins/src/index.ts` — the
 *  `@packages` set names the six cake packages and showcase-plugins is not one of them. It admits nothing:
 *  that package is ONE file with ZERO `drizzle-orm` references (rg, with a packages/server positive
 *  control), and guest showcase code has no db reach through the plugin membrane to acquire one. */
const NULLABLE_INEQUALITY_POPULATION = { in: ["@packages", "@tests"] } as const;

interface Operand {
  /** The `T.col` argument node — the report anchor and the waiver position token. */
  readonly node: MorphNode;
  /** Every drizzle `and`/`or` call between this predicate and its enclosing statement, innermost first.
   *  A guard counts only when it hangs off ONE OF THESE — see {@link combinatorChain}. */
  readonly combinators: readonly object[];
}

interface Guard {
  /** The guarded column argument. */
  readonly node: MorphNode;
  readonly combinators: readonly object[];
}

/** The four drizzle exports this policy reads, by their CANONICAL names. */
const RECOGNIZED = new Set([...Object.keys(COLUMN_ARG_COUNT), ...NULL_GUARD_FNS]);

/** The local callee SPELLINGS in one file that could be one of {@link RECOGNIZED} — the canonical names,
 *  every local alias a direct `drizzle-orm*` import binds to them, and the `<ns>.<name>` form of every
 *  namespace import of that module.
 *
 *  WHY A PREFILTER AT ALL (the id-brand lane's measured lesson, id-brand-family-1584.md): resolving a
 *  canonical module origin on EVERY CallExpression in a 6,112-file population does not finish in ten
 *  minutes. The index is built once per source, from that source's OWN import declarations, and only a
 *  spelling it contains pays for the full origin resolution — which still runs, so a SHADOWED local of a
 *  candidate name is refused exactly as before.
 *
 *  DECLARED LIMIT: a local barrel that RE-EXPORTS `ne` under a DIFFERENT name is not in the index. The
 *  legacy reader (`importedFromDrizzle`, direct drizzle imports only) missed that case too, so this is not
 *  a regression; the canonical names cover a name-preserving re-export. */
function calleeSpellings(sourceFile: SourceFile): ReadonlySet<string> {
  const spellings = new Set(RECOGNIZED);
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (!declaration.getModuleSpecifierValue().startsWith(DRIZZLE_MODULE)) {
      continue;
    }
    for (const named of declaration.getNamedImports()) {
      if (RECOGNIZED.has(named.getName())) {
        spellings.add((named.getAliasNode() ?? named.getNameNode()).getText());
      }
    }
    const namespace = declaration.getNamespaceImport();
    if (namespace !== undefined) {
      for (const name of RECOGNIZED) {
        spellings.add(`${namespace.getText()}.${name}`);
      }
    }
  }
  return spellings;
}

/** The exported drizzle name this call resolves to, or null. Spelling-independent: a named import, an
 *  alias, a namespace member and a re-export all resolve to the same origin, and a same-named LOCAL
 *  helper resolves to none of them. */
function drizzleCallee(call: CallExpression): string | null {
  const origin = resolveModuleMemberOrigin(call.getExpression());
  if (origin.kind !== "resolved") {
    return null;
  }
  const canonical = origin.value.canonical;
  const moduleSpecifier = canonical.kind === "external-door" ? canonical.moduleSpecifier : origin.value.moduleSpecifier;
  return moduleSpecifier.startsWith(DRIZZLE_MODULE) ? canonical.exportedName : null;
}

/** The enclosing STATEMENT — the upper BOUND of the ancestor walk below. Walked upward through parents,
 *  never a descendant sweep. */
function enclosingStatement(node: MorphNode): object {
  let current = node;
  let parent = current.getParent();
  while (parent !== undefined && !(Node.isBlock(parent) || Node.isSourceFile(parent) || Node.isModuleBlock(parent))) {
    current = parent;
    parent = current.getParent();
  }
  return current.compilerNode;
}

/** The drizzle `and`/`or` calls this node hangs off, innermost first, bounded by its enclosing statement.
 *
 *  CO-LOCATION IS NOT GUARDING (superseding the legacy "anywhere in the same statement" rule, #1584 review
 *  2026-09-06). `choose(isNull(c), ne(c, "x"))` puts a guard and a predicate in one statement and in one
 *  argument list, and the NULL rows still vanish — `choose` is not a boolean combinator, so the guard never
 *  reaches the predicate's truth value. Sharing a drizzle `and`/`or` ANCESTOR is the exact relation that
 *  makes `or(isNull(c), ne(c, x))` total, and it composes: nesting inside further and/or still shares one.
 *  The callee is resolved through the shared origin reader (memoized per call), never matched by name. */
function combinatorChain(call: CallExpression, statement: object, resolved: Map<object, string | null>): readonly object[] {
  const chain: object[] = [];
  let node = call.getParent();
  while (node !== undefined && node.compilerNode !== statement) {
    if (Node.isCallExpression(node)) {
      const identity: object = node.compilerNode;
      if (!resolved.has(identity)) {
        resolved.set(identity, drizzleCallee(node));
      }
      const name = resolved.get(identity) ?? null;
      if (name !== null && COMBINATOR_FNS.has(name)) {
        chain.push(identity);
      }
    }
    node = node.getParent();
  }
  return chain;
}

/** Column keys the schema declares NULLABLE: no `.notNull()`, not a `.primaryKey()`, and not a term of a
 *  composite primary key. A `.primaryKey()` column counts NOT NULL — SQLite's legacy quirk allows NULL in a
 *  non-INTEGER PK, but every PK here is an app-minted TypeID written on insert (a mustPass records it). */
function nullableColumnKeys(schema: SchemaModel): ReadonlySet<string> {
  const composite = new Set(
    schema.tables.flatMap((table) =>
      table.indexes.filter((index) => index.kind === "primary-key").flatMap((index) => index.columns.map((column) => column.key)),
    ),
  );
  return new Set(
    schema.tables.flatMap((table) =>
      table.columns.filter((column) => !(column.notNull || column.primaryKey || composite.has(column.identity.key))).map((column) => column.identity.key),
    ),
  );
}

/** Guards keyed (drizzle combinator call → the column keys guarded beneath it). A guard on a SIBLING
 *  column cannot absolve this column, and a guard that reaches no shared combinator absolves nothing at
 *  all. Built fresh per invocation from `create`-local state; no module binding survives the pass. */
function guardedColumnsByCombinator(
  fact: { readonly column: (node: MorphNode) => { readonly kind: string; readonly value?: SchemaColumn } },
  guards: readonly Guard[],
): ReadonlyMap<object, ReadonlySet<string>> {
  const guarded = new Map<object, Set<string>>();
  for (const guard of guards) {
    const column = fact.column(guard.node);
    if (column.kind !== "resolved" || column.value === undefined) {
      continue;
    }
    for (const combinator of guard.combinators) {
      const keys = guarded.get(combinator) ?? new Set<string>();
      keys.add(column.value.identity.key);
      guarded.set(combinator, keys);
    }
  }
  return guarded;
}

export const gate = defineGate({
  id: "nullable-column-inequality",
  family: "drizzle-schema",
  authority: "ordinary",
  severity: "error",
  population: NULLABLE_INEQUALITY_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const operands: Operand[] = [];
    const guards: Guard[] = [];
    /** Ancestor callee identities resolved once per invocation — an `and(...)` wrapping ten predicates is
     *  otherwise re-resolved ten times. */
    const resolvedCallees = new Map<object, string | null>();
    let spellings: ReadonlySet<string> = RECOGNIZED;
    return {
      visitFile: (sourceFile) => {
        spellings = calleeSpellings(sourceFile);
      },
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (!(Node.isCallExpression(node) && spellings.has(node.getExpression().getText()))) {
              return;
            }
            const callee = drizzleCallee(node);
            if (callee === null) {
              return;
            }
            if (NULL_GUARD_FNS.has(callee)) {
              const argument = node.getArguments()[0];
              if (argument !== undefined) {
                guards.push({ node: argument, combinators: combinatorChain(node, enclosingStatement(node), resolvedCallees) });
              }
              return;
            }
            const columnArgs = COLUMN_ARG_COUNT[callee];
            if (columnArgs === undefined) {
              return;
            }
            const combinators = combinatorChain(node, enclosingStatement(node), resolvedCallees);
            for (const argument of node.getArguments().slice(0, columnArgs)) {
              operands.push({ node: argument, combinators });
            }
          },
        },
      ],
      evaluate: () => {
        const fact = ctx.fact(drizzleSchemaFact);
        const schema = fact.schema();
        recordReadySchemaFact(ctx, schema);
        const nullable = nullableColumnKeys(schema.value);
        const guarded = guardedColumnsByCombinator(fact, guards);
        for (const operand of operands) {
          const column = fact.column(operand.node);
          // A table this run's schema fact does not carry is UNKNOWN, not nullable — the reader fails QUIET
          // rather than flagging every alias or subquery it cannot resolve (a DECLARED LIMIT with its row).
          if (column.kind !== "resolved" || !nullable.has(column.value.identity.key)) {
            continue;
          }
          const key = column.value.identity.key;
          if (operand.combinators.some((combinator) => guarded.get(combinator)?.has(key) === true)) {
            continue;
          }
          ctx.report.node(operand.node, { token: operand.node.getText(), offset: 0 });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { characters } from "../../../../../db/src/schema/x";\nexport const p = ne(characters.avatarAssetId, "a");\n',
      },
      expect: { count: 1, token: "characters.avatarAssetId" },
      why: "the founding shape (D124) — `ne()` on a column with no `.notNull()`: every row whose avatar is unset silently vanishes from a predicate that reads as 'any avatar but this one'",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { notInArray } from "drizzle-orm";\nimport { characters } from "../../../../../db/src/schema/x";\nexport const p = notInArray(characters.avatarAssetId, ["a", "b"]);\n',
      },
      expect: { count: 1 },
      why: "`notInArray` is the SAME three-valued defect (`NULL NOT IN (…)` is NULL) — covering only `ne` would be a half-gate",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const messages = sqliteTable("messages", { id: text("id").primaryKey(), selectedVariantId: text("selected_variant_id") });\nexport const messageVariants = sqliteTable("message_variants", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { messages, messageVariants } from "../../../../../db/src/schema/x";\nexport const p = ne(messageVariants.id, messages.selectedVariantId);\n',
      },
      expect: { count: 1, token: "messages.selectedVariantId" },
      why: "the nullable column on the RIGHT-hand side — the live chat/persistence/queries.ts shape; an arg-0-only reader would have passed it silently",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne as different } from "drizzle-orm";\nimport { characters } from "../../../../../db/src/schema/x";\nexport const p = different(characters.avatarAssetId, "a");\n',
      },
      expect: { count: 1 },
      why: "an IMPORT ALIAS is the same drizzle predicate — the legacy reader keyed on the written name `ne`, so renaming the import was a silent escape (#1506)",
    },
    {
      mode: "types",
      files: {
        "node_modules/drizzle-orm/index.ts":
          "export function notInArray(column: unknown, values: readonly string[]): boolean;\n" +
          "export function notInArray(column: unknown, values: readonly number[]): boolean;\n" +
          "export function notInArray(column: unknown, values: readonly unknown[]): boolean {\n  return Boolean(column) && values.length > 0;\n}\n",
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { notInArray } from "drizzle-orm";\nimport { characters } from "../../../../../db/src/schema/x";\nexport const p = notInArray(characters.avatarAssetId, ["a"]);\n',
      },
      expect: { count: 1, token: "characters.avatarAssetId" },
      why: "THE OVERLOAD DOOR, planted so a virtual proof can reach it: the real `drizzle-orm` declares `notInArray` THREE times, and the live site read as CLEAN with a stale-looking waiver while the shared reader refused a multiply-declared symbol. It is now a plain IDENTITY row — `overloadHome` resolves a same-file overload set to its one declaring module, so this row is answered by the canonical origin and the gate-local trace-declaration fallback it used to need is deleted",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id"), coverAssetId: text("cover_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { and, isNull, ne, or } from "drizzle-orm";\n' +
          'import { characters } from "../../../../../db/src/schema/x";\n' +
          'export const p = and(or(isNull(characters.avatarAssetId), ne(characters.avatarAssetId, "a")), ne(characters.coverAssetId, "b"));\n',
      },
      expect: { count: 1, token: "characters.coverAssetId" },
      why: "a guard is PER COLUMN, not per statement: the guarded avatar passes while the unguarded cover in the SAME statement still reds — a statement-wide guard would rubber-stamp the sibling",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n' +
          'export const personas = sqliteTable("personas", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { isNull, ne, or } from "drizzle-orm";\n' +
          'import { characters, personas } from "../../../../../db/src/schema/x";\n' +
          'export const p = or(isNull(personas.avatarAssetId), ne(characters.avatarAssetId, "a"));\n',
      },
      expect: { count: 1, token: "characters.avatarAssetId" },
      why: "SAME COLUMN NAME, DIFFERENT TABLE: `personas.avatarAssetId` is spelled identically to the guarded column and guards NOTHING here. The guard key is the fact's canonical column identity, not the member name, so a name-keyed reader would have rubber-stamped the real defect",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id"), coverAssetId: text("cover_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { isNull, ne } from "drizzle-orm";\n' +
          'import { characters } from "../../../../../db/src/schema/x";\n' +
          "declare function choose(a: unknown, b: unknown): unknown;\n" +
          'export const p = choose(isNull(characters.avatarAssetId), ne(characters.avatarAssetId, "a"));\n',
      },
      expect: { count: 1, token: "characters.avatarAssetId" },
      why: "CO-LOCATION IS NOT GUARDING: the guard and the predicate share a statement AND an argument list, but `choose` is not a boolean combinator, so the guard never reaches the predicate's truth value and every NULL row still vanishes. A same-statement rule passed this — the exact false clean the combinator-ancestor rule closes",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id"), coverAssetId: text("cover_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { and, isNull, ne } from "drizzle-orm";\n' +
          'import { characters } from "../../../../../db/src/schema/x";\n' +
          'export const p = and(isNull(characters.coverAssetId), ne(characters.avatarAssetId, "a"));\n',
      },
      expect: { count: 1, token: "characters.avatarAssetId" },
      why: "A GUARD ON A DIFFERENT COLUMN, correctly wired into the same `and`: the boolean relation is right and the SUBJECT is wrong, so the avatar's NULLs are still unowned",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const users = sqliteTable("users", { id: text("id").primaryKey(), role: text("role").notNull() });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { users } from "../../../../../db/src/schema/x";\nexport const p = ne(users.role, "owner");\n',
      },
      why: "a `.notNull()` column — three-valued logic cannot bite, and this is the overwhelming majority of the live corpus",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const rpgSnapshots = sqliteTable("rpg_snapshots", { id: text("id").primaryKey(), messageId: text("message_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { isNull, ne, or } from "drizzle-orm";\nimport { rpgSnapshots } from "../../../../../db/src/schema/x";\nexport const p = or(isNull(rpgSnapshots.messageId), ne(rpgSnapshots.messageId, "m"));\n',
      },
      why: "the SANCTIONED total form — `or(isNull(col), ne(col, x))`, the live rpg/persistence/snapshots.ts shape and exactly what the fix names",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const rpgSnapshots = sqliteTable("rpg_snapshots", { id: text("id").primaryKey(), messageId: text("message_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { and, isNotNull, ne } from "drizzle-orm";\nimport { rpgSnapshots } from "../../../../../db/src/schema/x";\nexport const p = and(isNotNull(rpgSnapshots.messageId), ne(rpgSnapshots.messageId, "m"));\n',
      },
      why: "the other sanctioned form — dropping the NULLs DELIBERATELY with `isNotNull` through the same `and` is a decision, not an accident",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id"), coverAssetId: text("cover_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { and, eq, isNull, ne, or } from "drizzle-orm";\n' +
          'import { characters } from "../../../../../db/src/schema/x";\n' +
          'export const p = or(eq(characters.id, "x"), and(isNull(characters.avatarAssetId), ne(characters.avatarAssetId, "a")));\n',
      },
      why: "NESTING COMPOSES: the guard and the predicate share the inner `and`, which is itself an argument of an `or`. Requiring the OUTERMOST combinator to be shared would red this correct shape",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\n' +
          'import { characters } from "../../../../../db/src/schema/x";\n' +
          "// @orb-waive nullable-column-inequality(characters.avatarAssetId): every consumer inner-joins on this column, so NULL rows are already gone. Ends if a consumer left-joins.\n" +
          'export const p = ne(characters.avatarAssetId, "a");\n',
      },
      why: "the ONE central positioned waiver, naming the exact reported token — the sanctioned escape for a fact the AST cannot see (the live discovery/persistence/embed-store-reads.ts site). Malformed, stale and over-broad markers are proven CENTRALLY, once, not re-proved per policy",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { characters } from "../../../../../db/src/schema/x";\n' +
          "function ne(a: unknown, b: string): boolean {\n  return a !== b;\n}\n" +
          'export const p = ne(characters.avatarAssetId, "a");\n',
      },
      why: "DECLARED LIMIT / no-false-positive: a same-named LOCAL `ne` is not drizzle SQL. THE COLUMN ARGUMENT IS THE POINT — with string literals this row was acquitted upstream by column resolution and isolated nothing. It now isolates the FIRST half of the origin claim (a local declaration is no module member at all); the SECOND half — and that module is drizzle — needs a genuine foreign export, which is the row below",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/predicates.ts": "export function ne(a: unknown, b: string): boolean {\n  return a !== b;\n}\n",
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { characters } from "../../../../../db/src/schema/x";\n' +
          'import { ne } from "./predicates";\n' +
          'export const p = ne(characters.avatarAssetId, "a");\n',
      },
      why: "THE MODULE-ORIGIN COUNTERFACTUAL: `ne` here is a GENUINE module export that resolves cleanly — same name, same shape, same nullable column, everything the detector keys on except the one thing that matters, its module. Only `moduleSpecifier.startsWith(\"drizzle-orm\")` acquits it, so deleting that comparison turns this row red; without it the whole 'only drizzle counts' claim had no control",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { eq, not } from "drizzle-orm";\nimport { characters } from "../../../../../db/src/schema/x";\nexport const p = not(eq(characters.avatarAssetId, "a"));\n',
      },
      why: "DECLARED LIMIT — `not(eq(...))` is the same three-valued defect one wrapper out. It appears nowhere on this tree, so the reader deliberately does not chase it; this row is the written baseline of that choice",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { chats } from "../../../../../db/src/schema/x";\nexport const p = ne(chats.id, "c");\n',
      },
      why: "DECLARED LIMIT — a `.primaryKey()` column is read as NOT NULL. SQLite's legacy quirk permits NULL in a non-INTEGER PK, but every PK here is an app-minted TypeID written on insert, so treating it as nullable would be dozens of false positives",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'export const chatTags = sqliteTable("chat_tags", { chatId: text("chat_id"), tagId: text("tag_id") }, (t) => [primaryKey({ columns: [t.chatId, t.tagId] })]);\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { chatTags } from "../../../../../db/src/schema/x";\nexport const p = ne(chatTags.chatId, "c");\n',
      },
      why: "DECLARED LIMIT — a COMPOSITE primary-key term is NOT NULL too; the fact's index terms are what make that readable without a second parser",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\ndeclare const someTable: { whatever: string };\nexport const p = ne(someTable.whatever, "a");\n',
      },
      why: "DECLARED LIMIT — a table this run's schema fact does not carry is UNKNOWN, not nullable: the policy fails QUIET rather than flagging every alias or subquery it cannot resolve",
    },
  ],
});
