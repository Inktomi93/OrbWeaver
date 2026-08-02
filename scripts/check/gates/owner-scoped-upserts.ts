// Gate: owner-scoped-upserts — the UPSERT half of the tenancy family (`owner-scoped-reads`/`-writes`). An
// `onConflictDoUpdate` is an UPDATE in disguise whose predicate is the conflict TARGET (a unique index), not a
// `.where`: on an `ownerId`-class table (table-scoping-class (a)) a target that omits the owner column lets a
// caller's insert COLLIDE with a foreign row's unique key and overwrite it. The owner must appear in the
// `target`/`targetWhere`/`setWhere`, or an `// @owner-scope-upsert-ok: <reason>` marker must name who proved
// the target values are the caller's. TWO-SIDED: a marker guarding no ownerless-target upsert is RED.
// DECLARED LIMITS: an unreadable config (a spread/identifier, or drizzle's DEPRECATED ambiguous `where:`)
// fails CLOSED, and `onConflictDoNothing` is out of scope (it overwrites nothing).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";
import { markedFunctions, markerKeyFor, upsertConfigOf } from "../tenancy-read.ts";
import { ownerScopedTableIdents } from "./table-scoping-class.ts";

const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const SERVER_SRC = "packages/server/src/";
const GATE_SELF = "scripts/check/gates/owner-scoped-upserts.ts";
const OWNER_COL = "ownerId";
const INSERT_VERB = "insert";
/** The config properties that can CONSTRAIN which row the DO UPDATE arm touches: the conflict `target` (the
 *  unique index whose collision fires it), the `targetWhere` (a partial-index predicate) and the `setWhere`
 *  (the DO UPDATE's own WHERE — a non-matching row is skipped, not overwritten). `set` is deliberately NOT
 *  here: assigning the owner column in `set` does not constrain WHICH row is written, it RESTAMPS the row that
 *  already lost — the widest form of the hole, not a guard. drizzle's `where:` is deprecated precisely because
 *  it is ambiguous between the two sides, so it cannot prove either. */
const GUARD_PROPS = ["target", "targetWhere", "setWhere"] as const;
/** The two-sided comment marker, DISTINCT from the read half's `@owner-scope-ok:` and the write half's
 *  `@owner-scope-write-ok:`. One shared vocabulary would let a promise about a `.where` silence a conflict
 *  TARGET (a different question with a different proof), and each gate's stale arm would then red on the
 *  others' markers. House grammar (`marker:\s*\S`): the reason is REQUIRED, a bare marker exempts NOTHING. */
const MARKER_RE = /@owner-scope-upsert-ok:\s*\S/u;
const MARKER = "@owner-scope-upsert-ok";

const MESSAGE =
  "an `onConflictDoUpdate` upsert of an ownerId-scoped table whose conflict target does not resolve the " +
  "owner — this is the cross-tenant UPSERT hole: an upsert is an UPDATE in disguise, and the row it updates " +
  "is chosen by the UNIQUE INDEX it collides with, not by a `.where`. When that index omits the owner " +
  "column, an insert carrying caller-supplied key values collides with a FOREIGN owner's row and the DO " +
  "UPDATE arm overwrites it (the victim keeps its own `owner_id`, so the corruption is invisible to every " +
  "owner-filtered read afterwards). An owner-scoped table (table-scoping-class class (a)) resolves tenancy " +
  "through its `ownerId`, so the collision has to say so — or say who already proved the target is the " +
  "caller's. The sibling halves judge the `.where` of a read and of a write; the owner-scoped fetch they " +
  "all pair with is packages/db/src/kit/fetch-owned.ts";

const FIX =
  "pick the arm that fits: (1) put the owner IN THE CONFLICT TARGET — `target: [T.ownerId, T.key]`, which " +
  "needs the matching UNIQUE INDEX in the schema and is the right answer when the collision genuinely is " +
  "per-owner; (2) BOUND THE UPDATE ARM — `setWhere: eq(T.ownerId, ownerId)` (a collision with a foreign row " +
  "moves 0 rows instead of overwriting it), which is the one-line belt when the unique index is legitimately " +
  "global (an FK-partitioned PK, a null-owner system seed) and must not change; (3) if the authority is " +
  "genuinely chained ABOVE this statement — the verb loaded the parent owned before building the scope, or " +
  `the target values are the engine's own constants (D20 un-principal) — mark it \`// ${MARKER}: <reason>\` ` +
  "on the function. The reason must name WHO proved the target values are the caller's and what would end " +
  "the exemption. Note that assigning `ownerId` inside `set` is NOT a fix: it restamps the row that already " +
  "lost the collision, which converts an overwrite into a theft.";

