#!/usr/bin/env tsx
/**
 * multi-user-seed — flip a running local-mode fixture into a LIVE two-human deployment.
 *
 * Dev tooling (throwaway script; global KISS applies — this is NOT the architecture). Drives the
 * ALREADY-RUNNING orb server over its real HTTP surface so nothing here reaches into domain internals or
 * duplicates the boot composition.
 *
 * THE OWNER SEAM: in `AUTH_MODE=local` an un-credentialed request from a LOCAL origin (127.0.0.1) resolves
 * to the box owner via the `AUTH_FALLBACK=owner` seam (`via:"fallback"`, so no session cookie and no CSRF
 * header are needed for a mutation). So this script acts AS the owner with zero login ceremony. It does NOT
 * rely on `LOCAL_INITIAL_PASSWORD` seeding the owner's password — that env var is boot-validated but the
 * boot never applies it to the owner row (the owner row is minted hash-less), so a local owner FORM login
 * would 401. This script fixes that for the fixture by explicitly resetting the owner's password, so a dev
 * can log in as EITHER user through the credential form.
 *
 * Steps (all as the fallback owner):
 *   1. admin.listUsers → the owner's userId.
 *   2. admin.resetPassword(owner) → the owner gets a known password (form-loginable).
 *   3. settings.updateAppSettings { localMultiUser: true } → the box becomes multi-human capable (D17 toggle).
 *   4. admin.createUser(member, role=user) → the second human (skipped if already present — idempotent).
 *   5. Assert /api/auth/config → multiHumanCapable:true, and that BOTH owner + member authenticate.
 *
 * Credentials + base URL ride in as env from the launcher (multi-user-fixture.sh) so the two files share
 * ONE source of truth. Standalone: `SEED_BASE_URL=… FIXTURE_*=… tsx scripts/dev/multi-user-seed.ts`.
 */
import process from "node:process";

const SESSION_COOKIE = "__Host-orb_session";

// biome-ignore lint/style/noProcessEnv: dev-tooling script (not app config) — the fixture launcher passes its contract in as env.
const env = process.env;

function die(message: string): never {
  process.stderr.write(`multi-user-seed: ${message}\n`);
  process.exit(1);
}

// SEED_BASE_URL has no default: an unset-env default of the operator's LIVE dev stack (8788) is the exact
// fail-open shape that once rewrote the operator's real `routing.roleDefaults` in globalSetup — one missing
// export away from repeating. Both current callers (multi-user-fixture.sh, global-setup.ts) already set it;
// require it here instead of silently seeding whatever happens to be listening on 8788.
const BASE =
  env["SEED_BASE_URL"] ??
  die(
    "SEED_BASE_URL is required (no default — an unset default would target the operator's live dev stack). Run via: bash scripts/dev/multi-user-fixture.sh up",
  );
const OWNER_HANDLE = env["FIXTURE_OWNER_HANDLE"] ?? "owner";
const OWNER_PASSWORD = env["FIXTURE_OWNER_PASSWORD"] ?? "owner-dev-pass";
const MEMBER_HANDLE = env["FIXTURE_MEMBER_HANDLE"] ?? "member";
const MEMBER_PASSWORD = env["FIXTURE_MEMBER_PASSWORD"] ?? "member-dev-pass";

