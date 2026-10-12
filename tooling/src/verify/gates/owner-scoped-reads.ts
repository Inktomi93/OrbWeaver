// Gate: owner-scoped-reads — a by-id READ of an `ownerId`-class table (table-scoping-class (a)) must put the
// owner IN THE WHERE (`fetchOwned`, or `eq(T.ownerId, …)`), or resolve it POST-FETCH (the loadWorkload
// F3-AUTHZ arm: project the ownerId and compare it — a distinct LEGAL shape, recognized here), or carry a
// central `// @orb-waive owner-scoped-reads(<ident>): <reason>` waiver. The post-fetch comparison must read
// the result binding's ownerId; an unrelated owner comparison in the same function proves nothing. A bare
// `eq(T.id, x)` is the hole. DECLARED LIMIT: READS only — the WRITE half is the sibling gate
// `owner-scoped-writes` (its own waiver position), and membership-rung completeness on (b)-class tables is
// control-flow-dependent (the cross-tenant behavioral sweep stays that proof). A post-fetch arm is valid only
// when a rejecting guard compares that exact result (or a one-hop alias) with the caller's owner binding; a
// self-comparison, unrelated owner, or unused comparison is RED.
// A JOINED owner-scoped table is a candidate too: it needs an owner predicate on itself, or a conjunct
// `eq(J.col, T.col)` along a declared FK from another bound row that points AT it (Spine-Identity-and-Auth
// §2b), and then the by-id rule above. A join on a caller value or along a fan-out FK is the hole. The verb
// is judged by its drizzle declaration; an unresolved one fails closed. Owner predicates are read through one
// hop of a predicate helper, and only when every value the helper returns carries them.
//
// MARKER TRANSLATION COMPLETE (#1944, 2026-09-11): this conversion dropped the legacy function-level
// `@owner-scope-ok` comment marker and the translation lane rewrote every live site into the central
// `@orb-waive owner-scoped-reads(<table>): <reason>` grammar, with the reported TABLE identifier as the
// position. A real run over the current population reports 0 blocking findings and 26 waived, and the
// central authority reports no unused, malformed, unknown-policy or over-broad marker. The only
// `@owner-scope-ok` text left on the tree is PROSE inside explanatory comments (it names the retired
// spelling); no live marker carries it. Ends if a new site is authored with the legacy spelling — the
// central engine does not recognize it under any grammar, so it would suppress nothing silently.
//
// The legacy `owner-scoped-reads` descriptor (04978142566ff3412b204f73d849f0b9bf301154) carried the
// `@owner-scope-ok` marker grammar and its own inline schema read before this conversion.
//
// FAMILY `tenancy-scope` — the shared reader is `lib/tenancy-scope.ts` (`ownerScopedTableIdents` for the
// (a)-class set, `reportBlindWhenEmpty` for the zero-derivation refusal), plus `lib/tenancy-read.ts` for
// the call SHAPES this member and its two write siblings ask about. All four members answer "which tables
// are ownerId-scoped" from the one registry, so the read half and the write half cannot disagree about
// which table is even in scope — which is precisely how a cross-tenant hole hides.
// POPULATION PORT: the same set, byte-for-byte in membership. The legacy
// `scanRoot: (p) => p.includes("packages/server/src/")` (04978142566ff3412b204f73d849f0b9bf301154)
// becomes `@server`, which is `packages/server/src/`; the only change is substring matching becoming
// anchored, and 1560 tracked paths contain that segment while the same 1560 begin with it. The
// derivation and its measurement have ONE home, in the shared reader's own header.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `owner-scoped-reads` descriptor at 04978142566ff3412b204f73d849f0b9bf301154, the parent of the conversion
// `5e6b7d09df` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,367 harness candidates at that tree (`git ls-tree` ∩ `floor/compiler/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 1,493 and final `population` admits 1,493. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/server/src/domain/admin/__cbbhr_in_context.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import type { ReadAnchor } from "../contract/tenancy.ts";
import { readDrizzleClientCall } from "../lib/drizzle-client-call.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";
import { chainsThroughForeignKey, predicateHolds, readAnchorOf } from "../lib/tenancy-join.ts";
import { enclosingFn, hasPostFetchFilter, predicatesOwnId, predicatesTableColumn, tableTargetOf, whereArgOf } from "../lib/tenancy-read.ts";
import { foreignKeyEdges, ownerScopedTableIdents, reportBlindWhenEmpty, schemaTableIdents } from "../lib/tenancy-scope.ts";

