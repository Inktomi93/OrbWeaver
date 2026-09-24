// The `ALLOWED_HOSTS` grammar and the always-allowed rule, one home for the server (its env parse and its Host
// check) and the `pnpm start --setup` wizard that writes the key. An entry is a hostname or a dot-led suffix;
// localhost and IP literals always pass, so the grammar has no IP form.

import { parseIp } from "#ip";

/** The env key the operator's extra names live under. */
export const ALLOWED_HOSTS_KEY = "ALLOWED_HOSTS";

/** A parsed value: canonical entries, plus every entry that failed the grammar (the env refusal names each one). */
export interface AllowedHostsParse {
  readonly hosts: readonly string[];
  readonly malformed: readonly string[];
}

const ENTRY_SEPARATOR = ",";
/** An entry starting with this admits the name after it and every subdomain. */
export const ALLOWED_HOST_SUFFIX_MARK = ".";
// RFC 1035 name and label bounds. The label also admits `_`, which browsers accept in a host.
const MAX_NAME_CHARS = 253;
const LABEL_RE = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/u;
const TRAILING_DOT = ".";
const LOCALHOST = "localhost";
const LOCALHOST_SUFFIX = `.${LOCALHOST}`;
const BRACKETED_RE = /^\[(.*)\]$/u;

/** Drop one trailing dot: `example.com.` names the same DNS node as `example.com`. */
export function withoutTrailingDot(name: string): string {
  return name.endsWith(TRAILING_DOT) ? name.slice(0, -TRAILING_DOT.length) : name;
}

/** The names that pass the Host check with no entry: localhost, any `*.localhost` name (never resolved through public
 *  DNS), and any IP literal, bare or bracketed (a rebinding attack needs a DNS name). `host` is lower-cased, with no
 *  port and no trailing dot. */
export function isAlwaysAllowedHost(host: string): boolean {
  const unbracketed = BRACKETED_RE.exec(host)?.[1] ?? host;
  return host === LOCALHOST || host.endsWith(LOCALHOST_SUFFIX) || parseIp(unbracketed) !== null;
}

/** Split a comma list into canonical entries: trimmed, lower-cased (hostnames are case-insensitive; Windows
 *  reports NetBIOS names in upper case), one trailing dot dropped (`example.com.` is the same DNS node), empties
 *  dropped, so `""` and `" , "` are both "unset". */
export function splitHostList(raw: string | null | undefined): readonly string[] {
  return (raw ?? "")
    .split(ENTRY_SEPARATOR)
    .map((entry) => entry.trim().toLowerCase())
    .map(withoutTrailingDot)
    .filter((entry) => entry.length > 0);
}

/** A canonical hostname: labels of `[a-z0-9_-]`, 1-63 characters, no hyphen at either end, at most 253 in all. */
export function isHostname(name: string): boolean {
  return name.length > 0 && name.length <= MAX_NAME_CHARS && name.split(".").every((label) => LABEL_RE.test(label));
}

/** A dot-led entry over a single label (`.com`, `.local`, `.lan`): it would admit every name under a whole
 *  top-level domain, including names an attacker registers, so it is malformed. There is no public-suffix list, so
 *  a two-label public suffix such as `.co.uk` is the operator's to avoid. */
export function isTopLevelSuffix(entry: string): boolean {
  if (!entry.startsWith(ALLOWED_HOST_SUFFIX_MARK)) {
    return false;
  }
  const name = entry.slice(ALLOWED_HOST_SUFFIX_MARK.length);
  return isHostname(name) && !name.includes(".");
}

/** A canonical `ALLOWED_HOSTS` entry: a hostname, or a hostname of two or more labels behind
 *  {@link ALLOWED_HOST_SUFFIX_MARK}. */
export function isAllowedHostEntry(entry: string): boolean {
  if (isTopLevelSuffix(entry)) {
    return false;
  }
  return isHostname(entry.startsWith(ALLOWED_HOST_SUFFIX_MARK) ? entry.slice(ALLOWED_HOST_SUFFIX_MARK.length) : entry);
}

/** The multicast DNS domain: most home networks resolve `<machine>.local` with no setup. */
export const MDNS_DOMAIN = "local";

/** The names a machine answers to from its OS host name: the name, lower-cased (Windows reports NetBIOS names in
 *  upper case), and the `<name>.local` mDNS form, which macOS may already report as the host name. Empty for a
 *  host name outside the grammar. */
export function machineHostNames(hostname: string): readonly string[] {
  const [name] = splitHostList(hostname);
  const label = name?.split(".")[0];
  if (name === undefined || label === undefined || !isHostname(name)) {
    return [];
  }
  return [...new Set([name, `${label}.${MDNS_DOMAIN}`])];
}

/** Parse one `ALLOWED_HOSTS` value. A scheme, port, path, wildcard, bracketed IP or top-level suffix is malformed. */
export function parseAllowedHosts(raw: string | null | undefined): AllowedHostsParse {
  const entries = splitHostList(raw);
  return { hosts: entries.filter(isAllowedHostEntry), malformed: entries.filter((entry) => !isAllowedHostEntry(entry)) };
}
