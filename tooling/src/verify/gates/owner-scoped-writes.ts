// Gate: owner-scoped-writes — the WRITE half of `owner-scoped-reads`. An `update`/`delete` of an
// `ownerId`-class table (table-scoping-class (a)) must put the owner IN THE WHERE, or carry a central
// `// @orb-waive owner-scoped-writes(<ident>): <reason>` waiver naming WHO authorized the id. THREE shapes
// bite: a by-id write (`eq(T.id, …)`/`inArray(T.id, …)` with no owner predicate), an UNBOUNDED write (no
// `.where` at all — a whole-table mutation, which on a tenant table is every owner's rows), and an
// UNRESOLVABLE target (an identifier tracing to no declared table — an unreadable target is unproven, so it
// reports instead of exempting). DECLARED LIMITS: no post-fetch arm (a write's guard sits in the CALLER's
// control flow, which is unprovable structurally — that is what the waiver records); a CHAIN-FREE
// unresolvable statement is out of the third arm (`cache.delete(key)` is the same AST as `db.delete(T)`,
// `isDrizzleWriteStatement` is the fence); and an `onConflictDoUpdate` upsert is out of scope HERE because
// the sibling `owner-scoped-upserts` owns it (its collision is a UNIQUE-index question, not a WHERE
// predicate — a third gate with its own waiver position).
//
// The legacy `owner-scoped-writes` descriptor (40223a0915eda72dd8ab35fbdeaf9e9892089717) carried the
// `@owner-scope-ok` marker grammar and its own inline schema read before this conversion, and treated
// `onConflictDoUpdate` as out of scope entirely.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";
import { isDrizzleWriteStatement, predicatesOwnId, predicatesTableColumn, tableTargetOf, whereArgOf } from "../lib/tenancy-read.ts";
import { ownerScopedTableIdents, reportBlindWhenEmpty, schemaTableIdents } from "../lib/tenancy-scope.ts";

const OWNER_COL = "ownerId";
/** The drizzle write verbs. A `Set`, not a `switch`: the two arms are judged identically — what differs is
 *  only which statement the reader anchors on, and both anchor the same way. */
const WRITE_VERBS = new Set(["update", "delete"]);

/** The finding message of the third arm — the UNRESOLVABLE class, so the arm reads distinctly from the by-
 *  id/unbounded arms even though its token (the binding itself) can collide with theirs. */
const UNRESOLVABLE = "unresolvable-target";

// MARKER TRANSLATION COMPLETE (#1944, 2026-09-11): this conversion dropped the legacy function-level
// `@owner-scope-write-ok` comment marker and the translation lane rewrote every live site into the
// central `@orb-waive owner-scoped-writes(<table>): <reason>` grammar, with the reported TABLE
// identifier as the position. A real run over the current population reports 0 blocking findings and 32
// waived, and the central authority reports no unused, malformed, unknown-policy or over-broad marker.
// The only `@owner-scope-write-ok` text left on the tree is PROSE inside explanatory comments; no live
// marker carries it. Ends if a new site is authored with the legacy spelling — the central engine does
// not recognize it under any grammar, so it would suppress nothing silently.

const MESSAGE =
  "an update/delete of an ownerId-scoped table with NO owner predicate — this is the cross-tenant WRITE " +
  "hole: whatever id the caller supplies gets mutated, whoever owns it (and with no `.where` at all, EVERY " +
  "owner's rows do). An owner-scoped table (table-scoping-class class (a)) resolves tenancy through its " +
  "`ownerId`, so the write has to say so — or say who already proved it. The owner-scoped read this pairs " +
  "with is packages/db/src/kit/fetch-owned.ts.";

const UNRESOLVABLE_MESSAGE =
  `a ${UNRESOLVABLE} write — the write target is an identifier that traces to no table this schema declares ` +
  "(a parameter, a reassigned binding, an alias chain past the depth cap or through a cycle), so the gate " +
  "cannot tell whether it is an ownerId-class table at all — and an unreadable target is an UNPROVEN one, " +
  "not a clean one. Reporting it is the whole point: the silent version of this branch is how one " +
  "`let table = characters` walked the write halves for an era (#769).";

