// The shared "external-id-single-writer" family reader (Spine-Identity-and-Auth.md invariant 10): the ONE
// `users.externalId`/`external_id` write-shape predicate, the two sanctioned files, the subject-writer
// registry and its reference, call and positional-insert readers. `external-id-single-writer.ts` (per-file
// detector) and `external-id-single-writer-health.ts` (whole-population carve-out proof) both read this module
// instead of each carrying its own copy — a family means a shared `lib/` reader, never a shared theme
// (docs/law/gate-runtime-standardization.md).
import type { Node } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import { unwrapExpression } from "./ast-read.ts";
import { readMemberAccess, referencesModuleExport } from "./symbol-reference.ts";

const EXTERNAL_ID_KEYS: ReadonlySet<string> = new Set(["externalId", "external_id"]);
/** The users-row write verbs: the two sessions persistence wrappers + the raw drizzle write surface. An
 *  `externalId` object-key whose nearest enclosing call is one of these is a COLUMN write; the same key in a
 *  `.select(...)` map / an `audit(...)` metadata object / a bare return object is not. */
const EXTERNAL_ID_WRITE_VERBS: ReadonlySet<string> = new Set(["insertUser", "updateUser", "set", "values", "onConflictDoUpdate"]);

const SESSIONS = "packages/server/src/domain/sessions/";
export const LINK_CAPABILITY = `${SESSIONS}verbs/link-external-id.ts`;
export const PROVISION_CAPABILITY = `${SESSIONS}verbs/provision-identity.ts`;
export const PENDING_SIGNUP_CAPABILITY = `${SESSIONS}verbs/pending-signup.ts`;
// The persistence file that declares every registered subject writer.
const SUBJECT_WRITER_HOME = `${SESSIONS}persistence/users.ts`;
/** THE SUBJECT-WRITER REGISTRY: each persistence statement that binds a NON-NULL subject into
 *  `users.external_id`, mapped to the only capability files that may name it. This map is the census; a new
 *  subject writer or caller is a row here or a red finding.
 *   • `claimExternalIdIfUnbound` — the atomic bind of an EXISTING row. The admin link capability and the SSO
 *     seam's owner-flip bind both ride it, so the unbound test sits inside one UPDATE and two concurrent
 *     owner logins with different subjects cannot both win.
 *   • `insertPendingSignupUserStatement` — the D254 pending-join account insert, a NEW row planned through
 *     `decideProvision`. It binds positionally in raw SQL, so no key-shaped write predicate can see it.
 *  The registry is per writer: a registered caller of one writer is not a caller of another. */
export const SUBJECT_WRITERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["claimExternalIdIfUnbound", new Set([LINK_CAPABILITY, PROVISION_CAPABILITY])],
  ["insertPendingSignupUserStatement", new Set([PENDING_SIGNUP_CAPABILITY])],
]);
/** The TWO physical externalId writers serving the sanctioned capabilities. Named individually so a stale
 *  finding can name the dead one. */
export const EXTERNAL_ID_SANCTIONED_FILES = [PROVISION_CAPABILITY, SUBJECT_WRITER_HOME] as const;

const USERS_TABLE_EXPORT = "users";
const isDbModule = (specifier: string): boolean => specifier === "@orb/db" || specifier.startsWith("@orb/db/");

