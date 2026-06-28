// entry/lifecycle — THE boot/shutdown protocol (tiers/entry.md §"Boot order"; DECISIONS-LEDGER §7 D5:
// this lives at `entry/lifecycle.ts`, read by entry only). `index.ts` constructs the lifecycle once and
// runs `boot()`; SIGTERM/SIGINT run `shutdown()`. It owns NO business logic — it MINTS the one real clock,
// resolves the boot chicken-egg (owner id → services → owner Principal), runs the seed steps, starts the
// supervisors, builds + serves the Hono app, and tears it all down gracefully.
//
// THE CLOCK: entry mints the ONE real wall clock (`Date.now`) — entry is the `no-raw-clock`-exempt site —
// and threads it everywhere as the injected `now` (compose, the seam, the seeders, the rate-limiter, the
// supervisors). Nothing below entry reads ambient time.

import { dirname, join } from "node:path";
import process from "node:process";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { createDb, preCloseHousekeeping } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createSessionsService } from "#domain/sessions";
import {
  loadWorkload,
  nextRunnableWorkload,
  reapOrphanedWorkloads,
  runWorkload,
  subscribeWorkloadWake,
} from "#domain/workloads";
import { env } from "#foundation/env";
import { getLog } from "#foundation/observability";
import type { SecretBox } from "#infra/crypto";
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
import { createRateLimitGate } from "./rate-limit-gate";

const MS_PER_HOUR = 3_600_000;
// The catalog-refresh decision tick — hourly is plenty (the actual refresh cadence is daily, gated in the
// scheduler).
const CATALOG_CHECK_INTERVAL_MS = MS_PER_HOUR;
// The SecretBox boot self-probe canary (round-trips through the configured key to prove the cipher is live).
const KEY_PROBE_AAD = "healthz|key-probe";
const KEY_PROBE_PLAINTEXT = "orbweaver-key-probe";

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

/**
 * The SecretBox boot decrypt-probe → the healthz `credentials_key_mismatch` signal. A disabled box (no key
 * configured) is HEALTHY — per-user credential storage is simply off, nothing is encrypted to mismatch. An
 * enabled box round-trips a canary through the live key to prove the cipher works.
 *
 * FLAG[PD-51]: the deeper probe PRE-SCAFFOLD §B2 names — "decrypt the FIRST stored credential row" to
 * catch a rotated/lost key against EXISTING ciphertext — needs a `credentials` front-door probe verb (the
 * slice exposes none; reconstructing the `${userId}|${provider}` AAD at entry would double the domain's
 * `aadFor`). Until that verb lands, this canary proves the configured key is internally consistent, not that
 * it still matches old rows. Wire the row-decrypt probe HERE when the front-door verb exists.
 */
function probeCredentialsKey(box: SecretBox): boolean {
  if (!box.enabled) {
    return true;
  }
  try {
    return (
      box.decrypt(box.encrypt(KEY_PROBE_PLAINTEXT, KEY_PROBE_AAD), KEY_PROBE_AAD) ===
      KEY_PROBE_PLAINTEXT
    );
  } catch {
    return false;
  }
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

  async function boot(): Promise<void> {
    if (booted) {
      return;
    }
    booted = true;

    // 1. db.
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
    });

    // 2b. The boot decrypt-probe → healthz `credentials_key_mismatch`.
    credentialsKeyOk = probeCredentialsKey(built.secretBox);
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

    // 7. seed the env OpenRouter key (once, into the owner's credentials).
    await seedCredentialFromEnv({
      credentials: built.services.credentials,
      owner,
      openrouterApiKey: env.OPENROUTER_API_KEY,
    });

    // 8. the idempotent boot packs + the single-replica lock reclaim. The default-character pack seeds the
    //    owner over the ONE seeder instance the app first-request hook also drives (shared memo + latch).
    await seedDefaultPreset({ db, now });
    await seedDefaultCharacters({ seeder: built.characterSeeder, owner });
    await reclaimLocksOnBoot({ db, now });

    // 9. supervisors.
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

    // 10. build + serve the app; the CAS handle for the blob route is re-built here (stateless, same dir —
    //     the documented `entry/ wires createCas(env.ASSETS_DIR)` pattern; compose does not expose its own).
    const app = createApp({
      now,
      db,
      seam: createAuthSeam({ sessions: built.sessions }),
      services: built.services,
      rateLimit: createRateLimitGate({ db, now }),
      assets: built.assets,
      cas: createCas(env.ASSETS_DIR),
      character: built.services.character,
      sessions: built.sessions,
      isShuttingDown: () => isShuttingDown,
      credentialsKeyOk: () => credentialsKeyOk,
      // Per-new-user first-request seed (SSO/admin-created accounts). Fire-and-forget — ensureSeeded never
      // throws and the memo+latch make it a Set lookup after the first touch; NEVER block the request.
      seedUserCharacters: (principal: Principal): void => {
        void built.characterSeeder.ensureSeeded(principal);
      },
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
