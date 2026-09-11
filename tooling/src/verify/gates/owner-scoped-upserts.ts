// Gate: owner-scoped-upserts — the UPSERT half of the tenancy family (`owner-scoped-reads`/`-writes`). An
// `onConflictDoUpdate` is an UPDATE in disguise whose predicate is the conflict TARGET (a unique index), not a
// `.where`: on an `ownerId`-class table (table-scoping-class (a)) a target that omits the owner column lets a
// caller's insert COLLIDE with a foreign row's unique key and overwrite it. The owner must appear in the
// `target`/`targetWhere`/`setWhere`, or a central `// @orb-waive owner-scoped-upserts(<ident>): <reason>`
// waiver must name who proved the target values are the caller's. An UNRESOLVABLE insert target (an
// identifier tracing to no declared table) reports too — an unreadable target is unproven. DECLARED LIMITS:
// an unreadable config (a spread/identifier, or drizzle's DEPRECATED ambiguous `where:`) fails CLOSED, and
// `onConflictDoNothing` is out of scope (it overwrites nothing).
//
// MARKER CENSUS: this is a NEW gate (the legacy corpus had no separate upsert checker — the legacy
// `owner-scoped-writes` treated `onConflictDoUpdate` as out of scope entirely), so there is no legacy
// `@owner-scope-*` marker to translate here. Its OWN waiver position (`owner-scoped-upserts(<ident>)`) is
// distinct from the sibling gates': a `@orb-waive owner-scoped-writes(<ident>)` marker sitting on an
// upsert candidate targets the WRONG policy id and must not suppress it — the retired legacy scenario
// "a WRITE marker does not exempt an UPSERT" — proven via runPolicyPass in
// tests/tooling/verify/gates/tenancy-scope-family.test.ts (a report-identity assertion, not a conformance
// row: an authority alarm from a mismatched marker is itself a conformance FAILURE, so this case can only
// be proven by driving the dispatcher directly and asserting the alarm).
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";
import { predicatesTableColumn, tableTargetOf, upsertConfigOf } from "../lib/tenancy-read.ts";
import { reportBlindWhenEmpty } from "../lib/tenancy-scope.ts";
import { ownerScopedTableIdents, schemaTableIdents } from "./table-scoping-class.ts";

const OWNER_COL = "ownerId";
const INSERT_VERB = "insert";
/** The config properties that can CONSTRAIN which row the DO UPDATE arm touches: the conflict `target` (the
 *  unique index whose collision fires it), the `targetWhere` (a partial-index predicate) and the `setWhere`
 *  (the DO UPDATE's own WHERE — a non-matching row is skipped, not overwritten). `set` is deliberately NOT
 *  here: assigning the owner column in `set` does not constrain WHICH row is written, it RESTAMPS the row that
 *  already lost — the widest form of the hole, not a guard. drizzle's `where:` is deprecated precisely because
 *  it is ambiguous between the two sides, so it cannot prove either. */
const GUARD_PROPS = ["target", "targetWhere", "setWhere"] as const;

/** The finding message of the unresolvable arm — a stable CLASS name, so the arm reads distinctly from the
 *  ownerless-target arm even though its token (the binding itself) can collide with it. */
const UNRESOLVABLE = "unresolvable-target";

const MESSAGE =
  "an `onConflictDoUpdate` upsert of an ownerId-scoped table whose conflict target does not resolve the " +
  "owner — this is the cross-tenant UPSERT hole: an upsert is an UPDATE in disguise, and the row it updates " +
  "is chosen by the UNIQUE INDEX it collides with, not by a `.where`. When that index omits the owner " +
  "column, an insert carrying caller-supplied key values collides with a FOREIGN owner's row and the DO " +
  "UPDATE arm overwrites it (the victim keeps its own `owner_id`, so the corruption is invisible to every " +
  "owner-filtered read afterwards). An owner-scoped table (table-scoping-class class (a)) resolves tenancy " +
  "through its `ownerId`, so the collision has to say so — or say who already proved the target is the " +
  "caller's. The sibling halves judge the `.where` of a read and of a write; the owner-scoped fetch they " +
  "all pair with is packages/db/src/kit/fetch-owned.ts.";

const UNRESOLVABLE_MESSAGE =
  `an ${UNRESOLVABLE} upsert — the insert target is an identifier that traces to no table this schema ` +
  "declares (a parameter, a reassigned binding, an alias chain past the depth cap or through a cycle), so " +
  "the gate cannot tell whether it is an ownerId-class table at all — and an unreadable target is an " +
  "UNPROVEN one, not a clean one. The `onConflictDoUpdate` in the chain is what proves this is a drizzle " +
  "statement, so no further fence is needed here (#769).";

