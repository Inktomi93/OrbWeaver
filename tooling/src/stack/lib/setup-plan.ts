// Every decision `pnpm start`'s setup makes, pure: when to ask, the defaults `.env` offers, and the `.env` edits each
// answer makes. `@orb/kit/env-file` applies the edits in place, so every other byte of the file survives.
import type { AuthMode } from "@orb/contracts/identity";
import { authModeSchema, SETUP_COMMAND } from "@orb/contracts/identity";
import {
  ALLOWED_HOSTS_KEY,
  isAllowedHostEntry,
  isAlwaysAllowedHost,
  isTopLevelSuffix,
  MDNS_DOMAIN,
  machineHostNames,
  splitHostList,
} from "@orb/kit/allowed-hosts";
import type { EnvEdit } from "@orb/kit/env-file";
import { DELETE_ENV_LINE } from "@orb/kit/env-file";
import { DEV_PORTS, MAX_TCP_PORT } from "../../_shared/ports.ts";
import type { AnswerParse, SetupAnswers, SetupAudience, SetupDecision, SetupLogin, SetupMachine, SetupUrl, SetupValues } from "../contract/types.ts";

export const PORT_KEY = "PORT";
export const AUTH_MODE_KEY = "AUTH_MODE";

/** The listen address key. Setup never writes a value to it; a network answer deletes it ({@link setupEnvEdits}). */
export const BIND_HOST_KEY = "BIND_HOST";

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

// The `ALLOWED_HOSTS` grammar and the always-allowed rule are `@orb/kit/allowed-hosts`, shared with the server; an
// always-allowed host (localhost, `*.localhost`, an IP literal) is never written.
const DIGITS_RE = /^\d+$/u;
const LINK_LOCAL_V4_PREFIX = "169.254.";
/** Tailscale's CGNAT range, 100.64.0.0/10. */
const TAILNET_FIRST_OCTET = 100;
const TAILNET_SECOND_OCTET_MIN = 64;
const TAILNET_SECOND_OCTET_MAX = 127;
/** Adapters whose addresses other devices on the LAN cannot open: container bridges, VM host-only networks,
 *  Hyper-V switches and VPN tunnels, by their Linux, macOS and Windows names. */
const VIRTUAL_ADAPTER_RE = /^(?:docker|br-|veth|virbr|vmnet|vboxnet|vethernet|virtualbox|vmware|utun|tailscale|zt|bridge)/iu;
const WSL2_KERNEL_RE = /microsoft-standard|wsl2/iu;

/** The header of a `.env` setup creates. The file then holds only the keys setup writes. */
export const SETUP_FILE_HEADER = `# Written by \`${SETUP_COMMAND}\`; run it again to change these. Every other setting is in .env.example.`;

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
  const mdns = machineHostNames(machine.hostname).filter((host) => host.endsWith(`.${MDNS_DOMAIN}`));
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
  for (const entry of splitHostList(raw)) {
    if (isAlwaysAllowedHost(entry)) {
      continue;
    }
    if (isTopLevelSuffix(entry)) {
      return { ok: false, error: `${JSON.stringify(entry)} would allow a whole top-level domain; type your own domain (.example.com) or the exact name.` };
    }
    if (!isAllowedHostEntry(entry)) {
      return { ok: false, error: `${JSON.stringify(entry)} is not a host name; type the name alone, with no http:// and no port.` };
    }
    names.push(entry);
  }
  const unique: readonly string[] = [...new Set(names)];
  return { ok: true, value: unique.length === 0 ? null : unique.join(",") };
}

/** The edits the answers make to `.env`, in the order a new file lists them. A network answer also deletes
 *  `BIND_HOST`: a share from a `just-me` box pins the bind to loopback, and choosing the network opens it again. */
export function setupEnvEdits(values: SetupValues): readonly EnvEdit[] {
  return [
    { key: PORT_KEY, value: String(values.port) },
    { key: AUTH_MODE_KEY, value: values.authMode },
    { key: ALLOWED_HOSTS_KEY, value: values.allowedHosts },
    { key: BIND_HOST_KEY, value: values.authMode === SINGLE_USER_MODE ? null : DELETE_ENV_LINE },
  ];
}
