// entry/lifecycle — THE boot/shutdown protocol (core/Tier-5-Entry.md §"Boot order"; DECISIONS-LEDGER §7 D5:
// this lives at `entry/lifecycle.ts`, read by entry only). `index.ts` constructs the lifecycle once and
// runs `boot()`; SIGTERM/SIGINT run `shutdown()`. It owns NO business logic — it MINTS the one real clock,
// resolves the boot chicken-egg (owner id → services → owner Principal), runs the seed steps, starts the
// supervisors, builds + serves the Hono app, and tears it all down gracefully.
//
// THE CLOCK: entry mints the ONE real wall clock (`Date.now`) — entry is the `no-raw-clock`-exempt site —
// and threads it everywhere as the injected `now` (compose, the seam, the seeders, the rate-limiter, the
// supervisors). Nothing below entry reads ambient time.

import { hostname } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { createDb, preCloseHousekeeping } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Configuration } from "openid-client";
import { discovery } from "openid-client";
import { startBuddyObserver } from "#domain/buddy";
import { createOidcStore, createSessionsService, ownerHandles } from "#domain/sessions";
import {
  loadWorkload,
  nextRunnableWorkload,
  reapOrphanedWorkloads,
  runWorkload,
  subscribeWorkloadWake,
} from "#domain/workloads";
import { env } from "#foundation/env";
import { getLog } from "#foundation/observability";
import { createPasswordHasher } from "#infra/auth";
import { credentialsKeyFromEnv } from "#infra/crypto";
import { installEgressFirewall } from "#infra/network";
import { detectGpu } from "#infra/providers";
import { createCas } from "#infra/storage";
import { startCatalogRefreshScheduler } from "../transport/jobs/catalog-refresh-scheduler";
import { startOidcGcScheduler } from "../transport/jobs/oidc-gc-scheduler";
import { startWorkloadsWorker } from "../transport/jobs/workloads-worker";
import { createApp } from "./app";
import { createAuthSeam } from "./auth";
import {
  reclaimLocksOnBoot,
  runBootMigrations,
  seedCredentialFromEnv,
  seedDefaultCharacters,
  seedDefaultPreset,
  seedOwner,
  seedThemes,
} from "./boot";
import { createServices } from "./compose";
import { createBuddyObserverEnv } from "./compose/buddy-observer";
import type { LocalAuthenticator, OidcRoutesDeps } from "./http";
import { createRateLimitGate } from "./rate-limit-gate";

const MS_PER_HOUR = 3_600_000;
// The catalog-refresh decision tick — hourly is plenty (the actual refresh cadence is daily, gated in the
// scheduler).
const CATALOG_CHECK_INTERVAL_MS = MS_PER_HOUR;

/** The lifecycle handle `index.ts` drives: boot once, shut down once (idempotent). */
export interface Lifecycle {
  readonly boot: () => Promise<void>;
  readonly shutdown: () => Promise<void>;
}

