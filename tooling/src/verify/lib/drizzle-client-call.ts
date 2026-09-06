// One canonical reader for "is this call a Drizzle CLIENT query?" — the fact a `db`/`tx` text regex was
// standing in for. The database handle is a PARAMETER of type `Db` (`packages/db/src/client`, a
// `LibSQLDatabase`), so it has no module-member origin of its own; what IS canonical is the METHOD: every
// query verb on the client and on its builders is declared inside the installed `drizzle-orm` package.
// Reading the property symbol therefore identifies `db.select()`, `tx.insert()`, `deps.db.batch()`,
// `this.#db["insert"]()` and `db.query.chats.findMany()` alike, while a same-named method on a local class
// or an unrelated import is refused. Callers own the fail-closed decision for an unresolved property.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { readMemberReference } from "./reference-fact.ts";

const DRIZZLE_PACKAGE_INFIX = "/drizzle-orm/";

export type DrizzleClientCall =
  /** The called member is declared inside the installed drizzle-orm package. */
  | { readonly kind: "drizzle"; readonly method: string; readonly nameNode: MorphNode }
  /** The member resolved to declarations OUTSIDE drizzle-orm — a same-named method of something else. */
  | { readonly kind: "foreign"; readonly method: string; readonly nameNode: MorphNode }
  /** No property symbol, or a member spelling the reader cannot normalize. Absence is never a verdict.
   *  `nameNode` is present whenever the MEMBER normalized and only the property symbol refused, so a
   *  fail-closed caller still has the exact authored token to anchor its finding on. */
  | { readonly kind: "unresolved"; readonly method: string | null; readonly nameNode: MorphNode | null; readonly detail: string };

function allInDrizzle(declarations: readonly MorphNode[]): boolean {
  return declarations.every((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").includes(DRIZZLE_PACKAGE_INFIX));
}

/** Classify one call expression against the installed Drizzle client surface. */
export function readDrizzleClientCall(call: CallExpression): DrizzleClientCall {
  const member = readMemberReference(call.getExpression());
  if (member.kind === "unresolved") {
    return { kind: "unresolved", method: null, nameNode: null, detail: member.detail };
  }
  const { name, receiver, nameNode } = member.value;
  const property = receiver.getType().getProperty(name);
  const declarations = property?.getDeclarations() ?? [];
  if (declarations.length === 0) {
    return { kind: "unresolved", method: name, nameNode, detail: `the checker resolved no declaration for member ${name}` };
  }
  return allInDrizzle(declarations) ? { kind: "drizzle", method: name, nameNode } : { kind: "foreign", method: name, nameNode };
}
