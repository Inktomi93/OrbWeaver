// Gate: owner-scoped-reads — a by-id READ of an `ownerId`-class table (table-scoping-class (a)) must put the
// owner IN THE WHERE (`fetchOwned`, or `eq(T.ownerId, …)`), or resolve it POST-FETCH (the loadWorkload
// F3-AUTHZ arm: project the ownerId and compare it — a distinct LEGAL shape, recognized here), or carry an
// `// @owner-scope-ok: <reason>` marker. An unexplained bare `eq(T.id, x)` is the cross-tenant read hole.
// TWO-SIDED: a marker on a function with no bare by-id read left is RED. DECLARED LIMIT: READS only — the
// write verbs (`update`/`delete`) chain their own ownership guard, and membership-rung completeness on
// (b)-class tables is control-flow-dependent (the cross-tenant behavioral sweep stays that proof).
import type { CallExpression, Node, VariableDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";
import { TABLE_SCOPING_CLASSES } from "./table-scoping-class.ts";

const SCHEMA_DIR = "packages/db/src/schema/";
const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const SERVER_SRC = "packages/server/src/";
const GATE_SELF = "scripts/check/gates/owner-scoped-reads.ts";
const TABLE_FN = "sqliteTable";
const OWNER_COL = "ownerId";
/** The two-sided comment marker. House grammar (`marker:\s*\S`) — the reason after the colon is REQUIRED,
 *  and a bare marker exempts NOTHING. */
const MARKER_RE = /@owner-scope-ok:\s*\S/u;
const MARKER = "@owner-scope-ok";

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
  `(a trusted system consumer, D20) or its ids come from already-authorized canon, mark it \`// ${MARKER}: <reason>\` ` +
  "on the function — the reason must say WHO authorized the ids and what would end the exemption.";

const STALE = (fn: string, file: string): string =>
  `\`${MARKER}\` marker on \`${fn}\` (${file}) guards NO unscoped by-id read any more — delete the stale ` +
  "marker. A stale exemption is a loaded gun: the next unscoped read written in this function inherits a " +
  "promise nobody granted it.";

const BLIND =
  "owner-scoped-reads derived ZERO ownerId-class tables from the schema — the gate has gone blind (the " +
  "schema shape or the class registry moved, and a gate that matches nothing reports ✓ forever). Re-derive " +
  "it in scripts/check/gates/owner-scoped-reads.ts";

/** The drizzle table identifiers whose SQL table is class (a). Derived per run from the schema sources
 *  CROSSED with `TABLE_SCOPING_CLASSES` — never a hand-kept list, so a re-classification moves the gate. */
const ownerTableIdents = new Set<string>();
/** Functions carrying the marker → their (file, name), for the stale arm. */
const markedFns = new Map<string, { readonly fn: string; readonly file: string }>();
/** Marker keys that actually guarded a bare read. */
const markersUsed = new Set<string>();

const LEADING_SLASH_RE = /^\/+/u;
function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path.replace(LEADING_SLASH_RE, "") : path.slice(idx + 1);
}

/** The SQL table name a `const X = sqliteTable("<name>", …)` declaration mints, or undefined. */
function sqlNameOf(decl: VariableDeclaration): string | undefined {
  const init = decl.getInitializer();
  if (init?.isKind(SyntaxKind.CallExpression) !== true) {
    return;
  }
  const callee = init.getExpression();
  if (callee.isKind(SyntaxKind.Identifier) !== true || callee.getText() !== TABLE_FN) {
    return;
  }
  const nameArg = init.getArguments()[0];
  return nameArg?.isKind(SyntaxKind.StringLiteral) === true ? nameArg.getLiteralText() : undefined;
}

/** Rebuild `ownerTableIdents` from the shared project: `export const X = sqliteTable("<name>", …)` in a
 *  schema file whose `<name>` is class (a). */
function deriveOwnerTables(ctx: GateRunCtx): void {
  ownerTableIdents.clear();
  for (const sf of ctx.project.getSourceFiles()) {
    if (!repoRel(sf.getFilePath()).includes(SCHEMA_DIR)) {
      continue;
    }
    for (const decl of sf.getVariableDeclarations()) {
      const sqlName = sqlNameOf(decl);
      if (sqlName !== undefined && TABLE_SCOPING_CLASSES[sqlName]?.scope === "ownerId") {
        ownerTableIdents.add(decl.getName());
      }
    }
  }
}

function isFnish(n: Node): boolean {
  return (
    n.isKind(SyntaxKind.FunctionDeclaration) ||
    n.isKind(SyntaxKind.MethodDeclaration) ||
    n.isKind(SyntaxKind.ArrowFunction) ||
    n.isKind(SyntaxKind.FunctionExpression)
  );
}

