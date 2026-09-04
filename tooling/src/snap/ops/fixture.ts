// ── fixture: the multi-user FIXTURE stack door for `snap --contexts`/`--as` ──────────────────────────
//
// WHY THIS EXISTS: `--contexts N` needs ≥2 DIFFERENT authenticated dev users to prove multi-human chat
// states (host vs member views). The SHARED dev stack (:5173/:8788, tooling/src/stack/stack.sh) always boots
// AUTH_MODE=single-user — one user, no login form, nothing to authenticate AS. The only door with a real
// local-login form + a second user is `tooling/src/stack/multi-user-fixture.sh`. This module never
// boots/stops that stack itself (unlike snap-stage.ts's `--isolated`) — it only DETECTS whether the fixture
// is up and healthy, and resolves its known credentials; bringing it up is `pnpm fixture up`, a
// human/orchestrator call, not something a screenshot tool silently does.
//
// PORTS — AN OFFSET PAIR, SO THE FIXTURE IS A SIDECAR (fixed 2026-08-03): the fixture used to reuse
// stack.sh's own 8788/5173, which made `--contexts` unusable whenever the owner's dev stack was up (they
// were mutually exclusive tenants of one port pair). It now boots on 8790/5175 with its own DB, assets and
// stack pidfile, so BOTH stacks run at once — the same isolation recipe every e2e mode uses
// (tests/e2e/support/modes.ts). The pair itself is READ from `_shared/ports.ts` (`FIXTURE_PORTS`), which is
// where multi-user-fixture.sh's defaults are mirrored — this module no longer respells them, so the only
// hand-lockstep left here is the credentials below;
// `resolveFixtureTarget` is the ONE seam every port/URL decision flows through, so an override
// (`--fixture-server`/`--fixture-base`, or SNAP_FIXTURE_SERVER_URL/SNAP_FIXTURE_BASE_URL) reaches the
// health probe AND the browser's base URL together — never one without the other.
//
// AUTH DOOR: the same one a browser uses — `POST /api/auth/login` (handle+password form → the
// `__Host-orb_session` cookie), never a bypass. Credentials mirror multi-user-fixture.sh's own defaults
// (its header docstring): owner/owner-dev-pass, member/member-dev-pass. A handle outside this map (or a
// `--contexts N` bigger than the fixture actually seeds) is a loud refusal, never a guess.

import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { FIXTURE_PORTS } from "../../_shared/ports.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import type { FixtureStatus, FixtureTarget, FixtureTargetOverride } from "../contract/fixture.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// The fixture's OFFSET pair comes from the ONE port registry (_shared/ports.ts `FIXTURE_PORTS`, which
// mirrors multi-user-fixture.sh's FIXTURE_PORT/FIXTURE_VITE_PORT defaults) — NOT the dev stack's pair, so
// both run side by side. It used to be two literals respelled here (#1271). `localhost` for the vite
// origin, 127.0.0.1 for the server: vite v8 binds [::1] only (see stack.sh's vite_ok()).
export const FIXTURE_SERVER_URL_DEFAULT = `http://127.0.0.1:${FIXTURE_PORTS.server}`;
export const FIXTURE_BASE_URL_DEFAULT = `http://localhost:${FIXTURE_PORTS.vite}`;

// The credentials multi-user-fixture.sh mints (its own header docstring is the source of truth — kept in
// lockstep by hand since the fixture is a shell script, not an importable module). Order is the
// `--contexts N` default assignment order (context 0 = owner, context 1 = member); a 3rd/4th dev user
// would need the fixture script extended first (refused below, not fabricated).
export const FIXTURE_CREDENTIALS: readonly { readonly handle: string; readonly password: string }[] = [
  { handle: "owner", password: "owner-dev-pass" },
  { handle: "member", password: "member-dev-pass" },
];

const FIXTURE_UP_REMEDY = "run `pnpm fixture up`";

const TRAILING_SLASH_RE = /\/$/u;

function stripSlash(url: string): string {
  return url.replace(TRAILING_SLASH_RE, "");
}

/** Resolve the fixture's two origins: explicit override \> env (SNAP_FIXTURE_SERVER_URL /
 *  SNAP_FIXTURE_BASE_URL) \> the offset-pair defaults. Pure apart from the env read (injectable for tests).
 *  An unparseable server URL falls back to the default port for the `/proc` check rather than throwing —
 *  the health probe below will refuse loudly on the same URL anyway, with a reason a human can act on. */
