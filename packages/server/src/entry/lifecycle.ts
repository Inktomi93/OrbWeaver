// The boot/shutdown protocol. index.ts constructs the lifecycle once and runs boot(); SIGTERM/SIGINT run
// shutdown(). Owns no business logic — mints the one real clock, resolves the boot chicken-egg (owner id
// → services → owner Principal), runs the seed steps, starts the supervisors, builds + serves the Hono
// app, and tears it all down gracefully. Entry mints the one real wall clock and threads it everywhere as
// the injected `now`; nothing below entry reads ambient time.

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
import { startAutomationWatcher } from "#domain/automation";
import { createOidcStore, createSessionsService, ownerHandles } from "#domain/sessions";
import { loadWorkload, nextRunnableWorkload, reapOrphanedWorkloads, runWorkload, subscribeWorkloadWake } from "#domain/workloads";
import { enginesPostureInput, env, postureManages, postureRegistersBackend, resolveEnginesPosture } from "#foundation/env";
import { getLog, initTracing, wrapLibSqlClient } from "#foundation/observability";
import { createForwardJwtVerifier, createPasswordHasher } from "#infra/auth";
import { credentialsKeyFromEnv } from "#infra/crypto";
import { installEgressFirewall } from "#infra/network";
import { detectGpu } from "#infra/providers";
import { createCas } from "#infra/storage";
import { startCatalogRefreshScheduler } from "../transport/jobs/catalog-refresh-scheduler";
import { startOidcGcScheduler } from "../transport/jobs/oidc-gc-scheduler";
import { startWorkloadScheduleScheduler } from "../transport/jobs/workload-schedule-scheduler";
import { startWorkloadsWorker } from "../transport/jobs/workloads-worker";
import { setChatOpenTap } from "../transport/trpc";
import { createApp } from "./app";
import { createAuthSeam } from "./auth";
import {
  reclaimLocksOnBoot,
  runBootMigrations,
  seedCredentialFromEnv,
  seedDefaultCharacters,
  seedDefaultPersona,
  seedDefaultPreset,
  seedDemoChats,
  seedOwner,
  seedThemes,
} from "./boot";
import { createServices } from "./compose";
import { createAutomationWatcherEnv } from "./compose/automation-watcher";
import type { LocalAuthenticator, OidcRoutesDeps } from "./http";
import { createRateLimitGate } from "./rate-limit-gate";

const MS_PER_HOUR = 3_600_000;
const CATALOG_CHECK_INTERVAL_MS = MS_PER_HOUR;

/** The lifecycle handle `index.ts` drives: boot once, shut down once (idempotent). */
export interface Lifecycle {
  readonly boot: () => Promise<void>;
  readonly shutdown: () => Promise<void>;
}

