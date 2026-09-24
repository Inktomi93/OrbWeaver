// The boot/shutdown protocol. index.ts constructs the lifecycle once and runs boot(); SIGTERM/SIGINT run
// shutdown(). Owns no business logic — mints the one real clock, resolves the boot chicken-egg (owner id
// → services → owner Principal), runs the seed steps, starts the supervisors, builds + serves the Hono
// app, and tears it all down gracefully. Entry mints the one real wall clock and threads it everywhere as
// the injected `now`; nothing below entry reads ambient time.

import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import type { AuthMode, Principal } from "@orb/contracts/identity";
import { isCookieAuthMode } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { createDb, preCloseHousekeeping } from "@orb/db";
import type { ChatId, ChatTurnId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { formatVersionIdentity } from "@orb/kit/version-identity";
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
  env,
  ownerFallbackCredentialInput,
  ownerFallbackPeerInput,
  ownerFallbackPeerWarnings,
  resolveBindPosture,
  resolveDiagnosticsPosture,
  resolveOwnerFallbackCredential,
  resolveOwnerFallbackPeers,
} from "#foundation/env";
import { getLog, initTracing, superviseDetached, wrapLibSqlClient } from "#foundation/observability";
import { versionIdentity } from "#foundation/version";
import {
  createBackchannelLogoutVerifier,
  createForwardJwtVerifier,
  createOidcConfigCache,
  createOidcExchange,
  createPasswordHasher,
  createRelayedFallbackNotice,
  ownerFallbackAllowed,
} from "#infra/auth";
import { bootSecretProvenance, credentialsKeyFromEnv, dataDirFromDbUrl, SESSION_SECRET_KEYFILE, sessionSecretFromEnv } from "#infra/crypto";
import { installEgressFirewall, parseAllowlist } from "#infra/network";
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
  composeBootDisclaimer,
  createLocalLightUserSeed,
  DB_LAUNCHED,
  healLegacyBackgroundPinsOnBoot,
  migrateHandoffOfferVocabOnBoot,
  migratePluginToolWireNamesOnBoot,
  migrateProseSlotVocabOnBoot,
  planLocalLightPrefetch,
  reactivatePluginsOnBoot,
  reclaimLocksOnBoot,
  repairStaleJoinSeqOnBoot,
  runBootMigrations,
  runsInContainer,
  seedCasSchedules,
  seedCredentialFromEnv,
  seedDefaultBackgrounds,
  seedDefaultCharacters,
  seedDefaultPersona,
  seedDefaultPreset,
  seedDemoChats,
  seedExamplePlugins,
  seedLocalLightOnBoot,
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
 *  socket, rather than only provable live (`DRAIN-UNBOUNDED`).
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
 *  share ONE gate (`ownerFallbackAllowed`), so the setup screen appears exactly where the setup endpoint
 *  accepts a claim: a LOOPBACK TCP peer (the unspoofable socket, not the client `Host`) on a request with no
 *  relay tell, so a same-host tunnel cannot offer the owner password to its visitors. A proxied or LAN
 *  local deploy still uses LOCAL_INITIAL_PASSWORD (seeded at boot ⇒ the owner has a password ⇒ first-run
 *  never triggers).
 *
 *  BOTH CALLS BELOW DELIBERATELY PASS NO TRUSTED-PEER RANGES — they stay LOOPBACK-ONLY while
 *  `AUTH_FALLBACK_TRUSTED_PEERS` widens `resolve`'s fallback arm, and that asymmetry is the point, not an
 *  oversight. This route consults no `AUTH_FALLBACK`: widening it would make the knob admit an
 *  un-credentialed owner-PASSWORD claim on a box whose operator set `AUTH_FALLBACK=deny`, which is the one
 *  property the knob promises it cannot do. A containerized local deploy sets `LOCAL_INITIAL_PASSWORD`
 *  instead (docs/plans/containerize/design.md — already its documented state). */
