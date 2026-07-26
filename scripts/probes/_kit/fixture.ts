// ── fixture: the multi-user FIXTURE stack door for `snap --contexts`/`--as` ──────────────────────────
//
// WHY THIS EXISTS: `--contexts N` needs ≥2 DIFFERENT authenticated dev users to prove multi-human chat
// states (host vs member views). The SHARED dev stack (:5173/:8788, scripts/dev/stack.sh) always boots
// AUTH_MODE=single-user — one user, no login form, nothing to authenticate AS. The only door with a real
// local-login form + a second user is `scripts/dev/multi-user-fixture.sh` — and because it reuses stack.sh
// verbatim (same 8788/5173, NOT an offset pair like the `--isolated` snap-stage), it must be running
// INSTEAD of the shared stack, never alongside it. This module never boots/stops that stack itself
// (unlike snap-stage.ts's `--isolated`) — it only DETECTS whether the fixture is up and healthy, and
// resolves its known credentials; bringing it up is `bash scripts/dev/multi-user-fixture.sh up`, a
// human/orchestrator call, not something a screenshot tool silently does.
//
// AUTH DOOR: the same one a browser uses — `POST /api/auth/login` (handle+password form → the
// `__Host-orb_session` cookie), never a bypass. Credentials mirror multi-user-fixture.sh's own defaults
// (its header docstring): owner/owner-dev-pass, member/member-dev-pass. A handle outside this map (or a
// `--contexts N` bigger than the fixture actually seeds) is a loud refusal, never a guess.

import { spawnSync } from "node:child_process";
import process from "node:process";

// Mirrors scripts/dev/stack.sh's BACKEND_PORT/VITE_PORT defaults — the fixture launcher never overrides
// them (its own header: "run this INSTEAD of the normal 'pnpm stack'"), so the fixture and the shared dev
// stack are the SAME ports, mutually exclusive tenants.
export const FIXTURE_SERVER_PORT = 8788;
export const FIXTURE_VITE_PORT = 5173;
export const FIXTURE_BASE_URL = `http://localhost:${FIXTURE_VITE_PORT}`;
const FIXTURE_HEALTHZ = `http://127.0.0.1:${FIXTURE_SERVER_PORT}/healthz`;
const FIXTURE_AUTH_CONFIG = `http://127.0.0.1:${FIXTURE_SERVER_PORT}/api/auth/config`;

// The credentials multi-user-fixture.sh mints (its own header docstring is the source of truth — kept in
// lockstep by hand since the fixture is a shell script, not an importable module). Order is the
// `--contexts N` default assignment order (context 0 = owner, context 1 = member); a 3rd/4th dev user
// would need the fixture script extended first (refused below, not fabricated).
export const FIXTURE_CREDENTIALS: readonly { readonly handle: string; readonly password: string }[] = [
  { handle: "owner", password: "owner-dev-pass" },
  { handle: "member", password: "member-dev-pass" },
];

export const FIXTURE_UP_REMEDY = "run scripts/dev/multi-user-fixture.sh up";

function curlOk(url: string): boolean {
  return spawnSync("curl", ["-sf", "-m", "2", url], { stdio: "ignore" }).status === 0;
}

function curlJson<T>(url: string): T | null {
  const res = spawnSync("curl", ["-sf", "-m", "2", url], { encoding: "utf8" });
  if (res.status !== 0) {
    return null;
  }
  try {
    return JSON.parse(res.stdout) as T;
  } catch {
    return null;
  }
}

type AuthConfig = { readonly mode?: string; readonly localEnabled?: boolean; readonly multiHumanCapable?: boolean };

/** Env-pin mismatch check ported from stack.sh's `env_pin_report` — reads the LIVE process's actual
 *  AUTH_MODE off /proc, since a dotenv-loaded or since-restarted value can drift from what a caller thinks
 *  is running. Returns null when unreadable (container without /proc access, wrong OS) — treated as "can't
 *  prove it's the fixture," same as a mismatch. */
function livePortOwnerIsLocalAuth(): boolean | null {
  const pid = spawnSync("bash", ["-c", `ss -tlnp 2>/dev/null | grep ':${FIXTURE_SERVER_PORT} ' | grep -oP 'pid=\\K[0-9]+' | head -1`], {
    encoding: "utf8",
  }).stdout.trim();
  if (pid === "") {
    return null;
  }
  const res = spawnSync("bash", ["-c", `tr '\\0' '\\n' </proc/${pid}/environ 2>/dev/null | grep '^AUTH_MODE=' | cut -d= -f2-`], {
    encoding: "utf8",
  });
  if (res.status !== 0) {
    return null;
  }
  const mode = res.stdout.trim();
  return mode === "local";
}

export type FixtureStatus = { readonly up: true } | { readonly up: false; readonly reason: string };

/** Is the multi-user FIXTURE (not the shared single-user stack) live at the shared 8788/5173 ports? Checks
 *  three things a caller could otherwise be fooled by: the ports answer at all, `/api/auth/config` reports
 *  `localEnabled`+`multiHumanCapable` (the shared stack's config is `single-user`/`false`/`false`), AND the
 *  live process's own `AUTH_MODE` env (a stale/mismatched pidfile can serve `local`-shaped config while the
 *  actual bound process is still `single-user` — the exact drift `stack.sh status` surfaces). */
export function fixtureStatus(): FixtureStatus {
  if (!curlOk(FIXTURE_HEALTHZ)) {
    return { up: false, reason: `server :${FIXTURE_SERVER_PORT} not answering` };
  }
  const config = curlJson<AuthConfig>(FIXTURE_AUTH_CONFIG);
  if (config === null) {
    return { up: false, reason: "/api/auth/config unreachable" };
  }
  if (!(config.localEnabled && config.multiHumanCapable)) {
    return {
      up: false,
      reason: `/api/auth/config reports localEnabled=${String(config.localEnabled)} multiHumanCapable=${String(config.multiHumanCapable)} (expected true/true — this is the SHARED single-user dev stack, not the fixture)`,
    };
  }
  const localAuthLive = livePortOwnerIsLocalAuth();
  if (localAuthLive === false) {
    return {
      up: false,
      reason: `env-pin mismatch — the live process on :${FIXTURE_SERVER_PORT} is NOT running AUTH_MODE=local (stale pidfile / a different stack bound the port)`,
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
        error: `unknown fixture handle "${h}" — known dev users: ${FIXTURE_CREDENTIALS.map((u) => u.handle).join(", ")} (extend scripts/dev/multi-user-fixture.sh to seed more)`,
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
      headers: { "content-type": "application/x-www-form-urlencoded" },
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

// biome-ignore lint/style/noProcessEnv: dev-tooling module (probe harness), not app config — mirrors the exemption pattern in browser.ts/snap-stage.ts.
export const FIXTURE_SERVER_URL = process.env["SNAP_FIXTURE_SERVER_URL"] ?? `http://127.0.0.1:${FIXTURE_SERVER_PORT}`;
