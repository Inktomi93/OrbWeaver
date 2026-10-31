// The browser-storage names the durable-local doors and the appearance boot hint write. Zero imports, so the
// code that writes them and a suite that seeds the same storage read one spelling.

/** The persisted-store door's key prefix; the key is `<prefix>u/<userId>/<name>` once an identity is bound. */
export const PERSISTED_STORE_PREFIX = "orb:";

/** Where the last-bound identity is recorded, so a cold boot mints on the right namespace. */
export const ACTIVE_USER_KEY = `${PERSISTED_STORE_PREFIX}active-user`;

/** The appearance boot hint's persisted-store name and envelope version. */
export const APPEARANCE_BOOT_HINT_NAME = "appearance-boot";
export const APPEARANCE_BOOT_HINT_VERSION = 1;

/** The localStorage key a durable-local store persists under: `<prefix>u/<userId>/<name>` once an identity is bound, else `<prefix><name>`. */
export function durableLocalStorageKey(prefix: string, userId: string | null, name: string): string {
  return userId === null ? `${prefix}${name}` : `${prefix}u/${userId}/${name}`;
}
