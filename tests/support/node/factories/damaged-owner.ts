// The owner row below `owner` or disabled is out-of-band surgery no verb can produce: setRole and setEnabled refuse
// the owner and boot heals it. D135(A) and D218 rule that every Principal-minting path reads it honestly and fails closed.

import { users } from "@orb/db";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";
import type { UserRow } from "./rows.ts";

/** The owner-row columns the D135 and D218 cases damage. */
export type OwnerRowDamage = Partial<Pick<UserRow, "role" | "enabled">>;

/** Damage the harness owner's row in place, as a manual database edit would. */
export async function damageOwnerRow(root: ServerProducerRoot & { readonly ownerId: UserRow["id"] }, damage: OwnerRowDamage): Promise<void> {
  await root.db.update(users).set(damage).where(eq(users.id, root.ownerId));
}
