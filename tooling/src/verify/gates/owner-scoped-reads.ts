// Gate: owner-scoped-reads — a by-id READ of an `ownerId`-class table (table-scoping-class (a)) must put the
// owner IN THE WHERE (`fetchOwned`, or `eq(T.ownerId, …)`), or resolve it POST-FETCH (the loadWorkload
// F3-AUTHZ arm: project the ownerId and compare it — a distinct LEGAL shape, recognized here), or carry an
// `// @owner-scope-ok: <reason>` marker. The post-fetch comparison must read the result binding's ownerId;
// an unrelated owner comparison in the same function proves nothing. A bare `eq(T.id, x)` is the hole.
// TWO-SIDED: a marker on a function with no bare by-id read left is RED. DECLARED LIMIT: READS only — the
// WRITE half is the sibling gate `owner-scoped-writes` (its own marker vocabulary), and membership-rung
// completeness on (b)-class tables is control-flow-dependent (the cross-tenant behavioral sweep stays that
// proof). A post-fetch arm is valid only when a rejecting guard compares that exact result (or a one-hop
// alias) with the caller's owner binding; a self-comparison, unrelated owner, or unused comparison is RED.
import type { Identifier, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";
import { enclosingFn, markedFunctions, markerKeyFor, predicatesOwnId, whereArgOf } from "../lib/tenancy-read.ts";
import { ownerScopedTableIdents } from "./table-scoping-class.ts";

const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const SERVER_SRC = "packages/server/src/";
const GATE_SELF = "tooling/src/verify/gates/owner-scoped-reads.ts";
const OWNER_COL = "ownerId";
/** The two-sided comment marker. House grammar (`marker:\s*\S`) — the reason after the colon is REQUIRED,
 *  and a bare marker exempts NOTHING. */
const MARKER_RE = /@owner-scope-ok:\s*\S/u;
const MARKER = "@owner-scope-ok";
const CALLER_OWNER_BINDING_RE = /^(?:caller|(?:caller|owner|user)[A-Za-z0-9_]*Id)$/u;

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
  "it in tooling/src/verify/gates/owner-scoped-reads.ts";

/** The drizzle table identifiers whose SQL table is class (a) — derived per run by `table-scoping-class`
 *  (the registry's own home), never a hand-kept list, so a re-classification moves the gate. */
let ownerTableIdents = new Set<string>();
/** Functions carrying the marker → their (file, name), for the stale arm. */
const markedFns = new Map<string, { readonly fn: string; readonly file: string }>();
/** Marker keys that actually guarded a bare read. */
const markersUsed = new Set<string>();

/** True when `id` is the read result binding itself or a one-hop local alias initialized from it. */
function derivesFromReadResult(id: Identifier, resultDecl: Node): boolean {
  for (const def of id.getDefinitionNodes()) {
    if (def === resultDecl) {
      return true;
    }
    if (!def.isKind(SyntaxKind.VariableDeclaration)) {
      continue;
    }
    const init = def.getInitializer();
    if (init === undefined) {
      continue;
    }
    const sources = init.isKind(SyntaxKind.Identifier) ? [init] : init.getDescendantsOfKind(SyntaxKind.Identifier);
    if (sources.some((source) => source.getDefinitionNodes().includes(resultDecl))) {
      return true;
    }
  }
  return false;
}

/** The `.ownerId` reads on this side that derive from the exact query-result declaration. */
function resultOwnerReads(side: Node, resultDecl: Node): Node[] {
  const descendants = side.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  const accesses = side.isKind(SyntaxKind.PropertyAccessExpression) ? [side, ...descendants] : descendants;
  return accesses.filter((candidate) => {
    if (candidate.getName() !== OWNER_COL) {
      return false;
    }
    const receiver = candidate.getExpression();
    if (receiver.isKind(SyntaxKind.Identifier) && derivesFromReadResult(receiver, resultDecl)) {
      return true;
    }
    return receiver.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => derivesFromReadResult(id, resultDecl));
  });
}

function expressionDerivesFromReadResult(expression: Node, resultDecl: Node): boolean {
  const value = unwrapExpression(expression);
  if (value.isKind(SyntaxKind.Identifier) && derivesFromReadResult(value, resultDecl)) {
    return true;
  }
  return value.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => derivesFromReadResult(id, resultDecl));
}