const STALE = (fn: string, file: string): string =>
  `\`${MARKER}\` marker on \`${fn}\` (${file}) guards NO ownerless-target upsert any more — delete the stale ` +
  "marker. A stale exemption is a loaded gun: the next upsert written in this function inherits a promise " +
  "nobody granted it.";

const BLIND =
  "owner-scoped-upserts derived ZERO ownerId-class tables from the schema — the gate has gone blind (the " +
  "schema shape or the class registry moved, and a gate that matches nothing reports ✓ forever). Re-derive " +
  "it in scripts/check/gates/table-scoping-class.ts (`ownerScopedTableIdents`)";

/** The (a)-class drizzle table identifiers, derived per run by `table-scoping-class`. */
let ownerTableIdents = new Set<string>();
/** Functions carrying the marker → their (file, name), for the stale arm. */
const markedFns = new Map<string, { readonly fn: string; readonly file: string }>();
/** Marker keys that actually guarded an ownerless-target upsert. */
const markersUsed = new Set<string>();

/** The (a)-class table this call inserts into — `db.insert(T)` / the same on a `tx` receiver — or undefined
 *  for every other call. */
function insertTargetIdent(node: Node): string | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = node.getExpression();
  if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === INSERT_VERB)) {
    return;
  }
  const arg = node.getArguments()[0];
  if (arg === undefined || !arg.isKind(SyntaxKind.Identifier) || !ownerTableIdents.has(arg.getText())) {
    return;
  }
  return arg.getText();
}

/** Does the upsert config constrain the DO UPDATE to THIS table's own owner column? Requires the qualified
 *  `<tableIdent>.ownerId` — a bare `ownerId` or some OTHER table's owner column scopes nothing here. FAILS
 *  CLOSED on any config the reader cannot see through (a spread, an identifier, a call), because an
 *  unreadable guard is an unproven one. */
function guardsOwner(config: Node | undefined, ident: string): boolean {
  if (config?.isKind(SyntaxKind.ObjectLiteralExpression) !== true) {
    return false;
  }
  const ownerRe = new RegExp(String.raw`\b${ident}\.${OWNER_COL}\b`, "u");
  return GUARD_PROPS.some((name) => {
    const prop = config.getProperty(name);
    return prop !== undefined && ownerRe.test(prop.getText());
  });
}

