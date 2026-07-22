// The ONE FK-walk that resolves a seat/party holder `UserId` → its principal KIND (D80 FK-derived-kind;
// agent-principal-design/05 §2 AP4a). Homed HERE (compose glue) because rpg must NEVER read `users` directly —
// this is the injected boundary compose wires into `RpgContext.identity.resolvePartyActorKind`. Exported (not
// an inline lambda) so the rpg-context / containment test seams drive the REAL op instead of a hand-copied
// mirror that can drift silently (audit F6). `null` ⇒ the row is gone (an owner-delete cascade race — every
// caller fails closed). The agent arm carries `enabled` — the kill switch that revokes an agent GM's authority.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { RpgActorKind } from "#domain/rpg";

/** Build the `resolvePartyActorKind` op over `db`: a holder `UserId` → `{kind:"human"}` | `{kind:"agent", enabled}`
 *  | `null` (the row is gone). Reads only `users.kind` + `users.enabled` — the least the FK-derived-kind needs. */
export function createResolvePartyActorKind(db: Db): (userId: UserId) => Promise<RpgActorKind | null> {
  return async (userId) => {
    const rows = await db.select({ kind: users.kind, enabled: users.enabled }).from(users).where(eq(users.id, userId)).limit(1);
    const row = rows.at(0);
    if (row === undefined) {
      return null;
    }
    return row.kind === "agent" ? { kind: "agent", enabled: row.enabled } : { kind: "human" };
  };
}
