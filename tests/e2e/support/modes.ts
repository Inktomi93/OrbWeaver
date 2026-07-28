// The auth-mode Playwright-project axis — the ONE source of truth for each mode's ports, base URL, DB/assets
// isolation, and seeded credentials. `playwright.config.ts` builds one project + one webServer per entry
// here; `global-setup.ts` seeds each; the specs read the credentials. Kept in the e2e-support tree (not a
// package) so it stays import-free of the app trees, exactly like `trpc.ts`.
//
// WHY a project per mode: the harness must boot the stack in a CHOSEN `AUTH_MODE` to exercise login /
// sessions / cross-user visibility. Each mode gets an ISOLATED stack — its own DB + assets dir + a distinct
// port pair (mirrors the dev `multi-user-fixture.sh` recipe) — so the modes never collide and can run
// independently. The dev stack on 8788/5173 is untouched (these use 87xx/51xx offsets).
//
// The secrets here are DEV-ONLY deterministic literals (insecure by design — never a real deploy), matching
// `scripts/dev/stack.sh` / `multi-user-fixture.sh`. `SESSION_SECRET` is ≥32 chars (the local-mode
// superRefine) and `LOCAL_INITIAL_PASSWORD` ≥8 (the owner seed).

/** One auth-mode project's boot + seed contract. `webServerEnv` is the exact env its `stack.sh start-fg`
 *  webServer boots with; `baseUrl` is its vite origin (the specs' `E2E_BASE_URL`); `backendUrl` is the Hono
 *  origin the owner-fallback seed hits directly. */
export interface ModeProject {
  /** The Playwright project name (also the `--project=<name>` selector). */
  readonly name: string;
  /** vite origin — the spec baseURL + `E2E_BASE_URL` for the actor clients. `localhost` (vite binds [::1]). */
  readonly baseUrl: string;
  /** Hono origin (127.0.0.1) — the owner-fallback seed + `/api/auth/config` probe hit this directly. */
  readonly backendUrl: string;
  /** Which specs run under THIS project (Playwright per-project `testMatch`). Each mode owns a distinct set so
   *  a full `pnpm e2e` never runs a single-user spec under `local` (where login is required) or vice-versa —
   *  the existing 22 specs stay single-user; a mode-specific spec is named `*.<mode>.spec.ts`. */
  readonly testMatch: RegExp;
  /** The webServer env: `AUTH_MODE` + secrets + isolated DB/assets + the port pair (stack.sh reads PORT /
   *  VITE_PORT / VITE_API_TARGET / DATABASE_URL / ASSETS_DIR). */
  readonly webServerEnv: Readonly<Record<string, string>>;
  /** Whether `global-setup.ts` runs the multi-user seed (localMultiUser + a member account) for this mode. */
  readonly seedMultiUser: boolean;
}

const SESSION_SECRET = "orbweaver-e2e-multimode-session-secret-insecure";
const CREDENTIALS_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/** The seeded local-mode credentials (owner via reset, member via createUser) — shared by the seed step and
 *  the specs' `loginLocal(...)` calls. Same handles the dev `multi-user-fixture.sh` uses. */
export const LOCAL_OWNER = { handle: "owner", password: "owner-dev-pass" } as const;
export const LOCAL_MEMBER = { handle: "member", password: "member-dev-pass" } as const;

// ── single-user (the default lane; the existing 22 specs) — ports 8788/5173, no isolated DB (the dev stack's
// own drift-free seed via global-setup). AUTH_MODE=single-user, adopt-only engines, WIRE_CAPTURE on (the
// @live specs read /api/_debug/wire/captures). This mirrors the pre-split `stackEnv` EXACTLY. ──
export const SINGLE_USER: ModeProject = {
  name: "single-user",
  baseUrl: "http://localhost:5173",
  backendUrl: "http://127.0.0.1:8788",
  // Every spec EXCEPT the mode-specific ones (`*.local.spec.ts` / `*.forward.spec.ts`) — the existing 22.
  testMatch: /(?<!\.(?:local|forward))\.spec\.ts$/u,
  webServerEnv: {
    ENGINES_POSTURE: "adopt-only",
    AUTH_MODE: "single-user",
    SESSION_SECRET: "orbweaver-dev-only-session-secret-insecure",
    CREDENTIALS_KEY,
    LOCAL_INITIAL_PASSWORD: "orbweaver-dev-password",
    WIRE_CAPTURE: "on",
  },
  seedMultiUser: false,
};