const FIX =
  "pick the arm that fits: (1) put the owner IN THE WHERE — `and(eq(T.id, id), eq(T.ownerId, ownerId))` (a " +
  "non-owner's write moves 0 rows instead of a stranger's row), which is the right answer whenever the owner " +
  "is already in scope at the query; (2) if the authority is genuinely chained ABOVE this statement — the " +
  "verb loaded the row owned first, a host/roster rung (D18) that is STRICTER than the stamp already passed, " +
  "or the ids are the engine's own (D20 un-principal) — add `// @orb-waive owner-scoped-writes(<ident>): " +
  "<reason>` on the exact declaration, naming WHO authorized the id and what would end the exemption. For " +
  `the ${UNRESOLVABLE} arm the first answer is different: NAME THE TABLE AT THE STATEMENT (pass the row's ` +
  "id, not the table, into a helper — a table-generic write cannot carry a tenancy predicate anyone can " +
  "read), or, if the indirection is deliberate, waive the function and say who proved the target is the " +
  "caller's.";

const BLIND =
  "owner-scoped-writes derived ZERO ownerId-class tables from the schema — the gate has gone blind (the " +
  "schema shape or the class registry moved, and a gate that matches nothing reports ✓ forever). Re-derive " +
  "it in tooling/src/verify/gates/table-scoping-class.ts (`ownerScopedTableIdents`)";

/** A candidate the WALK records without judging — resolving its target needs the (a)-class/denominator sets,
 *  which are not ready until `evaluate`. Pure-AST fields only. */
interface WriteCandidate {
  readonly node: CallExpression; // the whole `db.update(T)`/`db.delete(T)` call
}

/** `db.update(T)` / `db.delete(T)` (or the same on a `tx` receiver), or undefined for every other call. */
function writeCandidateOf(node: Node): WriteCandidate | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = node.getExpression();
  return callee.isKind(SyntaxKind.PropertyAccessExpression) && WRITE_VERBS.has(callee.getName()) ? { node } : undefined;
}

interface WriteVerdict {
  readonly argNode: Node;
  readonly message: string;
}

/** Judge one write candidate now that the (a)-class/denominator sets are ready. Reports at most once. */
function judgeWrite(node: CallExpression, ownerTableIdents: ReadonlySet<string>, allTableIdents: ReadonlySet<string>): WriteVerdict | undefined {
  const arg = node.getArguments()[0];
  const target = tableTargetOf(arg, ownerTableIdents, allTableIdents);
  if (target === undefined || target.kind === "other-table" || arg === undefined) {
    return;
  }
  if (target.kind === "unresolvable") {
    // The fence, not a shrug: `cache.delete(key)` and `db.delete(T)` are one AST shape, so only a chained
    // drizzle builder proves this statement is a write at all. A chain-free unresolvable call is the
    // declared limit (a mustPass row carries it), NOT a silent exemption of a readable one.
    return isDrizzleWriteStatement(node) ? { argNode: arg, message: UNRESOLVABLE_MESSAGE } : undefined;
  }
  const ident = target.ident;
  const where = whereArgOf(node);
  // NO WHERE AT ALL is the widest form of the hole, not an exemption: on a read it is a list, on a write it
  // is every owner's rows. BY-ID is the read half's shape — whatever id the caller supplies gets written.
  // Any OTHER predicate (a partition column, a status guard on its own) is a different, unenforced question.
  if (where !== undefined && predicatesTableColumn(where, ident, OWNER_COL)) {
    return; // arm 1 — the owner is IN THE WHERE (with or without a by-id predicate beside it)
  }
  const whereText = where?.getText() ?? "";
  if (where !== undefined && !predicatesOwnId(whereText, ident)) {
    return;
  }
  return { argNode: arg, message: MESSAGE };
}

