// The boot/shutdown protocol. index.ts constructs the lifecycle once and runs boot(); SIGTERM/SIGINT run
// shutdown(). Owns no business logic — mints the one real clock, resolves the boot chicken-egg (owner id
// → services → owner Principal), runs the seed steps, starts the supervisors, builds + serves the Hono
// app, and tears it all down gracefully. Entry mints the one real wall clock and threads it everywhere as
// the injected `now`; nothing below entry reads ambient time.

import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { createDb, preCloseHousekeeping } from "@orb/db";
import type { ChatId, ChatTurnId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Configuration } from "openid-client";
import { authorizationCodeGrant, discovery } from "openid-client";
import { startAutomationWatcher } from "#domain/automation";
import type { SessionsService } from "#domain/sessions";
import { createOidcStore, createSessionsService, ownerHandles } from "#domain/sessions";
import { loadWorkload, nextRunnableWorkload, reapOrphanedWorkloads, runWorkload, subscribeWorkloadWake } from "#domain/workloads";
import {
  bindPostureInput,
  bindPostureWarnings,
  diagnosticsPostureInput,
  diagnosticsPostureWarnings,
  effectiveVllmDisabled,
  enginesPostureInput,
  env,
  ownerFallbackCredentialInput,
  postureManages,
  resolveBindPosture,
  resolveDiagnosticsPosture,
  resolveEnginesPosture,
  resolveOwnerFallbackCredential,
} from "#foundation/env";
import { getLog, initTracing, superviseDetached, wrapLibSqlClient } from "#foundation/observability";
import {
  createBackchannelLogoutVerifier,
  createForwardJwtVerifier,
  createOidcConfigCache,
  createOidcExchange,
  createPasswordHasher,
  ownerFallbackAllowed,
} from "#infra/auth";
import { credentialsKeyFromEnv } from "#infra/crypto";
import { installEgressFirewall } from "#infra/network";
import { detectGpu } from "#infra/providers";
import { createCas } from "#infra/storage";
import { startCatalogRefreshScheduler } from "../transport/jobs/catalog-refresh-scheduler.ts";
import { startOidcGcScheduler } from "../transport/jobs/oidc-gc-scheduler.ts";
import { startWorkloadScheduleScheduler } from "../transport/jobs/workload-schedule-scheduler.ts";
import { startWorkloadsWorker } from "../transport/jobs/workloads-worker.ts";
import { setChatOpenTap } from "../transport/trpc/index.ts";
import { createApp } from "./app.ts";
import { createAuthSeam, createHostPrincipalResolver } from "./auth/index.ts";
import {
  backfillPluginProvenanceOnBoot,
  DB_LAUNCHED,
  healLegacyBackgroundPinsOnBoot,
  migrateHandoffOfferVocabOnBoot,
  migrateProseSlotVocabOnBoot,
  reclaimLocksOnBoot,
  runBootMigrations,
  seedCasSchedules,
  seedCredentialFromEnv,
  seedDefaultCharacters,
  seedDefaultPersona,
  seedDefaultPreset,
  seedDemoChats,
  seedExamplePlugins,
  seedOwner,
  seedThemes,
} from "./boot/index.ts";
import { createAutomationWatcherEnv } from "./compose/automation-watcher.ts";
import { createServices } from "./compose/index.ts";
import type { FirstRunRouteDeps, LocalAuthenticator, OidcRoutesDeps } from "./http/index.ts";
import { createRateLimitGate } from "./rate-limit-gate.ts";

const MS_PER_HOUR = 3_600_000;
const CATALOG_CHECK_INTERVAL_MS = MS_PER_HOUR;

/** How long a shutdown waits for open connections before force-closing them. Bounded on purpose: the app's
 *  own SSE stream never ends, so an unbounded drain lets one open browser tab stall a deploy indefinitely
 *  (measured: ~6 minutes on one tab, until it happened to reconnect). Long enough for a normal in-flight
 *  request to finish, short enough that a restart is always a restart. */
