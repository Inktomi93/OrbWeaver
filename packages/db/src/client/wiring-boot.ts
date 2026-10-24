// The boot-capability door: the `query-wiring-boot-admission` dependency rule confines its importers.
import type { BootDatabaseHandle, DatabaseHandle } from "./wiring-capabilities.ts";
import { bootDatabaseHandle as grantBoot } from "./wiring-capabilities.ts";

/** This door publishes the boot grant alone, not the private owner conversion API. */
export function bootDatabaseHandle(handle: DatabaseHandle): BootDatabaseHandle {
  return grantBoot(handle);
}
