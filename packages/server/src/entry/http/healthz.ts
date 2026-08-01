// The liveness registrar. Owns no crypto — the decrypt-probe runs once at the crypto boot step; this
// route reads its already-computed result via an injected getter and never re-runs SecretBox here.

import type { Hono } from "hono";

const SERVICE_UNAVAILABLE = 503;

export interface HealthzDeps {
  readonly isShuttingDown: () => boolean;
  /** The boot decrypt-probe result: did SecretBox successfully decrypt the canary at boot? `false` means
   *  the credentials key no longer matches the stored ciphertext. */
  readonly credentialsKeyOk: () => boolean;
  /** Does this process carry the e2e-harness self-stamp (`E2E_HARNESS=on`)? Reported on the live body as
   *  `harness` so the e2e globalSetup can refuse to seed a stack it does not own (target-guard.ts). */
  readonly isHarnessStack: () => boolean;
}

/** Register `GET /healthz`. 200 when live (body also carries the e2e-harness stamp); 503 during shutdown
 *  drain; 503 on a boot decrypt-probe mismatch. */
export function registerHealthz(app: Hono, deps: HealthzDeps): void {
  app.get("/healthz", (c) => {
    if (deps.isShuttingDown()) {
      return c.json({ status: "shutting_down" }, SERVICE_UNAVAILABLE);
    }
    if (!deps.credentialsKeyOk()) {
      return c.json({ status: "credentials_key_mismatch" }, SERVICE_UNAVAILABLE);
    }
    return c.json({ status: "ok", harness: deps.isHarnessStack() });
  });
}
