// Boot policy inputs and verdicts stay internal to the server; only policy functions reduce secret-bearing inputs.

import type { AuthMode } from "@orb/contracts/identity";
import type { NodeEnvironment } from "#primitives/node-environment";

/** The raw env values the resolver reads — passed in so this file never touches `process.env`. */
export interface BindPostureInput {
  readonly nodeEnv: NodeEnvironment;
  readonly authMode: AuthMode;
  /** `BIND_HOST` — unset means node's own default: EVERY interface. */
  readonly bindHost: string | undefined;
  /** `ALLOW_DEV_PUBLIC_BIND` — the deliberate-LAN-dev opt-in. */
  readonly allowDevPublicBind: boolean;
  /** `AUTH_FALLBACK_TRUSTED_PEERS` names at least one range: single-user's only door to a non-loopback bind. */
  readonly ownerPeersDeclared: boolean;
  /** `runsInContainer`: picks the fix the single-user refusal and notice name. */
  readonly inContainer: boolean;
}

/** The composed posture. Every field is a fact about this boot, safe to print in a boot log. */
export interface BindPosture {
  /** The host to hand `serve({ hostname })`. `undefined` ⇒ omit the option ⇒ every interface (node default). */
  readonly host: string | undefined;
  /** True when the resolved listener admits connections from beyond loopback. */
  readonly publicBind: boolean;
  /** Non-null ⇒ this env combination is BOOT-FATAL; the string is the operator-facing reason. */
  readonly refusal: string | null;
  /** The ONE boot-log line stating what this bind means for reachability. Always present: the restriction
   *  arm has to be discoverable AT THE MOMENT OF CONFUSION — an operator whose FQDN just started answering
   *  502 greps the boot log, and the 502 itself belongs to the proxy and cannot carry the hint. */
  readonly notice: string;
}

/** The raw env values the resolver reads — passed in so this file never touches `process.env`. */
export interface OwnerFallbackPeerInput {
  /** `AUTH_FALLBACK` — the knob `resolve` tests BEFORE the peer gate; `deny` makes this set unreachable. */
  readonly authFallback: "owner" | "deny";
  /** `AUTH_FALLBACK_TRUSTED_PEERS` — the raw comma CIDR list, or `undefined` when unset (the default). */
  readonly trustedPeers: string | undefined;
}

/** The composed posture. Both fields are facts about this boot, safe to print in a boot log. */
export interface OwnerFallbackPeerPosture {
  /** The parsed CIDR entries, reported even when `AUTH_FALLBACK=deny` makes them inert — a misconfigured
   *  deploy stays legible. */
  readonly ranges: readonly string[];
  /** True only when the widened set can actually admit somebody: ranges present AND the fallback enabled.
   *  This is what the warning and the /api/_debug credential rule (`diagnostics.ts`) key on. */
  readonly widened: boolean;
}

/** The raw env values the OWNER-FALLBACK credential rule reads — passed in so this file never touches
 *  `process.env` (the `BindPostureInput` shape). `authFallback` is a LAUNCH-time value, never a `.env` key
 *  (`foundation/env`'s superRefine refuses one), so a box's answer here is decided by how it was started. */
export interface OwnerFallbackCredentialInput {
  readonly nodeEnv: NodeEnvironment;
  readonly authFallback: "owner" | "deny";
  /** `AUTH_FALLBACK_TRUSTED_PEERS` resolved to an ACTIVE widening (`fallback-peers.ts::resolveOwnerFallbackPeers`
   *  `.widened`). `true` retracts this credential — see the rule below. */
  readonly fallbackWidened: boolean;
}

/** The composed verdict. Keys on RETENTION × PERIMETER — the credential planes are reported as facts
 *  beside it, because the door has a second credential (an admin session) that no env knob can remove. */
export const DIAGNOSTICS_EXPOSURES = ["minimal", "retaining", "retaining-open"] as const;
export type DiagnosticsExposure = (typeof DIAGNOSTICS_EXPOSURES)[number];

/** The raw env values the resolver reads — passed in so this file never touches `process.env`. */
export interface DiagnosticsPostureInput {
  readonly debugToken: string | undefined;
  readonly ipAllowlist: string | undefined;
  readonly wireCapture: "on" | "off";
  readonly rpgTrace: "on" | "off";
}

/** The composed posture. Every field is a FACT about the running box, safe to print in a boot log and on
 *  the (already host-gated) `/api/_debug/info` probe — no secret value appears, only whether one is set. */
export interface DiagnosticsPosture {
  /** `true` when `IP_ALLOWLIST` is non-empty — the 403-before-auth ring is armed. */
  readonly perimeter: boolean;
  /** `true` when `DEBUG_TOKEN` is set. The admin-SESSION credential exists either way. */
  readonly tokenConfigured: boolean;
  /** The recorders currently retaining bytes, by env knob. Empty ⇒ nothing is held. */
  readonly retaining: readonly string[];
  readonly exposure: DiagnosticsExposure;
}

/** The raw env values the resolver reads, passed in so this file never touches `process.env`. */
export interface AllowedHostsInput {
  /** `ALLOWED_HOSTS`: a comma list of names; a leading dot admits the name and every subdomain. */
  readonly allowedHosts: string | undefined;
  /** `OIDC_REDIRECT_URIS`: the OIDC callback URLs; each one's host is the operator's own name. */
  readonly oidcRedirectUris: string | undefined;
  /** The OS host name, or null when a container's random name must not be admitted. */
  readonly machineHostname: string | null;
}
