// entry/http/healthz — the liveness registrar (core/Tier-5-Entry.md §layout "healthz"). Reports three boot/
// runtime signals the orchestrator + a load balancer poll: live (200), graceful-shutdown drain (503), and
// the boot decrypt-probe failure (503 `credentials_key_mismatch`). It owns NO crypto — the decrypt-probe
// runs ONCE at the crypto boot step (boot order step 2; see `core/Planning-and-Checklists.md`); this
// route reads its already-computed result via an injected getter and NEVER re-runs SecretBox here.
//
// Determinism: the route reads injected getters only — no clock, no ambient state of its own.

import type { Hono } from "hono";

const SERVICE_UNAVAILABLE = 503;

/** Boot/runtime signals the registrar reads (getters, so the route always sees the live value). */
export interface HealthzDeps {
  /** True once graceful shutdown has begun (drain in flight) — healthz flips to 503 so the LB stops
   *  routing new traffic while in-flight turns finish (boot order step 8). */
  readonly isShuttingDown: () => boolean;
  /** The boot decrypt-probe result: did `SecretBox` successfully decrypt the canary at boot? `false` means
   *  the `.credentials-key` no longer matches the stored ciphertext (a rotated/lost key) — the box can't
   *  read its own credentials, so it is NOT healthy (503 `credentials_key_mismatch`). */
  readonly credentialsKeyOk: () => boolean;
}

/** Register `GET /healthz`. 200 `{status:"ok"}` when live; 503 during shutdown drain; 503 on a boot
 *  decrypt-probe mismatch. Shutdown wins over the key signal (a draining box is leaving regardless). */
export function registerHealthz(app: Hono, deps: HealthzDeps): void {
  app.get("/healthz", (c) => {
    if (deps.isShuttingDown()) {
      return c.json({ status: "shutting_down" }, SERVICE_UNAVAILABLE);
    }
    if (!deps.credentialsKeyOk()) {
      return c.json({ status: "credentials_key_mismatch" }, SERVICE_UNAVAILABLE);
    }
    return c.json({ status: "ok" });
  });
}