const OWNER_COL = "ownerId";

const MESSAGE =
  "a by-id READ of an ownerId-scoped table with NO owner predicate — this is the cross-tenant read hole: " +
  "whatever id the caller supplies comes back, whoever owns it. An owner-scoped table (table-scoping-class " +
  "class (a)) resolves tenancy through its `ownerId`, so the read has to say so. The one owner-scoped fetch " +
  "is packages/db/src/query/fetch-owned.ts";

const FIX =
  "pick the arm that fits: (1) put the owner IN THE WHERE — `fetchOwned(db, T, id, principal.userId)` or " +
  "`and(eq(T.id, id), eq(T.ownerId, ownerId))` (a non-owner gets undefined, never a row); (2) the POST-FETCH " +
  "arm — project `T.ownerId` and compare it, collapsing a foreign row to the SAME leak-free NOT_FOUND as an " +
  "absent one (`workloads/verbs/get.ts` F3-AUTHZ is the archetype); (3) if the read is genuinely un-principal " +
  "(a trusted system consumer, D20) or its ids come from already-authorized canon, add " +
  "`// @orb-waive owner-scoped-reads(<ident>): <reason>` on the exact declaration — the reason must say WHO " +
  "authorized the ids and what would end the exemption.";

const BLIND =
  "owner-scoped-reads derived ZERO ownerId-class tables from the schema — the gate has gone blind (the " +
  "schema shape or the class registry moved, and a gate that matches nothing reports ✓ forever). Re-derive " +
  "it in tooling/src/verify/gates/table-scoping-class.ts";

const JOIN_MESSAGE =
  "a join binds an ownerId-scoped table with NO FK chain and NO owner predicate — the cross-tenant read hole " +
  "through a join: the joined row is whatever the ON condition names, whoever owns it. A joined owner-scoped " +
  "table inherits scope only along a declared foreign key from another row of the read (Spine-Identity-and-Auth " +
  "§2b), or by an `eq(T.ownerId, …)` predicate on the joined table itself";

/** The schema answers `evaluate` needs, derived once per run. */
interface ReadScope {
  readonly ownerTables: ReadonlySet<string>;
  readonly schemaTables: ReadonlySet<string>;
  readonly fkEdges: ReadonlySet<string>;
}

// The join rows' shared schema: `chats` is (b) membership-scoped; `personas` and `workloads` are (a)
// ownerId-scoped. `chats.anchorPersonaId -> personas.id` points AT the persona (a chain), while
// `workloads.chatId -> chats.id` points away from the workload (a fan-out to every owner's workloads).
const CHAT_PERSONA_SCHEMA = {
  "packages/db/src/schema/chat.ts":
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const personas = sqliteTable("personas", { id: text("id").primaryKey(), ownerId: text("owner_id") });\nexport const chats = sqliteTable("chats", { id: text("id").primaryKey(), title: text("title"), anchorPersonaId: text("anchor_persona_id").references(() => personas.id) });\nexport const workloads = sqliteTable("workloads", { id: text("id").primaryKey(), ownerId: text("owner_id"), chatId: text("chat_id").references(() => chats.id) });\n',
} as const;
const PERSONA_READ_PATH = "packages/server/src/domain/persona/persistence/queries.ts";
const PERSONA_READ_HEAD = 'import { and, eq, or } from "drizzle-orm";\nimport { chats, personas, workloads } from "@orb/db";\n';

/** One persona read over the shared schema; `chain` is the drizzle builder text after `db.select()`. */
function personaRead(chain: string): Readonly<Record<string, string>> {
  return {
    ...CHAT_PERSONA_SCHEMA,
    [PERSONA_READ_PATH]: `${PERSONA_READ_HEAD}export async function loadPersona(db: Db, chatId: string, personaId: string, ownerId: string) {\n  return db.select()${chain}.limit(1);\n}\n`,
  };
}

/** The finding message for an owner-scoped table this read binds, or undefined when one safe arm holds. */
function unscopedReadMessage(anchor: ReadAnchor, ident: string, scope: ReadScope): string | undefined {
  const where = whereArgOf(anchor.call);
  const on = anchor.kind === "join" ? anchor.on : undefined;
  if (predicateHolds([on, where], (conjunct) => predicatesTableColumn(conjunct, ident, OWNER_COL))) {
    return; // arm 1 — the owner predicate names this exact table
  }
  if (anchor.kind === "join" && !chainsThroughForeignKey([on, where], ident, scope.schemaTables, scope.fkEdges)) {
    return JOIN_MESSAGE;
  }
  // BY-ID: `eq(T.id, …)` or `inArray(T.id, …)` — both are "whatever id the caller supplies comes back". With
  // no WHERE, or none on the id, it is a list read (from) or a row the FK chain already selected (join).
  if (where === undefined || !predicatesOwnId(where.getText(), ident)) {
    return;
  }
  return hasPostFetchFilter(anchor.call, enclosingFn(anchor.call)) ? undefined : MESSAGE; // arm 2 — the F3-AUTHZ post-fetch filter
}