function buildLocalAuthDeps(
  sessions: SessionsService,
  sessionSecret: string | null,
): {
  authenticate: LocalAuthenticator;
  firstRun: FirstRunRouteDeps;
  localFirstRun: (peerIp: string | undefined, headers: Headers) => Promise<boolean>;
} {
  const hasher = createPasswordHasher(sessionSecret);
  return {
    authenticate: (handle: Handle, password: string): Promise<UserId | null> => sessions.authenticate(handle, password),
    firstRun: {
      setOwnerPassword: async (plain: string): Promise<UserId | null> => sessions.claimOwnerPassword(await hasher.hash(plain)),
      originAllowed: (peerIp: string | undefined, headers: Headers): boolean => ownerFallbackAllowed(peerIp, headers),
    },
    localFirstRun: async (peerIp: string | undefined, headers: Headers): Promise<boolean> =>
      ownerFallbackAllowed(peerIp, headers) ? await sessions.ownerNeedsPassword() : false,
  };
}

// The refusal names where the keyfile would live, never DATABASE_URL itself: a remote URL can carry a token.
function missingSessionSecretMessage(mode: AuthMode, dataDir: string | null): string {
  if (dataDir === null) {
    return `boot: AUTH_MODE=${mode} needs a session secret, and DATABASE_URL is not a local file: database, so none can be generated. Set SESSION_SECRET (32+ characters).`;
  }
  return `boot: AUTH_MODE=${mode} needs a session secret, and ${join(dataDir, SESSION_SECRET_KEYFILE)} could not be read or generated (the crypto: line above says why). Set SESSION_SECRET (32+ characters), or fix that file.`;
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
  readonly listeningAddress: () => Readonly<AddressInfo> | null;
  readonly shutdown: () => Promise<void>;
}

interface LifecycleOptions {
  /** Composition-root test seam. Production omits it and binds the validated env.PORT unchanged. */
  readonly listenPort?: number;
  /** Composition-root test seam, forwarded verbatim to `createServices`. Its one production-shaped use is a
   *  boot test that must exercise the REAL graph while replacing a backend edge that would otherwise do
   *  something a test may not (fetch multi-GB model weights). Production omits it. */
  readonly providerSeams?: Parameters<typeof createServices>[0]["providerSeams"];
}

