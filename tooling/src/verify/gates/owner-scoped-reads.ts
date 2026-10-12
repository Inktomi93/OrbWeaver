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
// Every table a read binds is a candidate (`.from`, each join, and `db.query.<t>.findFirst|findMany`), resolved by
// the shared floor resolver (`floor/code-facts/drizzle-table-ref.ts`); an anchor it cannot resolve is a finding, a
// subquery or CTE is judged on its inner select, a relational `with:` is unproven, and only a provably foreign verb
// is skipped. Owner scope is a conjunct `eq`/`inArray` on `T.ownerId` against a plain value, or against a column or
// subselect whose own table is value-pinned in the statement, on every arm of a ternary or helper. A joined table
// also passes on a conjunct `eq(J.col, T.col)` along a declared FK pointing AT it (Spine-Identity-and-Auth §2b),
// unless `T` is derived from `J` and no other scope parent of `T` is pinned to the caller; selecting the chain's
// bound FK column by a value is the by-id hole. A WHERE term no reader can see (a parameter, a `let`, an unresolved
// helper, a `$dynamic()` builder that escapes) makes the read unproven, never a list read.
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
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import type { ChainTerm, ReadAnchor, ReadStatement, SchemaTableIndex } from "../contract/tenancy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { readDrizzleClientCall } from "../lib/drizzle-client-call.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";
import { chainTermsOf, conjunctLeaves, innerReadAnchorsOf, ownerTermValue, predicateHolds, readAnchorOf, selectsByValue } from "../lib/tenancy-join.ts";
import { parentReceiverOf, valuePinTerm, valueSourcesOf } from "../lib/tenancy-pin.ts";
import { enclosingFn, hasPostFetchFilter, predicatesOwnId, RELATIONAL_WHERE, relationalWhereCallback, tableRefsOf } from "../lib/tenancy-read.ts";
import {
  foreignKeyEdges,
  foreignKeysBetween,
  ownerScopedTableIdents,
  reportBlindWhenEmpty,
  schemaTableIndex,
  scopeParentsOfDerivedTables,
} from "../lib/tenancy-scope.ts";
import { readStatementOf } from "../lib/tenancy-statement.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const ID_COL = "id";
const MAX_SUBQUERY_DEPTH = 4;
const RELATIONAL_WITH = "with";

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

const SATELLITE_MESSAGE =
  "a join binds an ownerId-scoped table ONLY through a satellite of itself — a D23 derived table that scopes " +
  "through the very row this join selects, with none of its other scope parents pinned to the caller in this " +
  "statement, so the chain is circular and every owner's row comes back. A satellite gives no scope " +
  "(Spine-Identity-and-Auth §2b): put an owner predicate on the joined table, or bind and pin one of the derived " +
  "table's other scope parents (its ownerId parent by an owner term, its membership parent by a value)";

const UNPROVEN_MESSAGE =
  "an unproven owner-scoped read — a WHERE or ON term no reader can see (a parameter, a `let`, a destructured " +
  "binding, a spread of a non-literal array, an unresolved helper, or a `$dynamic()` builder handed to a call or " +
  "returned), so whether it selects a row by id is unknown. An unreadable filter is an unproven read, never a list " +
  "read: build the predicate from `const` terms in the reading function, or put the owner predicate in it";

const RELATIONAL_WITH_MESSAGE =
  "a relational-API read loads relations through `with:` — each relation binds a table the gate cannot trace to a " +
  "join condition, so its rows are unproven. Read related rows with an explicit select and join, whose FK chain " +
  "and owner predicates the gate judges";

const UNRESOLVABLE_MESSAGE =
  "an unresolvable table anchor — the read binds a table expression no declaration, drizzle alias, subquery or " +
  "drizzle table type resolves (a parameter, an object property, a computed table), so the gate cannot tell " +
  "whether it is ownerId-scoped. An unreadable anchor is an unproven read, never a clean one";

/** The schema answers `evaluate` needs, derived once per run. */
interface ReadScope {
  readonly ownerTables: ReadonlySet<string>;
  readonly index: SchemaTableIndex;
  readonly fkEdges: ReadonlySet<string>;
  readonly derivedParents: ReadonlyMap<string, ReadonlySet<string>>;
}

// The join rows' shared schema: `chats` is (b) membership-scoped; `personas` and `workloads` are (a)
// ownerId-scoped. `chats.anchorPersonaId -> personas.id` points AT the persona (a chain), while
// `workloads.chatId -> chats.id` points away from the workload (a fan-out to every owner's workloads).
const CHAT_PERSONA_SCHEMA = {
  "packages/db/src/schema/chat.ts":
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const personas = sqliteTable("personas", { id: text("id").primaryKey(), ownerId: text("owner_id") });\nexport const chats = sqliteTable("chats", { id: text("id").primaryKey(), title: text("title"), anchorPersonaId: text("anchor_persona_id").references(() => personas.id) });\nexport const workloads = sqliteTable("workloads", { id: text("id").primaryKey(), ownerId: text("owner_id"), chatId: text("chat_id").references(() => chats.id) });\n',
} as const;
const PERSONA_READ_PATH = "packages/server/src/domain/persona/persistence/queries.ts";
const PERSONA_READ_HEAD =
  'import { aliasedTable, and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";\nimport { chats, personas, workloads } from "@orb/db";\n';