function fnName(fn: Node): string {
  if (fn.isKind(SyntaxKind.FunctionDeclaration) || fn.isKind(SyntaxKind.MethodDeclaration)) {
    return fn.getName() ?? "(anonymous)";
  }
  const parent = fn.getParent();
  return parent?.isKind(SyntaxKind.VariableDeclaration) === true ? parent.getName() : "(anonymous)";
}

/** The innermost enclosing function — the post-fetch filter's unit of scope. */
function enclosingFn(node: Node): Node | undefined {
  return node.getFirstAncestor(isFnish);
}

function leadingMarker(n: Node): boolean {
  return n.getLeadingCommentRanges().some((r) => MARKER_RE.test(r.getText()));
}

/** A function carries the marker when it sits in the function's OWN leading comments, or in those of the
 *  variable statement declaring it. Deliberately NOT "anywhere in the body": a marker attached to the
 *  function is the reviewable unit, and a body-wide text match would let an inner arrow inherit a promise
 *  its enclosing helper was granted (and would make the stale arm fire on phantom keys). */
function carriesMarker(fn: Node): boolean {
  if (leadingMarker(fn)) {
    return true;
  }
  const decl = fn.getParent();
  if (decl?.isKind(SyntaxKind.VariableDeclaration) !== true) {
    return false;
  }
  const stmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  return stmt !== undefined && leadingMarker(stmt);
}

/** The nearest ancestor function (innermost first) carrying the marker — a read inside a `.map()` inherits
 *  the exported helper's marker, which is where a reviewer writes it. */
function markerOwner(node: Node): Node | undefined {
  let cur = node.getFirstAncestor(isFnish);
  while (cur !== undefined && !carriesMarker(cur)) {
    cur = cur.getFirstAncestor(isFnish);
  }
  return cur;
}

/** The POST-FETCH-FILTER arm (`workloads/verbs/get.ts` F3-AUTHZ): the enclosing function compares a
 *  `.ownerId` property with `===`/`!==`. The owner predicate is resolved in JS instead of SQL — a distinct
 *  LEGAL shape, and one the machine can see. */
function hasPostFetchFilter(fn: Node | undefined): boolean {
  if (fn === undefined) {
    return false;
  }
  return fn.getDescendantsOfKind(SyntaxKind.BinaryExpression).some((b) => {
    const op = b.getOperatorToken().getKind();
    if (op !== SyntaxKind.EqualsEqualsEqualsToken && op !== SyntaxKind.ExclamationEqualsEqualsToken) {
      return false;
    }
    return [b.getLeft(), b.getRight()].some((side) => side.getText().includes(`.${OWNER_COL}`));
  });
}

/** Walk a drizzle method chain UP from `.from(T)`, collecting the calls that follow it. */
function chainCalls(start: Node): CallExpression[] {
  const out: CallExpression[] = [];
  let cur: Node = start;
  for (;;) {
    const parent = cur.getParent();
    if (parent === undefined) {
      return out;
    }
    if (parent.isKind(SyntaxKind.CallExpression)) {
      out.push(parent);
    } else if (!(parent.isKind(SyntaxKind.PropertyAccessExpression) || parent.isKind(SyntaxKind.AwaitExpression))) {
      return out;
    }
    cur = parent;
  }
}

/** The `.where(…)` argument of the chain this `.from(T)` starts, or undefined (no WHERE ⇒ a LIST read, not
 *  a by-id read — out of scope). */
function whereArgOf(fromCall: Node): Node | undefined {
  const whereCall = chainCalls(fromCall).find((call) => {
    const callee = call.getExpression();
    return callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === "where";
  });
  return whereCall?.getArguments()[0];
}