/** Does this expression name the caller-side owner identity rather than another fetched/ambient row? The
 *  accepted forms are an explicit local binding (`ownerId`, `caller`, `callerUserId`) or the authenticated
 *  identity projection (`principal.userId` / `caller.userId`). An arbitrary `other.ownerId` is not an
 *  authority relationship merely because it shares the column name. */
function isCallerOwnerBinding(side: Node, resultDecl: Node): boolean {
  const value = unwrapExpression(side);
  if (expressionDerivesFromReadResult(value, resultDecl)) {
    return false;
  }
  if (value.isKind(SyntaxKind.Identifier)) {
    return CALLER_OWNER_BINDING_RE.test(value.getText());
  }
  if (!value.isKind(SyntaxKind.PropertyAccessExpression) || value.getName() !== "userId") {
    return false;
  }
  const principalText = value.getExpression().getText();
  return principalText === "principal" || principalText === "caller" || principalText.endsWith(".principal") || principalText.endsWith(".caller");
}

/** A mismatch branch protects egress only when it definitely leaves without returning the fetched result.
 *  This deliberately recognises the guard-clause register (`throw`, `return null`, or a block ending in one)
 *  and rejects a logging-only branch or `return row`. */
function rejectsFetchedResult(statement: Node, resultDecl: Node): boolean {
  if (statement.isKind(SyntaxKind.ThrowStatement)) {
    return true;
  }
  if (statement.isKind(SyntaxKind.ReturnStatement)) {
    const expression = statement.getExpression();
    return expression === undefined || !expressionDerivesFromReadResult(expression, resultDecl);
  }
  if (!statement.isKind(SyntaxKind.Block)) {
    return false;
  }
  const outerFn = enclosingFn(statement);
  const leaksOnAnyBranch = statement.getDescendantsOfKind(SyntaxKind.ReturnStatement).some((ret) => {
    if (enclosingFn(ret) !== outerFn) {
      return false;
    }
    const expression = ret.getExpression();
    return expression !== undefined && expressionDerivesFromReadResult(expression, resultDecl);
  });
  if (leaksOnAnyBranch) {
    return false;
  }
  const last = statement.getStatements().at(-1);
  return last !== undefined && rejectsFetchedResult(last, resultDecl);
}

/** Walk a `!==` mismatch through parentheses / OR clauses to the `if` it makes true. `&&` is intentionally
 *  excluded: a second false conjunct would let a mismatched row continue to egress. */
function rejectingGuardOf(comparison: Node, resultDecl: Node): boolean {
  let condition: Node = comparison;
  for (;;) {
    const parent = condition.getParent();
    if (parent?.isKind(SyntaxKind.ParenthesizedExpression) === true) {
      condition = parent;
      continue;
    }
    if (parent?.isKind(SyntaxKind.BinaryExpression) === true && parent.getOperatorToken().getKind() === SyntaxKind.BarBarToken) {
      condition = parent;
      continue;
    }
    if (parent?.isKind(SyntaxKind.IfStatement) !== true || parent.getExpression() !== condition) {
      return false;
    }
    return rejectsFetchedResult(parent.getThenStatement(), resultDecl);
  }
}

/** A verifier may return the ownership relationship itself instead of loading the row for egress. Keep
 *  this arm deliberately narrow: the exact `===` comparison must be the return expression. */
function returnsOwnerVerdict(comparison: Node): boolean {
  let expression = comparison;
  while (expression.getParent()?.isKind(SyntaxKind.ParenthesizedExpression) === true) {
    expression = expression.getParentOrThrow();
  }
  return expression.getParent()?.isKind(SyntaxKind.ReturnStatement) === true;
}

/** The POST-FETCH-FILTER arm: the enclosing function must relate the exact fetched result's `.ownerId` to
 *  the caller's authorized owner binding. A row-loading function rejects a mismatch; a boolean verifier
 *  may return the exact equality relationship directly. */