export const gate = defineGate({
  id: "owner-scoped-writes",
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
    const candidates: WriteCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            const candidate = writeCandidateOf(node);
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
          const verdict = judgeWrite(candidate.node, ownerTableIdents, allTableIdents);
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
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(characters).set({ name }).where(eq(characters.id, id));\n}\n',
      },
      expect: { count: 1, messageIncludes: "cross-tenant WRITE hole" },
      why: "the founding shape — a bare `eq(T.id, x)` UPDATE on an ownerId-scoped table mutates whoever's row the caller names",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function dropCard(db: Db, id: string) {\n  return db.delete(characters).where(eq(characters.id, id));\n}\n',
      },
      expect: { count: 1 },
      why: "the DELETE form — the destructive twin of the same hole. A gate covering only `update` would ship a blind spot on the arm that cannot be undone",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/databank.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const documents = sqliteTable("documents", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/databank/persistence/queries.ts":
          'import { documents } from "@orb/db";\nexport async function dropMany(db: Db, ids: string[]) {\n  return db.delete(documents).where(inArray(documents.id, ids));\n}\n',
      },
      expect: { count: 1 },
      why: "the SET form — `inArray(T.id, ids)` is exactly as unscoped as `eq`, and covers the batch/bulk write paths",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/theme.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const themeClusters = sqliteTable("theme_clusters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/discovery/themes/generate.ts":
          'import { themeClusters } from "@orb/db";\nexport async function wipe(db: Db) {\n  return db.delete(themeClusters);\n}\n',
      },
      expect: { count: 1 },
      why: "the UNBOUNDED write — the shape the READ half deliberately ignores (no WHERE = a list read) and the write half must NOT: with no predicate at all this deletes every owner's rows",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters as characterTable } from "@orb/db";\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(characterTable).set({ name }).where(eq(characterTable.id, id));\n}\n',
      },
      expect: { count: 1, token: "characterTable" },
      why: "an import alias is still the same owner-scoped table — renaming the local binding cannot bypass the write family",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nconst table = characters;\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(table).set({ name }).where(eq(table.id, id));\n}\n',
      },
      expect: { count: 1, token: "table" },
      why: "a same-file immutable alias still resolves to the canonical owner-scoped table; a local rename cannot erase the table's tenancy class",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nlet table = characters;\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(table).set({ name }).where(eq(table.id, id));\n}\n',
      },
      expect: { count: 1, token: "table" },
      why: "#769 — the DECLARATION KIND is irrelevant to what a binding names. `let` resolved to nothing while `const` resolved fine, so one keyword silently walked every by-id write past the tenancy check while the const control proved the gate 'worked'",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nvar table = characters;\nexport async function dropCard(db: Db, id: string) {\n  return db.delete(table).where(eq(table.id, id));\n}\n',
      },
      expect: { count: 1, token: "table" },
      why: "#769's `var` twin on the DELETE arm — the destructive half of the same bypass. Proving only `let` would leave the older keyword as a live hole",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          "export async function renameAny(db: Db, table: AnyTable, id: string, name: string) {\n  return db.update(table).set({ name }).where(eq(table.id, id));\n}\n",
      },
      expect: { count: 1, token: "table", messageIncludes: UNRESOLVABLE },
      why: "the UNRESOLVABLE arm — a table-generic write. The gate cannot see whether this is an (a)-class table, and an unreadable target is UNPROVEN, not clean: returning silently here is the same failure mode #769 shipped, one indirection further out",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nconst a = b;\nconst b = a;\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(a).set({ name }).where(eq(a.id, id));\n}\n',
      },
      expect: { count: 1, token: "a", messageIncludes: UNRESOLVABLE },
      why: "the CYCLE/depth refusal REPORTS rather than exempts (the gate-family review's remaining half): the resolver's `seen` set makes an alias cycle terminate, and terminating with 'I could not read it' must not read as 'nothing here'",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function renameCard(db: Db, id: string, ownerId: string, name: string) {\n  return db.update(characters).set({ name }).where(and(eq(characters.id, id), eq(ownerId, ownerId)));\n}\n',
      },
      expect: { count: 1, token: "characters" },
      why: "unrelated ownerId text is not a target-table owner predicate; a tautology over the caller value cannot scope the write",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function renameOwned(db: Db, id: string, ownerId: string, name: string) {\n  return db.update(characters).set({ name }).where(and(eq(characters.id, id), eq(characters.ownerId, ownerId)));\n}\n',
      },
      why: "arm 1 — the owner predicate IN THE WHERE: a non-owner's write moves 0 rows, which is the same answer as an absent row",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/theme.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const themeClusters = sqliteTable("theme_clusters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/discovery/themes/generate.ts":
          'import { themeClusters } from "@orb/db";\nexport async function replaceOwner(db: Db, ownerId: string) {\n  return db.delete(themeClusters).where(eq(themeClusters.ownerId, ownerId));\n}\n',
      },
      why: "the owner predicate ALONE (no id) is the partition-replace shape — arm 1 does not require a by-id predicate to be present",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\n// @orb-waive owner-scoped-writes(characters): the verb loaded the row through `fetchOwned` before calling this (a foreign id throws NOT_FOUND before any write). Ends if a caller ever reaches it without that load.\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(characters).set({ name }).where(eq(characters.id, id));\n}\n',
      },
      why: "arm 2 — the central positioned waiver WITH its reason: the authority is chained in the caller's control flow, which no structural gate can see. The reason is the deliverable; the engine's own liveness reconciliation is what stops it outliving the write",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id") });\n',
        "packages/server/src/domain/chat/persistence/canon-write.ts":
          'import { chats } from "@orb/db";\nexport async function touch(db: Db, id: string) {\n  return db.update(chats).set({ updatedAt: 1 }).where(eq(chats.id, id));\n}\n',
      },
      why: "DECLARED LIMIT: a (b) MEMBERSHIP-scoped table is out of scope here. Its rung is `requireParticipant`/`requireHost`, resolved in the verb's control flow — unprovable structurally, and the cross-tenant behavioral sweep stays that proof",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tag.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chatTags = sqliteTable("chat_tags", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/tag/persistence/queries.ts":
          'import { chatTags } from "@orb/db";\nexport async function retag(db: Db, from: string, to: string) {\n  return db.update(chatTags).set({ tagId: to }).where(eq(chatTags.tagId, from));\n}\n',
      },
      why: "DECLARED LIMIT: a write predicated on some OTHER column (here the tag-merge's `tagId`) is a different question — its blast radius is that partition, not 'whatever id the caller named'. Widening to arbitrary predicates would flag every partition write in the tree",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/plugin.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nexport async function put(db: Db, row: Row) {\n  return db.insert(pluginKv).values(row).onConflictDoUpdate({ target: [pluginKv.pluginId, pluginKv.key], set: { value: row.value } });\n}\n',
      },
      why: "DECLARED LIMIT, now SUPERSEDED rather than assumed: an UPSERT is an update in disguise, but its collision is decided by the conflict TARGET, not a WHERE — so it is judged by the sibling gate `owner-scoped-upserts` (which reds this exact shape unless the owner reaches the target/targetWhere/setWhere). This row stays as the two gates' SEAM: it is what stops this reader from silently widening onto a shape it cannot judge",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters as characterTable } from "@orb/db";\nexport async function renameOwned(db: Db, id: string, ownerId: string, name: string) {\n  return db.update(characterTable).set({ name }).where(and(eq(characterTable.id, id), eq(characterTable.ownerId, ownerId)));\n}\n',
      },
      why: "the alias resolver returns the local binding, so an owner predicate written through that alias remains a safe arm",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nconst table = characters;\nexport async function renameOwned(db: Db, id: string, ownerId: string, name: string) {\n  return db.update(table).set({ name }).where(and(eq(table.id, id), eq(table.ownerId, ownerId)));\n}\n',
      },
      why: "the local canonical-table alias is safe when the WHERE structurally predicates that same binding's owner column",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nlet table = characters;\nexport async function renameOwned(db: Db, id: string, ownerId: string, name: string) {\n  return db.update(table).set({ name }).where(and(eq(table.id, id), eq(table.ownerId, ownerId)));\n}\n',
      },
      why: "the #769 widening is two-sided: resolving a `let` alias must ACCEPT the guarded write as readily as it reds the unguarded one. A widening that only ever added findings would be a different (louder) lie",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id") });\n',
        "packages/server/src/domain/chat/persistence/canon-write.ts":
          'import { chats } from "@orb/db";\nlet table = chats;\nexport async function touch(db: Db, id: string) {\n  return db.update(table).set({ updatedAt: 1 }).where(eq(table.id, id));\n}\n',
      },
      why: "the DENOMINATOR arm: an alias of a (b) table READS fine and is simply out of scope — it must not fall into the unresolvable arm. Without the full schema-ident set, 'not (a)-class' and 'unreadable' would be the same answer and every non-(a) write in the tree would red",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/credentials/health/cache.ts":
          "export function evict(cache: Map<string, E>, oldest: string) {\n  return cache.delete(oldest);\n}\n",
      },
      why: "DECLARED LIMIT: a CHAIN-FREE unresolvable call is out of the third arm. `cache.delete(key)` / `hash.update(bytes)` are byte-identical in AST to an unbounded `db.delete(T)`, and the pure-AST harness builds no type graph to separate them — 72 such calls live in packages/server/src (measured 2026-08-27), all chain-free, so the drizzle-builder chain is the fence",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          "// @orb-waive owner-scoped-writes(table): the caller resolved the row owned and passes the table only to share one UPDATE body. Ends the day this helper takes an id it did not load.\nexport async function renameAny(db: Db, table: AnyTable, id: string, name: string) {\n  return db.update(table).set({ name }).where(eq(table.id, id));\n}\n",
      },
      why: "ONE vocabulary per gate: the unresolvable arm answers the same question the by-id arm does ('who authorized this write'), so it takes the SAME central waiver position rather than minting a fourth",
    },
  ],
});