/** The simple name of a call's callee: `insertUser(…)` → "insertUser"; `db.x(…).set(…)` → "set". */
function externalIdCalleeName(call: Node): string | undefined {
  if (!call.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = call.getExpression();
  if (callee.isKind(SyntaxKind.PropertyAccessExpression)) {
    return callee.getName();
  }
  return callee.isKind(SyntaxKind.Identifier) ? callee.getText() : undefined;
}

/** A literal `null` / `undefined` value — a non-binding write (the local-user default + the un-bind). Seen
 *  through `as`/`satisfies`/parens (`null as ExternalId | null`). */
function isNullish(value: Node | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const inner = unwrapExpression(value);
  return inner.isKind(SyntaxKind.NullKeyword) || (inner.isKind(SyntaxKind.Identifier) && inner.getText() === "undefined");
}

/** Is an `externalId`/`external_id` object-KEY (assignment or shorthand) a users-COLUMN BIND — its nearest
 *  enclosing call is a write verb AND its value is not literal null? A key in a `.select()` map / `audit()`
 *  metadata / a bare return object has no enclosing write call; `externalId: null` binds no subject. A
 *  ShorthandPropertyAssignment carries a live variable (never a null literal) so it always binds. */
export function isExternalIdWriteKey(node: Node): boolean {
  if (node.isKind(SyntaxKind.PropertyAssignment)) {
    if (!EXTERNAL_ID_KEYS.has(node.getNameNode().getText().replace(/["']/gu, "")) || isNullish(node.getInitializer())) {
      return false;
    }
  } else if (node.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
    if (!EXTERNAL_ID_KEYS.has(node.getNameNode().getText())) {
      return false;
    }
  } else {
    return false;
  }
  const enclosingCall = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  return enclosingCall !== undefined && EXTERNAL_ID_WRITE_VERBS.has(externalIdCalleeName(enclosingCall) ?? "");
}

/** Is `node` an `<expr>.externalId = <value>` (or `.external_id =`) assignment of a NON-null value — the
 *  patch-building bind (`changes.externalId = …`)? `===` (an equality read) is a different token and is NOT
 *  matched; `= null` (the un-bind) is not a bind. */
export function isExternalIdAssignment(node: Node): boolean {
  if (!node.isKind(SyntaxKind.BinaryExpression) || node.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
    return false;
  }
  const lhs = node.getLeft();
  return lhs.isKind(SyntaxKind.PropertyAccessExpression) && EXTERNAL_ID_KEYS.has(lhs.getName()) && !isNullish(node.getRight());
}

/** Is this identifier the NAME of the function or variable it declares (`function w(…)`, `const w = …`)? */
function isDeclarationName(identifier: Node): boolean {
  const parent = identifier.getParent();
  return (TsNode.isFunctionDeclaration(parent) || TsNode.isVariableDeclaration(parent)) && parent.getNameNode() === identifier;
}

/** A reference to a registered subject writer, however it is spelled, with the exact node/token to report
 *  at. An identifier covers the bare call, the imported name of an aliased import (`import { w as x }` keeps
 *  `w` in the specifier, so an alias buys nothing), a re-export, a destructure, a namespace read `ns.w`, a
 *  `.call`/value pass and a wrapper in the home file; an element access covers `ns["w"]` and `ns[KEY]`. The
 *  one non-reference is the writer's own declaration name in `SUBJECT_WRITER_HOME`. */
export function subjectWriterReference(node: Node, rel: string): { readonly writer: string; readonly node: Node; readonly token: string } | undefined {
  if (node.isKind(SyntaxKind.Identifier)) {
    const writer = node.getText();
    if (!SUBJECT_WRITERS.has(writer) || (rel === SUBJECT_WRITER_HOME && isDeclarationName(node))) {
      return;
    }
    return { writer, node, token: writer };
  }
  if (!node.isKind(SyntaxKind.ElementAccessExpression)) {
    return;
  }
  const read = readMemberAccess(node);
  return read !== undefined && SUBJECT_WRITERS.has(read.name) ? { writer: read.name, node: read.nameNode, token: read.nameNode.getText() } : undefined;
}

/** The registered subject writer this call invokes by name (`w(…)`, `ns.w(…)`, `ns["w"](…)`), or undefined. */
export function calledSubjectWriter(node: Node): string | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = unwrapExpression(node.getExpression());
  const name = callee.isKind(SyntaxKind.Identifier) ? callee.getText() : readMemberAccess(callee)?.name;
  return name !== undefined && SUBJECT_WRITERS.has(name) ? name : undefined;
}

/** A POSITIONAL users insert — `<db>.insert(users).select(<rows>)` in any member spelling, with `users` the
 *  `@orb/db` table by named, aliased or namespace import. Its values bind by the table's declared column
 *  order, so no name in the source says which one lands in `external_id`. Returns the `select` name to
 *  report at and the rows argument. */
export function positionalUsersInsert(node: Node): { readonly node: Node; readonly token: string; readonly rows: Node } | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const select = readMemberAccess(node.getExpression());
  const rows = node.getArguments()[0];
  if (select?.name !== "select" || rows === undefined) {
    return;
  }
  const insert = unwrapExpression(select.receiver);
  if (!insert.isKind(SyntaxKind.CallExpression) || readMemberAccess(insert.getExpression())?.name !== "insert") {
    return;
  }
  const table = insert.getArguments()[0];
  if (table === undefined || !referencesModuleExport(unwrapExpression(table), USERS_TABLE_EXPORT, isDbModule)) {
    return;
  }
  return { node: select.nameNode, token: select.nameNode.getText(), rows };
}

// Does a positional insert's rows argument read an externalId (`${row.externalId}`, `{ externalId }`)?
function readsExternalId(rows: Node): boolean {
  return [rows, ...rows.getDescendantsOfKind(SyntaxKind.Identifier)].some((node) => node.isKind(SyntaxKind.Identifier) && EXTERNAL_ID_KEYS.has(node.getText()));
}

// Is `node` inside the declaration of a registered subject writer (at any depth)?
function insideSubjectWriter(node: Node): boolean {
  return node
    .getAncestors()
    .some((ancestor) => (TsNode.isFunctionDeclaration(ancestor) || TsNode.isVariableDeclaration(ancestor)) && SUBJECT_WRITERS.has(ancestor.getName() ?? ""));
}

/** May this positional users insert stand where it is? Only in `SUBJECT_WRITER_HOME`, and there one whose rows
 *  read an externalId must sit inside a registered writer, whose callers the reference reader polices.
 *  DECLARED LIMIT: in the home file a subject renamed before the bind (`const sub = row.externalId`, then
 *  `${sub}`) reads as no externalId. That is why every other file gets no name test at all. */
export function positionalInsertSanctioned(insert: Node, rows: Node, rel: string): boolean {
  return rel === SUBJECT_WRITER_HOME && (!readsExternalId(rows) || insideSubjectWriter(insert));
}

/** The exact node/token pair for one detected externalId write — the property NAME node (assignment,
 *  shorthand, or the LHS of `<x>.externalId = …`), never the whole guarded node: `report.node` requires
 *  its token be an exact slice of the reported node's OWN text, and a keyed assignment's or a patch
 *  assignment's full text does not start with the key. Returns the AUTHORED spelling
 *  (`external_id` stays `external_id`) rather than a hardcoded literal. */
export function externalIdWriteAnchor(node: Node): { readonly node: Node; readonly token: string } {
  if (node.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
    return { node: node.getNameNode(), token: node.getNameNode().getText() };
  }
  if (node.isKind(SyntaxKind.PropertyAssignment)) {
    const nameNode = node.getNameNode();
    return { node: nameNode, token: nameNode.getText() };
  }
  const lhs = node.asKindOrThrow(SyntaxKind.BinaryExpression).getLeft().asKindOrThrow(SyntaxKind.PropertyAccessExpression);
  const nameNode = lhs.getNameNode();
  return { node: nameNode, token: nameNode.getText() };
}