/** A non-batched tRPC call as the fallback owner (no transformer server-side → raw input body). */
async function trpc(proc: string, input?: unknown): Promise<unknown> {
  const init: RequestInit =
    input === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        };
  const res = await fetch(`${BASE}/api/trpc/${proc}`, init);
  const text = await res.text();
  if (!res.ok) {
    die(`tRPC ${proc} failed (HTTP ${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

type UserRow = { id?: string; handle?: string };

async function listUsers(): Promise<readonly UserRow[]> {
  const body = (await trpc("admin.listUsers")) as { result?: { data?: readonly UserRow[] } };
  return body.result?.data ?? [];
}

/** POST the local login form; true iff it minted a session cookie (proves the credential works). */
async function canLogin(handle: string, password: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ handle, password }).toString(),
  });
  return res.ok && (res.headers.get("set-cookie") ?? "").includes(`${SESSION_COOKIE}=`);
}

async function main(): Promise<void> {
  const rows = await listUsers();
  const owner = rows.find((u) => (u.handle ?? "").toLowerCase() === OWNER_HANDLE);
  if (owner?.id === undefined) {
    // Two very different causes, so the message names WHICH: an empty list means the fallback seam gave us no
    // admin identity at all (wrong AUTH_MODE / non-local origin); a NON-empty list without our handle means
    // the box's owner is someone else — `OWNER_HANDLES` (or an ambient `.env` supplying it) disagrees with
    // FIXTURE_OWNER_HANDLE. The original message asserted the first cause for both, and the second one cost
    // an investigation (2026-08-08 e2e-smoke red).
    const seen = rows.map((u) => u.handle ?? "?").join(", ");
    die(
      rows.length === 0
        ? `owner "${OWNER_HANDLE}" not found — admin.listUsers returned NO users, so the fallback seam gave no admin identity: is AUTH_MODE=local + a local origin?`
        : `owner "${OWNER_HANDLE}" not found — this box's users are [${seen}]. The box owner is OWNER_HANDLES (default DEFAULT_USER_HANDLE="owner"); set FIXTURE_OWNER_HANDLE to it, or boot the fixture with OWNER_HANDLES=${OWNER_HANDLE}.`,
    );
  }

  await trpc("admin.resetPassword", { userId: owner.id, password: OWNER_PASSWORD });
  process.stdout.write(`multi-user-seed: owner "${OWNER_HANDLE}" password set (form-loginable)\n`);

  await trpc("settings.updateAppSettings", { partial: { localMultiUser: true } });
  process.stdout.write("multi-user-seed: localMultiUser AppSetting = true\n");

  const handles = new Set((await listUsers()).map((u) => (u.handle ?? "").toLowerCase()));
  if (handles.has(MEMBER_HANDLE.toLowerCase())) {
    process.stdout.write(`multi-user-seed: member "${MEMBER_HANDLE}" already present — skipped\n`);
  } else {
    await trpc("admin.createUser", {
      handle: MEMBER_HANDLE,
      password: MEMBER_PASSWORD,
      role: "user",
    });
    process.stdout.write(`multi-user-seed: member "${MEMBER_HANDLE}" created (role=user)\n`);
  }

  // ── Verify the fixture is what we claim ──────────────────────────────────────────────────────────
  const config = (await (await fetch(`${BASE}/api/auth/config`)).json()) as {
    multiHumanCapable?: boolean;
    mode?: string;
  };
  if (config.multiHumanCapable !== true) {
    die(`/api/auth/config reports multiHumanCapable=${String(config.multiHumanCapable)} (expected true)`);
  }
  if (!(await canLogin(OWNER_HANDLE, OWNER_PASSWORD))) {
    die(`owner "${OWNER_HANDLE}" cannot authenticate via the login form`);
  }
  if (!(await canLogin(MEMBER_HANDLE, MEMBER_PASSWORD))) {
    die(`member "${MEMBER_HANDLE}" cannot authenticate via the login form`);
  }

  process.stdout.write(
    [
      "",
      "multi-user-seed: VERIFIED — the fixture is live and multi-human capable.",
      `  mode                : ${config.mode ?? "?"}`,
      "  multiHumanCapable   : true",
      `  owner  (role=owner) : ${OWNER_HANDLE} / ${OWNER_PASSWORD}`,
      `  member (role=user)  : ${MEMBER_HANDLE} / ${MEMBER_PASSWORD}`,
      "",
    ].join("\n"),
  );
}

main().catch((e: unknown) => die(e instanceof Error ? e.message : String(e)));
