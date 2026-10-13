import type { Dirent } from "node:fs";
import { readdir as readdirFs, stat as statFs } from "node:fs/promises";
import { join } from "node:path";
import type { ImportFsPort } from "@orb/contracts/import";
import { readStorageFileNoFollow } from "./stage-dir.ts";

type FsEntry = Awaited<ReturnType<ImportFsPort["readdir"]>>[number];

function direntKind(e: Dirent): FsEntry["kind"] {
  if (e.isFile()) {
    return "file";
  }
  return e.isDirectory() ? "directory" : "other";
}

/** The fs codes that mean "this profile carries no such plane": the dir is not there (`ENOENT`), or the name
 *  is occupied by a FILE (`ENOTDIR`) — both are ABSENT, which is the port's documented `[]`. Every other code
 *  (`EACCES`, `EIO`, `ELOOP`, `EMFILE`, …) is an INFRASTRUCTURE fault: folding those into the same empty
 *  listing made an unreadable `characters/` read as "this profile has no characters" and imported a truncated
 *  profile while reporting success (#1469). */
const ABSENT_DIR_CODES: ReadonlySet<string> = new Set(["ENOENT", "ENOTDIR"]);

/** The real node:fs `ImportFsPort` for the staged profile snapshot. `readdir` resolves `[]` for an ABSENT dir
 *  (the port contract — a profile may carry only one subdir) and REJECTS on an infrastructure fault. */
export function createNodeFsImportPort(): ImportFsPort {
  return {
    readdir: async (dir): Promise<readonly FsEntry[]> => {
      // The catch is NARROWED to the two ABSENT
      // codes and RE-THROWS everything else — an infra fault leaves as a rejection, which the collector
      // wraps as `ImportInfraFailureError`. Ends if the port stops distinguishing absent from broken.
      try {
        const ents = await readdirFs(dir, { withFileTypes: true });
        return ents.map((e): FsEntry => ({ name: e.name, kind: direntKind(e) }));
      } catch (error) {
        if (!ABSENT_DIR_CODES.has((error as NodeJS.ErrnoException).code ?? "")) {
          throw error;
        }
        return [];
      }
    },
    readFile: readStorageFileNoFollow,
    stat: async (path): Promise<{ readonly size: number }> => {
      const s = await statFs(path);
      return { size: s.size };
    },
    join: (...parts): string => join(...parts),
  };
}
