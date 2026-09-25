// multi-user — flip a RUNNING local-mode fixture into a LIVE two-human deployment. Drives the already
// running orb server over its real HTTP surface, so nothing here reaches into domain internals or
// duplicates the boot composition.
//
// THE OWNER SEAM: in `AUTH_MODE=local` an un-credentialed request from a LOCAL origin (127.0.0.1) resolves
// to the box owner via the `AUTH_FALLBACK=owner` seam (`via:"fallback"`, so no session cookie and no CSRF
// header are needed for a mutation). So this acts AS the owner with zero login ceremony. It does NOT rely on
// `LOCAL_INITIAL_PASSWORD` seeding the owner's password — that env var is boot-validated but the boot never
// applies it to the owner row (the owner row is minted hash-less), so a local owner FORM login would 401.
// This fixes that for the fixture by explicitly resetting the owner's password, so a dev can log in as
// EITHER user through the credential form.
//
// Steps (all as the fallback owner): resolve the owner via admin.listUsers → reset their password →
// enable the localMultiUser AppSetting (D17 toggle) → create the member (idempotent) → ASSERT
// /api/auth/config reports multiHumanCapable and that BOTH humans authenticate.
import process from "node:process";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import { SESSION_COOKIE_MINTED } from "../../_shared/session-cookie.ts";
import type { MultiUserConfig } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm seed:demo (node tooling/src/seed/cli.ts <demo|chat|multi-user>)");

interface UserRow {
  readonly id?: string;
  readonly handle?: string;
}

/** The fixture contract arrives as env from the launcher (`pnpm fixture`, the stack tool's recipe) so the launcher and this tool
 *  share ONE source of truth. SEED_BASE_URL has NO default: an unset-env default of the operator's LIVE dev
 *  stack (8788) is the exact fail-open shape that once rewrote the operator's real `routing.roleDefaults` in
 *  globalSetup — one missing export away from repeating. */
export function multiUserConfig(): MultiUserConfig {
  // biome-ignore lint/style/noProcessEnv: dev-tooling fixture contract (not app config) — the launcher passes it in as env.
  const env = process.env;
  const baseUrl = env["SEED_BASE_URL"];
  if (baseUrl === undefined || baseUrl === "") {
    throw new UsageError("SEED_BASE_URL is required (no default — an unset default would target the operator's live dev stack). Run via: pnpm fixture up");
  }
  return {
    baseUrl,
    ownerHandle: env["FIXTURE_OWNER_HANDLE"] ?? "owner",
    ownerPassword: env["FIXTURE_OWNER_PASSWORD"] ?? "owner-dev-pass",
    memberHandle: env["FIXTURE_MEMBER_HANDLE"] ?? "member",
    memberPassword: env["FIXTURE_MEMBER_PASSWORD"] ?? "member-dev-pass",
  };
}

/** A non-batched tRPC call as the fallback owner (no transformer server-side → raw input body). */
async function trpc(baseUrl: string, proc: string, input?: unknown): Promise<unknown> {
  const init: RequestInit = input === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) };
  const res = await fetch(`${baseUrl}/api/trpc/${proc}`, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`tRPC ${proc} failed (HTTP ${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

async function listUsers(baseUrl: string): Promise<readonly UserRow[]> {
  const body = (await trpc(baseUrl, "admin.listUsers")) as { result?: { data?: readonly UserRow[] } };
  return body.result?.data ?? [];
}

/** POST the local login form; true iff it minted a session cookie (proves the credential works). */
async function canLogin(baseUrl: string, handle: string, password: string): Promise<boolean> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    // The login route requires the custom CSRF header (blocks login-CSRF); a non-browser client just sends it.
    headers: { "content-type": "application/x-www-form-urlencoded", "x-orb-csrf": "1" },
    body: new URLSearchParams({ handle, password }).toString(),
  });
  return res.ok && SESSION_COOKIE_MINTED.test(res.headers.get("set-cookie") ?? "");
}

function ownerIdOrThrow(rows: readonly UserRow[], ownerHandle: string): string {
  const owner = rows.find((u) => (u.handle ?? "").toLowerCase() === ownerHandle);
  if (owner?.id !== undefined) {
    return owner.id;
  }
  // Two very different causes, so the message names WHICH: an empty list means the fallback seam gave us no
  // admin identity at all (wrong AUTH_MODE / non-local origin); a NON-empty list without our handle means the
  // box's owner is someone else — `OWNER_HANDLES` (or an ambient `.env` supplying it) disagrees with
  // FIXTURE_OWNER_HANDLE. Asserting the first cause for both once cost an investigation (2026-08-08).
  const seen = rows.map((u) => u.handle ?? "?").join(", ");
  throw new Error(
    rows.length === 0
      ? `owner "${ownerHandle}" not found — admin.listUsers returned NO users, so the fallback seam gave no admin identity: is AUTH_MODE=local + a local origin?`
      : `owner "${ownerHandle}" not found — this box's users are [${seen}]. The box owner is OWNER_HANDLES (default DEFAULT_USER_HANDLE="owner"); set FIXTURE_OWNER_HANDLE to it, or boot the fixture with OWNER_HANDLES=${ownerHandle}.`,
  );
}

/** `seed multi-user` — env-configured; exits 0 only after VERIFYING the fixture is what it claims. */
export async function runMultiUserSeed(): Promise<ExitCode> {
  const config = multiUserConfig();
  const ownerId = ownerIdOrThrow(await listUsers(config.baseUrl), config.ownerHandle);

  await trpc(config.baseUrl, "admin.resetPassword", { userId: ownerId, password: config.ownerPassword });
  print(`multi-user-seed: owner "${config.ownerHandle}" password set (form-loginable)`);

  await trpc(config.baseUrl, "settings.updateAppSettings", { partial: { localMultiUser: true } });
  print("multi-user-seed: localMultiUser AppSetting = true");

  const handles = new Set((await listUsers(config.baseUrl)).map((u) => (u.handle ?? "").toLowerCase()));
  if (handles.has(config.memberHandle.toLowerCase())) {
    print(`multi-user-seed: member "${config.memberHandle}" already present — skipped`);
  } else {
    await trpc(config.baseUrl, "admin.createUser", { handle: config.memberHandle, password: config.memberPassword, role: "user" });
    print(`multi-user-seed: member "${config.memberHandle}" created (role=user)`);
  }

  const authConfig = (await (await fetch(`${config.baseUrl}/api/auth/config`)).json()) as { multiHumanCapable?: boolean; mode?: string };
  if (authConfig.multiHumanCapable !== true) {
    throw new Error(`/api/auth/config reports multiHumanCapable=${String(authConfig.multiHumanCapable)} (expected true)`);
  }
  if (!(await canLogin(config.baseUrl, config.ownerHandle, config.ownerPassword))) {
    throw new Error(`owner "${config.ownerHandle}" cannot authenticate via the login form`);
  }
  if (!(await canLogin(config.baseUrl, config.memberHandle, config.memberPassword))) {
    throw new Error(`member "${config.memberHandle}" cannot authenticate via the login form`);
  }

  print(
    [
      "",
      "multi-user-seed: VERIFIED — the fixture is live and multi-human capable.",
      `  mode                : ${authConfig.mode ?? "?"}`,
      "  multiHumanCapable   : true",
      `  owner  (role=owner) : ${config.ownerHandle} / ${config.ownerPassword}`,
      `  member (role=user)  : ${config.memberHandle} / ${config.memberPassword}`,
      "",
    ].join("\n"),
  );
  return EXIT.clean;
}
