// Gate: owner-scoped-writes — the WRITE half of `owner-scoped-reads`. An `update`/`delete` of an
// `ownerId`-class table (table-scoping-class (a)) must put the owner IN THE WHERE, or carry an
// `// @owner-scope-write-ok: <reason>` marker naming WHO authorized the id. Two shapes bite: a by-id write
// (`eq(T.id, …)`/`inArray(T.id, …)` with no owner predicate) and an UNBOUNDED write (no `.where` at all — a
// whole-table mutation, which on a tenant table is every owner's rows). TWO-SIDED: a marker guarding no
// unscoped write is RED. DECLARED LIMITS: no post-fetch arm (a write's guard sits in the CALLER's control
// flow, which is unprovable structurally — that is what the marker records), and an `onConflictDoUpdate`
// upsert is out of scope HERE because the sibling `owner-scoped-upserts` owns it (its collision is a UNIQUE
// -index question, not a WHERE predicate — a third gate with its own `@owner-scope-upsert-ok:` vocabulary).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";
import { markedFunctions, markerKeyFor, predicatesOwnId, whereArgOf } from "../tenancy-read.ts";
import { ownerScopedTableIdents } from "./table-scoping-class.ts";

const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const SERVER_SRC = "packages/server/src/";
const GATE_SELF = "scripts/check/gates/owner-scoped-writes.ts";
const OWNER_COL = "ownerId";
/** The drizzle write verbs. A `Set`, not a `switch`: the two arms are judged identically — what differs is
 *  only which statement the reader anchors on, and both anchor the same way. */
const WRITE_VERBS = new Set(["update", "delete"]);
/** The two-sided comment marker, DISTINCT from the read half's `@owner-scope-ok:` on purpose: a read
 *  exemption and a write exemption answer different questions ("who may see this row" vs "who may change
 *  it"), and one vocabulary would let a read's promise silence a write — while each gate's stale arm would
 *  red on the other's markers. House grammar (`marker:\s*\S`): the reason is REQUIRED, a bare marker exempts
 *  NOTHING. */
const MARKER_RE = /@owner-scope-write-ok:\s*\S/u;
const MARKER = "@owner-scope-write-ok";

const MESSAGE =
  "an update/delete of an ownerId-scoped table with NO owner predicate — this is the cross-tenant WRITE " +
  "hole: whatever id the caller supplies gets mutated, whoever owns it (and with no `.where` at all, EVERY " +
  "owner's rows do). An owner-scoped table (table-scoping-class class (a)) resolves tenancy through its " +
  "`ownerId`, so the write has to say so — or say who already proved it. The owner-scoped read this pairs " +
  "with is packages/db/src/kit/fetch-owned.ts";

const FIX =
  "pick the arm that fits: (1) put the owner IN THE WHERE — `and(eq(T.id, id), eq(T.ownerId, ownerId))` (a " +
  "non-owner's write moves 0 rows instead of a stranger's row), which is the right answer whenever the owner " +
  "is already in scope at the query; (2) if the authority is genuinely chained ABOVE this statement — the " +
  "verb loaded the row owned first, a host/roster rung (D18) that is STRICTER than the stamp already passed, " +
  `or the ids are the engine's own (D20 un-principal) — mark it \`// ${MARKER}: <reason>\` on the function. ` +
  "The reason must name WHO authorized the id and what would end the exemption. A marker is not a shrug: it " +
  "is the promise the next caller inherits, and it goes RED the day the write it guards disappears.";

const STALE = (fn: string, file: string): string =>
  `\`${MARKER}\` marker on \`${fn}\` (${file}) guards NO unscoped write any more — delete the stale marker. ` +
  "A stale exemption is a loaded gun: the next unscoped write in this function inherits a promise nobody " +
  "granted it.";

const BLIND =
  "owner-scoped-writes derived ZERO ownerId-class tables from the schema — the gate has gone blind (the " +
  "schema shape or the class registry moved, and a gate that matches nothing reports ✓ forever). Re-derive " +
  "it in scripts/check/gates/table-scoping-class.ts (`ownerScopedTableIdents`)";

/** The (a)-class drizzle table identifiers, derived per run by `table-scoping-class`. */
let ownerTableIdents = new Set<string>();
/** Functions carrying the marker → their (file, name), for the stale arm. */
const markedFns = new Map<string, { readonly fn: string; readonly file: string }>();
/** Marker keys that actually guarded an unscoped write. */
const markersUsed = new Set<string>();

