// The auth-mode Playwright-project axis — the ONE source of truth for each mode's ports, base URL, DB/assets
// isolation, and seeded credentials. `playwright.config.ts` builds one project + one webServer per entry
// here; `global-setup.ts` seeds each; the specs read the credentials. Kept in the e2e-support tree (not a
// package) so it stays import-free of the app trees, exactly like `trpc.ts`.
//
// WHY a project per mode: the harness must boot the stack in a CHOSEN `AUTH_MODE` to exercise login /
// sessions / cross-user visibility. EVERY mode (single-user included, since 2026-08-01) gets an ISOLATED
// stack — its own DB + assets dir + a distinct port pair (mirrors the dev `multi-user-fixture.sh` recipe) —
// so the modes never collide and can run independently. The dev stack on 8788/5173 is untouched (these use
// 87xx/51xx offsets), and every mode carries `E2E_HARNESS=on` so `global-setup.ts`'s target guard
// (target-guard.ts) can PROVE the origin it seeds is a throwaway harness stack.
//
// THE INCIDENT that made single-user isolated: it used to run on the DEV ports with NO `DATABASE_URL`, and
// `reuseExistingServer` locally — so `pnpm e2e` seeded the operator's LIVE dev DB (globalSetup's
// `pinChatConnection` authored a connection row in it and re-pointed their real `chat` Model role).
// `E2E_ALLOW_DEV_TARGET=1` restores exactly that old shape for a deliberate, supervised drive against the
// running dev stack, and waives the guard with it.
//
// AMBIENT-ENV ISOLATION (`ORB_ENV_NO_FILE=1` on every isolated project): a harness stack must see ONLY what
// this file gives it. The weaker `ORB_ENV_NO_OVERRIDE` this replaces flipped only PRECEDENCE — every key the
// harness did NOT set was still filled from the operator's checked-in `.env`, so the suite silently ran
// against their deploy config (`OWNER_HANDLES` redefining the box owner is what reddened e2e-smoke on
// 2026-08-08; `WIRE_CAPTURE`/`RPG_TRACE` leaked the same way). This is the SAME hatch, for the same measured
// reason, that `vitest.config.ts` applies to the node lanes. The `E2E_ALLOW_DEV_TARGET=1` drive deliberately
// omits it — that path WANTS the operator's stack + `.env`, verbatim.
//
// The secrets here are DEV-ONLY deterministic literals (insecure by design — never a real deploy), matching
// `tooling/src/stack/stack.sh` / `multi-user-fixture.sh`. `SESSION_SECRET` is ≥32 chars (the local-mode
// superRefine) and `LOCAL_INITIAL_PASSWORD` ≥8 (the owner seed).

import process from "node:process";
import { DEV_PORTS, E2E_PORTS, ENGINE_PORTS } from "@orb/tooling/_shared/ports";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/_shared/test-kinds";
import { devTargetAllowed } from "./target-guard.ts";

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
  /** How deep `global-setup.ts` warms THIS mode's vite dev server before the first spec runs (see
   *  `ClientWarmup`). The depth is an auth fact, not a preference: only a mode whose UI is reachable
   *  WITHOUT a login can be driven into the chat room by an un-authenticated warm pass. */
  readonly clientWarmup: ClientWarmup;
}

/**
 * How far `global-setup.ts` drives a mode's client to pre-transform its module graph.
 *
 * WHY THE HARNESS WARMS AT ALL (#571): each `playwright test` invocation boots a FRESH vite dev server, and
 * vite's transform cache is per-process — so the FIRST spec of every run pays the cold transform of the
 * whole route graph (~1.6k module requests for home → Chats → room, measured from the #571 trace) INSIDE its
 * own 60s test timeout. That cost grew with the client and crossed the budget: `chat-persistence`'s @smoke
 * case died at `page.reload` with `net::ERR_ABORTED` — the abort being the test-timeout context close, not a
 * competing navigation. Warming here moves that one-time cost OUT of every spec's budget (measured on this
 * box: cold 42.2s → warm 14.9s / 13.8s for the same case), and it is self-maintaining because the warm pass
 * walks the REAL graph through the same helpers the specs use rather than a hand-listed file set.
 *
 * - `room`  — drive home → Chats list → open a chat (`support/chat-room.ts`). The full spec surface; only
 *             valid where the UI needs no login (single-user).
 * - `shell` — load `/` only. The login-gated modes (local, forward-header) cannot reach the room
 *             un-authenticated, so they warm the boot shell + router + dep graph and stop there.
 */