export function resolveFixtureTarget(
  override: FixtureTargetOverride = {},
  // biome-ignore lint/style/noProcessEnv: dev-tooling module (probe harness), not app config — mirrors the exemption pattern in browser.ts/snap-stage.ts.
  env: Record<string, string | undefined> = process.env,
): FixtureTarget {
  const serverUrl = stripSlash(override.serverUrl ?? env["SNAP_FIXTURE_SERVER_URL"] ?? FIXTURE_SERVER_URL_DEFAULT);
  const baseUrl = stripSlash(override.baseUrl ?? env["SNAP_FIXTURE_BASE_URL"] ?? FIXTURE_BASE_URL_DEFAULT);
  let serverPort = FIXTURE_PORTS.server;
  // @orb-gate-ignore caught-failure-ownership(empty:catch): documented fail-safe floor — keeps the default port, and the status probe below refuses loudly on the same bad URL with a readable reason (see the doc comment above). Ends if that downstream refusal is removed.
  try {
    const parsed = new URL(serverUrl);
    serverPort = parsed.port === "" ? FIXTURE_PORTS.server : Number(parsed.port);
  } catch {
    /* keep the default port — the status probe refuses on the bad URL with a readable reason */
  }
  return { serverUrl, baseUrl, serverPort };
}

function curlOk(url: string): boolean {
  return runNicedSync("curl", ["-sf", "-m", "2", url], { stdio: "ignore" }).status === 0;
}

function curlJson(url: string): unknown | null {
  const res = runNicedSync("curl", ["-sf", "-m", "2", url]);
  if (res.status !== 0) {
    return null;
  }
  // @orb-gate-ignore caught-failure-ownership(default:catch): fail-closed floor — a parse failure returns null, and fixtureStatus() below turns any null into `{ up: false, reason: "… unreachable" }`, never a silent pass. Ends if that fail-closed mapping is removed.
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

interface AuthConfig {
  readonly mode?: string;
  readonly localEnabled?: boolean;
  readonly multiHumanCapable?: boolean;
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

/** Env-pin mismatch check ported from stack.sh's `env_pin_report` — reads the LIVE process's actual
 *  AUTH_MODE off /proc, since a `.env`-loaded or since-restarted value can drift from what a caller thinks
 *  is running. Returns null when unreadable (container without /proc access, wrong OS) — treated as "can't
 *  prove it's the fixture," same as a mismatch. */
function livePortOwnerIsLocalAuth(serverPort: number): boolean | null {
  const pid = runNicedSync("bash", ["-c", `ss -tlnp 2>/dev/null | grep ':${serverPort} ' | grep -oP 'pid=\\K[0-9]+' | head -1`]).stdout.trim();
  if (pid === "") {
    return null;
  }
  const res = runNicedSync("bash", ["-c", `tr '\\0' '\\n' </proc/${pid}/environ 2>/dev/null | grep '^AUTH_MODE=' | cut -d= -f2-`]);
  if (res.status !== 0) {
    return null;
  }
  const mode = res.stdout.trim();
  return mode === "local";
}

/** Is the multi-user FIXTURE (not a single-user stack) live at `target`? Checks three things a caller could
 *  otherwise be fooled by: the origin answers at all, `/api/auth/config` reports `localEnabled`+
 *  `multiHumanCapable` (a single-user stack's config is `single-user`/`false`/`false` — the tell if an
 *  override aimed this at the dev stack), AND the live process's own `AUTH_MODE` env (a stale/mismatched
 *  pidfile can serve `local`-shaped config while the actual bound process is still `single-user` — the exact
 *  drift `stack.sh status` surfaces). */
export function fixtureStatus(target: FixtureTarget): FixtureStatus {
  if (!curlOk(`${target.serverUrl}/healthz`)) {
    return { up: false, reason: `fixture server ${target.serverUrl} not answering` };
  }
  const config = authConfig(curlJson(`${target.serverUrl}/api/auth/config`));
  if (config === null) {
    return { up: false, reason: `${target.serverUrl}/api/auth/config unreachable` };
  }
  if (config.localEnabled !== true || config.multiHumanCapable !== true) {
    return {
      up: false,
      reason: `${target.serverUrl}/api/auth/config reports localEnabled=${String(config.localEnabled)} multiHumanCapable=${String(config.multiHumanCapable)} (expected true/true — that origin is a SINGLE-USER stack, not the fixture)`,
    };
  }
  const localAuthLive = livePortOwnerIsLocalAuth(target.serverPort);
  if (localAuthLive === false) {
    return {
      up: false,
      reason: `env-pin mismatch — the live process on :${target.serverPort} is NOT running AUTH_MODE=local (stale pidfile / a different stack bound the port)`,
    };
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
        error: `unknown fixture handle "${h}" — known dev users: ${FIXTURE_CREDENTIALS.map((u) => u.handle).join(", ")} (extend tooling/src/stack/multi-user-fixture.sh to seed more)`,
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
  const cookie = res.headers.get("set-cookie");
  if (cookie === null || !cookie.includes("orb_session=")) {
    return { error: `login for "${handle}" returned no session cookie` };
  }
  return { cookie };
}
