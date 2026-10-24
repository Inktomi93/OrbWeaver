// Boot may mint a credentials key only while no sealed row depends on the one it cannot find.

import { userCredentials } from "@orb/db";
import type { BootDatabaseHandle } from "@orb/db/wiring";
import { bootDatabaseForOwner } from "@orb/db/wiring-owner";

/** Whether any `user_credentials` row holds ciphertext sealed under the current credentials key. */
export async function hasSealedCredentials(handle: BootDatabaseHandle): Promise<boolean> {
  const rows = await bootDatabaseForOwner(handle).select({ id: userCredentials.id }).from(userCredentials).limit(1);
  return rows.length > 0;
}