export const gate = defineGate({
  id: "owner-scoped-reads",
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
    // The walk records anchors without judging: the schema fact, and so the (a)-class set, is ready only in `evaluate`.
    const anchors: ReadAnchor[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            const anchor = readAnchorOf(node);
            if (anchor !== undefined) {
              anchors.push(anchor);
            }
          },
        },
      ],
      evaluate: () => {
        const schemaFact = ctx.fact(drizzleSchemaFact).schema();
        recordReadySchemaFact(ctx, schemaFact);
        const scope: ReadScope = {
          ownerTables: ownerScopedTableIdents(schemaFact.value),
          schemaTables: schemaTableIdents(schemaFact.value),
          fkEdges: foreignKeyEdges(schemaFact.value),
        };
        for (const anchor of anchors) {
          const target = tableTargetOf(anchor.table, scope.ownerTables, scope.schemaTables);
          // The verb is judged by its declaration: an unresolved one fails closed, only a provably foreign one is acquitted.
          if (target?.kind !== "in-class" || readDrizzleClientCall(anchor.call).kind === "foreign") {
            continue;
          }
          const message = unscopedReadMessage(anchor, target.ident, scope);
          if (message !== undefined) {
            ctx.report.node(anchor.table, { token: target.ident, offset: 0, message });
          }
        }
        reportBlindWhenEmpty(ctx, schemaFact, scope.ownerTables, BLIND);
      },
    };
  },

  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (unrelated.ownerId !== caller) return null;\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "an unrelated `.ownerId` comparison in the same function cannot authorize the row returned by this unscoped read",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (rows[0]?.ownerId !== rows[0]?.ownerId) return null;\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "a fetched owner compared with itself is a tautology, not a relationship to the caller's authorized owner",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  const sameOwner = rows[0]?.ownerId === caller;\n  void sameOwner;\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "a correct owner relationship that does not control a rejecting guard leaves the fetched row free to egress",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (rows[0]?.ownerId !== unrelated.ownerId) return null;\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "the fetched owner must relate to the caller's authorized owner, not merely to a different ambient row's ownerId",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (rows[0]?.ownerId !== caller) {\n    auditForeignRead();\n  }\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "a mismatch branch that records but does not reject is non-protective — the foreign row still reaches the return",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (rows[0]?.ownerId !== caller) return rows[0];\n  return null;\n}\n',
      },
      expect: { count: 1 },
      why: "a mismatch branch that returns the fetched result is egress, not rejection, even though the comparison itself is correct",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string, caller: string, debug: boolean) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (rows[0]?.ownerId !== caller) {\n    if (debug) return rows[0];\n    return null;\n  }\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "a block whose final statement rejects is still unsafe when an earlier branch can return the fetched foreign row",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string) {\n  return db.select().from(characters).where(eq(characters.id, id)).limit(1);\n}\n',
      },
      expect: { count: 1, messageIncludes: "cross-tenant read hole" },
      why: "the founding shape — a bare `eq(T.id, x)` on an ownerId-scoped table returns whoever's row the caller names",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/databank.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const documents = sqliteTable("documents", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/databank/persistence/queries.ts":
          'import { documents } from "@orb/db";\nexport async function loadMany(db: Db, ids: string[]) {\n  return db.select().from(documents).where(inArray(documents.id, ids));\n}\n',
      },
      expect: { count: 1 },
      why: "the SET form of the same hole — `inArray(T.id, ids)` is exactly as unscoped as `eq`, and a gate covering only `eq` would ship a confident blind spot",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import * as schema from "@orb/db";\nexport async function loadCard(db: Db, id: string) {\n  return db.select().from(schema.characters).where(eq(schema.characters.id, id)).limit(1);\n}\n',
      },
      expect: { count: 1 },
      why: "a table named through `import * as schema` is the same owner-scoped table: the anchor resolves it by its exported member, not by an identifier argument",
    },
    {
      mode: "types",
      files: personaRead(".from(personas).where(eq(personas.id, personaId))"),
      expect: { count: 1 },
      why: "the positive control over the join rows' own schema: a bare by-id read of the persona table flags, so a silent join row below is the join reader's verdict, not a fixture artifact",
    },
    {
      mode: "types",
      files: personaRead(".from(chats).innerJoin(personas, eq(personas.id, personaId)).where(eq(chats.id, chatId))"),
      expect: { count: 1, messageIncludes: "join" },
      why: "a JOINED owner-scoped table bound to a caller-supplied id returns whichever persona the caller names; the chat filter scopes the chat row, never the joined persona",
    },
    {
      mode: "types",
      files: personaRead(".from(chats).leftJoin(personas, eq(personas.id, personaId)).where(eq(chats.id, chatId))"),
      expect: { count: 1, messageIncludes: "join" },
      why: "the leftJoin spelling of the caller-id join: a left join still returns the named persona beside the chat row",
    },
    {
      mode: "types",
      files: personaRead(".from(chats).innerJoin(personas, eq(personas.id, chats.title)).where(eq(chats.id, chatId))"),
      expect: { count: 1, messageIncludes: "join" },
      why: "a column-to-column join is a chain only through a DECLARED foreign key; `chats.title` is no reference to a persona, so the joined row is not inherited from the chat",
    },
    {
      mode: "types",
      files: personaRead(".from(chats).innerJoin(personas, eq(personas.id, chats.anchorPersonaId)).where(eq(personas.id, personaId))"),
      expect: { count: 1 },
      why: "the FK chain does not scope a joined table the WHERE selects by its OWN id: any chat anchored on the named persona returns it, so this is the by-id hole on the joined table",
    },
    {
      mode: "types",
      files: personaRead(".from(chats).innerJoin(workloads, eq(workloads.chatId, chats.id)).where(eq(chats.id, chatId))"),
      expect: { count: 1, messageIncludes: "join" },
      why: "a join along an FK that points AWAY from the joined table fans out: every owner's workload referencing the chat comes back, so the reverse edge is no inheritance",
    },
    {
      mode: "types",
      files: personaRead(
        ".from(chats).innerJoin(personas, or(eq(personas.id, chats.anchorPersonaId), eq(personas.id, personaId))).where(eq(chats.id, chatId))",
      ),
      expect: { count: 1, messageIncludes: "join" },
      why: "an FK term inside `or(…)` binds nothing: the other disjunct admits the caller-named persona, so only a conjunct can carry the chain",
    },
    {
      mode: "types",
      files: {
        ...CHAT_PERSONA_SCHEMA,
        [PERSONA_READ_PATH]: `${PERSONA_READ_HEAD}function ownedPersona(ownerId?: string) {\n  if (ownerId === undefined) {\n    return eq(personas.id, personas.id);\n  }\n  return eq(personas.ownerId, ownerId);\n}\nexport async function loadPersona(db: Db, chatId: string, personaId: string, ownerId: string) {\n  return db.select().from(chats).innerJoin(personas, eq(personas.id, personaId)).where(and(eq(chats.id, chatId), ownedPersona(ownerId))).limit(1);\n}\n`,
      },
      expect: { count: 1, messageIncludes: "join" },
      why: "a predicate helper proves the owner only when EVERY value it can return carries it; a helper with an unscoped branch is not an owner predicate",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadOwned(db: Db, id: string, ownerId: string) {\n  return db.select().from(characters).where(and(eq(characters.id, id), eq(characters.ownerId, ownerId))).limit(1);\n}\n',
      },
      why: "arm 1 — the owner predicate IN THE WHERE (the `fetchOwned` shape): a non-owner gets undefined, never a row",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/workloads.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const workloads = sqliteTable("workloads", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/workloads/persistence/queries.ts":
          'import { workloads } from "@orb/db";\nexport async function loadIt(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(workloads).where(eq(workloads.id, id)).limit(1);\n  if (rows[0]?.ownerId !== caller) {\n    return null;\n  }\n  return rows[0];\n}\n',
      },
      why: "arm 2 — the F3-AUTHZ POST-FETCH filter the census named as a distinct LEGAL class: the owner predicate is resolved in JS, collapsing a foreign row to the same leak-free absent answer",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadIt(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  const card = rows[0];\n  if (card === undefined || card.ownerId !== caller) return null;\n  return card;\n}\n',
      },
      why: "arm 2 through one local alias — `rows -> card -> card.ownerId` is still a relationship to this read result, matching persona/loadOwnedCharacterCard",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/persona.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const personas = sqliteTable("personas", { ownerId: text("owner_id") });\n',
        "packages/server/src/entry/compose/chat.ts":
          'import { personas } from "@orb/db";\nexport const verifyPersonaOwned = async ({ ownerId, personaId }) => {\n  const rows = await db.select({ ownerId: personas.ownerId }).from(personas).where(eq(personas.id, personaId)).limit(1);\n  return rows[0]?.ownerId === ownerId;\n};\n',
      },
      why: "arm 2 as a boolean verifier — returning the exact fetched owner relationship exposes only the authorization verdict, never the row",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\n// @orb-waive owner-scoped-reads(characters): the embeddings indexer is a trusted system consumer (D20), not a user-facing surface.\nexport async function loadById(db: Db, id: string) {\n  return db.select().from(characters).where(eq(characters.id, id)).limit(1);\n}\n',
      },
      why: "arm 3 — the central positioned waiver, WITH its reason: the reason is what a reviewer reads, and the central engine's own liveness/over-broad reconciliation is what stops it outliving the read it guards",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id") });\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          'import { chats } from "@orb/db";\nexport async function loadChat(db: Db, id: string) {\n  return db.select().from(chats).where(eq(chats.id, id)).limit(1);\n}\n',
      },
      why: "DECLARED LIMIT: a (b) MEMBERSHIP-scoped table is out of scope here. Its rung is `requireParticipant`, resolved in the verb's control flow — unprovable structurally, and the cross-tenant behavioral sweep stays that proof",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function listAll(db: Db, ownerId: string) {\n  return db.select().from(characters).where(eq(characters.synthetic, false));\n}\n',
      },
      why: "DECLARED LIMIT: a read with no `T.id` predicate is a LIST read, not the by-id shape — list scoping is a different (unenforced-here) question",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function del(db: Db, id: string) {\n  return db.delete(characters).where(eq(characters.id, id));\n}\n',
      },
      why: "DECLARED LIMIT: READS only — a `db.delete(T)`/`db.update(T)` is invisible to THIS gate by construction. The write half is the sibling gate `owner-scoped-writes`, which owns that shape at its own waiver position; a write must never silence itself with a read-side waiver",
    },
    {
      mode: "types",
      files: personaRead(".from(chats).innerJoin(personas, eq(personas.id, chats.anchorPersonaId)).where(eq(chats.id, chatId))"),
      why: "the FK-chain join (the shipped pinned-persona read): the persona is the one the chat row references through its declared FK, and the chat row is membership-scoped at the verb",
    },
    {
      mode: "types",
      files: personaRead(".from(chats).innerJoin(personas, and(eq(personas.id, personaId), eq(personas.ownerId, ownerId))).where(eq(chats.id, chatId))"),
      why: "a caller-id join that carries the owner predicate on the joined table is scoped: a foreign persona never joins",
    },
    {
      mode: "types",
      files: personaRead(".from(chats).innerJoin(personas, and(eq(chats.id, chatId), eq(personas.id, chats.anchorPersonaId)))"),
      why: "the FK chain inside an `and(…)` conjunct of the ON condition binds the persona to the chat row exactly as a lone term does",
    },
    {
      mode: "types",
      files: {
        ...CHAT_PERSONA_SCHEMA,
        [PERSONA_READ_PATH]: `${PERSONA_READ_HEAD}const ownedPersona = (ownerId: string, personaId: string) => and(eq(personas.id, personaId), eq(personas.ownerId, ownerId));\nexport async function loadPersona(db: Db, chatId: string, personaId: string, ownerId: string) {\n  return db.select().from(chats).innerJoin(personas, ownedPersona(ownerId, personaId)).where(eq(chats.id, chatId)).limit(1);\n}\n`,
      },
      why: "an owner predicate a helper returns on its only path scopes the join exactly as the inline predicate does (the discovery theme-cluster reads)",
    },
    {
      mode: "types",
      files: {
        ...CHAT_PERSONA_SCHEMA,
        [PERSONA_READ_PATH]: `${PERSONA_READ_HEAD}class Rows {\n  innerJoin(table: object, on: object): Rows {\n    return this;\n  }\n}\nexport function shape(rows: Rows, personaId: string) {\n  return rows.innerJoin(personas, eq(personas.id, personaId));\n}\n`,
      },
      why: "the verb is judged by its declaration, not its name: an `innerJoin` a local class declares binds no table into a drizzle read",
    },
  ],
});