const PERSONA_READ_SIGNATURE = "export async function loadPersona(db: Db, chatId: string, personaId: string, ownerId: string, flag: boolean) {\n";
// `global_books` is a (parent) satellite of `world_books`: its only scope is the book it points at.
const SATELLITE_SCHEMA = {
  "packages/db/src/schema/world-info.ts":
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const worldBooks = sqliteTable("world_books", { id: text("id").primaryKey(), ownerId: text("owner_id") });\nexport const globalBooks = sqliteTable("global_books", { bookId: text("book_id").references(() => worldBooks.id) });\n',
} as const;

// The value-pin rows' schema: `chat_participants` is (b) membership-scoped; `characters` and `personas` are (a);
// `character_personas` is a D23 junction with two ownerId parents; `message_assets` joins a membership parent
// (`messages`) to an ownerId parent (`assets`).
const PIN_SCHEMA = {
  "packages/db/src/schema/chat.ts":
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const personas = sqliteTable("personas", { id: text("id").primaryKey(), ownerId: text("owner_id"), name: text("name") });\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), ownerId: text("owner_id") });\nexport const chatParticipants = sqliteTable("chat_participants", { id: text("id").primaryKey(), chatId: text("chat_id"), userId: text("user_id") });\nexport const characterPersonas = sqliteTable("character_personas", { characterId: text("character_id").references(() => characters.id), personaId: text("persona_id").references(() => personas.id) });\nexport const messages = sqliteTable("messages", { id: text("id").primaryKey(), chatId: text("chat_id") });\nexport const assets = sqliteTable("assets", { id: text("id").primaryKey(), ownerId: text("owner_id") });\nexport const messageAssets = sqliteTable("message_assets", { messageId: text("message_id").references(() => messages.id), assetId: text("asset_id").references(() => assets.id) });\n',
} as const;
const PIN_READ_HEAD =
  'import { aliasedTable, and, eq, inArray, isNotNull } from "drizzle-orm";\nimport type { SQL } from "drizzle-orm";\nimport { assets, characterPersonas, characters, chatParticipants, messageAssets, personas } from "@orb/db";\n';
const PIN_READ_SIGNATURE =
  "export async function loadPinned(db: Db, chatId: string, personaId: string, characterId: string, messageId: string, ownerId: string, flag: boolean) {\n";

/** One read over the value-pin schema; `body` is the whole function body, `before` any module-level declaration. */
function pinBody(body: string, before = ""): Readonly<Record<string, string>> {
  return { ...PIN_SCHEMA, [PERSONA_READ_PATH]: `${PIN_READ_HEAD}${before}${PIN_READ_SIGNATURE}${body}}\n` };
}

/** One persona read over the shared schema; `body` is the whole function body. */
function personaBody(body: string, extra: Readonly<Record<string, string>> = {}, imports = ""): Readonly<Record<string, string>> {
  return { ...CHAT_PERSONA_SCHEMA, ...extra, [PERSONA_READ_PATH]: `${PERSONA_READ_HEAD}${imports}${PERSONA_READ_SIGNATURE}${body}}\n` };
}

/** One persona read over the shared schema; `chain` is the drizzle builder text after `db.select()`. */
function personaRead(chain: string): Readonly<Record<string, string>> {
  return {
    ...CHAT_PERSONA_SCHEMA,
    [PERSONA_READ_PATH]: `${PERSONA_READ_HEAD}${PERSONA_READ_SIGNATURE}  return db.select()${chain}.limit(1);\n}\n`,
  };
}

/** The predicates one anchor's verdict reads: its own ON, and its statement's inner ONs and WHERE alternatives. */
interface Judged {
  readonly on: Node | undefined;
  readonly statement: ReadStatement;
}

function judgedOf(anchor: ReadAnchor): Judged {
  return { on: anchor.kind === "join" ? anchor.on : undefined, statement: readStatementOf(anchor.call) };
}

/** Does `test` accept a conjunct that filters every row the statement returns: one in the anchor's own ON or an
 *  inner join's ON, or one in every `.where` it may apply? Several WHEREs are alternatives, never a conjunction. */
function bindsRows(judged: Judged, test: (conjunct: Node) => boolean): boolean {
  const { on, statement } = judged;
  return predicateHolds([on, ...statement.innerOns], test) || (statement.wheres.length > 0 && statement.wheres.every((where) => predicateHolds([where], test)));
}

