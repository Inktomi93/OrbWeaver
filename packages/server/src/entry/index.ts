// The process entry point. Intentionally tiny: construct the lifecycle, wire the OS shutdown signals, run
// boot(). All the wiring lives in lifecycle.ts + app.ts. A boot failure is fatal: log it and exit non-zero
// so the orchestrator restarts the box — never leave a half-booted process pretending to be alive.

import process from "node:process";
import { EnvRefusedError } from "#foundation/env/refusal";

const EXIT_BOOT_FAILURE = 1;

// The lifecycle graph parses the environment as it loads, so a refused key surfaces as this import's rejection. It
// prints as the named refusal alone; any other load failure keeps its stack.
const { createLifecycle } = await import("./lifecycle.ts").catch((err: unknown) => {
  if (err instanceof EnvRefusedError) {
    process.stderr.write(`${err.message}\n`);
    process.exit(EXIT_BOOT_FAILURE);
  }
  throw err;
});
const { getLog } = await import("#foundation/observability");

const lifecycle = createLifecycle();

// Wire graceful shutdown BEFORE boot so a signal arriving mid-boot still tears down cleanly (shutdown is
// idempotent + flips healthz to 503 first).
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    // @orb-waive caught-failure-ownership(shutdown): owned: the handler logs through getLog and exits non-zero; getLog is imported after the env parse, where this policy cannot resolve it as the logger. Ends if getLog returns to a static import.
    lifecycle
      .shutdown()
      .then(() => {
        process.exit(0);
      })
      .catch((err: unknown) => {
        getLog().error({ err, signal }, "entry: shutdown failed — exiting non-zero");
        process.exit(EXIT_BOOT_FAILURE);
      });
  });
}

// @orb-waive caught-failure-ownership(lifecycle.boot): owned: the handler logs through getLog and exits non-zero; getLog is imported after the env parse, where this policy cannot resolve it as the logger. Ends if getLog returns to a static import.
lifecycle.boot().catch((err: unknown) => {
  getLog().error({ err }, "entry: boot failed — exiting");
  process.exit(EXIT_BOOT_FAILURE);
});
