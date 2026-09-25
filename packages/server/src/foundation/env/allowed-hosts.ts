// The Host allowlist's configured names (`ALLOWED_HOSTS`, the `OIDC_REDIRECT_URIS` hosts, the machine's own name) and
// the public addresses the Share card names from the same values. Pure (raw values injected); the grammar is
// `@orb/kit/allowed-hosts`. `foundation/env` refuses a malformed entry at parse; `infra/auth/host-allowlist.ts` matches.

import type { AuthMode } from "@orb/contracts/identity";
import {
  ALLOWED_HOST_SUFFIX_MARK,
  ALLOWED_HOSTS_KEY,
  isHostname,
  isPublicHostName,
  isTopLevelSuffix,
  machineHostNames,
  parseAllowedHosts,
  withoutTrailingDot,
} from "@orb/kit/allowed-hosts";

/** The raw env values the resolver reads, passed in so this file never touches `process.env`. */
export interface AllowedHostsInput {
  /** `ALLOWED_HOSTS`: a comma list of names; a leading dot admits the name and every subdomain. */
  readonly allowedHosts: string | undefined;
  /** `OIDC_REDIRECT_URIS`: the OIDC callback URLs; each one's host is the operator's own name. */
  readonly oidcRedirectUris: string | undefined;
  /** The OS host name, or null in a container (see {@link machineHostnameFor}). */
  readonly machineHostname: string | null;
}

/** The machine's own name is admitted on bare metal only. A rebinding page controls DNS for its own domain and
 *  cannot make the victim resolve the victim machine's own name (or `<name>.local`) to it; the residual is an mDNS
 *  spoofer already on the LAN. In a container the host name is a random id nobody types, so it adds nothing. */
export function machineHostnameFor(inContainer: boolean, hostname: string): string | null {
  return inContainer ? null : hostname;
}

const URI_SEPARATOR = ",";

// The host of one OIDC callback URL, or null for an unparseable URL or a bracketed IPv6 literal (IP literals pass
// without an entry; an IPv4 one fits the name grammar and is kept, which admits nothing new).
function redirectUriHost(uri: string): string | null {
  if (!URL.canParse(uri)) {
    return null;
  }
  const name = withoutTrailingDot(new URL(uri).hostname);
  return isHostname(name) ? name : null;
}

/** Every configured name the request guard admits: the valid `ALLOWED_HOSTS` entries, the OIDC callback hosts, then
 *  the machine's own name and its `.local` form, deduplicated. A malformed `ALLOWED_HOSTS` entry never reaches here,
 *  because the env parse refuses it first. */
export function resolveAllowedHosts(input: AllowedHostsInput): readonly string[] {
  const derived = (input.oidcRedirectUris ?? "")
    .split(URI_SEPARATOR)
    .map((uri) => redirectUriHost(uri.trim()))
    .filter((host) => host !== null);
  const machine = input.machineHostname === null ? [] : machineHostNames(input.machineHostname);
  return [...new Set([...parseAllowedHosts(input.allowedHosts).hosts, ...derived, ...machine])];
}

/** The addresses a stranger already reaches this server at, for the Share card to send friends to instead of a relay:
 *  under oidc the origin of each callback URL (the identity provider returns people only there), under local each exact
 *  `ALLOWED_HOSTS` name that is public ({@link isPublicHostName}). Empty for the other modes. */
export function publicAddresses(mode: AuthMode, input: AllowedHostsInput): readonly string[] {
  if (mode === "oidc") {
    const origins = (input.oidcRedirectUris ?? "")
      .split(URI_SEPARATOR)
      .map((uri) => uri.trim())
      .filter((uri) => URL.canParse(uri))
      .map((uri) => new URL(uri).origin);
    return [...new Set(origins)];
  }
  if (mode === "local") {
    return parseAllowedHosts(input.allowedHosts).hosts.filter((entry) => !entry.startsWith(ALLOWED_HOST_SUFFIX_MARK) && isPublicHostName(entry));
  }
  return [];
}

/** The parse refusal for one malformed entry, naming it and the grammar. */
export function allowedHostsEntryRefusal(entry: string): string {
  if (isTopLevelSuffix(entry)) {
    return (
      `${ALLOWED_HOSTS_KEY} entry "${entry}" would allow every name under a whole top-level domain, including names anyone can ` +
      "register. Write your own domain behind the dot, such as .example.com, or the exact name, such as nas.local."
    );
  }
  return (
    `${ALLOWED_HOSTS_KEY} entry "${entry}" is not a hostname. Write a name such as orbweaver.example.com, or ` +
    ".example.com for that name and every subdomain, separated by commas: no scheme, port, path or wildcard. " +
    "localhost and IP addresses are always allowed and need no entry."
  );
}
