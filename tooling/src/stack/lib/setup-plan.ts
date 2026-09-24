// Every decision `pnpm start`'s setup makes, pure: when to ask, the defaults `.env` offers, which values each
// answer writes, and the in-place `.env` edit. The edit touches only the keys in SETUP_OWNED_KEYS; every other
// byte of the file (comments, unknown keys, line endings) survives.
import { isIP } from "node:net";
import type { AuthMode } from "@orb/contracts/identity";
import { authModeSchema } from "@orb/contracts/identity";
import { DEV_PORTS, MAX_TCP_PORT } from "../../_shared/ports.ts";
import type { AnswerParse, SetupAnswers, SetupAudience, SetupDecision, SetupLogin, SetupMachine, SetupUrl, SetupValues } from "../contract/types.ts";

/** The command that re-runs setup. Every "how do I change this" line names it. */
export const SETUP_COMMAND = "pnpm start --setup";

export const PORT_KEY = "PORT";
export const AUTH_MODE_KEY = "AUTH_MODE";
/** The Host allowlist the server enforces against DNS rebinding; a name people type must be on it. */
export const ALLOWED_HOSTS_KEY = "ALLOWED_HOSTS";

/** The only keys setup ever writes. Secrets are generated as keyfiles beside the database, never written here. */
const SETUP_OWNED_KEYS = [PORT_KEY, AUTH_MODE_KEY, ALLOWED_HOSTS_KEY] as const;

/** The mode whose ONLY credential is the loopback owner fallback (foundation/env: AUTH_MODE's default). */
export const SINGLE_USER_MODE = "single-user";

/** The mode a password login writes. */
const PASSWORD_MODE: AuthMode = "local";

/** What each auth mode answers to the two questions, so a re-run offers the running mode back. */
const MODE_ANSWERS: Record<AuthMode, { readonly audience: SetupAudience; readonly login: SetupLogin }> = {
  "single-user": { audience: "just-me", login: "password" },
  local: { audience: "network", login: "password" },
  oidc: { audience: "network", login: "sso" },
  "forward-header": { audience: "network", login: "sso" },
};

// The `ALLOWED_HOSTS` grammar the server parses (foundation/env/allowed-hosts.ts): an entry is an exact name
// or a dot-led suffix; labels are 1-63 of [a-z0-9_-] with no hyphen at either end; a name is at most 253
// characters. `localhost`, `*.localhost` and IP literals always pass the server's Host check and are never written.
const LOCALHOST = "localhost";
const HOST_LABEL_RE = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/u;
const MAX_HOST_NAME_LENGTH = 253;
const SUFFIX_MARK = ".";
const DIGITS_RE = /^\d+$/u;
const BRACKETED_RE = /^\[(.*)\]$/u;
const LINE_ENDING_RE = /\r$/u;
/** The multicast DNS domain: most home networks resolve `<machine>.local` with no setup. */
const MDNS_DOMAIN = "local";
const LINK_LOCAL_V4_PREFIX = "169.254.";
/** Tailscale's CGNAT range, 100.64.0.0/10. */
const TAILNET_FIRST_OCTET = 100;
const TAILNET_SECOND_OCTET_MIN = 64;
const TAILNET_SECOND_OCTET_MAX = 127;
/** Adapters whose addresses other devices on the LAN cannot open: container bridges, VM host-only networks,
 *  Hyper-V switches and VPN tunnels, by their Linux, macOS and Windows names. */
const VIRTUAL_ADAPTER_RE = /^(?:docker|br-|veth|virbr|vmnet|vboxnet|vethernet|virtualbox|vmware|utun|tailscale|zt|bridge)/iu;
const WSL2_KERNEL_RE = /microsoft-standard|wsl2/iu;

/** The header of a `.env` setup creates. The file then holds only the owned keys. */
const SETUP_FILE_HEADER = `# Written by \`${SETUP_COMMAND}\`; run it again to change these. Every other setting is in .env.example.`;

export function decideSetup(opts: { readonly envExists: boolean; readonly setup: boolean; readonly interactive: boolean }): SetupDecision {
  if (opts.setup) {
    return opts.interactive ? "ask" : "refuse";
  }
  if (opts.envExists) {
    return "keep";
  }
  return opts.interactive ? "ask" : "defaults";
}

function declared(
  key: string,
  fileEnv: Readonly<Record<string, string | undefined>>,
  ambient: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const value = fileEnv[key] ?? ambient[key];
  return value === "" ? undefined : value;
}

/** The effective AUTH_MODE, with `.env`'s precedence: foundation/env loads the file with `override:true`,
 *  so a value in `.env` beats a shell export, and an absent value is the schema's `single-user` default. */
export function effectiveAuthMode(fileEnv: Readonly<Record<string, string | undefined>>, ambient: Readonly<Record<string, string | undefined>>): string {
  return declared(AUTH_MODE_KEY, fileEnv, ambient) ?? SINGLE_USER_MODE;
}

