// ── fixture: the multi-user FIXTURE stack door for `snap --contexts`/`--as` ──────────────────────────
//
// WHY THIS EXISTS: `--contexts N` needs ≥2 DIFFERENT authenticated dev users to prove multi-human chat
// states (host vs member views). The SHARED dev stack (:5173/:8788, `pnpm stack up`) always boots
// AUTH_MODE=single-user — one user, no login form, nothing to authenticate AS. The only door with a real
// local-login form + a second user is the fixture (`pnpm fixture up`, the stack tool's env recipe). This
// module never boots/stops that stack itself (unlike snap-stage.ts's `--isolated`) — it only DETECTS whether the fixture
// is up and healthy, and resolves its known credentials; bringing it up is `pnpm fixture up`, a
// human/orchestrator call, not something a screenshot tool silently does.
//
// PORTS — AN OFFSET PAIR, SO THE FIXTURE IS A SIDECAR: the fixture boots on its own pair with its own DB,
// assets and stack record, so BOTH stacks run at once — the same isolation recipe every e2e mode uses
// (tests/e2e/support/modes.ts). The pair is READ from `_shared/ports.ts` (`FIXTURE_PORTS`) and the
// credentials from the stack tool's own recipe, so nothing is respelled here;
// `resolveFixtureTarget` is the ONE seam every port/URL decision flows through, so an override
// (`--fixture-server`/`--fixture-base`, or SNAP_FIXTURE_SERVER_URL/SNAP_FIXTURE_BASE_URL) reaches the
// health probe AND the browser's base URL together — never one without the other.
//
// AUTH DOOR: the same one a browser uses — `POST /api/auth/login` (handle+password form → the session
// cookie), never a bypass. A handle outside the fixture's roster (or a `--contexts N` bigger than the
// fixture actually seeds) is a loud refusal, never a guess.

import process from "node:process";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { httpJsonSync, httpOkSync } from "../../_shared/http-probe.ts";
import { listeningPids, processInfo } from "../../_shared/platform.ts";
import { FIXTURE_PORTS } from "../../_shared/ports.ts";
import { SESSION_COOKIE_MINTED } from "../../_shared/session-cookie.ts";
import { FIXTURE_CREDENTIALS, fixtureEnv, RUN_DIR_ENV, readLeaderRecord } from "../../stack/index.ts";
import type { AuthConfig, FixtureStatus, FixtureTarget, FixtureTargetOverride, PortOwnerAuthProbe } from "../contract/fixture.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// The fixture's OFFSET pair comes from the ONE port registry (_shared/ports.ts `FIXTURE_PORTS`) — NOT the
// dev stack's pair, so both run side by side. `localhost` for the vite origin, 127.0.0.1 for the server:
// vite v8 binds [::1] only.
export const FIXTURE_SERVER_URL_DEFAULT = `http://127.0.0.1:${FIXTURE_PORTS.server}`;
export const FIXTURE_BASE_URL_DEFAULT = `http://localhost:${FIXTURE_PORTS.vite}`;

const FIXTURE_UP_REMEDY = "run `pnpm fixture up`";

const TRAILING_SLASH_RE = /\/$/u;

function stripSlash(url: string): string {
  return url.replace(TRAILING_SLASH_RE, "");
}

/** Resolve the fixture's two origins: explicit override \> env (SNAP_FIXTURE_SERVER_URL /
 *  SNAP_FIXTURE_BASE_URL) \> the offset-pair defaults. Pure apart from the env read (injectable for tests).
 *  An unparseable server URL falls back to the default port for the owner check rather than throwing —
 *  the health probe below will refuse loudly on the same URL anyway, with a reason a human can act on. */
export function resolveFixtureTarget(
  override: FixtureTargetOverride = {},
  // biome-ignore lint/style/noProcessEnv: dev-tooling module (probe harness), not app config — mirrors the exemption pattern in browser.ts/snap-stage.ts.
  env: Record<string, string | undefined> = process.env,
): FixtureTarget {
  const serverUrl = stripSlash(override.serverUrl ?? env["SNAP_FIXTURE_SERVER_URL"] ?? FIXTURE_SERVER_URL_DEFAULT);
  const baseUrl = stripSlash(override.baseUrl ?? env["SNAP_FIXTURE_BASE_URL"] ?? FIXTURE_BASE_URL_DEFAULT);
  let serverPort = FIXTURE_PORTS.server;
  // @orb-waive caught-failure-ownership(catch): documented fail-safe floor — keeps the default port, and the status probe below refuses loudly on the same bad URL with a readable reason (see the doc comment above). Ends if that downstream refusal is removed.
  try {
    const parsed = new URL(serverUrl);
    serverPort = parsed.port === "" ? FIXTURE_PORTS.server : Number(parsed.port);
  } catch {
    /* keep the default port — the status probe refuses on the bad URL with a readable reason */
  }
  return { serverUrl, baseUrl, serverPort };
}

