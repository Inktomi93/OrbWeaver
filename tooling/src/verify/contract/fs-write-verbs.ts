// The filesystem doors and every export of them that creates, changes or removes an entry. A gate family test
// writes only through the scratch writers in tests/support/node/tool-fixtures.ts; the hard lint rule
// `orb/no-raw-fs-write-in-gate-tests` bans importing any name below. A sync verb and its async twin sit together:
// a missing twin is a spelling that bypasses the ban.

/** Module specifiers that reach the filesystem. A bare node builtin has no origin to resolve past. */
export const FS_SPECIFIERS = ["fs", "node:fs", "fs/promises", "node:fs/promises", "fs-extra"] as const;

export const FS_WRITE_VERBS = [
  "writeFileSync",
  "writeFile",
  "appendFileSync",
  "appendFile",
  "mkdirSync",
  "mkdir",
  "rmSync",
  "rm",
  "rmdirSync",
  "rmdir",
  "unlinkSync",
  "unlink",
  "cpSync",
  "cp",
  "copyFileSync",
  "copyFile",
  "renameSync",
  "rename",
  "createWriteStream",
  "symlinkSync",
  "symlink",
  "linkSync",
  "link",
  // A write-capable open mutates the path it opens; reads go through readFileSync.
  "openSync",
  "open",
  "truncateSync",
  "truncate",
  "chmodSync",
  "chmod",
  "chownSync",
  "chown",
  "lchownSync",
  "lchown",
  "lchmodSync",
  "lchmod",
  "lutimesSync",
  "lutimes",
  "utimesSync",
  "utimes",
  "mkdtempSync",
  "mkdtemp",
  "mkdtempDisposableSync",
  "mkdtempDisposable",
  // The promise namespace carries every verb above.
  "promises",
] as const;