/** Construct the lifecycle. Side-effect-free until `boot()` runs (so `index.ts` can wire signals first). */
export function createLifecycle(options: LifecycleOptions = {}): Lifecycle {
  const log = getLog();
  const now = (): number => Date.now();

  let isShuttingDown = false;
  let credentialsKeyOk = false;
  let db: Db | null = null;
  let server: ServerType | null = null;
  let listenerAddress: Readonly<AddressInfo> | null = null;
  let stopScheduler: (() => void) | null = null;
  let stopScheduleScheduler: (() => void) | null = null;
  let stopOidcGc: (() => void) | null = null;
  let stopWorker: OwnedWorkloadsWorker | null = null;
  let stopBuddyObserver: (() => void) | null = null;
  let stopAutomationWatcher: (() => void) | null = null;
  let stopLocalLightPrefetch: (() => void) | null = null;
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

    // THE FIRST LINE OF EVERY BOOT NAMES THE BUILD. Before tracing, before the db, before anything that can
    // fail: a log whose opening line does not say which build produced it makes every line under it
    // unattributable, and the lines most worth attributing are the ones from a boot that died at step two.
    const build = versionIdentity();
    log.info({ ...build }, `boot: orbweaver ${formatVersionIdentity(build)}`);

    // Boot the OTel SDK BEFORE any span opens (the db wrap below opens the first spans). Idempotent — the
    // composition-root call; without it the first query would lazy-boot tracing implicitly.
    initTracing();

    // Swap undici's global dispatcher for the private-IP-rejecting DNS lookup so every outbound fetch
    // below is address-gated before it can fire. No-op when EGRESS_FIREWALL=false.
    installEgressFirewall();

    // The SESSION_SECRET pepper, resolved ONCE: the explicit env value, else `.session-secret` beside the db.
    // A cookie mode without one cannot authenticate anyone, so it refuses here, before the db opens and long
    // before the listener binds. The other modes run without it, as they always have.
    const sessionSecret = sessionSecretFromEnv();
    if (sessionSecret === null && isCookieAuthMode(env.AUTH_MODE)) {
      throw new Error(missingSessionSecretMessage(env.AUTH_MODE, dataDirFromDbUrl(env.DATABASE_URL)));
    }

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

    // #1391 DATA migration, same window and same class: `pluginToolWireName` became INJECTIVE (a slug's `-`
    // now doubles to `__`), which renames every hyphen-slug plugin's model-visible tool names. A persisted
    // `ToolCallRecord.name` under the old spelling silently unmatches its plugin's `tool-card` surface, and a
    // `run_tool` automation arm under it stops firing. Idempotent, and a no-op on a box with no hyphenated
    // plugin slug installed. Runs before compose, which is where the first plugin activation lives.
    await migratePluginToolWireNamesOnBoot({ db });

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
    // #2253 DATA repair: before eba8ef526 the invite-redeem's `canonHeadSeq` subquery was unqualified,
    // recording the table-wide max(messages.seq) instead of the per-chat head. Clamp any stale join_seq
    // to the actual per-chat canon head. Idempotent — a no-op on every boot once the candidates are drained.
    await repairStaleJoinSeqOnBoot({ db });

    // Resolve the owner id before compose (the owner role-clients bundle resolves against it). A
    // transient sessions service is built only to run the owner seed; compose owns the real one.
    const bootSessions = createSessionsService({
      db,
      now,
      sessionSecret,
      // #2481 — the owner row is MINTED here (`seedOwner` → `ensureUser`), so this transient service needs
      // the per-user seed too: on a fresh install the sweep below would otherwise be the only thing that
      // ever seeds the owner, and it runs once per process.
      seedUserConnections: createLocalLightUserSeed({ db, now }),
    });

    // OIDC LAZY-MINT (#1853): in OIDC mode the owner identity comes from the IdP, not from env config.
    // Don't seed a placeholder owner row at boot — the first OIDC login whose identity matches owner
    // policy (OWNER_HANDLES or OWNER_GROUP) lazy-mints the owner row via `provisionIdentity`. For every
    // other mode (single-user, local, forward-header), seed the owner at boot as before.
    let ownerId: UserId | undefined;
    if (env.AUTH_MODE === "oidc") {
      ownerId = await bootSessions.getOwnerUserId();
      if (ownerId !== undefined) {
        log.info({ ownerId }, "boot(oidc): existing owner row found (from a prior OIDC login)");
      } else {
        log.info("boot(oidc): no owner row yet — the first owner-policy OIDC login will create it; owner-dependent boot seeds are deferred");
      }
    } else {
      const handles = ownerHandles();
      // AUTH_MODE=local: seed the owner's first-boot form-login password so a non-local-origin deploy isn't
      // locked out. Passed only in local mode; first-boot-only + non-clobbering (see seed-owner).
      const localPasswordSeed =
        env.AUTH_MODE === "local" && env.LOCAL_INITIAL_PASSWORD !== undefined
          ? {
              initialPassword: env.LOCAL_INITIAL_PASSWORD,
              hashPassword: createPasswordHasher(sessionSecret).hash,
            }
          : {};
      const ownerIds = await seedOwner({
        db,
        sessions: bootSessions,
        ownerHandles: handles,
        now,
        ...localPasswordSeed,
      });
      const seededId = ownerIds[0];
      if (seededId === undefined) {
        throw new Error("boot: seedOwner returned no owner id (OWNER_HANDLES resolved empty)");
      }
      // BELT: `ownerId` must name a REAL row, not merely be defined. Everything below binds to it — the owner
      // role-clients bundle, the boot Principal, and every owner-scoped seed — and the boot Principal is
      // ROW-DERIVED through `principalFromRow`, which deliberately DEGRADES an unknown id to `role:"user"`
      // (the frozen-host bridge needs that; a boot does not). So a defined-but-dangling id would seed the whole
      // box under a non-owner principal against a row that does not exist, silently. `ensureUser` now refuses
      // to fabricate an id upstream; this is the boot-side floor beneath it — one read, fail-closed.
      if ((await bootSessions.loadUserById(seededId)) === null) {
        throw new Error(`boot: seedOwner returned owner id ${seededId} but no users row carries it — refusing to boot on a phantom owner`);
      }
      ownerId = seededId;
    }

    // The DIAGNOSTICS POSTURE report (foundation/env/diagnostics.ts holds the model): who can reach the box,
    // who can open /api/_debug, and what the recorders are holding. Its warnings join the boot disclaimer.
    const diagnostics = resolveDiagnosticsPosture(diagnosticsPostureInput());
    log.info({ diagnostics }, "boot: diagnostics posture (perimeter × credential × retention)");

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
      sessionSecret,
      holder,
      ...(options.providerSeams === undefined ? {} : { providerSeams: options.providerSeams }),
    });

    credentialsKeyOk = await built.services.credentials.probeKeyDecrypt();
    if (!credentialsKeyOk) {
      log.error("boot: SecretBox decrypt-probe FAILED — healthz will report credentials_key_mismatch");
    }

    // Owner-INDEPENDENT boot seeds: these need only the db and never touch a user row. The local-light SWEEP
    // (§7.2: the two convenience rows + their `user` bindings for every account that EXISTS NOW, idempotent)
    // rides here because a user row may predate the connection table on this pre-launch box. It is half the
    // story — accounts minted after this point are seeded by the per-user op wired into the minting verbs
    // (#2481), not by a later boot.
    await seedDefaultPreset({ db, now });
    await seedThemes({ db, now });
    await seedLocalLightOnBoot({ db, now });

    // Owner-DEPENDENT boot seeds: guarded behind ownerId so a fresh OIDC box (no owner yet) can still boot.
    // In OIDC mode without an owner, these are deferred: per-user seeds (characters, persona, demo chats,
    // example plugins) fire via `seedUserCharacters` on the owner's first login; the env credential and
    // CAS schedules seed on the owner's first request after provisioning.
    // Declared OUTSIDE the guard because one step below the listener bind also needs it (the local-light
    // prefetch plan resolves roles AS the owner); it stays `undefined` on an owner-less box, which is
    // exactly the condition each consumer already guards on.
    let bootOwner: Principal | undefined;
    if (ownerId !== undefined) {
      // The boot-seed Principal (default preset/characters/persona + the env credential seed). D135: READ, not
      // stamped — `seedOwner` has already written `role=owner` onto this exact row, so reading
      // it back is byte-identical on a healthy box AND removes the last synthetic role literal that could
      // GRANT authority. On a box whose owner row is somehow below `owner`, the seed now runs at the row's
      // honest role and fails closed rather than overriding the users table from memory.
      const owner: Principal = await createHostPrincipalResolver(bootSessions)(ownerId);
      bootOwner = owner;

      await seedCredentialFromEnv({
        credentials: built.services.credentials,
        owner,
        openrouterApiKey: env.OPENROUTER_API_KEY,
      });
      // BEFORE the cards: both packs dress through this seeder, and seeding it first is what lands the
      // owner's background library in pack order. It also carries the `kind:"seeded"` retirement's data
      // rewrite for this user (see `boot/seed-default-backgrounds.ts`).
      await seedDefaultBackgrounds({ seeder: built.backgroundSeeder, owner });
      await seedDefaultCharacters({ seeder: built.characterSeeder, owner });
      await seedDefaultPersona({ seeder: built.personaSeeder, owner });
      // AFTER the cards — each bundled example attaches to seeded characters by handle.
      await seedDemoChats({ seeder: built.demoChatSeeder, owner });
      // BEFORE the seeder, and before anything serves (#1865): the resident-plugin registry is an in-process
      // Map the respawn wiped, so every row the db calls `enabled` has no instance and contributes no surface,
      // command, transform, tool or subscription until something re-activates it. Restoring first also means
      // the seeder's auto-upgrade — which re-activates the rows it swaps — lands the NEW bundle resident
      // instead of racing a second activation onto the old one.
      await reactivatePluginsOnBoot({
        db,
        setEnabled: built.services.plugin.setEnabled,
        resolvePrincipal: createHostPrincipalResolver(bootSessions),
      });
      // Independent of the three above (the examples attach to nothing) — the rows land installed, disabled and
      // ungranted, so the owner's first act on the Plugins pane is a real consent.
      await seedExamplePlugins({ seeder: built.examplePluginSeeder, owner });
      // The CAS maintenance cadence (#11) — GC weekly, fsck monthly. Existence-gated per kind, so an owner's
      // cadence/enabled edits survive a restart. Runs after the owner exists (the row's owner is NOT NULL).
      await seedCasSchedules({ workloads: built.services.workloads, ownerId: owner.userId });
    }

    await reclaimLocksOnBoot({ db, contributions: built.workloadContributions, now, holder });

    // Boot-reclaim the host-offline deferred-turn queue (chat Part III §5): each row runs (consent/budget
    // re-validated in-lock) or is dropped. Fire-and-forget — the drain does real generation, so it must
    // NOT block boot/listen; its own log reports ran/dropped and one row's fault can't abort the sweep.
    void built.services.chat
      .drainDeferredTurns({ all: true })
      .then((report) => log.info(report, "boot: drained deferred turns (pending_turns reclaim)"))
      .catch((err: unknown) => log.error({ err }, "boot: deferred-turn drain failed"));

    stopScheduler = startCatalogRefreshScheduler({
      service: built.services.workloads,
      ownerId: ownerId ?? null,
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
    const localAuth = env.AUTH_MODE === "local" ? buildLocalAuthDeps(built.sessions, sessionSecret) : undefined;

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
        relayedFallbackNotice: createRelayedFallbackNotice(now),
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
      inContainer: runsInContainer(),
      seedUserCharacters: (principal: Principal): void => {
        // CHAINED, not parallel: the demo chats attach to the cards this user is getting right now, so they
        // must not race the pack. `ensureSeeded` never throws, so the `.then` is unconditional.
        // CHAINED behind the scene plates too: both packs dress through the background seeder, so running it
        // first lands this user's library in pack order (and carries their `kind:"seeded"` data rewrite).
        superviseDetached(`seed-user:${principal.userId}:characters:${randomUUID()}`, "seed.user.characters", { userId: principal.userId }, () =>
          built.backgroundSeeder
            .ensureSeeded(principal)
            .then((): Promise<void> => built.characterSeeder.ensureSeeded(principal))
            .then((): Promise<void> => built.demoChatSeeder.ensureSeeded(principal)),
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

    // The DEPLOY-MODE INVARIANT (foundation/env/bind.ts holds the model): `hostname` is OMITTED rather than
    // defaulted to "0.0.0.0" so the production path stays byte-identical to node's own default — passing
    // "0.0.0.0" would silently drop the IPv6 listener.
    const bind = resolveBindPosture(bindPostureInput());
    const ownerPeers = resolveOwnerFallbackPeers(ownerFallbackPeerInput());

    // THE BOOT DISCLAIMER (`boot/disclaimer.ts`): ONE contiguous group, logged just before the listener binds,
    // so an operator reads what this box is, who reaches it and who is its owner in one place. Every standing
    // exposure is one `security:true` line naming its fix; a healthy box logs only information.
    for (const line of composeBootDisclaimer({
      authMode: env.AUTH_MODE,
      authFallback: env.AUTH_FALLBACK,
      breakGlass: env.AUTH_BREAK_GLASS,
      bind,
      bindWarnings: bindPostureWarnings(bindPostureInput(), bind),
      ownerPeers,
      ownerPeerWarnings: ownerFallbackPeerWarnings(ownerPeers),
      diagnosticsWarnings: diagnosticsPostureWarnings(diagnostics),
      forwardHeaderUnsignedClosed: env.AUTH_MODE === "forward-header" && parseAllowlist(env.FORWARD_AUTH_TRUSTED_PROXIES).length === 0,
      secrets: bootSecretProvenance(),
    })) {
      const fields = { bootDisclaimer: true, topic: line.topic, ...(line.security ? { security: true } : {}) };
      if (line.level === "warn") {
        log.warn(fields, `boot: ${line.text}`);
      } else {
        log.info(fields, `boot: ${line.text}`);
      }
    }

    // Await the bind, don't assume it: serve() binds asynchronously, and a bind failure (EADDRINUSE)
    // surfaces as a server "error" event, not a throw. Boot must fail loudly on a dead listener.
    await new Promise<void>((resolve, reject) => {
      const onBindError = (err: Error): void => {
        reject(err);
      };
      const handle = serve(
        { fetch: app.fetch, port: options.listenPort ?? env.PORT, ...(bind.host === undefined ? {} : { hostname: bind.host }) },
        (info: AddressInfo) => {
          handle.removeListener("error", onBindError);
          listenerAddress = { address: info.address, family: info.family, port: info.port };
          log.info({ port: info.port, address: info.address }, "boot: listening — healthz live");
          resolve();
        },
      );
      server = handle;
      handle.once("error", onBindError);
    });

    // AFTER THE BIND, ON PURPOSE — and the only boot step that is. The local-light weights are hundreds of
    // megabytes to gigabytes (jina-clip-v2 is 874 MB at the `q8` default, 3.455 GB at fp32 —
    // `LOCAL_LIGHT_EMBED_DTYPE`), so warming them anywhere earlier would hold /healthz and the
    // first request hostage to a download on a box that is otherwise ready to serve. Fire-and-forget past
    // this point: the plan read is a resolver call that can be slow (it may warm a catalog), the walk is a
    // multi-minute download, and NEITHER may extend boot. An owner-less box (a fresh OIDC deploy) has no
    // principal to resolve tasks as and simply keeps the lazy path until someone logs in.
    if (bootOwner !== undefined) {
      const principal = bootOwner;
      superviseDetached(`local-light-prefetch:${randomUUID()}`, "local-light.prefetch.plan", { enabled: env.LOCAL_LIGHT_PREFETCH }, async () => {
        const targets = await planLocalLightPrefetch({
          resolve: built.runtime.resolve,
          principals: [principal],
          enabled: env.LOCAL_LIGHT_PREFETCH === "on",
        });
        stopLocalLightPrefetch = built.runtime.localLight.prefetch.start(targets);
      });
    }
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
      listenerAddress = null;
      // STAGE BREADCRUMB (#1936). Everything between `draining` and `complete` used to be silent, so when
      // `stack down prod` escalated to SIGKILL the log said only that the process had not finished — never
      // WHICH stage it was in, which is the whole reason the original report could not be diagnosed. The
      // bounded drain announces only its FORCED path (a warn); this is the quiet one. Measured 2026-09-19 on
      // an isolated prod instance: 12 ms idle, and exactly 10.001 s with one in-flight request.
      log.info("shutdown: http drained");
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
      // STAGE BREADCRUMB (#1936) — announced BEFORE the await, because this join is UNBOUNDED: the abort is
      // cooperative and `settled` waits for whatever job is mid-run. It is one of the two stages that can
      // hold the process past the launcher's 15s watch, and the only way an operator can know it did.
      log.info("shutdown: joining the workloads worker");
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
    // Stops the WALK before its next slot; an ONNX load already in flight has no interrupt and settles into
    // a registry nobody reads again (`local-light/prefetch.ts`). Null when this boot planned nothing.
    if (stopLocalLightPrefetch !== null) {
      stopLocalLightPrefetch();
      stopLocalLightPrefetch = null;
    }
    if (db !== null) {
      // STAGE BREADCRUMB (#1936) — the SECOND unbounded stage, and the last thing between here and exit:
      // `PRAGMA optimize` + `wal_checkpoint(TRUNCATE)` (`@orb/db`'s `preCloseHousekeeping`), whose cost is a
      // function of the db, not of a timeout we control. Announced before the await for the same reason as
      // the worker join: a shutdown that stalls here must say so rather than look identical to a wedge.
      log.info("shutdown: db housekeeping");
      await preCloseHousekeeping(db);
      db = null;
    }
    log.info("shutdown: complete");
  }

  return { boot, listeningAddress: (): Readonly<AddressInfo> | null => listenerAddress, shutdown };
}
