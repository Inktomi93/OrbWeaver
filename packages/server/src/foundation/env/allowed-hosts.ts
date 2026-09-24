// The Host allowlist's configured names: `ALLOWED_HOSTS` plus the hosts of `OIDC_REDIRECT_URIS`. Pure (raw values
// injected), the `fallback-peers.ts` shape: `foundation/env` refuses a malformed entry at parse, and the request
// guard (`infra/auth/host-allowlist.ts`) matches against `resolveAllowedHosts`. localhost and IP literals always pass
// there, so they need no entry here.

/** The raw env values the resolver reads, passed in so this file never touches `process.env`. */
export interface AllowedHostsInput {
  /** `ALLOWED_HOSTS`: a comma list of names; a leading dot admits the name and every subdomain. */
  readonly allowedHosts: string | undefined;
  /** `OIDC_REDIRECT_URIS`: the OIDC callback URLs; each one's host is the operator's own name. */
  readonly oidcRedirectUris: string | undefined;
}

/** The parse: canonical entries, plus every raw entry that failed the grammar (the env refusal names each one). */
export interface AllowedHostsParse {
  readonly hosts: readonly string[];
  readonly malformed: readonly string[];
}

const ENTRY_SEPARATOR = ",";
const SUBDOMAIN_MARKER = ".";
// RFC 1035 name and label bounds. The label also admits `_`, which browsers accept in a host.
const MAX_NAME_CHARS = 253;
const LABEL_RE = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/;

/** Lower-case and drop one trailing dot: `Example.COM.` names the same DNS node as `example.com`. */
function canonicalName(raw: string): string {
  const lower = raw.toLowerCase();
  return lower.endsWith(".") ? lower.slice(0, -1) : lower;
}

function isHostname(name: string): boolean {
  return name.length > 0 && name.length <= MAX_NAME_CHARS && name.split(".").every((label) => LABEL_RE.test(label));
}

/** Parse one `ALLOWED_HOSTS` value. Entries are trimmed and empties dropped, so `""` is "unset". An entry is a
 *  hostname (`orbweaver.example.com`) or a dot-led suffix (`.example.com`): no scheme, port, path or wildcard. */
export function parseAllowedHosts(raw: string | undefined): AllowedHostsParse {
  const hosts: string[] = [];
  const malformed: string[] = [];
  for (const entry of (raw ?? "").split(ENTRY_SEPARATOR).map((part) => part.trim())) {
    if (entry.length === 0) {
      continue;
    }
    const canonical = canonicalName(entry);
    const suffix = canonical.startsWith(SUBDOMAIN_MARKER);
    if (isHostname(suffix ? canonical.slice(1) : canonical)) {
      hosts.push(canonical);
    } else {
      malformed.push(entry);
    }
  }
  return { hosts, malformed };
}

// The host of one OIDC callback URL, or null for an unparseable URL or a bracketed IPv6 literal (IP literals pass
// without an entry; an IPv4 one fits the name grammar and is kept, which admits nothing new).
function redirectUriHost(uri: string): string | null {
  if (!URL.canParse(uri)) {
    return null;
  }
  const name = canonicalName(new URL(uri).hostname);
  return isHostname(name) ? name : null;
}

/** Every configured name the request guard admits: the valid `ALLOWED_HOSTS` entries, then the OIDC callback hosts,
 *  deduplicated. A malformed `ALLOWED_HOSTS` entry never reaches here, because the env parse refuses it first. */
export function resolveAllowedHosts(input: AllowedHostsInput): readonly string[] {
  const derived = (input.oidcRedirectUris ?? "")
    .split(ENTRY_SEPARATOR)
    .map((uri) => redirectUriHost(uri.trim()))
    .filter((host) => host !== null);
  return [...new Set([...parseAllowedHosts(input.allowedHosts).hosts, ...derived])];
}

/** The parse refusal for one malformed entry, naming it and the grammar. */
export function allowedHostsEntryRefusal(entry: string): string {
  return (
    `ALLOWED_HOSTS entry "${entry}" is not a hostname. Write a name such as orbweaver.example.com, or ` +
    ".example.com for that name and every subdomain, separated by commas: no scheme, port, path or wildcard. " +
    "localhost and IP addresses are always allowed and need no entry."
  );
}
