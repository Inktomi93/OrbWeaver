// @orb/contracts/plugin — the membrane error vocabulary. These are the GUEST-observable
// failures the host throws across the boundary (they cross as `{name, message}` data, never live handles):
// an ungranted host-function call, and a version negotiation the host cannot serve. Distinct from
// the `domain/plugin` lifecycle errors (ManifestInvalid/HostVersionUnserved/PluginCrashed etc.),
// which never reach a guest.

import type { PluginCapability } from "./manifest.ts";

/** Thrown UNIFORMLY by every capability-gated host function when its capability is not in `grants`
 *  — so a guest can feature-detect by try/catch or by reading `host.grants`. */
export class PluginCapabilityError extends Error {
  readonly capability: PluginCapability;
  constructor(capability: PluginCapability) {
    super(`plugin capability not granted: ${capability}`);
    this.name = "PluginCapabilityError";
    this.capability = capability;
  }
}

/** POSTURE 2 (interaction spec §3-S4): the installer has the GRANT but not standing authority on this chat,
 *  so the act was NOT performed — it was raised as a SUGGESTION for the room's host to confirm.
 *
 *  WHY A THROW AND NOT A SILENT SUCCESS. The three-posture law says the act becomes an ask; it does not say
 *  the guest should be misled about what happened. `chat.requestTurn` returns `void`, so resolving would tell
 *  a plugin its turn ran — and a plugin that believes it wrote does something else next (writes a "done"
 *  variable, fetches the result, posts a follow-up). A typed rejection is the honest wire: the call did not
 *  do the thing, AND it is not the flat refusal `PluginCapabilityError` describes. `name` crosses the
 *  QuickJS boundary intact, so a guest feature-detects by `e.name === "PluginSuggestedError"` and can wait
 *  rather than retry — retrying only replaces its own pending card (the store is replace-per-origin).
 *
 *  It is NOT a security boundary and must not be read as one: the boundary is the host-authority check that
 *  produced it. This is what the guest is TOLD about that check's outcome. */
export class PluginSuggestedError extends Error {
  /** Which act was stashed — the `PluginSuggestedAct` kind, so a guest can branch without parsing prose. */
  readonly act: string;
  constructor(act: string) {
    super(`plugin act "${act}" was raised as a suggestion for the room's host to confirm (the installer does not host this chat)`);
    this.name = "PluginSuggestedError";
    this.act = act;
  }
}

/** Thrown by `orb.host(requestedMajor)` when the host does not serve that major — at ACTIVATION, loudly,
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
