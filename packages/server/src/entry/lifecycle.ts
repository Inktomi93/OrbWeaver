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
import { createOidcStore, createSessionsService } from "#domain/sessions";
import {
  loadWorkload,
  nextRunnableWorkload,
  reapOrphanedWorkloads,
  runWorkload,
  subscribeWorkloadWake,
} from "#domain/workloads";
import { env } from "#foundation/env";
import { getLog } from "#foundation/observability";
import { credentialsKeyFromEnv } from "#infra/crypto";
import { detectGpu } from "#infra/providers";
import { createCas } from "#infra/storage";
import { startCatalogRefreshScheduler } from "../transport/jobs/catalog-refresh-scheduler";
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
} from "./boot";
import { createServices } from "./compose";
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

/** Parse OWNER_HANDLES (comma list) → the resolved owner handles, defaulting to [DEFAULT_USER_HANDLE]. */
function ownerHandles(): readonly string[] {
  const parsed = (env.OWNER_HANDLES ?? "")
    .split(",")
    .map((handle) => handle.trim())
    .filter((handle) => handle.length > 0);
  return parsed.length > 0 ? parsed : [env.DEFAULT_USER_HANDLE];
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
  // The workloads worker loop runs until its AbortSignal fires; shutdown aborts it to drain the in-flight row.
  let stopWorker: AbortController | null = null;
  // The vLLM supervisor's graceful-drain closer is SYNCHRONOUS (VllmEngineHandle.start → () => void).
  let drainVllm: (() => void) | null = null;
  let booted = false;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: boot sequence is inherently long
  async function boot(): Promise<void> {
    if (booted) {
      return;
    }
    booted = true;

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
    const ownerIds = await seedOwner({ db, sessions: bootSessions, ownerHandles: handles, now });
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

    // 10. The auth modes. Local mode wires the sessions `authenticate` verb (PD-83 — the resolution
    // moved into `domain/sessions`; the entry no longer reads `users`/runs the KDF itself); OIDC mode
    // mints the discovery fetcher.
    let authenticate: LocalAuthenticator | undefined;
    if (env.AUTH_MODE === "local") {
      authenticate = (handle: string, password: string): Promise<UserId | null> =>
        built.sessions.authenticate(handle, password);
    }

    let oidc: OidcRoutesDeps | undefined;
    if (env.AUTH_MODE === "oidc") {
      let cachedConfig: Configuration | undefined;
      const issuerUrlStr = env.OIDC_ISSUER ?? "";
      const issuerUrl =
        issuerUrlStr.length > 0 ? new URL(issuerUrlStr) : new URL("http://localhost");
      const clientId = env.OIDC_CLIENT_ID ?? "";
      const clientSecret = env.OIDC_CLIENT_SECRET;

      oidc = {
        redirectUri: env.OIDC_REDIRECT_URIS?.split(",")[0]?.trim() ?? "",
        scope: "openid profile email",
        store: createOidcStore(db),
        getConfig: async (): Promise<Configuration> => {
          if (cachedConfig === undefined) {
            cachedConfig = await discovery(issuerUrl, clientId, clientSecret);
          }
          return cachedConfig;
        },
      };
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

    server = serve({ fetch: app.fetch, port: env.PORT });
    log.info({ port: env.PORT }, "boot: listening — healthz live");
  }

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
    if (stopWorker !== null) {
      // Aborts the poll loop AND the in-flight row's run (the signal threads into runWorkload → cancelled).
      stopWorker.abort();
      stopWorker = null;
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