/** {@link effectiveAuthMode} as a mode; a value that is not a mode reads as the schema default, since the answer
 *  replaces it. */
export function currentAuthMode(fileEnv: Readonly<Record<string, string | undefined>>, ambient: Readonly<Record<string, string | undefined>>): AuthMode {
  const parsed = authModeSchema.safeParse(effectiveAuthMode(fileEnv, ambient));
  return parsed.success ? parsed.data : SINGLE_USER_MODE;
}

/** The answers the current settings already give; each question offers its one as the default. */
export function setupDefaults(fileEnv: Readonly<Record<string, string | undefined>>, ambient: Readonly<Record<string, string | undefined>>): SetupAnswers {
  const port = parsePortAnswer(declared(PORT_KEY, fileEnv, ambient) ?? "", DEV_PORTS.server);
  return {
    port: port.ok ? port.value : DEV_PORTS.server,
    ...MODE_ANSWERS[currentAuthMode(fileEnv, ambient)],
    allowedHosts: declared(ALLOWED_HOSTS_KEY, fileEnv, ambient) ?? null,
  };
}

/** The values the answers write. SSO keeps a configured SSO mode; with none configured it writes the password
 *  mode, because an SSO mode without its identity provider's keys refuses to boot and setup never collects them. */
export function setupValues(answers: SetupAnswers, current: AuthMode): SetupValues {
  if (answers.audience === "just-me") {
    return { port: answers.port, authMode: SINGLE_USER_MODE, ssoPending: false, allowedHosts: null };
  }
  const base = { port: answers.port, allowedHosts: answers.allowedHosts };
  if (answers.login === "password") {
    return { ...base, authMode: PASSWORD_MODE, ssoPending: false };
  }
  return MODE_ANSWERS[current].login === "sso" ? { ...base, authMode: current, ssoPending: false } : { ...base, authMode: PASSWORD_MODE, ssoPending: true };
}

/** One TCP port; an empty answer keeps `fallback`. Also parses `--port`. */
export function parsePortAnswer(raw: string, fallback: number): AnswerParse<number> {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: fallback };
  }
  const port = Number(trimmed);
  if (!DIGITS_RE.test(trimmed) || port < 1 || port > MAX_TCP_PORT) {
    return { ok: false, error: `${JSON.stringify(trimmed)} is not a port; type a whole number from 1 to ${MAX_TCP_PORT}.` };
  }
  return { ok: true, value: port };
}

/** A numbered choice: "1" is `choices[0]`; an empty answer keeps `fallback`. */
export function parseChoiceAnswer<T extends string>(raw: string, choices: readonly T[], fallback: T): AnswerParse<T> {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: fallback };
  }
  const picked = DIGITS_RE.test(trimmed) ? choices[Number(trimmed) - 1] : undefined;
  return picked === undefined ? { ok: false, error: `type a number from 1 to ${choices.length}.` } : { ok: true, value: picked };
}

function needsNoAllowedHostsEntry(host: string): boolean {
  const unbracketed = BRACKETED_RE.exec(host)?.[1] ?? host;
  return isIP(unbracketed) !== 0 || host === LOCALHOST || host.endsWith(`.${LOCALHOST}`);
}

/** An exact host name or a dot-led suffix, in the server's `ALLOWED_HOSTS` grammar. */
function isAllowedHostEntry(entry: string): boolean {
  const name = entry.startsWith(SUFFIX_MARK) ? entry.slice(SUFFIX_MARK.length) : entry;
  return name !== "" && name.length <= MAX_HOST_NAME_LENGTH && name.split(".").every((label) => HOST_LABEL_RE.test(label));
}

/** Split an `ALLOWED_HOSTS` value or an address answer into entries: trimmed, lower-cased, one trailing dot
 *  removed, empty entries dropped. */
export function hostList(value: string | null): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .map((entry) => (entry.endsWith(".") ? entry.slice(0, -1) : entry))
    .filter((entry) => entry !== "");
}

/** The names this machine answers to: its host name, lower-cased (Windows reports NetBIOS names in upper case),
 *  and the `<name>.local` mDNS form, which macOS may already report as the host name. */
export function detectedHostNames(hostname: string): readonly string[] {
  const [name] = hostList(hostname);
  const label = name?.split(".")[0];
  if (name === undefined || label === undefined || name.startsWith(SUFFIX_MARK) || !isAllowedHostEntry(name)) {
    return [];
  }
  return [...new Set([name, `${label}.${MDNS_DOMAIN}`])];
}

/** WSL2's kernel names itself in `/proc/version`. WSL1 does not match: it shares Windows' own network stack, so
 *  its addresses are the LAN's. */
export function isWsl2Kernel(procVersion: string): boolean {
  return WSL2_KERNEL_RE.test(procVersion);
}

function inTailnetRange(address: string): boolean {
  const [first, second] = address.split(".").map(Number);
  return first === TAILNET_FIRST_OCTET && second !== undefined && second >= TAILNET_SECOND_OCTET_MIN && second <= TAILNET_SECOND_OCTET_MAX;
}

