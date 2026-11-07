const FS_DIR_ENTRY_KINDS = ["file", "directory", "other"] as const;
type FsDirEntryKind = (typeof FS_DIR_ENTRY_KINDS)[number];

interface FsDirEntry {
  readonly name: string;
  readonly kind: FsDirEntryKind;
}

/**
 * One open directory of a profile tree. A `name` is one entry of this directory and nothing else, and the port binds
 * every read to this directory, so a listed name cannot be redirected by a later change to a parent path.
 */
export interface ImportDirectory extends AsyncDisposable {
  /** The directory's display path, for reports and errors only. It is never a read input. */
  readonly path: string;
  /** An INFRASTRUCTURE fault (EACCES/EIO/…) must REJECT: an empty listing reads as "that plane is empty" and
   *  imports a truncated profile while reporting success. The collector wraps the rejection as
   *  `ImportInfraFailureError` naming the dir and `readdir`. */
  readonly list: () => Promise<readonly FsDirEntry[]>;
  /** Null for a MISSING child, or one a file or a link occupies: a profile may carry only one plane, and a link is
   *  not a directory of this tree. An infrastructure fault must reject. */
  readonly openDirectory: (name: string) => Promise<ImportDirectory | null>;
  readonly readFile: (name: string) => Promise<Uint8Array>;
  readonly stat: (name: string) => Promise<{ readonly size: number }>;
}

/** Filesystem reads distinguish an absent plane from an infrastructure failure. */
export interface ImportFsPort {
  /** The tree at `root`, or null when nothing is there. */
  readonly openTree: (root: string) => Promise<ImportDirectory | null>;
  readonly join: (...parts: string[]) => string;
}