export const gate: GateDescriptor = {
  name: "owner-scoped-reads",
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
    deriveOwnerTables(ctx);
  },

  visit: (node, sf, ctx) => {
    if (!node.isKind(SyntaxKind.CallExpression)) {
      return;
    }
    const callee = node.getExpression();
    if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === "from")) {
      return;
    }
    const arg = node.getArguments()[0];
    if (arg === undefined || !arg.isKind(SyntaxKind.Identifier) || !ownerTableIdents.has(arg.getText())) {
      return;
    }
    const where = whereArgOf(node);
    if (where === undefined) {
      return; // no WHERE at all: a full-table/list read, not the by-id shape this gate owns
    }
    const whereText = where.getText();
    const ident = arg.getText();
    // BY-ID: `eq(T.id, …)` or `inArray(T.id, …)` — both are "whatever id the caller supplies comes back".
    if (!new RegExp(String.raw`\b${ident}\.id\b`, "u").test(whereText)) {
      return;
    }
    if (whereText.includes(OWNER_COL)) {
      return; // arm 1 — the owner is IN THE WHERE
    }
    const fn = enclosingFn(node);
    if (hasPostFetchFilter(fn)) {
      return; // arm 2 — the F3-AUTHZ post-fetch filter
    }
    const rel = repoRel(sf.getFilePath());
    const owner = markerOwner(node);
    if (owner !== undefined) {
      markersUsed.add(`${rel}#${fnName(owner)}`);
      return; // arm 3 — a cited marker
    }
    ctx.report(node, { token: ident, offset: 0 });
  },

  visitFile: (sf) => {
    // Record every marker in scanned scope so the stale arm sees the ones guarding nothing. The key is
    // (file, marked-function) — the SAME key `visit` marks as USED, so the two halves can never drift.
    if (!MARKER_RE.test(sf.getFullText())) {
      return;
    }
    const rel = repoRel(sf.getFilePath());
    for (const n of sf.getDescendants()) {
      if (!(isFnish(n) && carriesMarker(n))) {
        continue;
      }
      const key = `${rel}#${fnName(n)}`;
      markedFns.set(key, { fn: fnName(n), file: rel });
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
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string) {\n  return db.select().from(characters).where(eq(characters.id, id)).limit(1);\n}\n',
      },
      expect: { count: 1, messageIncludes: "cross-tenant read hole" },
      why: "the founding shape — a bare `eq(T.id, x)` on an ownerId-scoped table returns whoever's row the caller names",
    },
    {
      files: {
        "packages/db/src/schema/databank.ts": 'export const documents = sqliteTable("documents", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/databank/persistence/queries.ts":
          'import { documents } from "@orb/db";\nexport async function loadMany(db: Db, ids: string[]) {\n  return db.select().from(documents).where(inArray(documents.id, ids));\n}\n',
      },
      expect: { count: 1 },
      why: "the SET form of the same hole — `inArray(T.id, ids)` is exactly as unscoped as `eq`, and a gate covering only `eq` would ship a confident blind spot",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\n// @owner-scope-ok:\nexport async function loadCard(db: Db, id: string) {\n  return db.select().from(characters).where(eq(characters.id, id)).limit(1);\n}\n',
      },
      expect: { count: 1 },
      why: "a BARE marker (no reason after the colon) exempts NOTHING — a rubber stamp is not an exemption (GATE-AUTHORING §4.3)",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadOwned(db: Db, id: string, ownerId: string) {\n  return db.select().from(characters).where(and(eq(characters.id, id), eq(characters.ownerId, ownerId))).limit(1);\n}\n',
      },
      why: "arm 1 — the owner predicate IN THE WHERE (the `fetchOwned` shape): a non-owner gets undefined, never a row",
    },
    {
      files: {
        "packages/db/src/schema/workloads.ts": 'export const workloads = sqliteTable("workloads", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/workloads/persistence/queries.ts":
          'import { workloads } from "@orb/db";\nexport async function loadIt(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(workloads).where(eq(workloads.id, id)).limit(1);\n  if (rows[0]?.ownerId !== caller) {\n    return null;\n  }\n  return rows[0];\n}\n',
      },
      why: "arm 2 — the F3-AUTHZ POST-FETCH filter the census named as a distinct LEGAL class: the owner predicate is resolved in JS, collapsing a foreign row to the same leak-free absent answer",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\n// @owner-scope-ok: the embeddings indexer is a trusted system consumer (D20), not a user-facing surface.\nexport async function loadById(db: Db, id: string) {\n  return db.select().from(characters).where(eq(characters.id, id)).limit(1);\n}\n',
      },
      why: "arm 3 — a marker WITH its reason. The reason is what a reviewer reads; the two-sided stale arm is what stops it outliving the read it guards",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts": 'export const chats = sqliteTable("chats", { id: text("id") });\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          'import { chats } from "@orb/db";\nexport async function loadChat(db: Db, id: string) {\n  return db.select().from(chats).where(eq(chats.id, id)).limit(1);\n}\n',
      },
      why: "DECLARED LIMIT: a (b) MEMBERSHIP-scoped table is out of scope here. Its rung is `requireParticipant`, resolved in the verb's control flow — unprovable structurally, and the cross-tenant behavioral sweep stays that proof",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function listAll(db: Db, ownerId: string) {\n  return db.select().from(characters).where(eq(characters.synthetic, false));\n}\n',
      },
      why: "DECLARED LIMIT: a read with no `T.id` predicate is a LIST read, not the by-id shape — list scoping is a different (unenforced-here) question",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/card.ts":
          'import { characters } from "@orb/db";\nexport async function del(db: Db, id: string) {\n  return db.delete(characters).where(eq(characters.id, id));\n}\n',
      },
      why: "DECLARED LIMIT: READS only. A write chains its own ownership guard in the verb (`remove` loads owned first); widening to update/delete is a separate, larger classification",
    },
  ],
};