/** Construct the lifecycle. Side-effect-free until `boot()` runs (so `index.ts` can wire signals first). */
export function createLifecycle(): Lifecycle {
  const log = getLog();
  // entry mints the ONE real clock (no-raw-clock-exempt site); threaded as the injected `now` everywhere.
  const now = (): number => Date.now();

  let isShuttingDown = false;
  let credentialsKeyOk = false;
  let db: Db | null = null;
  let server: ServerType | null = null;
  let stopScheduler: (() => void) | null = null;
  // The OIDC PKCE-transaction GC timer (armed only in oidc mode); shutdown clears it.
  let stopOidcGc: (() => void) | null = null;
  // The workloads worker loop runs until its AbortSignal fires; shutdown aborts it to drain the in-flight row.
  let stopWorker: AbortController | null = null;
  // The buddy observer reaction engine (PD-45) — a supervised out-of-band loop; shutdown tears it down.
  let stopBuddyObserver: (() => void) | null = null;
  // The vLLM supervisor's graceful-drain closer is SYNCHRONOUS (VllmEngineHandle.start → () => void).
  let drainVllm: (() => void) | null = null;
  let booted = false;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: boot sequence is inherently long
  async function boot(): Promise<void> {
    if (booted) {
      return;
    }
    booted = true;

    // 1. SSRF egress firewall FIRST — swap undici's global dispatcher for the private-IP-rejecting DNS
    //    lookup so EVERY outbound fetch below (compose, seeds, the `/models` probe, OIDC discovery/JWKS)
    //    is address-gated before it can fire. No-op when EGRESS_FIREWALL=false; env is import-time-loaded,
    //    so this needs nothing from boot. (Tier-3-Infra §"infra/network": constructed at entry boot.)
    installEgressFirewall();

    db = await createDb(env.DATABASE_URL);

    // 2. SecretBox key (boot crypto): resolve the key buffer; the box itself is built inside compose.
    const secretBoxKey = credentialsKeyFromEnv();

    // 3. migrate (backup → migrate on the FK-off connection → assertReferentialIntegrity; aborts on failure).
    await runBootMigrations({ db, databaseUrl: env.DATABASE_URL });

    // 4. Resolve the owner id BEFORE compose (the owner role-clients bundle resolves against it). A transient
    //    sessions service is built ONLY to run the owner seed — sessions is a pure constructor, so building it
    //    twice (here + inside compose) is harmless; compose owns the real one the seam consumes.
    const handles = ownerHandles();
    const bootSessions = createSessionsService({
      db,
      now,
      sessionSecret: env.SESSION_SECRET ?? null,
    });
    // AUTH_MODE=local: seed the owner's first-boot form-login password so a non-local-origin deploy (no
    // owner-fallback) isn't locked out. The password + the ONE hashing seam are passed ONLY in local mode
    // (oidc/forward-header owners authenticate via the IdP/proxy; SSO/single-user rows carry no password).
    // env's superRefine guarantees LOCAL_INITIAL_PASSWORD + SESSION_SECRET are set in local mode. The seed is
    // first-boot-only + non-clobbering (guarded on `password_hash IS NULL` — see seed-owner).
    const localPasswordSeed =
      env.AUTH_MODE === "local" && env.LOCAL_INITIAL_PASSWORD !== undefined
        ? {
            initialPassword: env.LOCAL_INITIAL_PASSWORD,
            hashPassword: createPasswordHasher(env.SESSION_SECRET).hash,
          }
        : {};
    const ownerIds = await seedOwner({
      db,
      sessions: bootSessions,
      ownerHandles: handles,
      now,
      ...localPasswordSeed,
    });
    const ownerId = ownerIds[0];
    if (ownerId === undefined) {
      throw new Error("boot: seedOwner returned no owner id (OWNER_HANDLES resolved empty)");
    }
    const ownerHandle = handles[0] ?? env.DEFAULT_USER_HANDLE;

    // 4b. The ONE GPU/vLLM-availability fact (PD-tier: one fact, no knobs). Probe the host ONCE (the shared
    //     `infra/providers` probe the supervisor also reads — no second `nvidia-smi`). `VLLM_DISABLED` is a
    //     force-OFF override; effective disabled = forced OR no GPU. This single value drives BOTH the vLLM
    //     backend build (compose → registry; no GPU ⇒ no engine ⇒ the supervisor isn't started) AND the
    //     derive-role local-light fallback (compose derives `vllmAvailable = !vllmDisabled` for connection).
    const gpuPresent = detectGpu();
    const vllmDisabled = env.VLLM_DISABLED || !gpuPresent;
    log.info({ gpuPresent, vllmDisabled }, "boot: gpu-detect → effective vLLM availability");

    // The stable per-replica lock-holder tag — threaded into BOTH compose (the chat turn-lock acquires under
    // it) AND the boot reclaim (it wipes this replica's own orphaned chat_locks). Stable across restarts of
    // the same box (single-replica assumption), so a crash's locks are reclaimable on the next boot.
    const holder = hostname();

    // 5. compose the full service graph (+ the boot handles). `vllmConcurrency` comes from settings'
    //    effective-config, which is built INSIDE compose — not available pre-compose, so it is omitted here
    //    (compose's BackendRegistry default applies). repoRoot is the process cwd (the vLLM engine root).
    const built = await createServices({
      db,
      now,
      ownerId,
      secretBoxKey,
      casDir: env.ASSETS_DIR,
      variantDir: join(dirname(env.ASSETS_DIR), "variants"),
      sessionSecret: env.SESSION_SECRET ?? null,
      vllmDisabled,
      repoRoot: process.cwd(),
      holder,
    });

    // 2b. The boot decrypt-probe → healthz `credentials_key_mismatch`.
    credentialsKeyOk = await built.services.credentials.probeKeyDecrypt();
    if (!credentialsKeyOk) {
      log.error(
        "boot: SecretBox decrypt-probe FAILED — healthz will report credentials_key_mismatch",
      );
    }

    // 6. The owner Principal (the privileged identity the env-credential seed writes under). `via:"fallback"`
    //    is the safe "this IS the owner" discriminator (spine §1); role is owner (D17).
    const owner: Principal = {
      userId: ownerId,
      role: "owner",
      handle: castId<Handle>(ownerHandle),
      externalId: null,
      via: "fallback",
    };

    await seedCredentialFromEnv({
      credentials: built.services.credentials,
      owner,
      openrouterApiKey: env.OPENROUTER_API_KEY,
    });

    // 8. the idempotent boot packs + the single-replica lock reclaim. The default-character pack seeds the
    //    owner over the ONE seeder instance the app first-request hook also drives (shared memo + latch).
    await seedDefaultPreset({ db, now });
    await seedThemes({ db, now });
    await seedDefaultCharacters({ seeder: built.characterSeeder, owner });
    await reclaimLocksOnBoot({ db, now, holder });

    //   • vLLM engine: null when VLLM_DISABLED — start it + keep its (synchronous) drain-closer for shutdown.
    if (built.vllmEngine !== null) {
      drainVllm = built.vllmEngine.start();
    }
    //   • catalog-refresh scheduler: enqueues the recurring `refresh-model-catalog` workload (workloads
    //     front door only; no executor needed).
    stopScheduler = startCatalogRefreshScheduler({
      service: built.services.workloads,
      ownerId,
      now,
      scheduleInterval: (fn, ms) => {
        const handle = setInterval(fn, ms);
        return () => {
          clearInterval(handle);
        };
      },
      checkIntervalMs: CATALOG_CHECK_INTERVAL_MS,
    });
    //   • workloads WORKER: the claim→run poll loop. Its per-dispatch role-clients come from the single
    //     async binder compose exposes (`built.bindRoleClients` — the PD-50 collapse); the engine ops + the
    //     wake-subscribe arrive via the workloads front door (the driver never touches the bus directly). The
    //     loop runs until `workerAbort` fires (shutdown); fire-and-forget, errors logged (it self-recovers).
    const workerAbort = new AbortController();
    stopWorker = workerAbort;
    const scheduleTimer = (fn: () => void, ms: number): (() => void) => {
      const handle = setInterval(fn, ms);
      return () => {
        clearInterval(handle);
      };
    };
    void startWorkloadsWorker({
      runnerDeps: {
        db,
        env: built.runnerEnv,
        bindRoleClients: built.bindRoleClients,
        loadUserSettings: built.services.settings.loadUserSettings,
        // PD-113: the engine audits WORKLOAD_FAILED on a terminal runtime failure through compose's ONE
        // bound logAudit writer (the same closure every domain audit op is wired from).
        audit: built.audit,
        now,
      },
      signal: workerAbort.signal,
      nextRunnable: nextRunnableWorkload,
      run: runWorkload,
      reap: reapOrphanedWorkloads,
      load: loadWorkload,
      subscribeWake: subscribeWorkloadWake,
      scheduleInterval: scheduleTimer,
      scheduleTimeout: scheduleTimer,
    }).catch((err: unknown) => {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "workloads worker loop exited",
      );
    });

    //   • buddy observer (PD-45/PD-64): the reaction engine — a SUPERVISED out-of-band loop (NOT a service
    //     verb) that taps the workloads + chat firehoses and the observability ring, reacting one normalized
    //     signal → one quip + mood/stat/bond shift onto the per-user reaction bus. `ownerId`'s buddy reacts to
    //     SYSTEM-health traces (request-scoped, not user-attributed). SIGTERM tears it down (unsubscribe +
    //     clear the sweeps).
    stopBuddyObserver = startBuddyObserver(
      createBuddyObserverEnv({
        db,
        now,
        ownerUserId: ownerId,
        summarize: built.roleClients.summarize,
        scheduleInterval: scheduleTimer,
      }),
    ).stop;

    // 10. The auth modes. Local mode wires the sessions `authenticate` verb (PD-83 — the resolution
    // moved into `domain/sessions`; the entry no longer reads `users`/runs the KDF itself); OIDC mode
    // mints the discovery fetcher.
    let authenticate: LocalAuthenticator | undefined;
    if (env.AUTH_MODE === "local") {
      authenticate = (handle: string, password: string): Promise<UserId | null> =>
        built.sessions.authenticate(handle, password);
    }

    // forward-header fail-closed belt: the UNSIGNED trusted-header path is refused until an operator names
    // the trusted source. Warn loudly at boot so a non-authentik proxy deploy (no signed JWT) isn't left
    // silently rejecting every request. The signed-JWT authentik path is unaffected.
    if (
      env.AUTH_MODE === "forward-header" &&
      (env.FORWARD_AUTH_TRUSTED_PROXIES === undefined ||
        env.FORWARD_AUTH_TRUSTED_PROXIES.trim().length === 0)
    ) {
      log.warn(
        "boot: AUTH_MODE=forward-header with FORWARD_AUTH_TRUSTED_PROXIES unset — the UNSIGNED trusted-header path is FAIL-CLOSED (raw identity headers are rejected). Set FORWARD_AUTH_TRUSTED_PROXIES to the trusted proxy/client source range(s) to enable it; the signed-JWT (authentik) path is unaffected.",
      );
    }

    let oidc: OidcRoutesDeps | undefined;
    if (env.AUTH_MODE === "oidc") {
      let cachedConfig: Configuration | undefined;
      const issuerUrlStr = env.OIDC_ISSUER ?? "";
      const issuerUrl =
        issuerUrlStr.length > 0 ? new URL(issuerUrlStr) : new URL("http://localhost");
      const clientId = env.OIDC_CLIENT_ID ?? "";
      const clientSecret = env.OIDC_CLIENT_SECRET;

      const oidcStore = createOidcStore(db, now);
      // The OIDC_REDIRECT_URIS allowlist: the FULL callback URLs the per-request derived origin must
      // exact-match. The login route derives the callback from the request origin + gates on this list
      // (origin-flexible: public FQDN AND LAN-IP/localhost), so no single redirect URI is baked in.
      const redirectAllowlist = (env.OIDC_REDIRECT_URIS ?? "")
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
      oidc = {
        redirectAllowlist,
        scope: env.OIDC_SCOPES,
        claims: {
          usernameClaim: env.OIDC_USERNAME_CLAIM,
          uidClaim: env.OIDC_UID_CLAIM,
          groupsClaim: env.OIDC_GROUPS_CLAIM,
          emailClaim: env.OIDC_EMAIL_CLAIM,
        },
        store: oidcStore,
        getConfig: async (): Promise<Configuration> => {
          if (cachedConfig === undefined) {
            cachedConfig = await discovery(issuerUrl, clientId, clientSecret);
          }
          return cachedConfig;
        },
      };

      //   • OIDC PKCE-transaction GC: reap expired/abandoned transactions on a cadence (the store's on-consume
      //     sweep only fires opportunistically, so an abandoned flow's row is otherwise unbounded). Direct-sweep
      //     driver (not a workload — a trivial idempotent DELETE); armed only in oidc mode where the table exists.
      stopOidcGc = startOidcGcScheduler({
        sweep: oidcStore.deleteExpired,
        now,
        scheduleInterval: scheduleTimer,
      });
    }

    // 11. build + serve the app; the CAS handle for the blob route is re-built here (stateless, same dir —
    //     the documented `entry/ wires createCas(env.ASSETS_DIR)` pattern; compose does not expose its own).
    const app = createApp({
      now,
      db,
      seam: createAuthSeam({ sessions: built.sessions }),
      services: built.services,
      rateLimit: createRateLimitGate({ db, now }),
      presence: built.presence,
      assets: built.assets,
      cas: createCas(env.ASSETS_DIR),
      character: built.services.character,
      exportService: built.exportService,
      sessions: built.sessions,
      isShuttingDown: () => isShuttingDown,
      credentialsKeyOk: () => credentialsKeyOk,
      // See AppDeps.seedUserCharacters for why the fire-and-forget void here is safe.
      seedUserCharacters: (principal: Principal): void => {
        void built.characterSeeder.ensureSeeded(principal);
      },
      ...(authenticate !== undefined ? { authenticate } : {}),
      ...(oidc !== undefined ? { oidc } : {}),
    });

    // Await the BIND, don't assume it: `serve()` binds asynchronously, and a bind failure
    // (EADDRINUSE — e.g. the dev stack already holds the port) surfaces as a server "error" event,
    // not a throw. Pre-fix, boot logged "listening" unconditionally and returned a zombie process
    // that claimed healthy while nothing was bound (found via the lifecycle int test silently
    // polling a NEIGHBOR server's healthz). Boot must fail LOUDLY on a dead listener.
    await new Promise<void>((resolve, reject) => {
      const onBindError = (err: Error): void => {
        reject(err);
      };
      const handle = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
        handle.removeListener("error", onBindError);
        log.info({ port: info.port }, "boot: listening — healthz live");
        resolve();
      });
      server = handle;
      handle.once("error", onBindError);
    });
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the graceful-drain teardown is a flat sequence of independent null-guarded stops (server, schedulers, worker, observer, vLLM, db) — one cohesive shutdown, splitting it hides the ordering.
  async function shutdown(): Promise<void> {
    if (isShuttingDown) {
      return;
    }
    // Flip healthz → 503 FIRST so the LB stops routing new traffic while in-flight work drains.
    isShuttingDown = true;
    log.info("shutdown: draining");

    if (server !== null) {
      const handle = server;
      await new Promise<void>((resolve) => {
        handle.close(() => {
          resolve();
        });
      });
      server = null;
    }
    if (stopScheduler !== null) {
      stopScheduler();
      stopScheduler = null;
    }
    if (stopOidcGc !== null) {
      stopOidcGc();
      stopOidcGc = null;
    }
    if (stopWorker !== null) {
      // Aborts the poll loop AND the in-flight row's run (the signal threads into runWorkload → cancelled).
      stopWorker.abort();
      stopWorker = null;
    }
    if (stopBuddyObserver !== null) {
      stopBuddyObserver();
      stopBuddyObserver = null;
    }
    if (drainVllm !== null) {
      drainVllm();
      drainVllm = null;
    }
    if (db !== null) {
      await preCloseHousekeeping(db);
      db = null;
    }
    log.info("shutdown: complete");
  }

  return { boot, shutdown };
}
