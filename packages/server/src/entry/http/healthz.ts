// The liveness registrar. Owns no crypto — the decrypt-probe runs once at the crypto boot step; this
// route reads its already-computed result via an injected getter and never re-runs SecretBox here.

import type { VersionIdentity } from "@orb/kit/version-identity";
import type { Hono } from "hono";
import { peerIp } from "#infra/network";

const SERVICE_UNAVAILABLE = 503;

export interface HealthzDeps {
  readonly isShuttingDown: () => boolean;
  /** The boot decrypt-probe result: did SecretBox successfully decrypt the canary at boot? `false` means
   *  the credentials key no longer matches the stored ciphertext. */
  readonly credentialsKeyOk: () => boolean;
  /** Does this process carry the e2e-harness self-stamp (`E2E_HARNESS=on`)? Reported on the live body as
   *  `harness` so the e2e globalSetup can refuse to seed a stack it does not own (target-guard.ts). */
  readonly isHarnessStack: () => boolean;
  /** This process's build identity (`#foundation/version`), frozen at boot. Reported on every arm the
   *  {@link HealthzDeps.identityVisible} gate admits, 200 and 503 alike: a box refusing traffic is exactly
   *  when its operator files a bug report that has to say what the box is. */
  readonly version: () => VersionIdentity;
  /**
   * Is this caller the box operator? Only then does the body carry the build identity (ADR 0076).
   *
   * SECURITY: a public share link reaches this route, and the exact build tells a stranger which known issues
   * apply. Wire the loopback-peer-and-no-relay-header gate here, never a Host check: a same-host tunnel arrives on
   * a loopback socket and only its relay header tells it apart.
   */
  readonly identityVisible: (peerIp: string | undefined, headers: Headers) => boolean;
}

/** Register `GET /healthz`. 200 when live (body also carries the e2e-harness stamp); 503 during shutdown
 *  drain; 503 on a boot decrypt-probe mismatch. The build-identity block rides every arm, for the operator only. */
export function registerHealthz(app: Hono, deps: HealthzDeps): void {
  app.get("/healthz", (c) => {
    const identity = deps.identityVisible(peerIp(c), c.req.raw.headers) ? { version: deps.version() } : {};
    if (deps.isShuttingDown()) {
      return c.json({ status: "shutting_down", ...identity }, SERVICE_UNAVAILABLE);
    }
    if (!deps.credentialsKeyOk()) {
      return c.json({ status: "credentials_key_mismatch", ...identity }, SERVICE_UNAVAILABLE);
    }
    return c.json({ status: "ok", harness: deps.isHarnessStack(), ...identity });
  });
}