const FIX =
  "pick the arm that fits: (1) put the owner IN THE CONFLICT TARGET — `target: [T.ownerId, T.key]`, which " +
  "needs the matching UNIQUE INDEX in the schema and is the right answer when the collision genuinely is " +
  "per-owner; (2) BOUND THE UPDATE ARM — `setWhere: eq(T.ownerId, ownerId)` (a collision with a foreign row " +
  "moves 0 rows instead of overwriting it), which is the one-line belt when the unique index is legitimately " +
  "global (an FK-partitioned PK, a null-owner system seed) and must not change; (3) if the authority is " +
  "genuinely chained ABOVE this statement — the verb loaded the parent owned before building the scope, or " +
  "the target values are the engine's own constants (D20 un-principal) — add `// @orb-waive " +
  "owner-scoped-upserts(<ident>): <reason>` on the exact declaration, naming WHO proved the target values are " +
  "the caller's and what would end the exemption. Note that assigning `ownerId` inside `set` is NOT a fix: " +
  "it restamps the row that already lost the collision, which converts an overwrite into a theft. For the " +
  `${UNRESOLVABLE} arm the first answer is different: NAME THE TABLE AT THE STATEMENT — a table-generic ` +
  "upsert helper cannot carry a conflict guard anyone can read — or, if the indirection is deliberate, waive " +
  "the function and say who proved the target values are the caller's.";

const BLIND =
  "owner-scoped-upserts derived ZERO ownerId-class tables from the schema — the gate has gone blind (the " +
  "schema shape or the class registry moved, and a gate that matches nothing reports ✓ forever). Re-derive " +
  "it in tooling/src/verify/gates/table-scoping-class.ts (`ownerScopedTableIdents`)";

/** A candidate the WALK records without judging — resolving its target needs the (a)-class/denominator sets,
 *  which are not ready until `evaluate`. Pure-AST fields only. */
interface UpsertCandidate {
  readonly node: CallExpression; // the whole `db.insert(T)…onConflictDoUpdate(…)` call
}

/** `db.insert(T)` (or the same on a `tx` receiver) whose chain reaches `onConflictDoUpdate`, or undefined for
 *  every other call. A plain insert / `onConflictDoNothing` is filtered by `upsertConfigOf` returning
 *  undefined, not here, so the candidate list stays a pure per-node AST match. */
function upsertCandidateOf(node: Node): UpsertCandidate | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = node.getExpression();
  return callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === INSERT_VERB ? { node } : undefined;
}

/** Does the upsert config constrain the DO UPDATE to THIS table's own owner column? Requires the qualified
 *  `<tableIdent>.ownerId` — a bare `ownerId` or some OTHER table's owner column scopes nothing here. FAILS
 *  CLOSED on any config the reader cannot see through (a spread, an identifier, a call), because an
 *  unreadable guard is an unproven one. */
function guardsOwner(config: Node | undefined, ident: string): boolean {
  if (config?.isKind(SyntaxKind.ObjectLiteralExpression) !== true) {
    return false;
  }
  return GUARD_PROPS.some((name) => {
    const prop = config.getProperty(name);
    return prop !== undefined && predicatesTableColumn(prop, ident, OWNER_COL);
  });
}

interface UpsertVerdict {
  readonly argNode: Node;
  readonly message: string;
}

/** Judge one upsert candidate now that the (a)-class/denominator sets are ready. Reports at most once. */
function judgeUpsert(node: CallExpression, ownerTableIdents: ReadonlySet<string>, allTableIdents: ReadonlySet<string>): UpsertVerdict | undefined {
  const arg = node.getArguments()[0];
  const target = tableTargetOf(arg, ownerTableIdents, allTableIdents);
  if (target === undefined || target.kind === "other-table" || arg === undefined) {
    return;
  }
  const config = upsertConfigOf(node);
  if (config === undefined) {
    return; // a plain insert or an `onConflictDoNothing` — neither overwrites a row that already exists
  }
  if (target.kind === "unresolvable") {
    // The `onConflictDoUpdate` above already proved this is a drizzle statement, so the target being
    // unreadable is the whole finding: no conflict guard can be verified against a table nobody named.
    return { argNode: arg, message: UNRESOLVABLE_MESSAGE };
  }
  return guardsOwner(config, target.ident) ? undefined : { argNode: arg, message: MESSAGE };
}