function authConfig(value: unknown): AuthConfig | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const mode = Reflect.get(value, "mode");
  const localEnabled = Reflect.get(value, "localEnabled");
  const multiHumanCapable = Reflect.get(value, "multiHumanCapable");
  if (
    !(
      (mode === undefined || typeof mode === "string") &&
      (localEnabled === undefined || typeof localEnabled === "boolean") &&
      (multiHumanCapable === undefined || typeof multiHumanCapable === "boolean")
    )
  ) {
    return null;
  }
  return {
    ...(mode === undefined ? {} : { mode }),
    ...(localEnabled === undefined ? {} : { localEnabled }),
    ...(multiHumanCapable === undefined ? {} : { multiHumanCapable }),
  };
}

/** The port-owner proof: the fixture's OWN leader record names the auth mode it launched with and the
 *  pids it spawned, so the process holding the port is the fixture's when it is one of those pids or a
 *  child of one (the watched server runs under its watcher). A `.env`-loaded or since-restarted value can
 *  drift from what a caller thinks is running, which is why the record, not the caller, answers.
 *
 *  #1507: this used to return `boolean | null` and its own header said null meant "can't prove it's the
 *  fixture, same as a mismatch" — but `fixtureStatus` only refused on `false`, so every unprovable case
 *  fell through to `{ up: true }`. The union makes the third outcome unignorable at the call site. */
function livePortOwnerAuthMode(serverPort: number): PortOwnerAuthProbe {
  const runDir = fixtureEnv(REPO_ROOT, {})[RUN_DIR_ENV] ?? "";
  const read = readLeaderRecord(runDir, REPO_ROOT);
  if (read.kind !== "record") {
    return { kind: "unreadable", reason: `no fixture record under ${runDir} (${read.kind}) — nothing proves who owns :${String(serverPort)}` };
  }
  const record = read.record;
  if (record.ports.server !== serverPort) {
    return { kind: "unreadable", reason: `the fixture record names :${String(record.ports.server)}, not :${String(serverPort)}` };
  }
  const holder = listeningPids().get(serverPort);
  if (holder === undefined) {
    return { kind: "unreadable", reason: `no process could be identified as the owner of :${String(serverPort)}` };
  }
  const own = new Set([record.pid, ...record.children]);
  const holderParent = processInfo(holder)?.ppid ?? null;
  if (!(own.has(holder) || (holderParent !== null && own.has(holderParent)))) {
    return { kind: "unreadable", reason: `pid ${String(holder)} owns :${String(serverPort)} but the fixture record does not name it or its parent` };
  }
  const mode = record.pins.values.AUTH_MODE ?? "";
  if (mode === "") {
    return { kind: "unreadable", reason: "the fixture record carries no AUTH_MODE" };
  }
  return mode === "local" ? { kind: "local" } : { kind: "not-local", mode };
}

/** Is the multi-user FIXTURE (not a single-user stack) live at `target`? Checks three things a caller could
 *  otherwise be fooled by: the origin answers at all, `/api/auth/config` reports `localEnabled`+
 *  `multiHumanCapable` (a single-user stack's config is `single-user`/`false`/`false` — the tell if an
 *  override aimed this at the dev stack), AND the live process's own `AUTH_MODE` env (a stale/mismatched
 *  record can serve `local`-shaped config while the actual bound process is still `single-user` — the exact
 *  drift `pnpm stack status` surfaces). */
export function fixtureStatus(target: FixtureTarget): FixtureStatus {
  return fixtureVerdict(target, {
    healthz: httpOkSync(`${target.serverUrl}/healthz`),
    config: authConfig(httpJsonSync(`${target.serverUrl}/api/auth/config`)),
    owner: (): PortOwnerAuthProbe => livePortOwnerAuthMode(target.serverPort),
  });
}

/** The DECISION half, split out of the probes so every arm — including the one that used to fall through —
 *  is provable without a running fixture (#1507). `owner` is a thunk: the record and process-table read only
 *  happens once the cheap HTTP evidence has already agreed, exactly as before. */
