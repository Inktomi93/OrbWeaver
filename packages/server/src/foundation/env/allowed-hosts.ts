// The Host allowlist's configured names: `ALLOWED_HOSTS`, the `OIDC_REDIRECT_URIS` hosts and the machine's own name.
// Pure (raw values injected). The grammar is `@orb/kit/allowed-hosts`, shared with the setup wizard; `foundation/env`
// refuses a malformed entry at parse, and `infra/auth/host-allowlist.ts` matches the result.

import { isHostname, isTopLevelSuffix, machineHostNames, parseAllowedHosts } from "@orb/kit/allowed-hosts";

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
  const hostname = new URL(uri).hostname;
  const name = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
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

/** The parse refusal for one malformed entry, naming it and the grammar. */
export function allowedHostsEntryRefusal(entry: string): string {
  if (isTopLevelSuffix(entry)) {
    return (
      `ALLOWED_HOSTS entry "${entry}" would allow every name under a whole top-level domain, including names anyone can ` +
      "register. Write your own domain behind the dot, such as .example.com, or the exact name, such as nas.local."
    );
  }
  return (
    `ALLOWED_HOSTS entry "${entry}" is not a hostname. Write a name such as orbweaver.example.com, or ` +
    ".example.com for that name and every subdomain, separated by commas: no scheme, port, path or wildcard. " +
    "localhost and IP addresses are always allowed and need no entry."
  );
}
