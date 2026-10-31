// The names a cold boot is addressed by: the mount node, the readiness marker and the durable-local keys.
// Zero imports, so a test or the e2e transform reads them without loading the app graph.

/** The `<html>` marker the readiness signal raises: presence means stop waiting, the value says whether the reads settled. */
export const APP_READY_ATTR = "data-app-ready";

/** The mount node `index.html` declares. */
export const APP_ROOT_ID = "root";

/** The door prefix every persisted store's localStorage key starts with. */
export const DURABLE_LOCAL_PREFIX = "orb:";

/** Where the last-bound identity is recorded, so a cold boot mints on the right namespace. */
export const ACTIVE_USER_KEY = `${DURABLE_LOCAL_PREFIX}active-user`;

/** The persisted store holding this device's remembered appearance, and the version its envelope carries. */
export const APPEARANCE_BOOT_HINT_NAME = "appearance-boot";
export const APPEARANCE_BOOT_HINT_VERSION = 1;

/** The localStorage key a durable-local store persists under: `<prefix>u/<userId>/<name>` once an identity is bound, else `<prefix><name>`. */
export function durableLocalStorageKey(prefix: string, userId: string | null, name: string): string {
  return userId === null ? `${prefix}${name}` : `${prefix}u/${userId}/${name}`;
}
