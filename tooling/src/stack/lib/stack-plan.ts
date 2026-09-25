// Every decision the dev supervisor makes before it spawns anything, pure over an env record: the pins a
// host export wins over, the run dir, the port pair, the leader env and the log paths.
import { isAbsolute, join, resolve } from "node:path";
import { DEV_PORTS, MAX_TCP_PORT } from "../../_shared/ports.ts";
import type { DevPinKey, DevPins, PinSource, StackContext, StackLogs } from "../contract/types.ts";
import { DEV_PIN_KEYS } from "../contract/types.ts";
import { parseEnvText } from "./env-file.ts";

/** The env keys the supervisor and the server both read for the stack's address. */
export const RUN_DIR_ENV = "STACK_RUN_DIR";
export const PORT_ENV = "PORT";
export const VITE_PORT_ENV = "VITE_PORT";
export const VITE_API_TARGET_ENV = "VITE_API_TARGET";
/** The server's switch that skips `.env` entirely; a sidecar sets it so the operator's file cannot leak in. */
export const ENV_NO_FILE = "ORB_ENV_NO_FILE";
/** The pin keys the supervisor filled, handed to the leader: in the leader's own env every pin reads as a
 *  host export, so the supervisor's verdict travels with the launch. */
export const PINNED_KEYS_ENV = "ORB_STACK_PINNED";

const DEFAULT_RUN_DIR_REL = join(".cache", "stack");
/** The stack's own cli, relative to a repo root: the detached leader re-exec target, and the launcher a
 *  staged tree is booted through. */
export const STACK_CLI_REL = join("tooling", "src", "stack", "cli.ts");
const LOG_FILES: StackLogs = { stack: "stack.log", server: "server.log", client: "client.log" };

/** The dev pins: `single-user` with dev-only deterministic secrets, so a caller flipping `AUTH_MODE=local`
 *  boots without ceremony, and the seed stamp that keeps the forced first-run persona ask a real-stack
 *  behaviour. INSECURE BY DESIGN, never for a real deploy. Env names, so the record is built from pairs. */
const PIN_DEFAULTS: Readonly<Record<DevPinKey, string>> = Object.fromEntries([
  ["AUTH_FALLBACK", "owner"],
  ["AUTH_MODE", "single-user"],
  ["SESSION_SECRET", "orbweaver-dev-only-session-secret-insecure"],
  ["CREDENTIALS_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
  ["LOCAL_INITIAL_PASSWORD", "orbweaver-dev-password"],
  ["DEV_SEED", "on"],
]) as Record<DevPinKey, string>;

/** The pins whose values `status` may print; the rest are secrets and print only their source. */
export const PRINTABLE_PINS: readonly DevPinKey[] = ["AUTH_FALLBACK", "AUTH_MODE", "DEV_SEED"];

/** A host export wins; the pin fills the gap. A key the supervisor already filled (`PINNED_KEYS_ENV`)
 *  keeps its `pinned` source in the leader, where it arrives as an ordinary export. */
export function devStackPins(ambient: Readonly<Record<string, string | undefined>>): DevPins {
  const env: Partial<Record<DevPinKey, string>> = {};
  const sources: Partial<Record<DevPinKey, PinSource>> = {};
  const filledUpstream = new Set((ambient[PINNED_KEYS_ENV] ?? "").split(",").filter((key) => key !== ""));
  for (const key of DEV_PIN_KEYS) {
    const host = ambient[key];
    const fromHost = host !== undefined && host !== "";
    env[key] = fromHost ? host : PIN_DEFAULTS[key];
    sources[key] = fromHost && !filledUpstream.has(key) ? "host" : "pinned";
  }
  return { env: env as Record<DevPinKey, string>, sources: sources as Record<DevPinKey, PinSource> };
}

/** The printable pins as `status` shows them from a record. */
export function printablePins(pins: DevPins): Readonly<Partial<Record<DevPinKey, string>>> {
  return Object.fromEntries(PRINTABLE_PINS.map((key) => [key, pins.env[key]]));
}

/** `STACK_RUN_DIR` resolved against the repo root, never against the caller's cwd: the e2e modes and the
 *  fixture pass `./.cache/<mode>/stack`, and a relative path must mean the same dir from any cwd. */
export function stackRunDir(repoRoot: string, raw: string | undefined): string {
  if (raw === undefined || raw === "") {
    return join(repoRoot, DEFAULT_RUN_DIR_REL);
  }
  return isAbsolute(raw) ? raw : resolve(repoRoot, raw);
}

function portFrom(raw: string | undefined, fallback: number): number {
  const port = Number(raw);
  return raw !== undefined && raw !== "" && Number.isInteger(port) && port > 0 && port <= MAX_TCP_PORT ? port : fallback;
}

/** The ports the stack binds, with the server's own precedence: `.env` beats the shell, unless the launch
 *  skips the file. Probing the shell's value alone would watch the wrong socket. */
export function stackPorts(
  ambient: Readonly<Record<string, string | undefined>>,
  envFileText: string | null,
): { readonly server: number; readonly vite: number } {
  const fileEnv = ambient[ENV_NO_FILE] === undefined || ambient[ENV_NO_FILE] === "" ? parseEnvText(envFileText ?? "") : {};
  return {
    server: portFrom(fileEnv[PORT_ENV] ?? ambient[PORT_ENV], DEV_PORTS.server),
    vite: portFrom(fileEnv[VITE_PORT_ENV] ?? ambient[VITE_PORT_ENV], DEV_PORTS.vite),
  };
}

export function stackLogs(runDir: string): StackLogs {
  return { stack: join(runDir, LOG_FILES.stack), server: join(runDir, LOG_FILES.server), client: join(runDir, LOG_FILES.client) };
}

/** One stack's whole address from an env record. `envFileText` is the repo `.env` as read, or null. */
export function stackContext(repoRoot: string, ambient: Readonly<Record<string, string | undefined>>, envFileText: string | null): StackContext {
  const runDir = stackRunDir(repoRoot, ambient[RUN_DIR_ENV]);
  const ports = stackPorts(ambient, envFileText);
  const pins = devStackPins(ambient);
  const launchEnv: Readonly<Record<string, string>> = Object.fromEntries([
    ...Object.entries(pins.env),
    [PINNED_KEYS_ENV, DEV_PIN_KEYS.filter((key) => pins.sources[key] === "pinned").join(",")],
    [VITE_PORT_ENV, String(ports.vite)],
    [VITE_API_TARGET_ENV, ambient[VITE_API_TARGET_ENV] ?? `http://127.0.0.1:${String(ports.server)}`],
    [RUN_DIR_ENV, runDir],
  ]);
  return { repoRoot, runDir, ports, pins, ambient: { ...ambient, ...launchEnv }, launchEnv, logs: stackLogs(runDir) };
}

export function healthzUrl(serverPort: number): string {
  return `http://127.0.0.1:${String(serverPort)}/healthz`;
}

/** `localhost`, not 127.0.0.1: vite binds `[::1]` only, so the IPv4 loopback never answers. */
export function viteUrl(vitePort: number): string {
  return `http://localhost:${String(vitePort)}/`;
}

export function authConfigUrl(serverPort: number): string {
  return `http://127.0.0.1:${String(serverPort)}/api/auth/config`;
}