const SHUTDOWN_DRAIN_MS = 10_000;

/** The two node-http connection-closing methods a bounded drain needs. Present on `http.Server` (node 18.2+),
 *  ABSENT on the http2 servers in `ServerType`'s union — so they are probed, never assumed. */
interface ConnectionCloser {
  readonly closeIdleConnections: () => void;
  readonly closeAllConnections: () => void;
}

/** The probe: the handle iff it carries BOTH methods, else `null` (an http2 server — no forced close available). */
function connectionCloser(handle: ServerType): ConnectionCloser | null {
  const candidate = handle as Partial<ConnectionCloser>;
  return typeof candidate.closeIdleConnections === "function" && typeof candidate.closeAllConnections === "function" ? (candidate as ConnectionCloser) : null;
}

/** The minimal logger shape {@link drainHttpServer} needs — real `getLog()` in production, a spy in tests. */
interface DrainLog {
  readonly warn: (fields: Record<string, unknown>, msg: string) => void;
}

/** The worker resources shutdown owns: signal it first, then join the loop before touching the DB. */
interface OwnedWorkloadsWorker {
  readonly abort: () => void;
  readonly settled: Promise<void>;
}

/** Abort and JOIN the workload worker. Exported so the held-worker ordering is behaviorally pinned without
 * booting the whole composition root; lifecycle calls this immediately before DB pre-close.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export async function drainWorkloadsWorker(worker: OwnedWorkloadsWorker): Promise<void> {
  worker.abort();
  await worker.settled;
}

/** Stop accepting, then drain — WITH A DEADLINE.
 *
 *  `server.close()` alone waits for every open connection to end, and an SSE stream never does: one browser
 *  tab held a prod shutdown for ~6 minutes (measured), because the app's own live-update socket is exactly
 *  the connection that never closes on its own. A client must not be able to hold a deploy hostage.
 *
 *  Idle keep-alive sockets are dropped immediately (they have no in-flight request to lose). Everything
 *  still open at the deadline — SSE, and any genuinely long request — is force-closed so `close()` can
 *  settle. The force is LOUD: a shutdown that had to cut connections says so, since that is the case where
 *  a client saw a truncated stream.
 *
 *  Exported (not a `createLifecycle` closure) so the forced path is directly testable against a real open
 *  socket, rather than only provable live (`DRAIN-UNBOUNDED`, dogfood-tracking.md).
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export async function drainHttpServer(handle: ServerType, log: DrainLog, drainMs: number = SHUTDOWN_DRAIN_MS): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    handle.close(() => {
      resolve();
    });
  });
  // `ServerType` is a union that includes the http2 servers, which do not carry the connection-closing
  // pair — hence a capability probe rather than a cast. Absent (http2), the drain degrades to the old
  // unbounded wait, which is honest: there is no supported way to force those sockets from here.
  const closer = connectionCloser(handle);
  // Keep-alive sockets sitting idle between requests: nothing in flight, drop them now rather than wait.
  closer?.closeIdleConnections();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<"forced">((resolve) => {
    timer = setTimeout(() => {
      resolve("forced");
    }, drainMs);
  });
  const outcome = await Promise.race([closed.then(() => "drained" as const), deadline]);
  if (outcome === "forced") {
    log.warn({ drainMs }, "shutdown: drain deadline hit — force-closing remaining connections (long-lived streams do not end on their own)");
    closer?.closeAllConnections();
    await closed;
  }
  if (timer !== undefined) {
    clearTimeout(timer);
  }
}

/** One `setInterval` as a stop-function — the `scheduleInterval`/`scheduleTimeout` shape every scheduler and
 *  the workloads worker take. ONE home: boot wired three byte-identical copies of this closure inline. */
function scheduleInterval(fn: () => void, ms: number): () => void {
  const handle = setInterval(fn, ms);
  return () => {
    clearInterval(handle);
  };
}