/** Is the table written `receiver` pinned to a plain value in this statement (optionally on one column)? */
function pinnedByValue(receiver: string, judged: Judged, scope: ReadScope, column?: string): boolean {
  return bindsRows(judged, (conjunct) => valuePinTerm(conjunct, receiver, scope.index, column));
}

/** Does every table a subselect binds carry a value pin inside the subselect? */
function subselectPinned(select: Node, scope: ReadScope): boolean {
  return innerReadAnchorsOf(select).every((anchor) => anchor.kind !== "relational" && pinnedByValue(anchor.table.getText(), judgedOf(anchor), scope));
}

/** An owner term's value scopes the row only when it is a plain value, or when every table or subselect it reads is
 *  itself value-pinned one hop away (Spine-Identity-and-Auth §2b). */
function ownerValuePinned(value: Node, judged: Judged, scope: ReadScope): boolean {
  const sources = valueSourcesOf(value, scope.index);
  return sources.receivers.every((receiver) => pinnedByValue(receiver, judged, scope)) && sources.subselects.every((select) => subselectPinned(select, scope));
}

/** Arm 1: an `eq`/`inArray` owner term on the table written `ident` whose value is pinned. */
function ownerScoped(ident: string, judged: Judged, scope: ReadScope): boolean {
  return bindsRows(judged, (conjunct) => {
    const value = ownerTermValue(conjunct, ident);
    return value !== undefined && ownerValuePinned(value, judged, scope);
  });
}

/** Is a scope parent of the chain's bound table pinned to the caller: an ownerId-class parent row bound along its
 *  FK with a pinned owner term, or a membership-class parent selected by a plain value? */
function parentPinned(term: ChainTerm, parent: string, judged: Judged, scope: ReadScope): boolean {
  const ownerClass = scope.ownerTables.has(parent);
  return foreignKeysBetween(scope.fkEdges, term.boundTable, parent).some(
    (fk) =>
      (!ownerClass && pinnedByValue(term.boundReceiver, judged, scope, fk.childColumn)) ||
      bindsRows(judged, (conjunct) => {
        const receiver = parentReceiverOf(conjunct, { receiver: term.boundReceiver, fk }, parent, scope.index);
        return receiver !== undefined && (ownerClass ? ownerScoped(receiver, judged, scope) : pinnedByValue(receiver, judged, scope));
      }),
  );
}

/** Is the chain's bound table a D23 satellite of the joined one: a derived table with the joined table among its
 *  scope parents, and none of its OTHER scope parents pinned to the caller in this statement? */
function isSatelliteOf(term: ChainTerm, joined: string, judged: Judged, scope: ReadScope): boolean {
  const parents = scope.derivedParents.get(term.boundTable);
  return parents?.has(joined) === true && ![...parents].some((parent) => parent !== joined && parentPinned(term, parent, judged, scope));
}

/** The finding message for one owner-scoped table this read binds (written `ident`, declared `declared`), or
 *  undefined when a safe arm holds. */
function unscopedReadMessage(anchor: ReadAnchor, ident: string, declared: string | undefined, scope: ReadScope): string | undefined {
  const judged = judgedOf(anchor);
  const { on, statement } = judged;
  if (!statement.escapes && ownerScoped(ident, judged, scope)) {
    return; // arm 1 — a pinned `eq`/`inArray` owner term on this exact table
  }
  const predicates = [on, ...statement.innerOns, ...statement.wheres];
  const chain = anchor.kind === "join" ? chainTermsOf(predicates, ident, scope.index, scope.fkEdges) : [];
  if (anchor.kind === "join" && chain.length === 0) {
    return JOIN_MESSAGE;
  }
  if (declared !== undefined && chain.length > 0 && chain.every((term) => isSatelliteOf(term, declared, judged, scope))) {
    return SATELLITE_MESSAGE;
  }
  // BY-ID: the table's own id in a WHERE or an inner join's ON, or the chain's bound FK column selected by a value
  // (`eq(chats.anchorPersonaId, personaId)` selects the persona by id). Anything else is a list read, or a row
  // the FK chain already selected, unless some term is unreadable.
  const wheres = conjunctLeaves(statement.wheres);
  const ons = conjunctLeaves(statement.innerOns);
  const all = conjunctLeaves(predicates);
  const byId =
    wheres.leaves.some((leaf) => predicatesOwnId(leaf.getText(), ident)) ||
    ons.leaves.some((leaf) => selectsByValue(leaf, `${ident}.${ID_COL}`, scope.index)) ||
    chain.some((term) => all.leaves.some((leaf) => selectsByValue(leaf, term.boundColumn, scope.index)));
  const unproven = all.opaque || statement.escapes;
  if (!(byId || unproven) || hasPostFetchFilter(anchor.call, enclosingFn(anchor.call))) {
    return; // a list read, or arm 2 — the F3-AUTHZ post-fetch filter
  }
  return byId ? MESSAGE : UNPROVEN_MESSAGE;
}

