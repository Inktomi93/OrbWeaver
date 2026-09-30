// The db backup naming patterns, dependency-free so `#foundation/env` can read them without loading the
// libSQL client, drizzle and the schema (the plugin-worker-no-db depcruise rule holds that line).

/**
 * The pin marker: an empty sibling file `<db>.backup-<stamp>.keep` in the backup dir exempts that backup
 * from the retention sweep for good, on top of the recent/daily budget. Create one with a bare `touch`; the
 * marker is the whole mechanism. A pin saves the pre-migrate backup of a dev database the next migrating
 * boots would otherwise age out.
 *
 * A marker for a stamp with no base copy pins nothing, and the sweep's patterns never match the marker
 * itself, so `pruneDbBackups` never deletes one. An orphaned marker accumulates on purpose: it is a
 * zero-byte human intent, and deciding "gone" from a listing taken while another boot may be mid-copy is
 * the wrong trade.
 */
export const PIN_SUFFIX = ".keep";

// The ONE pair of anchored, regex-escaped name patterns for a db's backups: the copies with their sidecars,
// and the pin markers. Both the retention sweep and the layout migration's enumeration read through these.
export function backupNamePatterns(base: string): { readonly backupRe: RegExp; readonly pinRe: RegExp } {
  const escaped = RegExp.escape(base);
  return {
    backupRe: new RegExp(`^${escaped}\\.backup-(\\d+)(-wal|-shm)?$`, "g"),
    pinRe: new RegExp(`^${escaped}\\.backup-(\\d+)${RegExp.escape(PIN_SUFFIX)}$`, "g"),
  };
}

/** Whether `name` is one of `base`'s backup copies, sidecars or pin markers, by the sweep's own patterns. */
export function isBackupFileName(name: string, base: string): boolean {
  const { backupRe, pinRe } = backupNamePatterns(base);
  return [...name.matchAll(backupRe)].length > 0 || [...name.matchAll(pinRe)].length > 0;
}
