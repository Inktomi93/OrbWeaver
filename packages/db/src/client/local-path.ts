// The native file client's path for a database URL, dependency-free so a caller that only resolves where a
// db file lives (snap's stage copy) never loads the libSQL client, drizzle and the schema.
import { fileURLToPath } from "node:url";

const FILE_SCHEME = "file:";

/** The native file client's path, retaining bare cwd-relative paths; undefined for non-file URLs. */
export function localPath(url: string): string | undefined {
  if (!url.startsWith(FILE_SCHEME)) {
    return;
  }
  // Node roots bare file URLs; libSQL retains relative paths and percent-decodes only the URI pathname.
  if (!url.startsWith(`${FILE_SCHEME}//`)) {
    const pathname = url.slice(FILE_SCHEME.length).split(/[?#]/u, 1)[0] ?? "";
    return decodeURIComponent(pathname);
  }
  return fileURLToPath(url); // file://host-form
}
