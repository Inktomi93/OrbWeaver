// One canonical reader for "is this call a Drizzle CLIENT query?" — the fact a `db`/`tx` text regex was
// standing in for. The database handle is a PARAMETER of type `Db` (`packages/db/src/client`, a
// `LibSQLDatabase`), so it has no module-member origin of its own; what IS canonical is the METHOD: every
// query verb on the client and on its builders is declared inside the installed `drizzle-orm` package.
// Reading the property symbol therefore identifies `db.select()`, `tx.insert()`, `deps.db.batch()`,
// `this.#db["insert"]()` and `db.query.chats.findMany()` alike, while a same-named method on a local class
// or an unrelated import is refused. Callers own the fail-closed decision for an unresolved property.

import { declaredInDrizzle, readCalledMember } from "@orb/tooling/floor/code-facts/drizzle-write-chain";
import type { CallExpression } from "ts-morph";
import type { DrizzleClientCall } from "../contract/drizzle-client-call.ts";

/** Classify one call expression against the installed Drizzle client surface. */
export function readDrizzleClientCall(call: CallExpression): DrizzleClientCall {
  const member = readCalledMember(call);
  if (member.kind === "unresolved") {
    return { kind: "unresolved", method: null, nameNode: null, detail: member.detail };
  }
  const { name, nameNode, declarations } = member.value;
  if (declarations.length === 0) {
    return { kind: "unresolved", method: name, nameNode, detail: `the checker resolved no declaration for member ${name}` };
  }
  return declaredInDrizzle(declarations) ? { kind: "drizzle", method: name, nameNode } : { kind: "foreign", method: name, nameNode };
}
