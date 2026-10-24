// Suites that prove a boot step or a cross-owner verb take the grant here, so testkit stays the one test-side mint (D335).
import type { Db } from "@orb/db";
import type { BootDatabaseHandle } from "@orb/db/wiring";
import { bootDatabaseHandle } from "@orb/db/wiring-boot";
import { databaseHandle } from "@orb/db/wiring-driver";

/** The boot grant over a suite's database, minted exactly as the lifecycle mints it. */
export function bootGrantFor(db: Db): BootDatabaseHandle {
  return bootDatabaseHandle(databaseHandle(db));
}
