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
//
// MARKER TRANSLATION COMPLETE (#1944, 2026-09-11): this conversion dropped the legacy function-level
// `@owner-scope-ok` comment marker and the translation lane rewrote every live site into the central
// `@orb-waive owner-scoped-reads(<table>): <reason>` grammar, with the reported TABLE identifier as the
// position. A real run over the current population reports 0 blocking findings and 26 waived, and the
// central authority reports no unused, malformed, unknown-policy or over-broad marker. The only
// `@owner-scope-ok` text left on the tree is PROSE inside explanatory comments (it names the retired
// spelling); no live marker carries it. Ends if a new site is authored with the legacy spelling — the
// central engine does not recognize it under any grammar, so it would suppress nothing silently.
import type { Identifier, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";
import { enclosingFn, hasPostFetchFilter, predicatesOwnId, whereArgOf } from "../lib/tenancy-read.ts";
import { reportBlindWhenEmpty } from "../lib/tenancy-scope.ts";
import { ownerScopedTableIdents } from "./table-scoping-class.ts";

const OWNER_COL = "ownerId";

const MESSAGE =
  "a by-id READ of an ownerId-scoped table with NO owner predicate — this is the cross-tenant read hole: " +
  "whatever id the caller supplies comes back, whoever owns it. An owner-scoped table (table-scoping-class " +
  "class (a)) resolves tenancy through its `ownerId`, so the read has to say so. The one owner-scoped fetch " +
  "is packages/db/src/kit/fetch-owned.ts";

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

/** A candidate the WALK records without judging — the schema fact (and therefore the (a)-class set) is not
 *  finished until `evaluate`, so the ownership question is deferred to that phase. Pure-AST fields only. */
interface ReadCandidate {
  readonly callNode: Node; // the `.from(ident)` call
  readonly argNode: Identifier;
  readonly ident: string;
}

/** True when this candidate is a bare by-id read of an owner-scoped table with NO safe arm — the finding. */
function isUnscopedRead(candidate: ReadCandidate): boolean {
  const where = whereArgOf(candidate.callNode);
  if (where === undefined) {
    return false; // no WHERE at all: a full-table/list read, not the by-id shape this gate owns
  }
  const whereText = where.getText();
  // BY-ID: `eq(T.id, …)` or `inArray(T.id, …)` — both are "whatever id the caller supplies comes back".
  if (!predicatesOwnId(whereText, candidate.ident)) {
    return false;
  }
  if (whereText.includes(OWNER_COL)) {
    return false; // arm 1 — the owner is IN THE WHERE
  }
  return !hasPostFetchFilter(candidate.callNode, enclosingFn(candidate.callNode)); // arm 2 — the F3-AUTHZ post-fetch filter
}

/** A `X.from(ident)` call's identifier argument, or undefined for every other shape. */
function readCandidateOf(node: Node): ReadCandidate | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = node.getExpression();
  if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === "from")) {
    return;
  }
  const arg = node.getArguments()[0];
  return arg?.isKind(SyntaxKind.Identifier) === true ? { callNode: node, argNode: arg, ident: arg.getText() } : undefined;
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
    const candidates: ReadCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            const candidate = readCandidateOf(node);
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
        for (const candidate of candidates) {
          if (ownerTableIdents.has(candidate.ident) && isUnscopedRead(candidate)) {
            ctx.report.node(candidate.argNode, { token: candidate.ident, offset: 0, message: MESSAGE });
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
  ],
});
