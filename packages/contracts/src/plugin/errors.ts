// @orb/contracts/plugin — the membrane error vocabulary. These are the GUEST-observable
// failures the host throws across the boundary (they cross as `{name, message}` data, never live handles):
// an ungranted host-function call, and a version negotiation the host cannot serve. Distinct from
// the `domain/plugin` lifecycle errors (ManifestInvalid/HostVersionUnserved/PluginCrashed etc.),
// which never reach a guest.
//
// Each class sits in the domain error tree so the transport classifier answers it as a client or availability
// error if one ever escapes toward a route, instead of an unmodeled server error. The guest reads `name` and each
// class's own string fields; a host refusal with no class here carries its reason as a code.

import { DomainConflictError, DomainForbiddenError, DomainUnavailableError } from "@orb/kit/errors";
import type { PluginCapability } from "./manifest.ts";

/** Thrown UNIFORMLY by every capability-gated host function when its capability is not in `grants`
 *  — so a guest can feature-detect by try/catch or by reading `host.grants`. */
export class PluginCapabilityError extends DomainForbiddenError {
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
export class PluginSuggestedError extends DomainConflictError {
  /** Which act was stashed — the `PluginSuggestedAct` kind, so a guest can branch without parsing prose. */
  readonly act: string;
  constructor(act: string) {
    super(`plugin act "${act}" was raised as a suggestion for the room's host to confirm (the installer does not host this chat)`);
    this.name = "PluginSuggestedError";
    this.act = act;
  }
}

/** A host call outlived the host's real-time bound. The call is NOT cancelled when the host stops waiting for
 *  it (a started turn or a paint keeps running), so a guest reads this name as "no answer yet", never as a
 *  refusal. `name` crosses the QuickJS boundary intact, so a guest matches `e.name === "PluginHostDeadlineError"`. */
export class PluginHostDeadlineError extends DomainUnavailableError {
  /** The host function that outlived the bound, the bare property name, e.g. `getVariables`. */
  readonly hostFunction: string;
  constructor(hostFunction: string, deadlineMs: number) {
    super(`${hostFunction} exceeded ${deadlineMs}ms host bound`);
    this.name = "PluginHostDeadlineError";
    this.hostFunction = hostFunction;
  }
}

/** The code of a `PluginHostUnavailable` refusal made because a channel between the host's processes was full: that
 *  one call was refused and nothing else, and a retry may succeed (D348). */
export const PLUGIN_CHANNEL_FULL_CODE = "channel_full";
/** The codes a `PluginHostUnavailable` refusal may carry in `code`, so a guest tells why without reading the message.
 *  One with no code means the host could not serve the call at all. */
export const PLUGIN_HOST_REFUSAL_CODES = [PLUGIN_CHANNEL_FULL_CODE] as const;
export type PluginHostRefusalCode = (typeof PLUGIN_HOST_REFUSAL_CODES)[number];

/** Thrown by `orb.host(requestedMajor)` when the host does not serve that major — at ACTIVATION, loudly,
 *  so a V2-compiled plugin never half-runs on V1 (and, when V2 ships without a V1 adapter, symmetrically). */
export class HostVersionError extends DomainConflictError {
  readonly requested: number;
  readonly served: readonly number[];
  constructor(requested: number, served: readonly number[]) {
    super(`plugin host version ${requested} not served (served: ${served.join(", ")})`);
    this.name = "HostVersionError";
    this.requested = requested;
    this.served = served;
  }
}