/** The URLs another device opens, most reliable first: LAN IPv4 addresses, then tailnet addresses, then the mDNS
 *  name. None need an `ALLOWED_HOSTS` edit. Loopback, link-local, IPv6 and virtual adapters are left out, and so
 *  is everything under WSL2, whose own addresses are not reachable from the LAN. */
export function openUrls(machine: SetupMachine, port: number): readonly SetupUrl[] {
  if (machine.wsl) {
    return [];
  }
  const addresses = Object.entries(machine.interfaces).flatMap(([name, infos]) =>
    (infos ?? [])
      .filter((info) => info.family === "IPv4" && !info.internal && !info.address.startsWith(LINK_LOCAL_V4_PREFIX))
      .map((info) => ({ name, address: info.address })),
  );
  const tailnet = addresses.filter(({ address }) => inTailnetRange(address));
  const lan = addresses.filter(({ name, address }) => !(inTailnetRange(address) || VIRTUAL_ADAPTER_RE.test(name)));
  const mdns = detectedHostNames(machine.hostname).filter((host) => host.endsWith(`.${MDNS_DOMAIN}`));
  const url = (host: string): string => `http://${host}:${port}`;
  return [
    ...lan.map(({ address }) => ({ url: url(address), kind: "lan" as const })),
    ...tailnet.map(({ address }) => ({ url: url(address), kind: "tailnet" as const })),
    ...mdns.map((host) => ({ url: url(host), kind: "mdns" as const })),
  ];
}

/** The address answer: host names typed (comma-separated) are added to `known`, and the result is the
 *  `ALLOWED_HOSTS` value. IP addresses and `localhost` always pass the server's Host check and add nothing, so an
 *  empty answer or an IP keeps `known`. `null` means there is nothing to write. */
export function parseAddressAnswer(raw: string, known: readonly string[]): AnswerParse<string | null> {
  const names = [...known];
  for (const entry of hostList(raw)) {
    if (needsNoAllowedHostsEntry(entry)) {
      continue;
    }
    if (!isAllowedHostEntry(entry)) {
      return { ok: false, error: `${JSON.stringify(entry)} is not a host name; type the name alone, with no http:// and no port.` };
    }
    names.push(entry);
  }
  const unique: readonly string[] = [...new Set(names)];
  return { ok: true, value: unique.length === 0 ? null : unique.join(",") };
}

type OwnedKey = (typeof SETUP_OWNED_KEYS)[number];

/** `KEY=value` with an optional `export ` prefix, a quoted or bare value, and whatever follows it (an inline comment). */
const ASSIGNMENT_PATTERNS: Readonly<Record<OwnedKey, RegExp>> = {
  [PORT_KEY]: assignmentPattern(PORT_KEY),
  [AUTH_MODE_KEY]: assignmentPattern(AUTH_MODE_KEY),
  [ALLOWED_HOSTS_KEY]: assignmentPattern(ALLOWED_HOSTS_KEY),
};

function assignmentPattern(key: string): RegExp {
  return new RegExp(`^(\\s*(?:export\\s+)?${key}\\s*=\\s*)("[^"]*"|'[^']*'|\`[^\`]*\`|[^\\s#]*)(.*)$`, "u");
}

/** The value text setup writes for each owned key; `null` leaves that key's lines as they are. */
function ownedValues(values: SetupValues): Readonly<Record<OwnedKey, string | null>> {
  return { [PORT_KEY]: String(values.port), [AUTH_MODE_KEY]: values.authMode, [ALLOWED_HOSTS_KEY]: values.allowedHosts };
}

/** Write `values` into `.env` text: every assignment of an owned key gets the new value in place, an owned key the
 *  file lacks is appended, and nothing else changes. `null` text is a new file. The same values applied twice give
 *  the same bytes. */
export function applySetupValues(text: string | null, values: SetupValues): string {
  const owned = ownedValues(values);
  if (text === null) {
    const assignments = SETUP_OWNED_KEYS.flatMap((key) => (owned[key] === null ? [] : [`${key}=${owned[key]}`]));
    return `${[SETUP_FILE_HEADER, ...assignments].join("\n")}\n`;
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const seen = new Set<OwnedKey>();
  const lines = text.split("\n").map((line) => {
    const ending = LINE_ENDING_RE.test(line) ? "\r" : "";
    const body = ending === "" ? line : line.slice(0, -1);
    for (const key of SETUP_OWNED_KEYS) {
      const match = ASSIGNMENT_PATTERNS[key].exec(body);
      if (match !== null) {
        seen.add(key);
        const value = owned[key];
        return value === null ? line : `${match[1]}${value}${match[3]}${ending}`;
      }
    }
    return line;
  });
  let out = lines.join("\n");
  for (const key of SETUP_OWNED_KEYS) {
    const value = owned[key];
    if (value !== null && !seen.has(key)) {
      out = `${out}${out === "" || out.endsWith("\n") ? "" : eol}${key}=${value}${eol}`;
    }
  }
  return out;
}