type ClientWarmup = "room" | "shell";

const SESSION_SECRET = "orbweaver-e2e-multimode-session-secret-insecure";
const CREDENTIALS_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const E2E_TEST_SUFFIXES = TEST_KIND_DEFINITIONS.filter(({ family }) => family === "e2e").map(({ suffix }) => suffix);
const E2E_TEST_SUFFIX_PATTERN = E2E_TEST_SUFFIXES.map((suffix) => suffix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|");
const E2E_TEST_END_PATTERN = `(?:${E2E_TEST_SUFFIX_PATTERN})$`;

/**
 * The `/api/_debug/*` credential every mode stack boots with — the harness's ONLY way onto that surface
 * since AUTHFIX-2 (2026-08-07).
 *
 * Before that fix the debug gate's admin arm admitted the UN-CREDENTIALED owner fallback, so the debug
 * witnesses (`fetchWireCaptures` / `inspectChatDb` / `fetchDebugErrors` in `trpc.ts`) worked with a bare
 * `fetch` and no header. That convenience WAS the hole — on a real box it served provider request bodies to
 * anyone who could reach the port — so the harness now presents the operator token like any other client.
 * Set here (webServerEnv) and read there (`trpc.ts::debugHeaders`); the two must not drift, which is why
 * this is one exported constant rather than two literals.
 *
 * Dev-only and deliberately non-secret, exactly like SESSION_SECRET/CREDENTIALS_KEY above — these stacks are
 * throwaway (`E2E_HARNESS=on`, isolated DB + ports). Under `E2E_ALLOW_DEV_TARGET=1` the project boots the
 * operator's dev stack VERBATIM, whose checked-in `.env` supplies its own `DEBUG_TOKEN` and wins (that path
 * omits `ORB_ENV_NO_OVERRIDE`): export `DEBUG_TOKEN=<that value>` in the runner's shell for the debug
 * witnesses to read there.
 */
export const E2E_DEBUG_TOKEN = "orbweaver-e2e-debug-token-insecure";

/**
 * EACH MODE'S OWN pidfile + server/client log dir (`STACK_RUN_DIR`, stack.sh) — the #1851 instrument gap.
 *
 * All three mode stacks used to leave `STACK_RUN_DIR` unset, so all three wrote `.cache/stack/server.log`,
 * `client.log` AND `stack.pgid`. When `smoke.spec.ts` got `ECONNREFUSED 127.0.0.1:8796` in the 2026-09-06
 * `--full` run, the single-user server's crash reason was UNRECOVERABLE: the forward-header stack booting on
 * :8798 had already rotated and overwritten the same file. A harness that cannot say why its own server died
 * is an instrument, not a test suite — and the shared `stack.pgid` was the same collision one step worse,
 * since `stop`/`status` read it.
 *
 * It rides the mode's EXISTING throwaway state root (`.cache/e2e/<mode>/`, next to its DB and assets) rather
 * than minting a second convention; stack.sh `mkdir -p`s it, so nothing has to pre-create it.
 */
const STACK_RUN_SUBDIR = "stack";

/**
 * The BOX OWNER's handle on every harness stack — pinned into each mode's `OWNER_HANDLES` below, and the
 * handle the local fixture resets a password for.
 *
 * WHY IT IS PINNED (the 2026-08-08 e2e-smoke red): `ORB_ENV_NO_FILE`/`ORB_ENV_NO_OVERRIDE` aside, the server
 * resolves WHO the owner is from `OWNER_HANDLES` (else `[DEFAULT_USER_HANDLE]` = "owner"). The operator's
 * checked-in dev `.env` sets `OWNER_HANDLES=<their email>`, and the old `ORB_ENV_NO_OVERRIDE` hatch only
 * flipped PRECEDENCE — a key the harness never set was still FILLED from that file. So the harness stacks
 * booted with the operator's owner identity: `global-setup`'s multi-user seed could not find handle "owner"
 * (`multi-user-seed: owner "owner" not found …`, which aborts the whole run in globalSetup) and
 * `auth-smoke.forward.spec.ts`'s owner case would resolve role=user. It stayed hidden for days only because
 * the pre-D135 owner fallback
 * minted a TWIN row at `DEFAULT_USER_HANDLE` on exactly such a box (`04a96f459`) — the seed had been finding
 * that bug's artifact, and the first fresh DB after the fix turned the latent gap red.
 *
 * Identity is part of a mode project's fixture contract, exactly like its DB/assets/ports — so it is
 * DECLARED here, never inherited from whatever box the suite runs on.
 */
const HARNESS_OWNER_HANDLE = "owner";

// THE THROWAWAY STATE ROOT MOVED WITH THAT PIN: `.cache/e2e-<mode>/` → `.cache/e2e/<mode>/` (2026-08-08).
// A harness DB seeded BEFORE the pin holds the operator's handle at `role='owner'`, and D17's
// `users_single_owner_unique` partial index makes a second owner row UNREPRESENTABLE — so boot's
// `seedOwner("owner")` dies with `UNIQUE constraint failed: users.role` on any stale harness DB (measured
// against this box's `.cache/e2e-local/orb.db`). A fresh path retires that state on every box at once,
// instead of leaving a manual `rm -rf` standing between this fix and the next green run. The old
// `.cache/e2e-*` dirs are inert leftovers — delete at leisure.

/**
 * THE HARNESS'S LOCAL-ENGINE CONNECTION — the three facts `global-setup.ts`'s `pinChatConnection` mints it
 * from and every spec finds it by (`support/trpc.ts::localEngineConnection`).
 *
 * WHY IT EXISTS AT ALL: a per-task model pick is a `connection_bindings` row pointing at a `user_connections`
 * row (inference program §3.2/§7.1) — there is no `routing` settings section any more, so there is nothing to
 * "pin" without first authoring a connection. The harness authors exactly one: a `vllm` row at the shared
 * generation engine, `chat` + `summarize` bound to it.
 *
 * WHY `ENGINE_PORTS.generate` AND NOT A MODE-OFFSET PORT: the operator's engine is a connection the
 * harness adopts, never something a mode boots (isolation here is of the DB, never of the GPU), so all
 * three mode stacks dial the SAME loopback engine. `openAiPath` appends `/v1` when the base URL lacks it;
 * spelling it here keeps the row identical to what a user would type.
 */
export const E2E_LOCAL_ENGINE_BASE_URL = `http://127.0.0.1:${String(ENGINE_PORTS.generate)}/v1`;

/** The provider that row is authored under; its model list is read under the same id. */
export const E2E_LOCAL_ENGINE_PROVIDER = "vllm";

/** The label that row is minted under. `connection.create` collision-suffixes a duplicate label rather than
 *  refusing it (`verbs/connections.ts::mintLabel`), so the seed must LOOK FIRST — this string is the
 *  harness's idempotency key across re-runs against a surviving DB, and the key the specs look it up by. */
export const E2E_LOCAL_ENGINE_LABEL = "e2e local engine";

/** The model id written when the engine's own `/v1/models` answers nothing (no engine running). The row is
 *  then saved `modelListed: false` — the product's own typed-id fallback (§7.4), not a fabrication: the
 *  non-live suite is model-free and only needs the row + binding to EXIST. The id is the operator's
 *  default gen model; the launcher that serves it lives outside this repo. */
export const E2E_LOCAL_ENGINE_FALLBACK_MODEL = "Qwen/Qwen3-VL-8B-Instruct";

/**
 * The F12 private-endpoint admission every mode stack boots with, DECLARED rather than inherited (the
 * `OWNER_HANDLES` posture two blocks up, for the same reason).
 *
 * `connection.create` refuses an `auth: endpoint` row whose base URL is a private address this deployment
 * does not admit (`verbs/connections.ts::requireBaseUrl` → `infra/network::endpointAdmission`), and the
 * allowlist's env floor is born loopback ONLY under `AUTH_MODE=single-user`
 * (`settings/effective-config/layer.ts::privateEndpointAllowlistFloor`) — EMPTY on `local` and
 * `forward-header`. Both of those stacks author loopback endpoint rows (this engine; the local mode's
 * scripted fixture provider at `E2E_FIXTURE_PROVIDER_PORT`), so without this they would be refused at the
 * write seam. It is NOT the same key as `EGRESS_ALLOWLIST` below: that one widens the non-safeFetch egress
 * backstop at connect time, this one is the write-time admission.
 */
const LOOPBACK_ENDPOINT_ALLOWLIST = "127.0.0.1";

/** The seeded local-mode credentials (owner via reset, member via createUser) — shared by the seed step and
 *  the specs' `loginLocal(...)` calls. Same handles the dev `multi-user-fixture.sh` uses. */
export const LOCAL_OWNER = { handle: HARNESS_OWNER_HANDLE, password: "owner-dev-pass" } as const;
export const LOCAL_MEMBER = { handle: "member", password: "member-dev-pass" } as const;

// ── single-user (the default lane; the existing 22 specs) — ISOLATED ports 8796/5181 + its own DB/assets
// under .cache, exactly like the local/forward projects. AUTH_MODE=single-user, the operator's loopback
// engine adopted as a connection (isolation is of the DB, never the GPU), WIRE_CAPTURE on (the @live specs
// read /api/_debug/wire/captures).
//
// `E2E_ALLOW_DEV_TARGET=1` flips this project back to the pre-2026-08-01 shape: the dev ports 8788/5173 and
// NO DATABASE_URL pin, i.e. the operator's real dev stack + dev DB (reused, not booted — see
// playwright.config.ts). That is the supervised-live-drive escape hatch, and it waives the target guard. ──
const SINGLE_USER_ON_DEV_STACK = devTargetAllowed(process.env);
const SINGLE_BACKEND_PORT = String(SINGLE_USER_ON_DEV_STACK ? DEV_PORTS.server : E2E_PORTS.singleUser.server);
const SINGLE_VITE_PORT = String(SINGLE_USER_ON_DEV_STACK ? DEV_PORTS.vite : E2E_PORTS.singleUser.vite);
export const SINGLE_USER: ModeProject = {
  name: "single-user",
  baseUrl: `http://localhost:${SINGLE_VITE_PORT}`,
  backendUrl: `http://127.0.0.1:${SINGLE_BACKEND_PORT}`,
  // Every spec EXCEPT the mode-specific ones (`*.local.spec.ts` / `*.forward.spec.ts`) — the existing 22.
  testMatch: new RegExp(`(?<!\\.(?:local|forward))${E2E_TEST_END_PATTERN}`, "u"),
  webServerEnv: {
    AUTH_MODE: "single-user",
    SESSION_SECRET: "orbweaver-dev-only-session-secret-insecure",
    CREDENTIALS_KEY,
    LOCAL_INITIAL_PASSWORD: "orbweaver-dev-password",
    WIRE_CAPTURE: "on",
    // The rpg flight recorder (#1493): `rpg-lite-loop.spec.ts`'s live-loop poll needs ONE observable that
    // becomes true only after the state round SETTLED, and the `flush` trace event is it — the arm it used
    // before (an empty debug-error ring) is true on tick one, so the barrier never barriered. Cheap: an
    // in-memory ring plus the host-only /api/_debug/rpg/traces route, both no-ops when this key is absent.
    RPG_TRACE: "on",
    DEBUG_TOKEN: E2E_DEBUG_TOKEN,
    E2E_HARNESS: "on",
    // The dev-target escape hatch boots/reuses the dev stack VERBATIM (its own .env-driven DB) — pinning
    // ports or a DB there would defeat the point of asking for the operator's stack.
    ...(SINGLE_USER_ON_DEV_STACK
      ? {}
      : {
          PORT: SINGLE_BACKEND_PORT,
          VITE_PORT: SINGLE_VITE_PORT,
          VITE_API_TARGET: `http://127.0.0.1:${SINGLE_BACKEND_PORT}`,
          DATABASE_URL: "file:./.cache/e2e/single/orb.db",
          ASSETS_DIR: "./.cache/e2e/single/assets",
          STACK_RUN_DIR: `./.cache/e2e/single/${STACK_RUN_SUBDIR}`,
          OWNER_HANDLES: HARNESS_OWNER_HANDLE,
          PRIVATE_ENDPOINT_ALLOWLIST: LOOPBACK_ENDPOINT_ALLOWLIST,
          ORB_ENV_NO_FILE: "1",
        }),
  },
  seedMultiUser: false,
  clientWarmup: "room",
};

/** Is the single-user project deliberately aimed at the operator's dev stack (`E2E_ALLOW_DEV_TARGET=1`)?
 *  Read by `playwright.config.ts` (reuse the running stack instead of booting one) and by `global-setup.ts`
 *  (waive the target guard). */
export const DEV_TARGET_ALLOWED = SINGLE_USER_ON_DEV_STACK;

// ── local (cookie/BFF sessions) — ports 8799/5183, ISOLATED DB/assets under .cache. AUTH_MODE=local +
// the local-mode secrets; global-setup flips localMultiUser on + seeds a member. adopt-only + WIRE_CAPTURE
// so the member-strip @live spec can plant a lie AND (optionally) drive a real turn. ──
const LOCAL_BACKEND_PORT = String(E2E_PORTS.local.server);
const LOCAL_VITE_PORT = String(E2E_PORTS.local.vite);
// Module-local (fed into MODE_PROJECTS below; only SINGLE_USER is exported — the config's reuse-check needs it).
const LOCAL: ModeProject = {
  name: "local",
  baseUrl: `http://localhost:${LOCAL_VITE_PORT}`,
  backendUrl: `http://127.0.0.1:${LOCAL_BACKEND_PORT}`,
  testMatch: new RegExp(`\\.local${E2E_TEST_END_PATTERN}`, "u"),
  webServerEnv: {
    AUTH_MODE: "local",
    SESSION_SECRET,
    CREDENTIALS_KEY,
    LOCAL_INITIAL_PASSWORD: LOCAL_OWNER.password,
    WIRE_CAPTURE: "on",
    DEBUG_TOKEN: E2E_DEBUG_TOKEN,
    E2E_HARNESS: "on",
    PORT: LOCAL_BACKEND_PORT,
    VITE_PORT: LOCAL_VITE_PORT,
    VITE_API_TARGET: `http://127.0.0.1:${LOCAL_BACKEND_PORT}`,
    DATABASE_URL: "file:./.cache/e2e/local/orb.db",
    ASSETS_DIR: "./.cache/e2e/local/assets",
    STACK_RUN_DIR: `./.cache/e2e/local/${STACK_RUN_SUBDIR}`,
    // The reasoning-strip spec's scripted BYO provider (support/fixture-provider.ts) is a loopback endpoint the
    // custom-byo runner reaches via a raw fetch → the global egress firewall. Allowlist loopback so the box can
    // reach its OWN configured backend (127.0.0.1); the operator legitimately trusts loopback egress on a test
    // box. safeFetch paths stay self-enforcing regardless — this only widens the NON-safeFetch backstop.
    EGRESS_ALLOWLIST: "127.0.0.1",
    // The local specs log in the seeded member MANY times within a minute, all from 127.0.0.1 — the default
    // per-IP login throttle (10/min) 429s partway through a serial run. Raise it for the isolated test stack
    // (the throttle itself is proven in auth-routes' own tests; here it is noise on a single-tenant loopback).
    RATE_LIMIT_LOGIN: "1000",
    OWNER_HANDLES: HARNESS_OWNER_HANDLE,
    PRIVATE_ENDPOINT_ALLOWLIST: LOOPBACK_ENDPOINT_ALLOWLIST,
    ORB_ENV_NO_FILE: "1",
  },
  seedMultiUser: true,
  clientWarmup: "shell",
};

// ── forward-header (SSO trusted-proxy) — ports 8798/5182, isolated DB/assets. AUTH_MODE=forward-header +
// FORWARD_AUTH_VERIFY_JWT=true + a non-empty JWKS allowlist (the signed path refuses an empty one; the JWKS
// itself rides each request as a literal, so the allowlist gates only remote-URL egress). The actor mints a
// signed JWT in-test (jose) — no external IdP, no login. ──
const FWD_BACKEND_PORT = String(E2E_PORTS.forwardHeader.server);
const FWD_VITE_PORT = String(E2E_PORTS.forwardHeader.vite);
const FORWARD_HEADER: ModeProject = {
  name: "forward-header",
  baseUrl: `http://localhost:${FWD_VITE_PORT}`,
  backendUrl: `http://127.0.0.1:${FWD_BACKEND_PORT}`,
  testMatch: new RegExp(`\\.forward${E2E_TEST_END_PATTERN}`, "u"),
  webServerEnv: {
    AUTH_MODE: "forward-header",
    SESSION_SECRET,
    CREDENTIALS_KEY,
    // The signed-JWT path: verify on (default) + a non-empty allowlist (a dummy host — the JWKS travels as a
    // request literal, so this only needs to be non-empty to pass the "no trusted key source" gate).
    FORWARD_AUTH_VERIFY_JWT: "true",
    FORWARD_AUTH_JWKS_ALLOWLIST: "idp.e2e.local",
    DEBUG_TOKEN: E2E_DEBUG_TOKEN,
    E2E_HARNESS: "on",
    PORT: FWD_BACKEND_PORT,
    VITE_PORT: FWD_VITE_PORT,
    VITE_API_TARGET: `http://127.0.0.1:${FWD_BACKEND_PORT}`,
    DATABASE_URL: "file:./.cache/e2e/forward/orb.db",
    ASSETS_DIR: "./.cache/e2e/forward/assets",
    STACK_RUN_DIR: `./.cache/e2e/forward/${STACK_RUN_SUBDIR}`,
    // The owner case in auth-smoke.forward.spec.ts asserts THIS handle resolves role=owner.
    OWNER_HANDLES: HARNESS_OWNER_HANDLE,
    PRIVATE_ENDPOINT_ALLOWLIST: LOOPBACK_ENDPOINT_ALLOWLIST,
    ORB_ENV_NO_FILE: "1",
  },
  seedMultiUser: false,
  clientWarmup: "shell",
};

// ── oidc — DEFERRED (owner decision). No mock IdP exists yet. Left as a documented ABSENCE, not a
// half-built project: adding an unbacked `oidc` project would boot a stack no spec can authenticate against.
// When built: mirror LOCAL/FORWARD_HEADER's shape with OIDC_ISSUER/CLIENT_ID/SECRET/REDIRECT_URIS pointed at
// a REAL mock IdP process (discovery document + JWKS + a signed id_token), and an `actorViaOidc(claims)`
// constructor in actors.ts.
//
// #867 DID NOT DISCHARGE THIS, and the reason is a fence, not a caveat. Injecting the code→token exchange
// (`OidcRoutesDeps.exchange`) made the whole OIDC callback drivable IN-PROCESS — that coverage now lives in
// `tests/server/entry/http/auth-routes.test.ts` and `tests/server/entry/oidc-logout-roundtrip.suite.int.test.ts`
// — but e2e boots the REAL server, whose composition root binds the REAL `openid-client` grant on purpose.
// The only way a fake exchange could reach an e2e stack is an env-selectable substitute for the token
// exchange, which is an authentication bypass wearing a test affordance. So this project stays deferred
// until a mock IdP exists that the real grant can actually talk to.

/** Every mode project the config builds a project + webServer for (oidc excluded — deferred). */
export const MODE_PROJECTS: readonly ModeProject[] = [SINGLE_USER, LOCAL, FORWARD_HEADER];