/** Construct the lifecycle. Side-effect-free until `boot()` runs (so `index.ts` can wire signals first). */
export function createLifecycle(): Lifecycle {
  const log = getLog();
  const now = (): number => Date.now();

  let isShuttingDown = false;
  let credentialsKeyOk = false;
  let db: Db | null = null;
  let server: ServerType | null = null;
  let stopScheduler: (() => void) | null = null;
  let stopScheduleScheduler: (() => void) | null = null;
  let stopOidcGc: (() => void) | null = null;
  let stopWorker: AbortController | null = null;
  let stopBuddyObserver: (() => void) | null = null;
  let stopCrewScheduler: (() => void) | null = null;
  let stopAutomationWatcher: (() => void) | null = null;
  let drainVllm: (() => void) | null = null;
  let booted = false;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: boot sequence is inherently long
  async function boot(): Promise<void> {
    if (booted) {
      return;
    }
    booted = true;

    // Boot the OTel SDK BEFORE any span opens (the db wrap below opens the first spans). Idempotent — the
    // composition-root call; without it the first query would lazy-boot tracing implicitly.
    initTracing();

    // Swap undici's global dispatcher for the private-IP-rejecting DNS lookup so every outbound fetch
    // below is address-gated before it can fire. No-op when EGRESS_FIREWALL=false.
    installEgressFirewall();

    // Inject the OTel libSQL wrap so every db.execute/batch/transaction opens a child span under the active
    // request-root (the composition-root injection the tracing.ts + createDb headers document).
    db = await createDb(env.DATABASE_URL, wrapLibSqlClient);

    const secretBoxKey = credentialsKeyFromEnv();

    await runBootMigrations({ db, databaseUrl: env.DATABASE_URL });

    // Resolve the owner id before compose (the owner role-clients bundle resolves against it). A
    // transient sessions service is built only to run the owner seed; compose owns the real one.
    const handles = ownerHandles();
    const bootSessions = createSessionsService({
      db,
      now,
      sessionSecret: env.SESSION_SECRET ?? null,
    });
    // AUTH_MODE=local: seed the owner's first-boot form-login password so a non-local-origin deploy isn't
    // locked out. Passed only in local mode; first-boot-only + non-clobbering (see seed-owner).
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

    // The one GPU/vLLM-availability fact: probe the host once, then resolve the ENGINES_POSTURE (A.4). The
    // deprecated VLLM_DISABLED/STACK_ENGINES pair maps to a posture with a VISIBLE log. `off` OR no GPU ⇒
    // the backend isn't registered and no supervisor runs (effective "disabled" for the rest of compose).
    const gpuPresent = detectGpu();
    const posture = resolveEnginesPosture(enginesPostureInput(), (msg) => log.warn({ deprecation: true }, `boot: ${msg}`));
    const vllmDisabled = !(postureRegistersBackend(posture) && gpuPresent);
    log.info({ gpuPresent, posture, vllmDisabled }, "boot: gpu-detect → engines posture → effective vLLM availability");

    // The stable per-replica lock-holder tag — threaded into both compose (chat turn-lock) and the boot
    // reclaim (wipes this replica's own orphaned chat_locks).
    const holder = hostname();

    const built = await createServices({
      db,
      now,
      ownerId,
      secretBoxKey,
      casDir: env.ASSETS_DIR,
      variantDir: join(dirname(env.ASSETS_DIR), "variants"),
      ...(env.IMPORT_STAGING_DIR !== undefined ? { importStagingDir: env.IMPORT_STAGING_DIR } : {}),
      ...(env.ST_PROFILE_DIR !== undefined ? { stProfileDir: env.ST_PROFILE_DIR } : {}),
      sessionSecret: env.SESSION_SECRET ?? null,
      vllmDisabled,
      vllmManages: postureManages(posture),
      repoRoot: process.cwd(),
      holder,
    });

    credentialsKeyOk = await built.services.credentials.probeKeyDecrypt();
    if (!credentialsKeyOk) {
      log.error("boot: SecretBox decrypt-probe FAILED — healthz will report credentials_key_mismatch");
    }

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

    // Boot-seed the in-memory OR catalog mirror from the persisted snapshot so a restart preserves catalog
    // warmth (getCatalog's read warms or-model-cache as a side-effect). Without this the mirror is cold
    // until the next refresh — which the daily-cadence scheduler won't run for up to a day — and every OR
    // model resolves with EMPTY supportedParameters, silently dropping its advertised structured/tools
    // capability. A never-refreshed account reads the empty snapshot (no-op warm); harmless.
    await built.services.connection.getCatalog({});

    // Same boot-seed for the SEPARATE agent-sdk daemon catalog mirror (getCatalog above is OR-only — the two
    // caches never co-mingle). getAgentSdkCatalog's read warms agent-sdk-model-cache as a side-effect. Without
    // this the mirror is cold until the next daily refresh, so a restart degrades max-pro-sub / OR-skin models
    // to the conservative no-reasoning profile (resolveAgentSdkAlias returns undefined on a null cache).
    await built.services.connection.getAgentSdkCatalog({});

    await seedDefaultPreset({ db, now });
    await seedThemes({ db, now });
    await seedDefaultCharacters({ seeder: built.characterSeeder, owner });
    await seedDefaultPersona({ seeder: built.personaSeeder, owner });
    // AFTER the cards — each bundled example attaches to seeded characters by handle.
    await seedDemoChats({ seeder: built.demoChatSeeder, owner });
    await reclaimLocksOnBoot({ db, contributions: built.workloadContributions, now, holder });

    // Boot-reclaim the host-offline deferred-turn queue (chat Part III §5): each row runs (consent/budget
    // re-validated in-lock) or is dropped. Fire-and-forget — the drain does real generation, so it must
    // NOT block boot/listen; its own log reports ran/dropped and one row's fault can't abort the sweep.
    void built.services.chat
      .drainDeferredTurns({ all: true })
      .then((report) => log.info(report, "boot: drained deferred turns (pending_turns reclaim)"))
      .catch((err: unknown) => log.error({ err }, "boot: deferred-turn drain failed"));

    if (built.vllmEngine !== null) {
      drainVllm = built.vllmEngine.start();
    }
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
      // Item 5: the success-refresh cadence is a live admin knob (catalogRefreshIntervalMs).
      refreshEveryMs: () => built.services.settings.getEffectiveConfig().catalogRefreshIntervalMs,
    });
    stopScheduleScheduler = startWorkloadScheduleScheduler({
      db,
      now,
      start: (params) => built.services.workloads.start(params),
      scheduleInterval: (fn, ms) => {
        const handle = setInterval(fn, ms);
        return () => {
          clearInterval(handle);
        };
      },
    });
    // The workloads worker's claim→run poll loop, fire-and-forget; errors logged (it self-recovers).
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
        contributions: built.workloadContributions,
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
      log.error({ err: err instanceof Error ? err.message : String(err) }, "workloads worker loop exited");
    });

    // The automation watcher (A5, D46) — evaluates enabled rules against the chat firehose + the domain-event
    // bus. The per-viewer `chatOpened` trigger rides the transport-attach synthesis (D81), not the bus, so it
    // is tapped separately into the same `handleEvent`. Fire-and-forget; SIGTERM stops both.
    stopAutomationWatcher = startAutomationWatcher(createAutomationWatcherEnv({ automation: built.automation, eventBus: built.eventBus })).stop;
    setChatOpenTap((chatId) => {
      void built.automation.handleEvent({ type: "chatOpened", chatId });
    });

    let authenticate: LocalAuthenticator | undefined;
    if (env.AUTH_MODE === "local") {
      authenticate = (handle: string, password: string): Promise<UserId | null> => built.sessions.authenticate(handle, password);
    }

    // forward-header fail-closed belt: warn loudly at boot so a non-authentik proxy deploy (no signed
    // JWT) isn't left silently rejecting every request.
    if (env.AUTH_MODE === "forward-header" && (env.FORWARD_AUTH_TRUSTED_PROXIES === undefined || env.FORWARD_AUTH_TRUSTED_PROXIES.trim().length === 0)) {
      log.warn(
        "boot: AUTH_MODE=forward-header with FORWARD_AUTH_TRUSTED_PROXIES unset — the UNSIGNED trusted-header path is FAIL-CLOSED (raw identity headers are rejected). Set FORWARD_AUTH_TRUSTED_PROXIES to the trusted proxy/client source range(s) to enable it; the signed-JWT (authentik) path is unaffected.",
      );
    }

    let oidc: OidcRoutesDeps | undefined;
    if (env.AUTH_MODE === "oidc") {
      let cachedConfig: Configuration | undefined;
      const issuerUrlStr = env.OIDC_ISSUER ?? "";
      const issuerUrl = issuerUrlStr.length > 0 ? new URL(issuerUrlStr) : new URL("http://localhost");
      const clientId = env.OIDC_CLIENT_ID ?? "";
      const clientSecret = env.OIDC_CLIENT_SECRET;

      const oidcStore = createOidcStore(db, now);
      // The full callback URLs the per-request derived origin must exact-match.
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

      stopOidcGc = startOidcGcScheduler({
        sweep: oidcStore.deleteExpired,
        now,
        scheduleInterval: scheduleTimer,
      });
    }

    const app = createApp({
      now,
      db,
      seam: createAuthSeam({ sessions: built.sessions, verifyForwardJwt: createForwardJwtVerifier() }),
      services: built.services,
      rateLimit: createRateLimitGate({ db, now, resolveRateLimits: () => built.services.settings.getEffectiveConfig().rateLimits }),
      presence: built.presence,
      sockets: built.sockets,
      assets: built.assets,
      cas: createCas(env.ASSETS_DIR),
      character: built.services.character,
      exportService: built.exportService,
      portability: built.portability,
      importWorldInfo: built.importWorldInfo,
      sessions: built.sessions,
      isShuttingDown: () => isShuttingDown,
      credentialsKeyOk: () => credentialsKeyOk,
      seedUserCharacters: (principal: Principal): void => {
        // CHAINED, not parallel: the demo chats attach to the cards this user is getting right now, so they
        // must not race the pack. `ensureSeeded` never throws, so the `.then` is unconditional.
        void built.characterSeeder.ensureSeeded(principal).then((): Promise<void> => built.demoChatSeeder.ensureSeeded(principal));
        void built.personaSeeder.ensureSeeded(principal);
      },
      ...(authenticate !== undefined ? { authenticate } : {}),
      ...(oidc !== undefined ? { oidc } : {}),
    });

    // Await the bind, don't assume it: serve() binds asynchronously, and a bind failure (EADDRINUSE)
    // surfaces as a server "error" event, not a throw. Boot must fail loudly on a dead listener.
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
    if (stopScheduleScheduler !== null) {
      stopScheduleScheduler();
      stopScheduleScheduler = null;
    }
    if (stopOidcGc !== null) {
      stopOidcGc();
      stopOidcGc = null;
    }
    if (stopWorker !== null) {
      stopWorker.abort();
      stopWorker = null;
    }
    if (stopBuddyObserver !== null) {
      stopBuddyObserver();
      stopBuddyObserver = null;
    }
    if (stopCrewScheduler !== null) {
      stopCrewScheduler();
      stopCrewScheduler = null;
    }
    if (stopAutomationWatcher !== null) {
      stopAutomationWatcher();
      stopAutomationWatcher = null;
    }
    setChatOpenTap(null);
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
