// The ONE boot disclaimer block: what this box is, who reaches it, who is the owner without a credential, how
// the session cookie travels, where the secrets live, then one security line per standing exposure, each
// naming its fix. There is no silence switch: a warning goes away when its cause is fixed.

import type { AuthMode } from "@orb/contracts/identity";
import { isCookieAuthMode, SESSION_COOKIE_NAMES } from "@orb/contracts/identity";
import type { BindPosture, OwnerFallbackPeerPosture } from "#foundation/env/record";

/** The disclaimer's closed topic set; `exposure` is the only one that can carry a security line. */
export const BOOT_DISCLAIMER_TOPICS = ["mode", "listen", "owner", "cookie", "secrets", "caveat", "exposure"] as const;

/** Where one boot secret came from: the explicit env value, else the keyfile path (`null` for a remote db). */
export interface BootSecretProvenance {
  readonly explicit: boolean;
  readonly keyfile: string | null;
}

/** The facts the block states. The warning lists are the posture modules' own, so the block restates no rule. */
export interface BootDisclaimerOptions {
  readonly authMode: AuthMode;
  readonly authFallback: "owner" | "deny";
  readonly breakGlass: boolean;
  readonly bind: BindPosture;
  readonly bindWarnings: readonly string[];
  readonly ownerPeers: OwnerFallbackPeerPosture;
  readonly ownerPeerWarnings: readonly string[];
  readonly diagnosticsWarnings: readonly string[];
  /** `forward-header` with no `FORWARD_AUTH_TRUSTED_PROXIES`: the unsigned header path refuses everyone. */
  readonly forwardHeaderUnsignedClosed: boolean;
  /** `forward-header` verifying JWTs with no `FORWARD_AUTH_JWKS`: the signed path refuses everyone. */
  readonly forwardHeaderSignedClosed: boolean;
  /** One line per `EGRESS_ALLOWLIST` entry that admits nothing (`egressAllowlistWarnings`). */
  readonly egressAllowlistWarnings: readonly string[];
  readonly secrets: { readonly sessionSecret: BootSecretProvenance; readonly credentialsKey: BootSecretProvenance };
}

export interface BootDisclaimerLine {
  readonly topic: (typeof BOOT_DISCLAIMER_TOPICS)[number];
  readonly level: "info" | "warn";
  /** A standing exposure an attacker could use; always a `warn`. */
  readonly security: boolean;
  readonly text: string;
}

const MODE_LINE: Record<AuthMode, string> = {
  "single-user": "mode: single-user — no login; the one owner is whoever the owner rule below admits.",
  local: "mode: local — people sign in with a handle and a password stored by this server.",
  oidc: "mode: oidc — people sign in through your identity provider (OIDC_ISSUER).",
  "forward-header": "mode: forward-header — the reverse proxy asserts who each request is.",
};

const SINGLE_USER_CAVEAT =
  "single-user: never put a reverse proxy or tunnel in front of this mode. A request carrying a forwarding header is refused the " +
  "owner, but a proxy or tunnel that sends no forwarding header is not seen and makes every visitor the owner. Behind any proxy use " +
  "a login mode (AUTH_MODE=local or oidc).";

const BREAK_GLASS_WARNING =
  "AUTH_BREAK_GLASS=true with AUTH_FALLBACK=owner — the un-credentialed owner fallback is ACTIVE in an SSO deploy (on-box recovery). " +
  "SSO is bypassed for any loopback request that carries no forwarding header, including one from a same-host proxy that sends none. " +
  "Set AUTH_FALLBACK=deny and unset AUTH_BREAK_GLASS as soon as recovery is done.";

const FORWARD_HEADER_CLOSED_WARNING =
  "AUTH_MODE=forward-header with FORWARD_AUTH_TRUSTED_PROXIES unset — the UNSIGNED trusted-header path refuses every request. Set " +
  "FORWARD_AUTH_TRUSTED_PROXIES to the proxy's address to enable it. The signed-JWT path does not read this setting.";

const FORWARD_HEADER_SIGNED_CLOSED_WARNING =
  "AUTH_MODE=forward-header with FORWARD_AUTH_JWKS unset — the SIGNED path refuses every forwarded JWT. Set FORWARD_AUTH_JWKS to the " +
  "proxy's JWKS URL or key set, or set FORWARD_AUTH_VERIFY_JWT=false if the proxy sends no JWT.";

function ownerLine(input: BootDisclaimerOptions): string {
  if (input.authFallback === "deny") {
    return "owner without a credential: nobody (AUTH_FALLBACK=deny).";
  }
  const peers = input.ownerPeers.widened ? `a loopback peer or a peer in [${input.ownerPeers.ranges.join(", ")}]` : "a loopback peer (this machine)";
  return `owner without a credential: ${peers}, on a request that carries no forwarding header.`;
}

function cookieLine(mode: AuthMode): string {
  if (!isCookieAuthMode(mode)) {
    return `session cookie: none — AUTH_MODE=${mode} mints no session cookie.`;
  }
  return (
    `session cookie: Secure \`${SESSION_COOKIE_NAMES.https}\` when a trusted proxy sends X-Forwarded-Proto: https; \`${SESSION_COOKIE_NAMES.http}\` in clear ` +
    "over plain http, so a device that signs in over plain http on your LAN keeps a cleartext cookie."
  );
}

function secretText(name: string, provenance: BootSecretProvenance): string {
  if (provenance.explicit) {
    return `${name} from the environment`;
  }
  return provenance.keyfile === null ? `${name} unavailable (the database is remote, so nothing is generated)` : `${name} generated at ${provenance.keyfile}`;
}

function secretsLine(secrets: BootDisclaimerOptions["secrets"]): string {
  return `secrets: ${secretText("SESSION_SECRET", secrets.sessionSecret)}; ${secretText("CREDENTIALS_KEY", secrets.credentialsKey)}. Back up generated keyfiles with the database.`;
}

function info(topic: BootDisclaimerLine["topic"], text: string): BootDisclaimerLine {
  return { topic, level: "info", security: false, text };
}

function exposure(text: string): BootDisclaimerLine {
  return { topic: "exposure", level: "warn", security: true, text };
}

// A refused path warns the operator but gives an attacker nothing, so it is never a security line.
function closedDoor(text: string): BootDisclaimerLine {
  return { topic: "exposure", level: "warn", security: false, text };
}

/** Compose the block, in order. A healthy box produces only `info` lines. */
export function composeBootDisclaimer(input: BootDisclaimerOptions): readonly BootDisclaimerLine[] {
  const breakGlassLive = input.authMode !== "single-user" && input.authFallback === "owner" && input.breakGlass;
  return [
    info("mode", MODE_LINE[input.authMode]),
    info("listen", `listen: ${input.bind.notice}`),
    info("owner", ownerLine(input)),
    info("cookie", cookieLine(input.authMode)),
    info("secrets", secretsLine(input.secrets)),
    ...(input.authMode === "single-user" ? [info("caveat", SINGLE_USER_CAVEAT)] : []),
    ...input.bindWarnings.map(exposure),
    ...input.ownerPeerWarnings.map(exposure),
    ...input.diagnosticsWarnings.map(exposure),
    ...(breakGlassLive ? [exposure(BREAK_GLASS_WARNING)] : []),
    ...(input.forwardHeaderUnsignedClosed ? [closedDoor(FORWARD_HEADER_CLOSED_WARNING)] : []),
    ...(input.forwardHeaderSignedClosed ? [closedDoor(FORWARD_HEADER_SIGNED_CLOSED_WARNING)] : []),
    ...input.egressAllowlistWarnings.map(closedDoor),
  ];
}
