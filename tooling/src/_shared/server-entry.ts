// The server's process entry, the one file every launcher runs. Node runs its `.ts` source directly: there is no
// server build step.
import { join } from "node:path";

/** The entry inside the `@orb/server` package directory. */
export const SERVER_ENTRY_IN_PACKAGE = join("src", "entry", "index.ts");

/** The entry from the repository root. */
export const SERVER_ENTRY_REL = join("packages", "server", SERVER_ENTRY_IN_PACKAGE);

/** The Node flags every launcher starts the server with. `--disable-sigusr1` stops any process running as the app's
 *  user, the plugin broker included, from opening the app's inspector with SIGUSR1. The image sets the same flag
 *  through `NODE_OPTIONS` in the `Dockerfile`. */
export const SERVER_NODE_FLAGS = ["--disable-sigusr1"] as const;
