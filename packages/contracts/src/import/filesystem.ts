export const FS_DIR_ENTRY_KINDS = ["file", "directory", "other"] as const;
export type FsDirEntryKind = (typeof FS_DIR_ENTRY_KINDS)[number];

export interface FsDirEntry {
  readonly name: string;
  readonly kind: FsDirEntryKind;
}

/** Filesystem reads distinguish an absent plane from an infrastructure failure. */
export interface ImportFsPort {
  /** Must resolve to [] (never throw) for a MISSING dir — a profile may carry only one subdir. An
   *  INFRASTRUCTURE fault on a dir that exists (EACCES/EIO/ELOOP/…) must REJECT: folding it into the same
   *  empty listing reads as "that plane is empty" and imports a truncated profile while reporting success
   *  (#1469). The collector wraps the rejection as `ImportInfraFailureError` naming the dir + `readdir`. */
  readonly readdir: (dir: string) => Promise<readonly FsDirEntry[]>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly stat: (path: string) => Promise<{ readonly size: number }>;
  readonly join: (...parts: string[]) => string;
}
