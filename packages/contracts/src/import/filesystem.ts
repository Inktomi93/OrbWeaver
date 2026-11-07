const FS_DIR_ENTRY_KINDS = ["file", "directory", "other"] as const;
type FsDirEntryKind = (typeof FS_DIR_ENTRY_KINDS)[number];

interface FsDirEntry {
  readonly name: string;
  readonly kind: FsDirEntryKind;
}

/**
 * One open directory of a profile tree. A `name` is one entry of this directory and nothing else. The port decides how
 * far a read is trusted: a staged tree accepts only bytes that hash to the server's record of them, and the operator's
 * configured tree reads what its links reach.
 */
export interface ImportDirectory extends AsyncDisposable {
  /** The directory's display path, for reports and errors only. It is never a read input. */
  readonly path: string;
  /** An INFRASTRUCTURE fault (EACCES/EIO/…) must REJECT: an empty listing reads as "that plane is empty" and
   *  imports a truncated profile while reporting success. The collector wraps the rejection as
   *  `ImportInfraFailureError` naming the dir and `readdir`. */
  readonly list: () => Promise<readonly FsDirEntry[]>;
  /** Null for a MISSING child, or one a file occupies: a profile may carry only one plane. A dangling link and an
   *  infrastructure fault must reject, because reading either as absent drops the plane's data silently. A dangling
   *  link at the top of a tree lists as `other`: it is no plane, and nothing opens it. */
  readonly openDirectory: (name: string) => Promise<ImportDirectory | null>;
  readonly readFile: (name: string) => Promise<Uint8Array>;
  readonly stat: (name: string) => Promise<{ readonly size: number }>;
}

/** Filesystem reads distinguish an absent plane from an infrastructure failure. One port reads one tree. */
export interface ImportFsPort {
  /** The port's tree, or null when nothing is there. */
  readonly openTree: () => Promise<ImportDirectory | null>;
  readonly join: (...parts: string[]) => string;
}