/** Does the subquery's inner select scope every owner-scoped table it reads with a pinned owner term? */
function subqueryScoped(select: Node, scope: ReadScope, depth = 0): boolean {
  return innerReadAnchorsOf(select).every((anchor) => {
    if (anchor.kind === "relational") {
      return false;
    }
    const ident = anchor.table.getText();
    // A nested CTE is owner-relevant only when its own inner select is unscoped; the depth cap fails closed.
    const owned = tableRefsOf(anchor.table, scope.index).some(
      (ref) =>
        ref.kind === "unresolved" ||
        (ref.kind === "subquery" && (depth >= MAX_SUBQUERY_DEPTH || !subqueryScoped(ref.select, scope, depth + 1))) ||
        (ref.kind === "table" && scope.ownerTables.has(ref.ident)),
    );
    const judged = judgedOf(anchor);
    return !owned || (!judged.statement.escapes && ownerScoped(ident, judged, scope));
  });
}

/** The predicate a relational `where` carries and the receiver its columns are read through: the table name for
 *  an SQL value, or the callback's first parameter for `where: (t, { eq }) => …`. Undefined when unreadable. */
function relationalWhere(where: Node | undefined, table: string): { readonly receiver: string; readonly predicate: Node | undefined } | undefined {
  const value = where === undefined ? undefined : unwrapExpression(where);
  if (value === undefined || !(value.isKind(SyntaxKind.ArrowFunction) || value.isKind(SyntaxKind.FunctionExpression))) {
    return { receiver: table, predicate: value };
  }
  const body = value.getBody();
  const [row] = value.getParameters();
  return row === undefined || !relationalWhereCallback(value) || body.isKind(SyntaxKind.Block) ? undefined : { receiver: row.getName(), predicate: body };
}

/** The finding a relational-API read owes. A `with:` relation, an unreadable config or an unknown table is unproven;
 *  an owner-scoped table must carry a pinned owner term in `where`, or read no row by id. */
function relationalFinding(anchor: Extract<ReadAnchor, { kind: "relational" }>, scope: ReadScope): string | undefined {
  if (readDrizzleClientCall(anchor.call).kind === "foreign") {
    return;
  }
  const table = anchor.table.getText();
  const config = anchor.config === undefined ? undefined : unwrapExpression(anchor.config);
  if ((config !== undefined && !config.isKind(SyntaxKind.ObjectLiteralExpression)) || !scope.index.idents.has(table)) {
    return UNRESOLVABLE_MESSAGE;
  }
  const property = (name: string): Node | undefined => {
    const assigned = config?.getProperty(name);
    if (assigned?.isKind(SyntaxKind.ShorthandPropertyAssignment) === true) {
      return assigned.getNameNode();
    }
    return assigned?.isKind(SyntaxKind.PropertyAssignment) === true ? assigned.getInitializer() : assigned;
  };
  if (property(RELATIONAL_WITH) !== undefined) {
    return RELATIONAL_WITH_MESSAGE;
  }
  if (!scope.ownerTables.has(table)) {
    return;
  }
  const where = relationalWhere(property(RELATIONAL_WHERE), table);
  if (where === undefined) {
    return UNPROVEN_MESSAGE;
  }
  const judged: Judged = { on: undefined, statement: { wheres: where.predicate === undefined ? [] : [where.predicate], innerOns: [], escapes: false } };
  if (ownerScoped(where.receiver, judged, scope)) {
    return;
  }
  const leaves = conjunctLeaves(judged.statement.wheres);
  const byId = leaves.leaves.some((leaf) => predicatesOwnId(leaf.getText(), where.receiver));
  if (!(byId || leaves.opaque) || hasPostFetchFilter(anchor.call, enclosingFn(anchor.call))) {
    return;
  }
  return byId ? MESSAGE : UNPROVEN_MESSAGE;
}

