// The content store a root writes, opened from the record's `ASSETS_DIR` through the production factory, so a
// suite can age or remove a blob: a blob's mtime and presence are filesystem facts no injected clock moves.

import { createCas } from "@orb/server/infra/storage/cas";
import type { ServerTestHarness } from "./server.ts";

export function casOf(root: Pick<ServerTestHarness, "env" | "logger">): ReturnType<typeof createCas> {
  return createCas(root.env.ASSETS_DIR, root.logger);
}
