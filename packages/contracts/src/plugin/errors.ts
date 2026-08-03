// @orb/contracts/plugin — the membrane error vocabulary (plugin-design/01 §2/§3). These are the GUEST-observable
// failures the host throws across the boundary (they cross as `{name, message}` data, never live handles — P1
// report §2): an ungranted host-function call, and a version negotiation the host cannot serve. Distinct from
// the `domain/plugin` lifecycle errors (02 §5 — ManifestInvalid/HostVersionUnserved/PluginCrashed etc., P3),
// which never reach a guest.

import type { PluginCapability } from "./manifest.ts";

/** Thrown UNIFORMLY by every capability-gated host function when its capability is not in `grants` (01 §2 pt 3)
 *  — so a guest can feature-detect by try/catch or by reading `host.grants`. */
export class PluginCapabilityError extends Error {
  readonly capability: PluginCapability;
  constructor(capability: PluginCapability) {
    super(`plugin capability not granted: ${capability}`);
    this.name = "PluginCapabilityError";
    this.capability = capability;
  }
}

/** Thrown by `orb.host(requestedMajor)` when the host does not serve that major (01 §3) — at ACTIVATION, loudly,
 *  so a V2-compiled plugin never half-runs on V1 (and, when V2 ships without a V1 adapter, symmetrically). */
export class HostVersionError extends Error {
  readonly requested: number;
  readonly served: readonly number[];
  constructor(requested: number, served: readonly number[]) {
    super(`plugin host version ${requested} not served (served: ${served.join(", ")})`);
    this.name = "HostVersionError";
    this.requested = requested;
    this.served = served;
  }
}