/** The (a)-class table this call mutates — `db.update(T)` / `db.delete(T)` / the same on a `tx` receiver —
 *  or undefined for every other call. */
function writeTargetIdent(node: Node): string | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = node.getExpression();
  if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && WRITE_VERBS.has(callee.getName()))) {
    return;
  }
  const arg = node.getArguments()[0];
  if (arg === undefined || !arg.isKind(SyntaxKind.Identifier) || !ownerTableIdents.has(arg.getText())) {
    return;
  }
  return arg.getText();
}

export const gate: GateDescriptor = {
  name: "owner-scoped-writes",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Core-Path-Registry.md D20/D23; the `fetchOwned` contract (packages/db/src/kit/fetch-owned.ts)",
  status: "active",
  scopeSafety: "whole-project", // the table set is derived from another package; the marker ratchet is tree-wide
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes(SERVER_SRC),
  kinds: [SyntaxKind.CallExpression],

  begin: (ctx) => {
    markedFns.clear();
    markersUsed.clear();
    ownerTableIdents = ownerScopedTableIdents(ctx);
  },

  visit: (node, sf, ctx) => {
    const ident = writeTargetIdent(node);
    if (ident === undefined) {
      return;
    }
    const where = whereArgOf(node);
    // NO WHERE AT ALL is the widest form of the hole, not an exemption: on a read it is a list, on a write it
    // is every owner's rows. BY-ID is the read half's shape — whatever id the caller supplies gets written.
    // Any OTHER predicate (a partition column, a status guard on its own) is a different, unenforced question.
    const whereText = where?.getText() ?? "";
    if (whereText.includes(OWNER_COL)) {
      return; // arm 1 — the owner is IN THE WHERE (with or without a by-id predicate beside it)
    }
    if (where !== undefined && !predicatesOwnId(whereText, ident)) {
      return;
    }
    const markerKey = markerKeyFor(node, sf, MARKER_RE);
    if (markerKey !== undefined) {
      markersUsed.add(markerKey);
      return; // arm 2 — a cited marker
    }
    ctx.report(node, { token: ident, offset: 0 });
  },

  visitFile: (sf) => {
    // Record every marker in scanned scope so the stale arm sees the ones guarding nothing. The key is
    // (file, marked-function) — the SAME key `visit` marks as USED, so the two halves can never drift.
    for (const marked of markedFunctions(sf, MARKER_RE)) {
      markedFns.set(marked.key, { fn: marked.fn, file: marked.file });
    }
  },

  finalize: (ctx) => {
    // Both arms are WHOLE-TREE claims. Anchor on the real schema barrel — a conformance mini-project carries
    // neither the full schema nor the full server tree, and would "prove" every marker dead (§4.5).
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, SCHEMA_BARREL)) {
      return;
    }
    if (ownerTableIdents.size === 0) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND });
    }
    for (const [key, { fn, file }] of markedFns) {
      if (!markersUsed.has(key)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE(fn, file) });
      }
    }
  },

  mustFlag: [
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(characters).set({ name }).where(eq(characters.id, id));\n}\n',
      },
      expect: { count: 1, messageIncludes: "cross-tenant WRITE hole" },
      why: "the founding shape — a bare `eq(T.id, x)` UPDATE on an ownerId-scoped table mutates whoever's row the caller names",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function dropCard(db: Db, id: string) {\n  return db.delete(characters).where(eq(characters.id, id));\n}\n',
      },
      expect: { count: 1 },
      why: "the DELETE form — the destructive twin of the same hole. A gate covering only `update` would ship a blind spot on the arm that cannot be undone",
    },
    {
      files: {
        "packages/db/src/schema/databank.ts": 'export const documents = sqliteTable("documents", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/databank/persistence/queries.ts":
          'import { documents } from "@orb/db";\nexport async function dropMany(db: Db, ids: string[]) {\n  return db.delete(documents).where(inArray(documents.id, ids));\n}\n',
      },
      expect: { count: 1 },
      why: "the SET form — `inArray(T.id, ids)` is exactly as unscoped as `eq`, and covers the batch/bulk write paths",
    },
    {
      files: {
        "packages/db/src/schema/theme.ts": 'export const themeClusters = sqliteTable("theme_clusters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/discovery/themes/generate.ts":
          'import { themeClusters } from "@orb/db";\nexport async function wipe(db: Db) {\n  return db.delete(themeClusters);\n}\n',
      },
      expect: { count: 1 },
      why: "the UNBOUNDED write — the shape the READ half deliberately ignores (no WHERE = a list read) and the write half must NOT: with no predicate at all this deletes every owner's rows",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\n// @owner-scope-write-ok:\nexport async function dropCard(db: Db, id: string) {\n  return db.delete(characters).where(eq(characters.id, id));\n}\n',
      },
      expect: { count: 1 },
      why: "a BARE marker (no reason after the colon) exempts NOTHING — a rubber stamp is not an exemption (GATE-AUTHORING §4.3)",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\n// @owner-scope-ok: the read half authorized this id.\nexport async function dropCard(db: Db, id: string) {\n  return db.delete(characters).where(eq(characters.id, id));\n}\n',
      },
      expect: { count: 1 },
      why: "a READ marker does not exempt a WRITE — the vocabularies are separate on purpose, so a promise about who may SEE a row can never silence who may DESTROY it",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function renameOwned(db: Db, id: string, ownerId: string, name: string) {\n  return db.update(characters).set({ name }).where(and(eq(characters.id, id), eq(characters.ownerId, ownerId)));\n}\n',
      },
      why: "arm 1 — the owner predicate IN THE WHERE: a non-owner's write moves 0 rows, which is the same answer as an absent row",
    },
    {
      files: {
        "packages/db/src/schema/theme.ts": 'export const themeClusters = sqliteTable("theme_clusters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/discovery/themes/generate.ts":
          'import { themeClusters } from "@orb/db";\nexport async function replaceOwner(db: Db, ownerId: string) {\n  return db.delete(themeClusters).where(eq(themeClusters.ownerId, ownerId));\n}\n',
      },
      why: "the owner predicate ALONE (no id) is the partition-replace shape — arm 1 does not require a by-id predicate to be present",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\n// @owner-scope-write-ok: the verb loaded the row through `fetchOwned` before calling this (a foreign id throws NOT_FOUND before any write). Ends if a caller ever reaches it without that load.\nexport async function renameCard(db: Db, id: string, name: string) {\n  return db.update(characters).set({ name }).where(eq(characters.id, id));\n}\n',
      },
      why: "arm 2 — a marker WITH its reason: the authority is chained in the caller's control flow, which no structural gate can see. The reason is the deliverable; the two-sided stale arm is what stops it outliving the write",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts": 'export const chats = sqliteTable("chats", { id: text("id") });\n',
        "packages/server/src/domain/chat/persistence/canon-write.ts":
          'import { chats } from "@orb/db";\nexport async function touch(db: Db, id: string) {\n  return db.update(chats).set({ updatedAt: 1 }).where(eq(chats.id, id));\n}\n',
      },
      why: "DECLARED LIMIT: a (b) MEMBERSHIP-scoped table is out of scope here. Its rung is `requireParticipant`/`requireHost`, resolved in the verb's control flow — unprovable structurally, and the cross-tenant behavioral sweep stays that proof",
    },
    {
      files: {
        "packages/db/src/schema/tag.ts": 'export const chatTags = sqliteTable("chat_tags", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/tag/persistence/queries.ts":
          'import { chatTags } from "@orb/db";\nexport async function retag(db: Db, from: string, to: string) {\n  return db.update(chatTags).set({ tagId: to }).where(eq(chatTags.tagId, from));\n}\n',
      },
      why: "DECLARED LIMIT: a write predicated on some OTHER column (here the tag-merge's `tagId`) is a different question — its blast radius is that partition, not 'whatever id the caller named'. Widening to arbitrary predicates would flag every partition write in the tree",
    },
    {
      files: {
        "packages/db/src/schema/plugin.ts": 'export const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nexport async function put(db: Db, row: Row) {\n  return db.insert(pluginKv).values(row).onConflictDoUpdate({ target: [pluginKv.pluginId, pluginKv.key], set: { value: row.value } });\n}\n',
      },
      why: "DECLARED LIMIT, now SUPERSEDED rather than assumed: an UPSERT is an update in disguise, but its collision is decided by the conflict TARGET, not a WHERE — so it is judged by the sibling gate `owner-scoped-upserts` (which reds this exact shape unless the owner reaches the target/targetWhere/setWhere). This row stays as the two gates' SEAM: it is what stops this reader from silently widening onto a shape it cannot judge",
    },
  ],
};