export const gate: GateDescriptor = {
  name: "owner-scoped-upserts",
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
    const ident = insertTargetIdent(node);
    if (ident === undefined) {
      return;
    }
    const config = upsertConfigOf(node);
    if (config === undefined) {
      return; // a plain insert or an `onConflictDoNothing` — neither overwrites a row that already exists
    }
    if (guardsOwner(config, ident)) {
      return; // arm 1 — the owner is in the conflict target, the targetWhere, or the setWhere
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
        "packages/db/src/schema/plugin.ts": 'export const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nexport async function putKv(db: Db, scope: S, entry: E) {\n  return db.insert(pluginKv).values({ pluginId: scope.pluginId, ownerId: scope.ownerId, key: entry.key, value: entry.value }).onConflictDoUpdate({ target: [pluginKv.pluginId, pluginKv.key], set: { value: entry.value } });\n}\n',
      },
      expect: { count: 1, messageIncludes: "cross-tenant UPSERT hole" },
      why: "the founding shape — the declared limit `owner-scoped-writes` wrote down and this gate supersedes: a (plugin_id, key) conflict target on an ownerId-class table collides on values the caller names, and the DO UPDATE arm overwrites whoever owns the loser",
    },
    {
      files: {
        "packages/db/src/schema/theme.ts": 'export const themes = sqliteTable("themes", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          'import { themes } from "@orb/db";\nexport async function upsertSeed(db: Db, row: R) {\n  return db.insert(themes).values(row).onConflictDoUpdate({ target: themes.id, set: { name: row.name } });\n}\n',
      },
      expect: { count: 1 },
      why: "the SINGLE-column form: `target: T.id` is not an array, and a gate reading only array targets would ship a blind spot on the PK-collision shape — which is the widest one (every row of the table is a candidate victim)",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function put(db: Db, row: R, ownerId: string) {\n  return db.insert(characters).values(row).onConflictDoUpdate({ target: characters.slug, set: { name: row.name, ownerId } });\n}\n',
      },
      expect: { count: 1 },
      why: "assigning `ownerId` in `set` is the ANTI-fix and must still RED: it does not choose WHICH row is written, it restamps the foreign row that already lost the collision — an overwrite upgraded to a theft. A reader matching `ownerId` anywhere in the config would call this safe",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nconst CFG = { target: characters.slug, set: { name: "x" } };\nexport async function put(db: Db, row: R) {\n  return db.insert(characters).values(row).onConflictDoUpdate(CFG);\n}\n',
      },
      expect: { count: 1 },
      why: "FAIL CLOSED on a config the reader cannot see through (an identifier, a spread, a call). A guard that is unreadable is unproven — a gate that returned 'safe' here would be silenced by one `const CFG =` refactor (GATE-AUTHORING §5, literal-shape blindness)",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function put(db: Db, row: R, ownerId: string) {\n  return db.insert(characters).values(row).onConflictDoUpdate({ target: characters.slug, where: eq(characters.ownerId, ownerId), set: { name: row.name } });\n}\n',
      },
      expect: { count: 1 },
      why: "drizzle's `where:` on this config is DEPRECATED because it is ambiguous between the target predicate and the update predicate — an ambiguous guard proves neither side, so it must not exempt. The fix is the explicit `setWhere:`",
    },
    {
      files: {
        "packages/db/src/schema/tag.ts": 'export const chatTags = sqliteTable("chat_tags", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/tag/persistence/queries.ts":
          'import { chatTags } from "@orb/db";\n// @owner-scope-upsert-ok:\nexport async function put(db: Db, row: R) {\n  return db.insert(chatTags).values(row).onConflictDoUpdate({ target: [chatTags.chatId, chatTags.tagId], set: { at: 1 } });\n}\n',
      },
      expect: { count: 1 },
      why: "a BARE marker (no reason after the colon) exempts NOTHING — a rubber stamp is not an exemption (GATE-AUTHORING §4.3)",
    },
    {
      files: {
        "packages/db/src/schema/tag.ts": 'export const chatTags = sqliteTable("chat_tags", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/tag/persistence/queries.ts":
          'import { chatTags } from "@orb/db";\n// @owner-scope-write-ok: the verb loaded the row owned before calling this.\nexport async function put(db: Db, row: R) {\n  return db.insert(chatTags).values(row).onConflictDoUpdate({ target: [chatTags.chatId, chatTags.tagId], set: { at: 1 } });\n}\n',
      },
      expect: { count: 1 },
      why: "a WRITE marker does not exempt an UPSERT — the vocabularies are separate on purpose. `@owner-scope-write-ok` promises a `.where` names the caller's row; it says nothing about which row a UNIQUE INDEX collision picks",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/stats.ts": 'export const dailyStats = sqliteTable("daily_stats", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/stats/write/apply-delta.ts":
          'import { dailyStats } from "@orb/db";\nexport function roll(db: Db, row: R) {\n  return db.insert(dailyStats).values(row).onConflictDoUpdate({ target: [dailyStats.ownerId, dailyStats.day], set: { chats: 1 } });\n}\n',
      },
      why: "arm 1 — the owner IN THE CONFLICT TARGET: the unique index is per-owner, so a foreign row is not even a collision candidate. This is the rollup shape the stats plane already writes",
    },
    {
      files: {
        "packages/db/src/schema/stats.ts": 'export const ownerStats = sqliteTable("owner_stats", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/stats/write/apply-delta.ts":
          'import { ownerStats } from "@orb/db";\nexport function roll(db: Db, row: R) {\n  return db.insert(ownerStats).values(row).onConflictDoUpdate({ target: ownerStats.ownerId, set: { chats: 1 } });\n}\n',
      },
      why: "arm 1 in its SINGLE-column form — the owner column IS the natural key. The reader must not require an array target any more than it may require a scalar one",
    },
    {
      files: {
        "packages/db/src/schema/plugin.ts": 'export const pluginKv = sqliteTable("plugin_kv", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/plugin/persistence/plugin-kv.ts":
          'import { pluginKv } from "@orb/db";\nexport async function putKv(db: Db, scope: S, entry: E) {\n  return db.insert(pluginKv).values(entry).onConflictDoUpdate({ target: [pluginKv.pluginId, pluginKv.key], setWhere: eq(pluginKv.ownerId, scope.ownerId), set: { value: entry.value } });\n}\n',
      },
      why: "arm 1 via `setWhere` — the belt for a legitimately global unique index (here an FK-partitioned PK). A collision with a foreign owner's row moves 0 rows instead of overwriting it, which is the upsert's version of putting the owner in the WHERE",
    },
    {
      files: {
        "packages/db/src/schema/theme.ts": 'export const themes = sqliteTable("themes", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          'import { themes } from "@orb/db";\nexport async function upsertSeed(db: Db, row: R) {\n  return db.insert(themes).values(row).onConflictDoUpdate({ target: themes.id, setWhere: isNull(themes.ownerId), set: { name: row.name } });\n}\n',
      },
      why: "the NULL-owner system-seed shape: `isNull(T.ownerId)` is an owner predicate too — the boot reseed can only ever overwrite an ownerless seed row, never a user's. The reader keys on the qualified column, not on a specific comparison helper",
    },
    {
      files: {
        "packages/db/src/schema/tag.ts": 'export const chatTags = sqliteTable("chat_tags", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/tag/persistence/queries.ts":
          'import { chatTags } from "@orb/db";\n// @owner-scope-upsert-ok: the target values are the engine\'s own constants (D20 un-principal), never caller-supplied. Ends the day a caller can name one.\nexport async function put(db: Db, row: R) {\n  return db.insert(chatTags).values(row).onConflictDoUpdate({ target: [chatTags.chatId, chatTags.tagId], set: { at: 1 } });\n}\n',
      },
      why: "arm 2 — a marker WITH its reason: the proof that the target values are the caller's lives in the CALLER's control flow, which no structural gate can see. The reason is the deliverable; the two-sided stale arm is what stops it outliving the upsert",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function put(db: Db, row: R) {\n  return db.insert(characters).values(row).onConflictDoNothing({ target: characters.slug });\n}\n',
      },
      why: "DECLARED LIMIT: `onConflictDoNothing` is out of scope by construction — a collision with a foreign row is a NO-OP, which is the safe answer already. Only the DO UPDATE arm can overwrite",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts": 'export const chatLocks = sqliteTable("chat_locks", { chatId: text("chat_id") });\n',
        "packages/server/src/domain/chat/persistence/lock.ts":
          'import { chatLocks } from "@orb/db";\nexport async function take(db: Db, row: R) {\n  return db.insert(chatLocks).values(row).onConflictDoUpdate({ target: chatLocks.chatId, set: { holder: row.holder } });\n}\n',
      },
      why: "DECLARED LIMIT: a (b) MEMBERSHIP-scoped table is out of scope here, the same way it is for both sibling halves. Its rung is `requireParticipant`/`requireHost` in the verb's control flow — unprovable structurally, and the cross-tenant behavioral sweep stays that proof",
    },
    {
      files: {
        "packages/db/src/schema/discovery.ts":
          'export const characterSummaries = sqliteTable("character_summaries", { characterId: text("character_id").references(() => characters.id) });\n',
        "packages/server/src/domain/discovery/verbs/distill.ts":
          'import { characterSummaries } from "@orb/db";\nexport async function store(db: Db, row: R) {\n  return db.insert(characterSummaries).values(row).onConflictDoUpdate({ target: characterSummaries.characterId, set: { text: row.text } });\n}\n',
      },
      why: "DECLARED LIMIT: a (d) PARENT-derived table is out of scope — its tenancy is the parent's, so the owner column this gate keys on does not exist to be put in a target. The parent's own reachability is `owner-scoped-reads`' question",
    },
  ],
};
