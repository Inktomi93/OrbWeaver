// The liveness registrar. Owns no crypto — the decrypt-probe runs once at the crypto boot step; this
// route reads its already-computed result via an injected getter and never re-runs SecretBox here.

import type { VersionIdentity } from "@orb/kit/version-identity";
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
  /** This process's build identity (`#foundation/version`), frozen at boot. Reported on EVERY arm, 200 and
   *  503 alike: a bug report filed against a box that is refusing traffic still has to say WHAT that box is,
   *  and the shutdown / key-mismatch arms are exactly when someone is filing one. */
  readonly version: () => VersionIdentity;
}

/** Register `GET /healthz`. 200 when live (body also carries the e2e-harness stamp); 503 during shutdown
 *  drain; 503 on a boot decrypt-probe mismatch. Every arm carries the build-identity block. */
export function registerHealthz(app: Hono, deps: HealthzDeps): void {
  app.get("/healthz", (c) => {
    const version = deps.version();
    if (deps.isShuttingDown()) {
      return c.json({ status: "shutting_down", version }, SERVICE_UNAVAILABLE);
    }
    if (!deps.credentialsKeyOk()) {
      return c.json({ status: "credentials_key_mismatch", version }, SERVICE_UNAVAILABLE);
    }
    return c.json({ status: "ok", harness: deps.isHarnessStack(), version });
  });
}