/** The one finding this anchor owes, or undefined. Every table it can name is judged; a subquery on its inner select. */
function anchorFinding(anchor: ReadAnchor, scope: ReadScope): string | undefined {
  if (anchor.kind === "relational") {
    return relationalFinding(anchor, scope);
  }
  const refs = tableRefsOf(anchor.table, scope.index);
  const owned = refs.flatMap((ref) => (ref.kind === "table" && scope.ownerTables.has(ref.ident) ? [ref.ident] : []));
  const unscopedSubquery = refs.some((ref) => ref.kind === "subquery" && !subqueryScoped(ref.select, scope));
  const unresolved = refs.some((ref) => ref.kind === "unresolved");
  if ((owned.length === 0 && !unscopedSubquery && !unresolved) || readDrizzleClientCall(anchor.call).kind === "foreign") {
    return; // not an owner-scoped read, or a same-named method that is no drizzle verb
  }
  if (unresolved) {
    return UNRESOLVABLE_MESSAGE;
  }
  const ident = anchor.table.getText();
  const declared = owned.length === 0 ? [undefined] : owned;
  return declared.map((table) => unscopedReadMessage(anchor, ident, table, scope)).find((message) => message !== undefined);
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
          index: schemaTableIndex(schemaFact.value),
          fkEdges: foreignKeyEdges(schemaFact.value),
          derivedParents: scopeParentsOfDerivedTables(schemaFact.value),
        };
        for (const anchor of anchors) {
          const message = anchorFinding(anchor, scope);
          if (message !== undefined) {
            ctx.report.node(anchor.table, { token: waivableCoordinate(anchor.table.getText()) ?? anchor.table.getText(), offset: 0, message });
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
    {
      mode: "types",
      files: personaBody('  const sq = db.select().from(personas).as("sq");\n  return db.select().from(sq).where(eq(sq.id, personaId)).limit(1);\n'),
      expect: { count: 1 },
      why: "a `.as()` subquery is judged on its inner select: an unscoped inner persona read selected by id outside the subquery returns any owner's persona",
    },
    {
      mode: "types",
      files: personaBody(
        '  const cte = db.$with("cte").as(db.select().from(personas));\n  return db.with(cte).select().from(cte).where(eq(cte.id, personaId)).limit(1);\n',
      ),
      expect: { count: 1 },
      why: "a `$with` CTE is the same subquery: its inner select carries no owner, so the outer by-id read returns any owner's persona",
    },
    {
      mode: "types",
      files: personaBody(
        "  return db.select().from(chats).innerJoin(pinned, eq(pinned.id, personaId)).where(eq(chats.id, chatId)).limit(1);\n",
        {
          "packages/server/src/domain/persona/persistence/aliases.ts":
            'import { alias } from "drizzle-orm/sqlite-core";\nimport { personas } from "@orb/db";\nexport const pinned = alias(personas, "pinned");\n',
        },
        'import { pinned } from "./aliases.ts";\n',
      ),
      expect: { count: 1, messageIncludes: "join" },
      why: "an `alias()` declared in another file is still the persona table: the declaration walk follows the import to the alias and judges the caller-id join",
    },
    {
      mode: "types",
      files: personaBody(
        '  const p = aliasedTable(personas, "p");\n  return db.select().from(chats).innerJoin(p, eq(p.id, personaId)).where(eq(chats.id, chatId)).limit(1);\n',
      ),
      expect: { count: 1, messageIncludes: "join" },
      why: "`aliasedTable()` names the persona table under a second name; the caller-id join through it is the same hole",
    },
    {
      mode: "types",
      files: personaBody("  const table = flag ? personas : workloads;\n  return db.select().from(table).where(eq(table.id, personaId)).limit(1);\n"),
      expect: { count: 1 },
      why: "a conditional table is judged on every arm: both arms are owner-scoped and the by-id read names neither owner",
    },
    {
      mode: "types",
      files: {
        ...CHAT_PERSONA_SCHEMA,
        [PERSONA_READ_PATH]:
          'import { eq } from "drizzle-orm";\nexport async function loadAny(db: Db, table: Tbl, id: string) {\n  return db.select().from(table).where(eq(table.id, id)).limit(1);\n}\n',
      },
      expect: { count: 1, messageIncludes: "unresolvable" },
      why: "a table anchor no declaration or type resolves is unproven, never skipped: it reports instead of passing",
    },
    {
      mode: "types",
      files: personaRead(".from(personas).where(or(eq(personas.ownerId, ownerId), eq(personas.id, personaId)))"),
      expect: { count: 1 },
      why: "an owner term inside `or(…)` scopes nothing: the other disjunct admits the caller-named persona",
    },
    {
      mode: "types",
      files: personaRead(".from(personas).where(and(eq(personas.id, personaId), ne(personas.ownerId, ownerId)))"),
      expect: { count: 1 },
      why: "`ne(T.ownerId, …)` names the owner column and selects every OTHER owner's row: only `eq`/`inArray` on the owner is scope",
    },
    {
      mode: "types",
      files: personaRead(".from(personas).where(and(eq(personas.id, personaId), isNotNull(personas.ownerId)))"),
      expect: { count: 1 },
      why: "`isNotNull(T.ownerId)` is true for every owner's row",
    },
    {
      mode: "types",
      files: personaRead(".from(personas).where(and(eq(personas.id, personaId), sql`${personas.ownerId} = ${ownerId}`))"),
      expect: { count: 1 },
      why: "a raw `sql` template is unreadable here, so it proves no owner scope even when it names the column",
    },
    {
      mode: "types",
      files: personaRead(".from(personas).where(and(eq(personas.id, personaId), eq(personas.ownerId, personas.ownerId)))"),
      expect: { count: 1 },
      why: "`eq(T.ownerId, T.ownerId)` is a tautology: the owner column compared with itself relates the row to no caller",
    },
    {
      mode: "types",
      files: personaRead(".from(chats).innerJoin(personas, eq(personas.id, chats.anchorPersonaId)).where(eq(chats.anchorPersonaId, personaId))"),
      expect: { count: 1 },
      why: "selecting by the chain's bound FK column is selecting the joined row by id: any chat anchored on the named persona returns it",
    },
    {
      mode: "types",
      files: personaRead(".from(personas).innerJoin(chats, and(eq(chats.anchorPersonaId, personas.id), eq(personas.id, personaId)))"),
      expect: { count: 1 },
      why: "a from-table selected by id inside an inner join's ON is the by-id hole moved out of the WHERE",
    },
    {
      mode: "types",
      files: {
        ...SATELLITE_SCHEMA,
        "packages/server/src/domain/world-info/persistence/queries.ts":
          'import { eq } from "drizzle-orm";\nimport { globalBooks, worldBooks } from "@orb/db";\nexport async function listGlobal(db: Db) {\n  return db.select().from(globalBooks).innerJoin(worldBooks, eq(worldBooks.id, globalBooks.bookId));\n}\n',
      },
      expect: { count: 1, messageIncludes: "satellite" },
      why: "a chain whose bound table is scoped only through the table it joins (a D23 satellite) is circular: every owner's global book comes back",
    },
    {
      mode: "types",
      files: personaBody(
        "  const ownedPersona = (o?: string) => (o === undefined ? eq(personas.id, personas.id) : eq(personas.ownerId, o));\n  return db.select().from(chats).innerJoin(personas, eq(personas.id, personaId)).where(and(eq(chats.id, chatId), ownedPersona(ownerId))).limit(1);\n",
      ),
      expect: { count: 1, messageIncludes: "join" },
      why: "a ternary helper body is judged on both branches: the no-owner branch is unscoped, so the helper proves nothing",
    },
    {
      mode: "types",
      files: personaBody(
        "  function ownedPersona(o: string | undefined) {\n    if (o !== undefined) {\n      return eq(personas.ownerId, o);\n    }\n  }\n  return db.select().from(chats).innerJoin(personas, eq(personas.id, personaId)).where(and(eq(chats.id, chatId), ownedPersona(ownerId))).limit(1);\n",
      ),
      expect: { count: 1, messageIncludes: "join" },
      why: "a helper whose block end is reachable returns `undefined` on that path, which scopes nothing",
    },
    {
      mode: "types",
      files: personaRead(".from(personas).where(and(eq(personas.id, personaId), flag ? eq(personas.ownerId, ownerId) : undefined))"),
      expect: { count: 1 },
      why: "an inline ternary owner term holds only when both arms hold; the `undefined` arm drops the owner",
    },
    {
      mode: "types",
      files: personaBody("  const q = db.select().from(personas);\n  return q.where(eq(personas.id, personaId)).limit(1);\n"),
      expect: { count: 1 },
      why: "a split builder keeps its WHERE on the binding: following `q` in the same function finds the by-id read",
    },
    {
      mode: "types",
      files: personaBody("  const byId = eq(personas.id, personaId);\n  return db.select().from(personas).where(byId).limit(1);\n"),
      expect: { count: 1 },
      why: "a split PREDICATE is read through its `const`: the by-id term bound to `byId` is still the by-id read",
    },
    {
      mode: "types",
      files: personaBody(
        '  const inner = db.$with("inner").as(db.select().from(personas));\n  const outer = db.$with("outer").as(db.select().from(inner));\n  return db.with(inner, outer).select().from(outer).where(eq(outer.id, personaId)).limit(1);\n',
      ),
      expect: { count: 1 },
      why: "a CTE over a CTE inherits the innermost select's scope: an unscoped persona read two CTEs down is still selected by id",
    },
    {
      mode: "types",
      files: pinBody(
        "  return db.select().from(chatParticipants).innerJoin(personas, and(eq(personas.ownerId, chatParticipants.userId), eq(personas.id, personaId))).limit(1);\n",
      ),
      expect: { count: 1, messageIncludes: "join" },
      why: "an owner term valued by an UNPINNED column scopes nothing: every seat anywhere is a candidate, so any persona whose owner holds any seat comes back",
    },
    {
      mode: "types",
      files: pinBody(
        '  const p2 = aliasedTable(personas, "p2");\n  return db.select().from(personas).innerJoin(p2, and(eq(p2.ownerId, personas.ownerId), eq(p2.id, personaId))).limit(1);\n',
      ),
      expect: { count: 1, messageIncludes: "join" },
      why: "a self-alias owner term relates the named persona to an unfiltered persona row of the same owner, never to the caller",
    },
    {
      mode: "types",
      files: pinBody(
        "  return db.select().from(personas).where(and(eq(personas.id, personaId), inArray(personas.ownerId, db.select({ u: chatParticipants.userId }).from(chatParticipants)))).limit(1);\n",
      ),
      expect: { count: 1, messageIncludes: "cross-tenant read hole" },
      why: "an `inArray` owner term over an unpinned subselect admits every owner who holds any seat",
    },
    {
      mode: "types",
      files: pinBody(
        "  return db.select().from(characterPersonas).innerJoin(personas, eq(personas.id, characterPersonas.personaId)).where(eq(characterPersonas.characterId, characterId));\n",
      ),
      expect: { count: 1, messageIncludes: "satellite" },
      why: "a two-parent junction gives no scope to one parent while its other parent is selected only by a caller-supplied id, not pinned to the caller",
    },
    {
      mode: "types",
      files: pinBody("  return db.select().from(messageAssets).innerJoin(assets, eq(assets.id, messageAssets.assetId));\n"),
      expect: { count: 1, messageIncludes: "satellite" },
      why: "a junction whose membership parent is not pinned by a value returns every owner's joined asset",
    },
    {
      mode: "types",
      files: pinBody("  return db.query.personas.findFirst({ where: eq(personas.id, personaId) });\n"),
      expect: { count: 1, messageIncludes: "cross-tenant read hole" },
      why: "the relational API is a read anchor: `db.query.personas.findFirst` by id with no owner term returns any owner's persona",
    },
    {
      mode: "types",
      files: pinBody("  return db.query.personas.findFirst({ where: (p, { eq: equals }) => equals(p.id, personaId) });\n"),
      expect: { count: 1, messageIncludes: "cross-tenant read hole" },
      why: "the callback `where` reads its columns through the row parameter and its operators through the destructured second parameter; a by-id callback is the same hole",
    },
    {
      mode: "types",
      files: pinBody("  return db.query.personas.findMany({ where: eq(personas.ownerId, ownerId), with: { chats: true } });\n"),
      expect: { count: 1, messageIncludes: "with:" },
      why: "a `with:` relation loads rows of a table no join condition names, so even an owner-scoped root cannot prove them",
    },
    {
      mode: "types",
      files: pinBody("  let byId = eq(personas.id, personaId);\n  return db.select().from(personas).where(byId).limit(1);\n"),
      expect: { count: 1, messageIncludes: "unproven" },
      why: "a `let` predicate can be reassigned, so its terms are unreadable: an unreadable WHERE is unproven, never a list read",
    },
    {
      mode: "types",
      files: pinBody(
        "  return db.select().from(personas).limit(1);\n",
        "export function filtered(db: Db, cond: SQL) {\n  return db.select().from(personas).where(cond);\n}\n",
      ),
      expect: { count: 1, messageIncludes: "unproven" },
      why: "a parameter WHERE is whatever the caller passes, a by-id term included",
    },
    {
      mode: "types",
      files: pinBody(
        "  const q = db.select().from(personas).$dynamic();\n  return byId(q, personaId);\n",
        "function byId(q: Q, id: string) {\n  return q.where(eq(personas.id, id));\n}\n",
      ),
      expect: { count: 1, messageIncludes: "unproven" },
      why: "a `$dynamic()` builder handed to a helper is filtered out of view: the helper can apply or replace any WHERE",
    },
    {
      mode: "types",
      files: pinBody(
        "  const terms = [isNotNull(personas.name)];\n  terms.push(eq(personas.id, personaId));\n  return db.select().from(personas).where(and(...terms)).limit(1);\n",
      ),
      expect: { count: 1, messageIncludes: "cross-tenant read hole" },
      why: "a term pushed onto a spread `const` array is a conjunct the statement carries: the pushed by-id term is the hole",
    },
    {
      mode: "types",
      files: pinBody("  return db.select().from(personas).where(byId(personaId)).limit(1);\n", "const byId = (id: string) => eq(personas.id, id);\n"),
      expect: { count: 1, messageIncludes: "cross-tenant read hole" },
      why: "a predicate helper is read through its return one hop deep: a helper that returns a by-id term is the by-id read",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { ownerId: text("owner_id") });\n',
        "packages/server/src/domain/character/persistence/queries.ts":
          'import { and, eq } from "drizzle-orm";\nimport { characters } from "@orb/db";\nexport async function loadOwned(db: Db, id: string, ownerId: string) {\n  return db.select().from(characters).where(and(eq(characters.id, id), eq(characters.ownerId, ownerId))).limit(1);\n}\n',
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
    {
      mode: "types",
      files: personaBody(
        '  const sq = db.select().from(personas).where(eq(personas.ownerId, ownerId)).as("sq");\n  return db.select().from(sq).where(eq(sq.id, personaId)).limit(1);\n',
      ),
      why: "a subquery whose inner select carries the owner predicate scopes every row the outer read can select",
    },
    {
      mode: "types",
      files: personaRead(".from(personas).where(and(eq(personas.id, personaId), inArray(personas.ownerId, [ownerId])))"),
      why: "`inArray(T.ownerId, owners)` is an owner predicate: only the listed owners' rows match",
    },
    {
      mode: "types",
      files: personaBody(
        "  const q = db.select().from(personas);\n  return q.where(and(eq(personas.id, personaId), eq(personas.ownerId, ownerId))).limit(1);\n",
      ),
      why: "a split builder whose followed WHERE carries the owner predicate is scoped",
    },
    {
      mode: "types",
      files: personaBody(
        "  const owned = flag ? eq(personas.ownerId, ownerId) : and(eq(personas.ownerId, ownerId), eq(personas.id, personaId));\n  return db.select().from(personas).where(owned).limit(1);\n",
      ),
      why: "a `const` predicate whose every ternary arm carries the owner term scopes the read (the stats rollup shape)",
    },
    {
      mode: "types",
      files: personaBody(
        '  const inner = db.$with("inner").as(db.select().from(personas).where(eq(personas.ownerId, ownerId)));\n  const outer = db.$with("outer").as(db.select().from(inner));\n  return db.with(inner, outer).select().from(outer).where(eq(outer.id, personaId)).limit(1);\n',
      ),
      why: "a CTE over an owner-scoped CTE is scoped: the nested check reaches the innermost select's owner term (the character activity shape)",
    },
    {
      mode: "types",
      files: pinBody(
        "  return db.select().from(chatParticipants).innerJoin(personas, and(eq(personas.ownerId, chatParticipants.userId), eq(personas.id, personaId))).where(eq(chatParticipants.chatId, chatId)).limit(1);\n",
      ),
      why: "an owner term valued by a column scopes when that column's table is pinned by a value one hop away: only seats of the named room count (the visible-rooms and corpus-source shape)",
    },
    {
      mode: "types",
      files: pinBody(
        '  const p2 = aliasedTable(personas, "p2");\n  return db.select().from(personas).innerJoin(p2, and(eq(p2.ownerId, personas.ownerId), eq(p2.id, personaId))).where(eq(personas.ownerId, ownerId)).limit(1);\n',
      ),
      why: "a self-alias owner term scopes when the aliased row is itself pinned to the caller's owner (the image-embedding upsert shape)",
    },
    {
      mode: "types",
      files: pinBody(
        "  return db.select().from(personas).where(and(eq(personas.id, personaId), inArray(personas.ownerId, db.select({ u: chatParticipants.userId }).from(chatParticipants).where(eq(chatParticipants.chatId, chatId))))).limit(1);\n",
      ),
      why: "an `inArray` owner term over a subselect pinned by a value admits only that room's seat holders",
    },
    {
      mode: "types",
      files: pinBody(
        "  return db.select().from(characterPersonas).innerJoin(characters, and(eq(characters.id, characterPersonas.characterId), eq(characters.ownerId, ownerId))).innerJoin(personas, eq(personas.id, characterPersonas.personaId)).where(eq(characterPersonas.characterId, characterId));\n",
      ),
      why: "a two-parent junction scopes the joined parent when the statement binds its other ownerId parent along the FK and pins that parent's owner",
    },
    {
      mode: "types",
      files: pinBody(
        "  return db.select().from(messageAssets).innerJoin(assets, eq(assets.id, messageAssets.assetId)).where(eq(messageAssets.messageId, messageId));\n",
      ),
      why: "a junction's membership parent selected by a value is the membership rung, which the verb gates (the declared limit for membership tables)",
    },
    {
      mode: "types",
      files: pinBody("  return db.query.personas.findFirst({ where: and(eq(personas.id, personaId), eq(personas.ownerId, ownerId)) });\n"),
      why: "a relational read whose `where` carries the owner term is scoped exactly as the select form is",
    },
    {
      mode: "types",
      files: pinBody("  return db.query.personas.findFirst({ where: (p, { and, eq }) => and(eq(p.id, personaId), eq(p.ownerId, ownerId)) });\n"),
      why: "a callback `where` carrying the owner term through its row parameter and destructured operators is scoped",
    },
    {
      mode: "types",
      files: pinBody(
        "  return new Local().query.personas.findFirst({ where: eq(personas.id, personaId) });\n",
        "class Local {\n  query = { personas: { findFirst: (config: object) => config } };\n}\n",
      ),
      why: "the relational verb is judged by its declaration: a `findFirst` a local class declares reads no table",
    },
    {
      mode: "types",
      files: pinBody(
        "  return db.select().from(personas).limit(1);\n",
        "export function filtered(db: Db, cond: SQL, ownerId: string) {\n  return db.select().from(personas).where(and(eq(personas.ownerId, ownerId), cond));\n}\n",
      ),
      why: "an unreadable conjunct beside a pinned owner term cannot widen the read: the owner term is in every row's filter",
    },
    {
      mode: "types",
      files: pinBody(
        "  const q = db.select().from(personas).where(eq(personas.ownerId, ownerId)).$dynamic();\n  if (flag) {\n    q.limit(1);\n  }\n  return await q;\n",
      ),
      why: "a `$dynamic()` builder that only takes method calls and an `await` in its own function stays in view (the roster-preset list shape)",
    },
  ],
});