/** AUTH_MODE=local's route dependencies, built together because they are one feature: the form-login
 *  authenticator plus the B4 first-run owner-password setup. The route and the `localFirstRun` config flag
 *  share ONE gate (`ownerFallbackAllowed`, #298 f2), so the setup screen appears exactly where the setup
 *  endpoint accepts a claim: a LOOPBACK TCP peer (the unspoofable socket, not the client `Host`). A
 *  public-origin/LAN local deploy still uses LOCAL_INITIAL_PASSWORD (seeded at boot ⇒ the owner has a
 *  password ⇒ first-run never triggers). */
function buildLocalAuthDeps(sessions: SessionsService): {
  authenticate: LocalAuthenticator;
  firstRun: FirstRunRouteDeps;
  localFirstRun: (peerIp: string | undefined) => Promise<boolean>;
} {
  const hasher = createPasswordHasher(env.SESSION_SECRET);
  return {
    authenticate: (handle: Handle, password: string): Promise<UserId | null> => sessions.authenticate(handle, password),
    firstRun: {
      setOwnerPassword: async (plain: string): Promise<UserId | null> => sessions.claimOwnerPassword(await hasher.hash(plain)),
      originAllowed: (peerIp: string | undefined): boolean => ownerFallbackAllowed(peerIp),
    },
    localFirstRun: async (peerIp: string | undefined): Promise<boolean> => (ownerFallbackAllowed(peerIp) ? await sessions.ownerNeedsPassword() : false),
  };
}

/** AUTH_MODE=oidc's route dependencies plus the store's GC sweeper, built together because the sweeper's
 *  subject IS the store these deps carry — returning the stop handle keeps the teardown's ownership with the
 *  thing that started it. The issuer discovery is lazy + SINGLE-FLIGHT-memoized (a cold IdP must not fail
 *  boot; the concurrency contract — one shared attempt, no cached rejection — is `infra/auth/oidc-discovery`
 *  and is proven there, #762). */
