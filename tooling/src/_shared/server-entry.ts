// The server's process entry, the one file every launcher runs. Node runs its `.ts` source directly: there is no
// server build step.
import { join } from "node:path";

/** The entry inside the `@orb/server` package directory. */
export const SERVER_ENTRY_IN_PACKAGE = join("src", "entry", "index.ts");

/** The entry from the repository root. */
export const SERVER_ENTRY_REL = join("packages", "server", SERVER_ENTRY_IN_PACKAGE);
