// The process entry point. Intentionally tiny: construct the lifecycle, wire the OS shutdown signals, run
// boot(). All the wiring lives in lifecycle.ts + app.ts. A boot failure is fatal: log it and exit non-zero
// so the orchestrator restarts the box — never leave a half-booted process pretending to be alive.

import process from "node:process";
import { getLog } from "#foundation/observability";
import { createLifecycle } from "./lifecycle.ts";

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