export const gate = defineGate({
  id: "owner-scoped-upserts",
  family: "tenancy-scope",
  authority: "ordinary",
  severity: "error",
  population: "@server",
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: UpsertCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            const candidate = upsertCandidateOf(node);
            if (candidate !== undefined) {
              candidates.push(candidate);
            }
          },
        },
      ],
      evaluate: () => {
        const schemaFact = ctx.fact(drizzleSchemaFact).schema();
        recordReadySchemaFact(ctx, schemaFact);
        const ownerTableIdents = ownerScopedTableIdents(schemaFact.value);
        const allTableIdents = schemaTableIdents(schemaFact.value);
        for (const candidate of candidates) {
          const verdict = judgeUpsert(candidate.node, ownerTableIdents, allTableIdents);
          if (verdict !== undefined) {
            ctx.report.node(verdict.argNode, { token: verdict.argNode.getText(), offset: 0, message: verdict.message });
          }
        }
        reportBlindWhenEmpty(ctx, schemaFact, ownerTableIdents, BLIND);
      },
    };
  },

  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nexport async function putKv(db: Db, scope: S, entry: E) {\n  return db.insert(pluginKv).values({ pluginId: scope.pluginId, ownerId: scope.ownerId, key: entry.key, value: entry.value }).onConflictDoUpdate({ target: [pluginKv.pluginId, pluginKv.key], set: { value: entry.value } });\n}\n',
      },
      expect: { count: 1, messageIncludes: "cross-tenant UPSERT hole" },
      why: "the founding shape — the declared limit `owner-scoped-writes` wrote down and this gate supersedes: a (plugin_id, key) conflict target on an ownerId-class table collides on values the caller names, and the DO UPDATE arm overwrites whoever owns the loser",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/theme.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const themes = sqliteTable("themes", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          'import { themes } from "@orb/db";\nexport async function upsertSeed(db: Db, row: R) {\n  return db.insert(themes).values(row).onConflictDoUpdate({ target: themes.id, set: { name: row.name } });\n}\n',
      },
      expect: { count: 1 },
      why: "the SINGLE-column form: `target: T.id` is not an array, and a gate reading only array targets would ship a blind spot on the PK-collision shape — which is the widest one (every row of the table is a candidate victim)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function put(db: Db, row: R, ownerId: string) {\n  return db.insert(characters).values(row).onConflictDoUpdate({ target: characters.slug, set: { name: row.name, ownerId } });\n}\n',
      },
      expect: { count: 1 },
      why: "assigning `ownerId` in `set` is the ANTI-fix and must still RED: it does not choose WHICH row is written, it restamps the foreign row that already lost the collision — an overwrite upgraded to a theft. A reader matching `ownerId` anywhere in the config would call this safe",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nconst CFG = { target: characters.slug, set: { name: "x" } };\nexport async function put(db: Db, row: R) {\n  return db.insert(characters).values(row).onConflictDoUpdate(CFG);\n}\n',
      },
      expect: { count: 1 },
      why: "FAIL CLOSED on a config the reader cannot see through (an identifier, a spread, a call). A guard that is unreadable is unproven — a gate that returned 'safe' here would be silenced by one `const CFG =` refactor (GATE-AUTHORING §5, literal-shape blindness)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function put(db: Db, row: R, ownerId: string) {\n  return db.insert(characters).values(row).onConflictDoUpdate({ target: characters.slug, where: eq(characters.ownerId, ownerId), set: { name: row.name } });\n}\n',
      },
      expect: { count: 1 },
      why: "drizzle's `where:` on this config is DEPRECATED because it is ambiguous between the target predicate and the update predicate — an ambiguous guard proves neither side, so it must not exempt. The fix is the explicit `setWhere:`",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv as kvTable } from "@orb/db";\nexport async function putKv(db: Db, entry: E) {\n  return db.insert(kvTable).values(entry).onConflictDoUpdate({ target: [kvTable.pluginId, kvTable.key], set: { value: entry.value } });\n}\n',
      },
      expect: { count: 1, token: "kvTable" },
      why: "an import alias is still the same owner-scoped table — renaming the local binding cannot bypass the upsert half",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nconst table = pluginKv;\nexport async function putKv(db: Db, entry: E) {\n  return db.insert(table).values(entry).onConflictDoUpdate({ target: [table.pluginId, table.key], set: { value: entry.value } });\n}\n',
      },
      expect: { count: 1, token: "table" },
      why: "a same-file immutable alias retains the canonical table's owner-scoped identity at an upsert target",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nlet table = pluginKv;\nexport async function putKv(db: Db, entry: E) {\n  return db.insert(table).values(entry).onConflictDoUpdate({ target: [table.pluginId, table.key], set: { value: entry.value } });\n}\n',
      },
      expect: { count: 1, token: "table" },
      why: "#769 — the DECLARATION KIND is irrelevant to what a binding names. `let` resolved to nothing while `const` resolved fine, so one keyword silently walked every ownerless-target upsert past this gate",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nvar table = pluginKv;\nexport async function putKv(db: Db, entry: E) {\n  return db.insert(table).values(entry).onConflictDoUpdate({ target: table.key, set: { value: entry.value } });\n}\n',
      },
      expect: { count: 1, token: "table" },
      why: "#769's `var` twin — proving only `let` would leave the older keyword as a live hole on the upsert half too",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          "export async function putAny(db: Db, table: AnyTable, entry: E) {\n  return db.insert(table).values(entry).onConflictDoUpdate({ target: table.key, set: { value: entry.value } });\n}\n",
      },
      expect: { count: 1, token: "table", messageIncludes: UNRESOLVABLE },
      why: "the UNRESOLVABLE arm — a table-generic upsert helper. The `onConflictDoUpdate` proves this is a drizzle statement, and a conflict guard cannot be verified against a table nobody named: unreadable is UNPROVEN, not clean",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nconst a = b;\nconst b = a;\nexport async function putKv(db: Db, entry: E) {\n  return db.insert(a).values(entry).onConflictDoUpdate({ target: a.key, set: { value: entry.value } });\n}\n',
      },
      expect: { count: 1, token: "a", messageIncludes: UNRESOLVABLE },
      why: "the CYCLE/depth refusal REPORTS rather than exempts: terminating the alias walk with 'I could not read it' must not read as 'nothing here'",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/stats.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const dailyStats = sqliteTable("daily_stats", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/stats/write/apply-delta.ts":
          'import { dailyStats } from "@orb/db";\nexport function roll(db: Db, row: R) {\n  return db.insert(dailyStats).values(row).onConflictDoUpdate({ target: [dailyStats.ownerId, dailyStats.day], set: { chats: 1 } });\n}\n',
      },
      why: "arm 1 — the owner IN THE CONFLICT TARGET: the unique index is per-owner, so a foreign row is not even a collision candidate. This is the rollup shape the stats plane already writes",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/stats.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const ownerStats = sqliteTable("owner_stats", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/stats/write/apply-delta.ts":
          'import { ownerStats } from "@orb/db";\nexport function roll(db: Db, row: R) {\n  return db.insert(ownerStats).values(row).onConflictDoUpdate({ target: ownerStats.ownerId, set: { chats: 1 } });\n}\n',
      },
      why: "arm 1 in its SINGLE-column form — the owner column IS the natural key. The reader must not require an array target any more than it may require a scalar one",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nexport async function putKv(db: Db, scope: S, entry: E) {\n  return db.insert(pluginKv).values(entry).onConflictDoUpdate({ target: [pluginKv.pluginId, pluginKv.key], setWhere: eq(pluginKv.ownerId, scope.ownerId), set: { value: entry.value } });\n}\n',
      },
      why: "arm 1 via `setWhere` — the belt for a legitimately global unique index (here an FK-partitioned PK). A collision with a foreign owner's row moves 0 rows instead of overwriting it, which is the upsert's version of putting the owner in the WHERE",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/theme.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const themes = sqliteTable("themes", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          'import { themes } from "@orb/db";\nexport async function upsertSeed(db: Db, row: R) {\n  return db.insert(themes).values(row).onConflictDoUpdate({ target: themes.id, setWhere: isNull(themes.ownerId), set: { name: row.name } });\n}\n',
      },
      why: "the NULL-owner system-seed shape: `isNull(T.ownerId)` is an owner predicate too — the boot reseed can only ever overwrite an ownerless seed row, never a user's. The reader keys on the qualified column, not on a specific comparison helper",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tag.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatTags = sqliteTable("chat_tags", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/tag/persistence/queries.ts":
          'import { chatTags } from "@orb/db";\n// @orb-waive owner-scoped-upserts(chatTags): the target values are the engine\'s own constants (D20 un-principal), never caller-supplied. Ends the day a caller can name one.\nexport async function put(db: Db, row: R) {\n  return db.insert(chatTags).values(row).onConflictDoUpdate({ target: [chatTags.chatId, chatTags.tagId], set: { at: 1 } });\n}\n',
      },
      why: "arm 2 — the central positioned waiver WITH its reason: the proof that the target values are the caller's lives in the CALLER's control flow, which no structural gate can see. The reason is the deliverable; the engine's own liveness reconciliation is what stops it outliving the upsert",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function put(db: Db, row: R) {\n  return db.insert(characters).values(row).onConflictDoNothing({ target: characters.slug });\n}\n',
      },
      why: "DECLARED LIMIT: `onConflictDoNothing` is out of scope by construction — a collision with a foreign row is a NO-OP, which is the safe answer already. Only the DO UPDATE arm can overwrite",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatLocks = sqliteTable("chat_locks", { chatId: text("chat_id") });\n',
        "packages/server/src/domain/chat/persistence/lock.ts":
          'import { chatLocks } from "@orb/db";\nexport async function take(db: Db, row: R) {\n  return db.insert(chatLocks).values(row).onConflictDoUpdate({ target: chatLocks.chatId, set: { holder: row.holder } });\n}\n',
      },
      why: "DECLARED LIMIT: a (b) MEMBERSHIP-scoped table is out of scope here, the same way it is for both sibling halves. Its rung is `requireParticipant`/`requireHost` in the verb's control flow — unprovable structurally, and the cross-tenant behavioral sweep stays that proof",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey() });\n',
        "packages/db/src/schema/discovery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nimport { characters } from "./character.ts";\nexport const characterSummaries = sqliteTable("character_summaries", { characterId: text("character_id").references(() => characters.id) });\n',
        "packages/server/src/domain/discovery/verbs/distill.ts":
          'import { characterSummaries } from "@orb/db";\nexport async function store(db: Db, row: R) {\n  return db.insert(characterSummaries).values(row).onConflictDoUpdate({ target: characterSummaries.characterId, set: { text: row.text } });\n}\n',
      },
      why: "DECLARED LIMIT: a (d) PARENT-derived table is out of scope — its tenancy is the parent's, so the owner column this gate keys on does not exist to be put in a target. The parent's own reachability is `owner-scoped-reads`' question",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv as kvTable } from "@orb/db";\nexport async function putKv(db: Db, scope: S, entry: E) {\n  return db.insert(kvTable).values(entry).onConflictDoUpdate({ target: [kvTable.pluginId, kvTable.key], setWhere: eq(kvTable.ownerId, scope.ownerId), set: { value: entry.value } });\n}\n',
      },
      why: "the alias resolver returns the local binding, so a guarded conflict target written through that alias remains safe",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nconst table = pluginKv;\nexport async function putKv(db: Db, scope: S, entry: E) {\n  return db.insert(table).values(entry).onConflictDoUpdate({ target: [table.pluginId, table.key], setWhere: eq(table.ownerId, scope.ownerId), set: { value: entry.value } });\n}\n',
      },
      why: "a local canonical-table alias is safe when the conflict guard structurally uses that same binding's owner column",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nlet table = pluginKv;\nexport async function putKv(db: Db, scope: S, entry: E) {\n  return db.insert(table).values(entry).onConflictDoUpdate({ target: [table.pluginId, table.key], setWhere: eq(table.ownerId, scope.ownerId), set: { value: entry.value } });\n}\n',
      },
      why: "the #769 widening is two-sided: resolving a `let` alias must ACCEPT the guarded upsert as readily as it reds the unguarded one",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatLocks = sqliteTable("chat_locks", { chatId: text("chat_id") });\n',
        "packages/server/src/domain/chat/persistence/lock.ts":
          'import { chatLocks } from "@orb/db";\nlet table = chatLocks;\nexport async function take(db: Db, row: R) {\n  return db.insert(table).values(row).onConflictDoUpdate({ target: table.chatId, set: { holder: row.holder } });\n}\n',
      },
      why: "the DENOMINATOR arm: an alias of a (b) table READS fine and is simply out of scope — it must not fall into the unresolvable arm. Without the full schema-ident set, 'not (a)-class' and 'unreadable' would be one answer and every non-(a) upsert in the tree would red",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          "// @orb-waive owner-scoped-upserts(table): the caller resolved the parent owned and passes the table only to share one upsert body. Ends the day this helper takes values it did not prove.\nexport async function putAny(db: Db, table: AnyTable, entry: E) {\n  return db.insert(table).values(entry).onConflictDoUpdate({ target: table.key, set: { value: entry.value } });\n}\n",
      },
      why: "ONE vocabulary per gate: the unresolvable arm answers the same question the ownerless-target arm does, so it takes the SAME central waiver position rather than minting another",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          "export async function putAny(db: Db, table: AnyTable, entry: E) {\n  return db.insert(table).values(entry);\n}\n",
      },
      why: "a plain insert through an unresolvable target has no DO UPDATE arm to judge at all — `upsertConfigOf` returns undefined before the target's resolvability is even asked",
    },
  ],
});