export function fixtureVerdict(
  target: FixtureTarget,
  probes: { readonly healthz: boolean; readonly config: AuthConfig | null; readonly owner: () => PortOwnerAuthProbe },
): FixtureStatus {
  if (!probes.healthz) {
    return { up: false, reason: `fixture server ${target.serverUrl} not answering` };
  }
  const config = probes.config;
  if (config === null) {
    return { up: false, reason: `${target.serverUrl}/api/auth/config unreachable` };
  }
  if (config.localEnabled !== true || config.multiHumanCapable !== true) {
    return {
      up: false,
      reason: `${target.serverUrl}/api/auth/config reports localEnabled=${String(config.localEnabled)} multiHumanCapable=${String(config.multiHumanCapable)} (expected true/true — that origin is a SINGLE-USER stack, not the fixture)`,
    };
  }
  const owner = probes.owner();
  if (owner.kind === "not-local") {
    return {
      up: false,
      reason: `env-pin mismatch — the live process on :${target.serverPort} is running AUTH_MODE=${owner.mode}, not local (stale pidfile / a different stack bound the port)`,
    };
  }
  if (owner.kind === "unreadable") {
    // FAIL CLOSED (#1507): an unproven port owner is not a proven fixture. `up: true` here would hand the
    // caller a green about a stack nobody identified — the single-user dev stack answers `/healthz` and can
    // be configured to answer the auth probe, and this is the check that tells them apart.
    return { up: false, reason: `could not prove :${target.serverPort} is the fixture — ${owner.reason}` };
  }
  return { up: true };
}

/** Loud refusal line for the fixture being down/mismatched or `--contexts N` exceeding the seeded roster —
 *  mirrors `--open-chat`'s ambiguity-refusal style (a stated reason + the exact remedy, never a silent
 *  fallback to the shared stack). */
export function fixtureRefusalLine(reason: string): string {
  return `FIXTURE REFUSED  ${reason} — ${FIXTURE_UP_REMEDY}`;
}

/** Resolve N distinct dev-user credentials for `--contexts N`, or a single one for `--as <handle>`.
 *  Returns an error string (never throws) when N exceeds the known roster or `--as` names an unknown
 *  handle — the caller turns that into a loud refusal, never a guess at a password. */
export function resolveFixtureUsers(
  handles: readonly string[],
): { readonly users: readonly { readonly handle: string; readonly password: string }[] } | { readonly error: string } {
  const byHandle = new Map(FIXTURE_CREDENTIALS.map((c) => [c.handle, c] as const));
  const users: { readonly handle: string; readonly password: string }[] = [];
  for (const h of handles) {
    const c = byHandle.get(h);
    if (c === undefined) {
      return {
        error: `unknown fixture handle "${h}" — known dev users: ${FIXTURE_CREDENTIALS.map((u) => u.handle).join(", ")} (extend the stack tool's fixture recipe to seed more)`,
      };
    }
    users.push(c);
  }
  return { users };
}

/** The default N-context roster (first N of FIXTURE_CREDENTIALS, in order) — used when `--contexts N` is
 *  given without `--as` naming specific handles. */
export function defaultFixtureUsers(
  n: number,
): { readonly users: readonly { readonly handle: string; readonly password: string }[] } | { readonly error: string } {
  if (n > FIXTURE_CREDENTIALS.length) {
    return {
      error: `--contexts ${n} exceeds the fixture's seeded roster (${FIXTURE_CREDENTIALS.length} dev users: ${FIXTURE_CREDENTIALS.map((u) => u.handle).join(", ")})`,
    };
  }
  return { users: FIXTURE_CREDENTIALS.slice(0, n) };
}

/** POST the local login form for one user — the SAME door a browser's login screen drives, never a
 *  bypass. Returns the `Set-Cookie` value (the session cookie) on success. */
export async function loginFixtureUser(
  baseServerUrl: string,
  handle: string,
  password: string,
): Promise<{ readonly cookie: string } | { readonly error: string }> {
  let res: Response;
  try {
    res = await fetch(`${baseServerUrl}/api/auth/login`, {
      method: "POST",
      // The login route requires the custom CSRF header (blocks login-CSRF); a non-browser probe just sends it.
      headers: { "content-type": "application/x-www-form-urlencoded", "x-orb-csrf": "1" },
      body: new URLSearchParams({ handle, password }).toString(),
    });
  } catch (e) {
    return { error: `login request failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok) {
    return { error: `login for "${handle}" failed (HTTP ${res.status})` };
  }
  // The minted value itself, never the joined header: a login also clears the other transport's name, and
  // the context seeds only the first pair it is handed.
  const cookie = res.headers.getSetCookie().find((value) => SESSION_COOKIE_MINTED.test(value));
  if (cookie === undefined) {
    return { error: `login for "${handle}" returned no session cookie` };
  }
  return { cookie };
}
