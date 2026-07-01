// entry/index — THE process entry point (`tsx packages/server/src/entry/index.ts`; core/Tier-5-Entry.md
// §"Boot order"). It is intentionally tiny: construct the lifecycle, wire the OS shutdown signals, run
// `boot()`. All the wiring lives in `lifecycle.ts` (boot/serve) + `app.ts` (the HTTP edge). Nothing imports
// this file — it sits at the very top of the cake (entry invariant #3); importing `@orb/server/foundation/env`
// is the one `process.env` read (foundation owns it), and `getLog()` is the only output (the noConsole ban).
//
// A boot failure is FATAL: log it and exit non-zero so the orchestrator restarts (or surfaces) the box —
// never leave a half-booted process pretending to be alive.

import process from "node:process";
import { getLog } from "#foundation/observability";
import { createLifecycle } from "./lifecycle";

const EXIT_BOOT_FAILURE = 1;

const lifecycle = createLifecycle();

// Wire graceful shutdown BEFORE boot so a signal arriving mid-boot still tears down cleanly (shutdown is
// idempotent + flips healthz to 503 first).
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void lifecycle.shutdown().then(() => {
      process.exit(0);
    });
  });
}

lifecycle.boot().catch((err: unknown) => {
  getLog().error({ err }, "entry: boot failed — exiting");
  process.exit(EXIT_BOOT_FAILURE);
});