function buildOidcDeps(db: Db, now: () => number): { oidc: OidcRoutesDeps; stopOidcGc: () => void } {
  const issuerUrlStr = env.OIDC_ISSUER ?? "";
  const issuerUrl = issuerUrlStr.length > 0 ? new URL(issuerUrlStr) : new URL("http://localhost");
  const clientId = env.OIDC_CLIENT_ID ?? "";
  const clientSecret = env.OIDC_CLIENT_SECRET;
  const store = createOidcStore(db, now);
  // #762 — ONE shared in-flight discovery per process; a rejection is never cached (the next caller
  // retries). The cache module owns that contract; this root only supplies the round-trip.
  const getConfig = createOidcConfigCache((): Promise<Configuration> => discovery(issuerUrl, clientId, clientSecret));
  return {
    oidc: {
      // #867 — THE REAL code→token exchange. This is the ONE site that binds the callback to
      // `openid-client`'s `authorizationCodeGrant`; the route and the adapter hold only types, which is what
      // lets a test drive the whole callback (and the adapter's own checks mapping) with a deterministic
      // fake and no IdP. Nothing here is env-switchable on purpose: a knob that could swap the exchange for
      // a fake would be an authentication bypass wearing a test affordance.
      exchange: createOidcExchange(authorizationCodeGrant),
      // The full callback URLs the per-request derived origin must exact-match.
      redirectAllowlist: (env.OIDC_REDIRECT_URIS ?? "")
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u.length > 0),
      scope: env.OIDC_SCOPES,
      claims: {
        usernameClaim: env.OIDC_USERNAME_CLAIM,
        uidClaim: env.OIDC_UID_CLAIM,
        groupsClaim: env.OIDC_GROUPS_CLAIM,
        emailClaim: env.OIDC_EMAIL_CLAIM,
      },
      // A4 — split a separator-joined groups claim (authentik property mappings) into an array.
      groupsSeparator: env.OIDC_GROUPS_SEPARATOR,
      // A1/A2 — resolve the OIDC admission decisions from env HERE (the oidc-only caller) and pass them into
      // provisionIdentity; the verb stays mode-agnostic and forward-header JIT is never gated by these.
      allowJitProvision: env.OIDC_SIGNUP,
      requireApproval: env.OIDC_REQUIRE_APPROVAL,
      store,
      getConfig,
      // A5 — register the back-channel logout endpoint only when OIDC_BACKCHANNEL_LOGOUT=on. The verifier
      // is the sealed infra/auth JWKS checker; clientId is the required `aud` on the logout_token.
      ...(env.OIDC_BACKCHANNEL_LOGOUT ? { backchannelLogout: { verify: createBackchannelLogoutVerifier().verify, clientId } } : {}),
    },
    stopOidcGc: startOidcGcScheduler({ sweep: store.deleteExpired, now, scheduleInterval }),
  };
}

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
  let stopWorker: OwnedWorkloadsWorker | null = null;
  let stopBuddyObserver: (() => void) | null = null;
  let stopAutomationWatcher: (() => void) | null = null;
  let drainVllm: (() => void) | null = null;
  let booted = false;

  // RATIFIED (#596). boot is the ORDERED startup protocol, and its score is the protocol's LENGTH, not tangled
  // control flow: fail-closed guards on the sequence plus one conditional column per optional dependency, each
  // at real nesting depth 0 and each DOUBLED by biome's enclosing-closure nesting penalty. The genuinely nested
  // wiring HAS been lifted out (buildLocalAuthDeps / buildOidcDeps / scheduleInterval, #596 — 57 → 45); what is
  // left is the inventory this file exists to state IN ORDER, and splitting it further hides that ordering.
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the ordered boot protocol — ruling above
  async function boot(): Promise<void> {
    if (booted) {
      return;
    }
    // SET BEFORE THE PROTOCOL, ON PURPOSE (#1479 item 2, refuted as a defect): this is the IN-FLIGHT latch
    // of `if (booted) return`, not an "initialization finished" flag — nothing else reads it. Moving the
    // assignment after the bind below would let a second `boot()` re-run migrations, the seeds, compose and
    // the listener bind concurrently. A boot FAILURE never leaves it stale either: `entry/index.ts` exits
    // the process (there is no in-process retry to unblock).
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

    // `launched` is REQUIRED and passed explicitly (#1392) — the omission here is what left the
    // auto-wipe refusal inert on every real boot.
    await runBootMigrations({ db, databaseUrl: env.DATABASE_URL, launched: DB_LAUNCHED });

    // #1649 DATA migration, immediately after the schema migrations and before anything reads a chat: the
    // host-handoff offer's `$.copyCast` key became `$.copyCharacters`, and the offer's read seam degrades an
    // unrecognised blob to NO_HANDOFF_OFFER rather than failing, so an un-migrated row silently drops a
    // departing host's recorded consent. Idempotent — a no-op on every boot after the first.
    await migrateHandoffOfferVocabOnBoot({ db });

    // #1737 DATA migration, in the same window and for the same reason: the `home:"preset"` prose slot
    // `chat.group.castMember` became `chat.group.characterHeading`, and `proseOverridesSchema` STRIPS an
    // unknown slot id at the parse seam — so an un-migrated `presets.config` silently loses the host's
    // authored narrator character heading instead of failing. Idempotent — a no-op on every boot after the
    // first. Runs before compose, which is where the first preset read lives.
    await migrateProseSlotVocabOnBoot({ db });

    // #1600 ONE-TIME DATA heal, same window: a `user_settings` row pinning a background asset that predates
    // #1478.1's ownership+kind guard (dev data, or any asset whose `kind` was never `background`) refuses
    // EVERY settings write for that user, not only a background edit. Idempotent — a no-op on every boot
    // after the first, and on a db seeded entirely post-#1478.
    await healLegacyBackgroundPinsOnBoot({ db });
    // #1708 DATA repair, in the same window and for the same reason: a card ingested through a plugin BEFORE
    // #1702 shipped never got an `importedFrom` stamp, and `characterProvenanceOf` collapses a null
    // `importedFrom` to `authored` — so an un-migrated row silently misreports "Made here" on every read
    // until this runs. Idempotent — a no-op on every boot once the candidate set is drained. Runs before
    // compose, which is where the first character read lives.
    await backfillPluginProvenanceOnBoot({ db });

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
    // BELT: `ownerId` must name a REAL row, not merely be defined. Everything below binds to it — the owner
    // role-clients bundle, the boot Principal, and every owner-scoped seed — and the boot Principal is
    // ROW-DERIVED through `principalFromRow`, which deliberately DEGRADES an unknown id to `role:"user"`
    // (the frozen-host bridge needs that; a boot does not). So a defined-but-dangling id would seed the whole
    // box under a non-owner principal against a row that does not exist, silently. `ensureUser` now refuses
    // to fabricate an id upstream; this is the boot-side floor beneath it — one read, fail-closed.
    if ((await bootSessions.loadUserById(ownerId)) === null) {
      throw new Error(`boot: seedOwner returned owner id ${ownerId} but no users row carries it — refusing to boot on a phantom owner`);
    }

    // The one GPU/vLLM-availability fact: probe the host once, then resolve the ENGINES_POSTURE (A.4). The
    // deprecated VLLM_DISABLED/STACK_ENGINES pair maps to a posture with a VISIBLE log. `off` ⇒ disabled;
    // the local-GPU requirement is MANAGER-scoped (effectiveVllmDisabled): adopt-or-start spawns on THIS
    // host and needs its GPU, while adopt-only may consume a REMOTE fleet (VLLM_ENGINE_HOST) GPU-less.
    const gpuPresent = detectGpu();
    const posture = resolveEnginesPosture(enginesPostureInput(), (msg) => log.warn({ deprecation: true }, `boot: ${msg}`));
    const vllmDisabled = effectiveVllmDisabled(posture, gpuPresent);
    log.info({ gpuPresent, posture, vllmDisabled }, "boot: gpu-detect → engines posture → effective vLLM availability");

    // The DIAGNOSTICS POSTURE report (foundation/env/diagnostics.ts holds the model): one line stating who
    // can reach the box, who can open /api/_debug, and what the recorders are holding — then a WARN per
    // exposure that needs closing, each naming the knob that closes it. A healthy posture logs the info
    // line and nothing else, so a warn here is always a real standing item, never boot noise.
    const diagnostics = resolveDiagnosticsPosture(diagnosticsPostureInput());
    log.info({ diagnostics }, "boot: diagnostics posture (perimeter × credential × retention)");
    for (const warning of diagnosticsPostureWarnings(diagnostics)) {
      log.warn({ security: true, diagnostics: diagnostics.exposure }, `boot: ${warning}`);
    }

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

    // The boot-seed Principal (default preset/characters/persona + the env credential seed). D135: READ, not
    // stamped — `seedOwner` has already written `role=owner` onto this exact row a few lines up, so reading
    // it back is byte-identical on a healthy box AND removes the last synthetic role literal that could
    // GRANT authority. On a box whose owner row is somehow below `owner`, the seed now runs at the row's
    // honest role and fails closed rather than overriding the users table from memory.
    const owner: Principal = await createHostPrincipalResolver(bootSessions)(ownerId);

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
    // Independent of the three above (the examples attach to nothing) — the rows land installed, disabled and
    // ungranted, so the owner's first act on the Plugins pane is a real consent.
    await seedExamplePlugins({ seeder: built.examplePluginSeeder, owner });
    // The CAS maintenance cadence (#11) — GC weekly, fsck monthly. Existence-gated per kind, so an owner's
    // cadence/enabled edits survive a restart. Runs after the owner exists (the row's owner is NOT NULL).
    await seedCasSchedules({ workloads: built.services.workloads, ownerId: owner.userId });
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
      scheduleInterval,
      checkIntervalMs: CATALOG_CHECK_INTERVAL_MS,
      // Item 5: the success-refresh cadence is a live admin knob (catalogRefreshIntervalMs).
      refreshEveryMs: () => built.services.settings.getEffectiveConfig().catalogRefreshIntervalMs,
    });
    stopScheduleScheduler = startWorkloadScheduleScheduler({
      db,
      now,
      start: (params) => built.services.workloads.start(params),
      scheduleInterval,
    });
    // The workloads worker's claim→run poll loop. Boot does not await it, but shutdown OWNS its settlement:
    // abort first, join the loop, then begin DB pre-close so an unwinding run cannot write into housekeeping.
    const workerAbort = new AbortController();
    const workerSettled = startWorkloadsWorker({
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
      scheduleInterval,
      scheduleTimeout: scheduleInterval,
    }).catch((err: unknown) => {
      log.error({ err: err instanceof Error ? err.message : String(err) }, "workloads worker loop exited");
    });
    stopWorker = { abort: (): void => workerAbort.abort(), settled: workerSettled };

    // The automation watcher (A5, D46) — evaluates enabled rules against the chat firehose + the domain-event
    // bus. The per-viewer `chatOpened` trigger rides the transport-attach synthesis (D81), not the bus, so it
    // is tapped separately into the same `handleEvent`. Fire-and-forget; SIGTERM stops both.
    stopAutomationWatcher = startAutomationWatcher(createAutomationWatcherEnv({ automation: built.automation, eventBus: built.eventBus })).stop;
    setChatOpenTap((chatId) => {
      superviseDetached(`automation:chat-opened:${chatId}:${randomUUID()}`, "automation.handleEvent", { eventType: "chatOpened", chatId }, () =>
        built.automation.handleEvent({ type: "chatOpened", chatId }),
      );
    });

    // B4 — the in-app first-run owner-password setup rides the same builder (LOCAL_INITIAL_PASSWORD is now
    // optional); every non-local mode leaves all three route deps absent.
    const localAuth = env.AUTH_MODE === "local" ? buildLocalAuthDeps(built.sessions) : undefined;

    // forward-header fail-closed belt: warn loudly at boot so a non-authentik proxy deploy (no signed
    // JWT) isn't left silently rejecting every request.
    if (env.AUTH_MODE === "forward-header" && (env.FORWARD_AUTH_TRUSTED_PROXIES === undefined || env.FORWARD_AUTH_TRUSTED_PROXIES.trim().length === 0)) {
      log.warn(
        "boot: AUTH_MODE=forward-header with FORWARD_AUTH_TRUSTED_PROXIES unset — the UNSIGNED trusted-header path is FAIL-CLOSED (raw identity headers are rejected). Set FORWARD_AUTH_TRUSTED_PROXIES to the trusted proxy/client source range(s) to enable it; the signed-JWT (authentik) path is unaffected.",
      );
    }

    // BREAK-GLASS active: the loopback-owner fallback is deliberately on in an SSO deploy (foundation/env
    // lets the otherwise-fatal prod triple boot when AUTH_BREAK_GLASS=true). Warn loudly EVERY boot so a
    // recovery flag left set is impossible to miss — revert AUTH_FALLBACK=deny + AUTH_BREAK_GLASS off when done.
    if (env.AUTH_MODE !== "single-user" && env.AUTH_FALLBACK === "owner" && env.AUTH_BREAK_GLASS) {
      log.warn(
        "boot: AUTH_BREAK_GLASS=true with AUTH_FALLBACK=owner — the un-credentialed LOOPBACK-peer owner fallback is ACTIVE in an SSO deploy (on-box recovery). SSO is bypassed for any request on a loopback socket (incl. a same-host reverse proxy). This is a temporary break-glass posture: set AUTH_FALLBACK=deny and unset AUTH_BREAK_GLASS as soon as recovery is done.",
      );
    }

    const oidcWiring = env.AUTH_MODE === "oidc" ? buildOidcDeps(db, now) : undefined;
    stopOidcGc = oidcWiring === undefined ? null : oidcWiring.stopOidcGc;

    const app = createApp({
      now,
      db,
      seam: createAuthSeam({
        sessions: built.sessions,
        verifyForwardJwt: createForwardJwtVerifier(),
        // The /api/_debug credential plane's third arm (#1193): on a DEV box the loopback owner fallback IS
        // the operator's session, so the diagnostics door opens for it; in PRODUCTION — where a same-host
        // proxy makes every request a loopback peer — it never does, single-user included. The RULE lives in
        // `foundation/env`, beside the boot-fatality that rules the same hazard.
        ownerFallbackIsOperatorCredential: resolveOwnerFallbackCredential(ownerFallbackCredentialInput()),
      }),
      services: built.services,
      rateLimit: createRateLimitGate({ db, now, resolveRateLimits: () => built.services.settings.getEffectiveConfig().rateLimits }),
      presence: built.presence,
      sockets: built.sockets,
      // R-OBS: the flight recorder's READ half, present only when `createServices` built one (tracing on).
      // The foundation port speaks RAW query strings (it may not import a kit brand into its filter), so the
      // brand is applied HERE, at the entry seam — exactly what `app.ts` already does for the socket counter's
      // `userId`. Foundation still learns no rpg type: `recent` returns `object[]`.
      ...(built.rpgTrace === undefined
        ? {}
        : {
            rpgTrace: {
              recent: (filter: { chatId?: ChatId; turnId?: string; limit?: number }): readonly object[] =>
                built.rpgTrace?.recent({
                  ...(filter.chatId === undefined ? {} : { chatId: filter.chatId }),
                  ...(filter.turnId === undefined ? {} : { turnId: castId<ChatTurnId>(filter.turnId) }),
                  ...(filter.limit === undefined ? {} : { limit: filter.limit }),
                }) ?? [],
            },
          }),
      // #412: compose's wire-capture request-sink decision, published as `enabled` on the captures probe.
      wireCapture: built.wireCaptureOn,
      // #250: the memory-recall ring's read half. Unconditional (the recorder always exists); the brand is
      // applied HERE at the entry seam, same as the rpg recorder above — foundation's port speaks raw query
      // strings and learns no chat type (`recent` returns `object[]`).
      memoryRecall: {
        recent: (filter: { chatId?: ChatId; limit?: number }): readonly object[] =>
          built.recallRecorder.recent({
            ...(filter.chatId === undefined ? {} : { chatId: filter.chatId }),
            ...(filter.limit === undefined ? {} : { limit: filter.limit }),
          }),
      },
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
        superviseDetached(`seed-user:${principal.userId}:characters:${randomUUID()}`, "seed.user.characters", { userId: principal.userId }, () =>
          built.characterSeeder.ensureSeeded(principal).then((): Promise<void> => built.demoChatSeeder.ensureSeeded(principal)),
        );
        superviseDetached(`seed-user:${principal.userId}:persona:${randomUUID()}`, "seed.user.persona", { userId: principal.userId }, () =>
          built.personaSeeder.ensureSeeded(principal),
        );
        // Independent of the character/chat chain — the example plugins attach to nothing, so they race
        // nobody. Fire-and-forget like its siblings; `ensureSeeded` never throws.
        superviseDetached(`seed-user:${principal.userId}:example-plugin:${randomUUID()}`, "seed.user.example-plugin", { userId: principal.userId }, () =>
          built.examplePluginSeeder.ensureSeeded(principal),
        );
        // The SERVER-WIDE published plugin set (D147 clause (d)) — the new-user half of the admin fan-out, for
        // a user created after a publish ran. Independent of everything above (a distributed plugin attaches to
        // no card and no chat) and latched per user, so a withdrawal by its owner is respected.
        superviseDetached(
          `seed-user:${principal.userId}:distributed-plugins:${randomUUID()}`,
          "seed.user.distributed-plugins",
          { userId: principal.userId },
          () => built.distributedPluginApplier.ensureApplied(principal),
        );
      },
      oidcProviderName: env.OIDC_PROVIDER_NAME,
      ...(localAuth ?? {}),
      ...(oidcWiring === undefined ? {} : { oidc: oidcWiring.oidc }),
    });

    // The DEPLOY-MODE INVARIANT (PROD-LEAK, 2026-08-09 — foundation/env/bind.ts holds the model): a
    // NON-PRODUCTION build listens on LOOPBACK ONLY unless ALLOW_DEV_PUBLIC_BIND opens it, and an explicit
    // dev public bind was already refused at env parse. Production is unchanged (unset ⇒ every interface).
    // `hostname` is OMITTED rather than defaulted to "0.0.0.0" so the production path stays byte-identical
    // to node's own default — passing "0.0.0.0" would silently drop the IPv6 listener.
    const bind = resolveBindPosture(bindPostureInput());
    // The notice is the posture's OWN sentence (bind.ts holds it) because the restriction has to be
    // discoverable at the moment of confusion: an operator whose FQDN suddenly answers 502 greps this log,
    // and the 502 belongs to the proxy — it cannot carry the hint.
    log.info({ nodeEnv: env.NODE_ENV, bindHost: bind.host ?? "*", publicBind: bind.publicBind }, `boot: ${bind.notice}`);
    for (const warning of bindPostureWarnings(bindPostureInput(), bind)) {
      log.warn({ security: true }, `boot: ${warning}`);
    }

    // single-user has NO credential but the loopback owner fallback (env fatals single-user+deny), so a
    // PUBLICLY-bound single-user box is "no auth, every reachable caller can be owner" — intended (the
    // zero-setup first-run mode), but it must announce itself. The SSO modes get the boot-FATAL guard in
    // foundation/env instead; single-user is exempt there (it has no other door) and warns here.
    if (env.AUTH_MODE === "single-user" && bind.publicBind) {
      log.warn(
        { security: true },
        "boot: AUTH_MODE=single-user on a PUBLIC bind — this box has NO login: the un-credentialed owner fallback is its only auth, so any caller that reaches it over a loopback socket (directly on-box, or via a same-host reverse proxy) is the OWNER. Intended for a private/first-run box only; put it behind SSO (AUTH_MODE=oidc/local/forward-header) before exposing it.",
      );
    }

    // Await the bind, don't assume it: serve() binds asynchronously, and a bind failure (EADDRINUSE)
    // surfaces as a server "error" event, not a throw. Boot must fail loudly on a dead listener.
    await new Promise<void>((resolve, reject) => {
      const onBindError = (err: Error): void => {
        reject(err);
      };
      const handle = serve({ fetch: app.fetch, port: env.PORT, ...(bind.host === undefined ? {} : { hostname: bind.host }) }, (info) => {
        handle.removeListener("error", onBindError);
        log.info({ port: info.port, address: info.address }, "boot: listening — healthz live");
        resolve();
      });
      server = handle;
      handle.once("error", onBindError);
    });
  }

  // RATIFIED (#596). Nine null-guarded stops at real nesting depth 0 score 20 only because biome DOUBLES every
  // increment inside a closure — the measured tell that this score is length, not tangle.
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the graceful-drain teardown is a flat sequence of independent null-guarded stops (server, schedulers, worker, observer, vLLM, db) — one cohesive shutdown, splitting it hides the ordering.
  async function shutdown(): Promise<void> {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    log.info("shutdown: draining");

    if (server !== null) {
      await drainHttpServer(server, log);
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
      const worker = stopWorker;
      stopWorker = null;
      await drainWorkloadsWorker(worker);
    }
    if (stopBuddyObserver !== null) {
      stopBuddyObserver();
      stopBuddyObserver = null;
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