// ── local (cookie/BFF sessions) — ports 8799/5183, ISOLATED DB/assets under .cache. AUTH_MODE=local +
// the local-mode secrets; global-setup flips localMultiUser on + seeds a member. adopt-only + WIRE_CAPTURE
// so the member-strip @live spec can plant a lie AND (optionally) drive a real turn. ──
const LOCAL_BACKEND_PORT = "8799";
const LOCAL_VITE_PORT = "5183";
// Module-local (fed into MODE_PROJECTS below; only SINGLE_USER is exported — the config's reuse-check needs it).
const LOCAL: ModeProject = {
  name: "local",
  baseUrl: `http://localhost:${LOCAL_VITE_PORT}`,
  backendUrl: `http://127.0.0.1:${LOCAL_BACKEND_PORT}`,
  testMatch: /\.local\.spec\.ts$/u,
  webServerEnv: {
    ENGINES_POSTURE: "adopt-only",
    AUTH_MODE: "local",
    SESSION_SECRET,
    CREDENTIALS_KEY,
    LOCAL_INITIAL_PASSWORD: LOCAL_OWNER.password,
    WIRE_CAPTURE: "on",
    PORT: LOCAL_BACKEND_PORT,
    VITE_PORT: LOCAL_VITE_PORT,
    VITE_API_TARGET: `http://127.0.0.1:${LOCAL_BACKEND_PORT}`,
    DATABASE_URL: "file:./.cache/e2e-local/orb.db",
    ASSETS_DIR: "./.cache/e2e-local/assets",
    // The dev stack's checked-in `.env` loads with override:true; flip to override:false so this project's
    // exported AUTH_MODE/DATABASE_URL win (the multi-user-fixture escape hatch).
    ORB_ENV_NO_OVERRIDE: "1",
  },
  seedMultiUser: true,
};

// ── forward-header (SSO trusted-proxy) — ports 8798/5182, isolated DB/assets. AUTH_MODE=forward-header +
// FORWARD_AUTH_VERIFY_JWT=true + a non-empty JWKS allowlist (the signed path refuses an empty one; the JWKS
// itself rides each request as a literal, so the allowlist gates only remote-URL egress). The actor mints a
// signed JWT in-test (jose) — no external IdP, no login. ──
const FWD_BACKEND_PORT = "8798";
const FWD_VITE_PORT = "5182";
const FORWARD_HEADER: ModeProject = {
  name: "forward-header",
  baseUrl: `http://localhost:${FWD_VITE_PORT}`,
  backendUrl: `http://127.0.0.1:${FWD_BACKEND_PORT}`,
  testMatch: /\.forward\.spec\.ts$/u,
  webServerEnv: {
    ENGINES_POSTURE: "adopt-only",
    AUTH_MODE: "forward-header",
    SESSION_SECRET,
    CREDENTIALS_KEY,
    // The signed-JWT path: verify on (default) + a non-empty allowlist (a dummy host — the JWKS travels as a
    // request literal, so this only needs to be non-empty to pass the "no trusted key source" gate).
    FORWARD_AUTH_VERIFY_JWT: "true",
    FORWARD_AUTH_JWKS_ALLOWLIST: "idp.e2e.local",
    PORT: FWD_BACKEND_PORT,
    VITE_PORT: FWD_VITE_PORT,
    VITE_API_TARGET: `http://127.0.0.1:${FWD_BACKEND_PORT}`,
    DATABASE_URL: "file:./.cache/e2e-forward/orb.db",
    ASSETS_DIR: "./.cache/e2e-forward/assets",
    ORB_ENV_NO_OVERRIDE: "1",
  },
  seedMultiUser: false,
};

// ── oidc — DEFERRED (owner decision). No mock IdP exists yet; the planned increment is a route-level fake
// IdP (openid-client discovery + a signed id_token), NOT built here. Left as a documented ABSENCE, not a
// half-built project: adding an unbacked `oidc` project would boot a stack no spec can authenticate against.
// When built: mirror LOCAL/FORWARD_HEADER's shape with OIDC_ISSUER/CLIENT_ID/SECRET/REDIRECT_URIS pointed at
// the fake IdP, and an `actorViaOidc(claims)` constructor in actors.ts.

/** Every mode project the config builds a project + webServer for (oidc excluded — deferred). */
export const MODE_PROJECTS: readonly ModeProject[] = [SINGLE_USER, LOCAL, FORWARD_HEADER];