function hasPostFetchFilter(read: Node, fn: Node | undefined): boolean {
  if (fn === undefined) {
    return false;
  }
  const resultDecl = read.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (resultDecl === undefined) {
    return false;
  }
  return fn.getDescendantsOfKind(SyntaxKind.BinaryExpression).some((b) => {
    const op = b.getOperatorToken().getKind();
    if (op !== SyntaxKind.ExclamationEqualsEqualsToken && op !== SyntaxKind.EqualsEqualsEqualsToken) {
      return false;
    }
    const left = b.getLeft();
    const right = b.getRight();
    const leftIsResultOwner = resultOwnerReads(left, resultDecl).length > 0;
    const rightIsResultOwner = resultOwnerReads(right, resultDecl).length > 0;
    if (leftIsResultOwner === rightIsResultOwner) {
      return false;
    }
    const callerOwner = leftIsResultOwner ? right : left;
    if (!isCallerOwnerBinding(callerOwner, resultDecl)) {
      return false;
    }
    return op === SyntaxKind.EqualsEqualsEqualsToken ? returnsOwnerVerdict(b) : rejectingGuardOf(b, resultDecl);
  });
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
    ownerTableIdents = ownerScopedTableIdents(ctx);
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
    if (!predicatesOwnId(whereText, ident)) {
      return;
    }
    if (whereText.includes(OWNER_COL)) {
      return; // arm 1 — the owner is IN THE WHERE
    }
    if (hasPostFetchFilter(node, enclosingFn(node))) {
      return; // arm 2 — the F3-AUTHZ post-fetch filter
    }
    const markerKey = markerKeyFor(node, sf, MARKER_RE);
    if (markerKey !== undefined) {
      markersUsed.add(markerKey);
      return; // arm 3 — a cited marker
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
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (unrelated.ownerId !== caller) return null;\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "an unrelated `.ownerId` comparison in the same function cannot authorize the row returned by this unscoped read",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (rows[0]?.ownerId !== rows[0]?.ownerId) return null;\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "a fetched owner compared with itself is a tautology, not a relationship to the caller's authorized owner",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  const sameOwner = rows[0]?.ownerId === caller;\n  void sameOwner;\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "a correct owner relationship that does not control a rejecting guard leaves the fetched row free to egress",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (rows[0]?.ownerId !== unrelated.ownerId) return null;\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "the fetched owner must relate to the caller's authorized owner, not merely to a different ambient row's ownerId",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (rows[0]?.ownerId !== caller) {\n    auditForeignRead();\n  }\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "a mismatch branch that records but does not reject is non-protective — the foreign row still reaches the return",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (rows[0]?.ownerId !== caller) return rows[0];\n  return null;\n}\n',
      },
      expect: { count: 1 },
      why: "a mismatch branch that returns the fetched result is egress, not rejection, even though the comparison itself is correct",
    },
    {
      files: {
        "packages/db/src/schema/character.ts": 'export const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { characters } from "@orb/db";\nexport async function loadCard(db: Db, id: string, caller: string, debug: boolean) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  if (rows[0]?.ownerId !== caller) {\n    if (debug) return rows[0];\n    return null;\n  }\n  return rows[0];\n}\n',
      },
      expect: { count: 1 },
      why: "a block whose final statement rejects is still unsafe when an earlier branch can return the fetched foreign row",
    },
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
          'import { characters } from "@orb/db";\nexport async function loadIt(db: Db, id: string, caller: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  const card = rows[0];\n  if (card === undefined || card.ownerId !== caller) return null;\n  return card;\n}\n',
      },
      why: "arm 2 through one local alias — `rows -> card -> card.ownerId` is still a relationship to this read result, matching persona/loadOwnedCharacterCard",
    },
    {
      files: {
        "packages/db/src/schema/persona.ts": 'export const personas = sqliteTable("personas", { ownerId: text("owner_id") });\n',
        "packages/server/src/entry/compose/chat.ts":
          'import { personas } from "@orb/db";\nexport const verifyPersonaOwned = async ({ ownerId, personaId }) => {\n  const rows = await db.select({ ownerId: personas.ownerId }).from(personas).where(eq(personas.id, personaId)).limit(1);\n  return rows[0]?.ownerId === ownerId;\n};\n',
      },
      why: "arm 2 as a boolean verifier — returning the exact fetched owner relationship exposes only the authorization verdict, never the row",
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
      why: "DECLARED LIMIT: READS only — a `db.delete(T)`/`db.update(T)` is invisible to THIS gate by construction. The write half is the sibling gate `owner-scoped-writes`, which owns that shape with its own `@owner-scope-write-ok:` vocabulary; a write must never silence itself with a READ marker",
    },
  ],
};
