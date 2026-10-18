// The boot/shutdown protocol. index.ts constructs the lifecycle once and runs boot(); SIGTERM/SIGINT/SIGHUP run
// shutdown(). Owns no business logic — mints the one real clock, resolves the boot chicken-egg (owner id
// → services → owner Principal), runs the seed steps, starts the supervisors, builds + serves the Hono
// app, and tears it all down gracefully. Entry mints the one real wall clock and threads it everywhere as
// the injected `now`; nothing below entry reads ambient time.

import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hostname } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { ServerType } from "@hono/node-server";
import type { AuthMode, Principal } from "@orb/contracts/identity";
import { isCookieAuthMode } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { createDb, optimizeDb, preCloseHousekeeping } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { UserId } from "@orb/kit/ids";
import { RESTART_EXIT_CODE } from "@orb/kit/supervisor";
import { formatVersionIdentity } from "@orb/kit/version-identity";
import type { ServerRestartPort } from "#domain/admin";

import { createSessionsRolePolicy, createSessionsService } from "#domain/sessions";
import type { CertificateBootOutcome, ShareBootOutcome, ShareGraph } from "#domain/share";

import { OWNER_CLAIM_URL_FILE_NAME } from "#foundation/data-layout";
import {
  bindPostureInput,
  bindPostureWarnings,
  diagnosticsPostureInput,
  diagnosticsPostureWarnings,
  env,
  launchedBySupervisor,
  loopbackCompanion,
  ownerFallbackPeerInput,
  ownerFallbackPeerWarnings,
  resolveBindPosture,
  resolveDiagnosticsPosture,
  resolveOwnerFallbackPeers,
} from "#foundation/env";
import { getLog, initTracing, superviseDetached, wrapLibSqlClient } from "#foundation/observability";
import { SERVER_INSTANCE_ID } from "#foundation/server-instance";
import { versionIdentity } from "#foundation/version";
import { createOwnerClaimCode, createPasswordHasher, oidcRedirectAllowlist } from "#infra/auth";
import { bootSecretProvenance, resolveCredentialsKey, resolveSessionSecret } from "#infra/crypto";
import { drainHttpServer, installEgressFirewall, parseAllowlist, SHUTDOWN_DRAIN_MS, serveHttpServer } from "#infra/network";
import type { CloudflaredPin, RelayAssetFetch, SpawnRelay } from "#infra/relay";

import { authConfigFromEnv, createHostPrincipalResolver } from "./auth/index.ts";
import {
  announceOwnerClaim,
  backfillPluginProvenanceOnBoot,
  composeBootDisclaimer,
  createLocalLightUserSeed,
  DB_LAUNCHED,
  healLegacyBackgroundPinsOnBoot,
  migrateDataLayout,
  migrateHandoffOfferVocabOnBoot,
  migratePluginToolWireNamesOnBoot,
  migrateProseSlotVocabOnBoot,
  planLocalLightPrefetch,
  reactivatePluginsOnBoot,
  rebuildStatsTimelineOnBoot,
  reclaimLocksOnBoot,
  removeOwnerClaimFileOnSpend,
  repairStaleJoinSeqOnBoot,
  runBootMigrations,
  seedCasSchedules,
  seedCredentialFromEnv,
  seedDefaultBackgrounds,
  seedDefaultPreset,
  seedExamplePlugins,
  seedLocalLightOnBoot,
  seedOwner,
  seedThemes,
  seedUserContent,
  settleBootSecrets,
} from "./boot/index.ts";
import { startPlannerMaintenance } from "./boot/planner-maintenance.ts";

import { createConfiguredOidc, createHttpApp, createServices, createShareGraph } from "./compose/index.ts";

/** The worker resources shutdown owns: signal it first, then join the loop before touching the DB. */
interface OwnedWorkloadsWorker {
  readonly abort: () => void;
  readonly settled: Promise<void>;
}

/** Abort and JOIN the workload worker. Exported so the held-worker ordering is behaviorally pinned without
 * booting the whole composition root; lifecycle calls this immediately before DB pre-close.
 */
export async function drainWorkloadsWorker(worker: OwnedWorkloadsWorker): Promise<void> {
  worker.abort();
  await worker.settled;
}

/** One `setInterval` as a stop-function — the `scheduleInterval`/`scheduleTimeout` shape every scheduler and
 *  the workloads worker take. ONE home: boot wired three byte-identical copies of this closure inline. */
function scheduleInterval(fn: () => void, ms: number): () => void {
  const handle = setInterval(fn, ms);
  return () => {
    clearInterval(handle);
  };
}

/** Serve the app on one address and await the bind: a bind failure (EADDRINUSE) is a server "error" event, not a throw,
 *  and boot must fail loudly on a dead listener. An omitted `hostname` binds every interface. Every listener goes
 *  through `serveHttpServer`, so the loopback companion carries the same {@link HTTP_SERVER_TIMEOUTS} as the primary. */
function listenApp(options: Parameters<typeof serveHttpServer>[0]): Promise<{ readonly handle: ServerType; readonly address: Readonly<AddressInfo> }> {
  return new Promise((resolve, reject) => {
    const onBindError = (err: Error): void => {
      reject(err);
    };
    const handle = serveHttpServer(options, (info: AddressInfo) => {
      handle.removeListener("error", onBindError);
      resolve({ handle, address: { address: info.address, family: info.family, port: info.port } });
    });
    handle.once("error", onBindError);
  });
}

/** One `setTimeout` as a cancel-function, unref'd so a pending relay restart never holds the process open. */
function scheduleOnce(run: () => void, ms: number): () => void {
  const handle = setTimeout(run, ms);
  handle.unref();
  return () => {
    clearTimeout(handle);
  };
}

/** The log line for the boot start of a stored IP certificate choice; the controller logs what the order does next. */
function logCertificateBootOutcome(log: ReturnType<typeof getLog>, outcome: CertificateBootOutcome): void {
  switch (outcome.kind) {
    case "not_configured":
      return;
    case "refused":
      log.warn(
        { share: true, security: true, code: outcome.refusal.code },
        `share: the stored IP certificate choice did not start. ${outcome.refusal.message}`,
      );
      return;
    case "started":
      log.info({ share: true, state: outcome.certificate.state }, "share: the stored IP certificate choice started");
      return;
    default: {
      const _exhaustive: never = outcome;
      throw new Error(`share: unknown certificate boot outcome ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** The log line for a boot-time or post-claim share start; the relay's own `up` line carries the link. */
function logShareBootOutcome(log: ReturnType<typeof getLog>, outcome: ShareBootOutcome): void {
  switch (outcome.kind) {
    case "started":
      log.info({ share: true, state: outcome.relay.state }, "share: SHARE_RELAY started the relay; its link is logged once the relay reports it");
      return;
    case "refused":
      log.warn({ share: true, code: outcome.refusal.code }, `share: SHARE_RELAY did not start the relay. ${outcome.refusal.message}`);
      return;
    case "failed":
      log.error({ share: true, code: outcome.code }, `share: SHARE_RELAY could not start the relay. ${outcome.message}`);
      return;
    case "not_waiting":
      return;
    default: {
      const _exhaustive: never = outcome;
      throw new Error(`share: unknown boot outcome ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// The refusal names the keyfile, never DATABASE_URL itself: a remote URL can carry a token.
function missingSessionSecretMessage(mode: AuthMode, keyfile: string | null): string {
  if (keyfile === null) {
    return `boot: AUTH_MODE=${mode} needs a session secret, and DATABASE_URL is not a local file: database, so none can be generated. Set SESSION_SECRET (32+ characters).`;
  }
  return `boot: AUTH_MODE=${mode} needs a session secret, and ${keyfile} could not be read or generated (the crypto: line above says why). Set SESSION_SECRET (32+ characters), or fix that file.`;
}

// @orb-waive no-inline-package-interface(Lifecycle): baselined when the gate landed; burn-down item 952.
/** The lifecycle handle `index.ts` drives: boot once, shut down once (idempotent). */
export interface Lifecycle {
  readonly boot: () => Promise<void>;
  readonly listeningAddress: () => Readonly<AddressInfo> | null;
  readonly shutdown: (options?: { readonly drainMs?: number }) => Promise<void>;
}

interface LifecycleOptions {
  /** Composition-root test seam. Production omits it and binds the validated env.PORT unchanged. */
  readonly listenPort?: number;
  /** Composition-root test seam, forwarded verbatim to `createServices`. Its one production-shaped use is a
   *  boot test that must exercise the REAL graph while replacing a backend edge that would otherwise do
   *  something a test may not (fetch multi-GB model weights). Production omits it. */
  readonly providerSeams?: Parameters<typeof createServices>[0]["providerSeams"];
  /** Composition-root test seam: the share relay's pin, download and spawn, so a boot test never reaches the network
   *  or runs cloudflared. The checksum verifier and its directory in the data layout stay production's. Production
   *  omits it and gets the pinned release over the pinned-download door and a real quick tunnel. */
  readonly relaySeams?: { readonly pin: CloudflaredPin; readonly fetch: RelayAssetFetch; readonly spawn: SpawnRelay };
}

/** Construct the lifecycle. Side-effect-free until `boot()` runs (so `index.ts` can wire signals first). */
export function createLifecycle(options: LifecycleOptions = {}): Lifecycle {
  const log = getLog();
  // eslint-disable-next-line orb/no-raw-clock -- The composition root constructs the clock it injects; remove when a platform seam supplies that clock instead.
  const now = (): number => Date.now();

  let isShuttingDown = false;
  let credentialsKeyOk = false;
  let db: Db | null = null;
  let server: ServerType | null = null;
  // The loopback listener a bind to one named interface adds (`loopbackCompanion`); null on every other bind.
  let loopbackServer: ServerType | null = null;
  let listenerAddress: Readonly<AddressInfo> | null = null;
  let stopPlannerMaintenance: (() => Promise<void>) | null = null;
  let oidcLifetime: Awaited<ReturnType<typeof createConfiguredOidc>> | null = null;
  let stopBuddyObserver: (() => void) | null = null;

  let stopLocalLightPrefetch: (() => void) | null = null;
  let closeLocalLight: (() => Promise<void>) | null = null;
  let sharing: ShareGraph | null = null;
  let booted = false;

  // RATIFIED (#596). boot is the ORDERED startup protocol, and its score is the protocol's LENGTH, not tangled
  // control flow: fail-closed guards on the sequence plus one conditional column per optional dependency, each
  // at real nesting depth 0 and each DOUBLED by biome's enclosing-closure nesting penalty. The genuinely nested
  // wiring HAS been lifted out (OIDC composition / scheduleInterval, #596 — 57 → 45); what is
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

    // The data layout FIRST, before anything opens a file under it: a legacy flat data dir is renamed into
    // the current tree (db/, backups/, secrets/, cache/ …) under a journal. Every path below reads the layout
    // the env resolved, so nothing here can open the old location.
    await migrateDataLayout({ layout: env.DATA_LAYOUT });

    // The boot secrets, phase one of two: the explicit env value, else the keyfile under `secrets/`. A
    // keyfile that does not exist yet is left ABSENT here — whether generating one is safe depends on the db
    // (a pepper with passwords behind it, a key with sealed credentials behind it), so that decision waits
    // for the migrated db below. A cookie mode with an UNUSABLE secret (a remote db, a corrupt keyfile)
    // cannot authenticate anyone, so it refuses now, before the db opens and long before the listener binds.
    const credentialsKey = resolveCredentialsKey();
    const sessionSecretSource = resolveSessionSecret();
    if (sessionSecretSource.kind === "resolved" && sessionSecretSource.value === null && isCookieAuthMode(env.AUTH_MODE)) {
      throw new Error(missingSessionSecretMessage(env.AUTH_MODE, sessionSecretSource.path));
    }

    // Inject the OTel libSQL wrap so every db.execute/batch/transaction opens a child span under the active
    // request-root (the composition-root injection the tracing.ts + createDb headers document).
    db = await createDb(env.DATABASE_URL, wrapLibSqlClient);
    const wiringDb = databaseHandle(db);

    // `launched` is REQUIRED and passed explicitly (#1392) — the omission here is what left the
    // auto-wipe refusal inert on every real boot.
    await runBootMigrations({ db, databaseUrl: env.DATABASE_URL, backupDir: env.DATA_LAYOUT.backups, launched: DB_LAUNCHED });

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
    // #2253 DATA repair: before 39f71b2294 the invite-redeem's `canonHeadSeq` subquery was unqualified,
    // recording the table-wide max(messages.seq) instead of the per-chat head. Clamp any stale join_seq
    // to the actual per-chat canon head. Idempotent — a no-op on every boot once the candidates are drained.
    await repairStaleJoinSeqOnBoot({ db });
    // DATA repair, same window: the `daily_stats` timeline re-grain drops rows only canon can rebuild, so every
    // owner with activity and an empty timeline is rebuilt before the first Insights read.
    await rebuildStatsTimelineOnBoot({ db, now });

    // The boot secrets, phase two: with the schema in place, an absent keyfile is generated only when no row
    // depends on it; otherwise this REFUSES and names the file (owner ruling — a regenerated secret would
    // orphan every sealed credential, or every local password, session and live invite). A cookie mode still needs a
    // usable pepper after that: a filesystem fault on the first write is the one way it can still be null.
    const { secretBoxKey, sessionSecret } = await settleBootSecrets({ db, now, credentialsKey, sessionSecret: sessionSecretSource });
    if (sessionSecret === null && isCookieAuthMode(env.AUTH_MODE)) {
      throw new Error(missingSessionSecretMessage(env.AUTH_MODE, sessionSecretSource.path));
    }

    // Resolve the owner id before compose (the owner role-clients bundle resolves against it). A
    // transient sessions service is built only to run the owner seed; compose owns the real one.
    const ownersBoundBeforeCompose: UserId[] = [];
    const rolePolicy = createSessionsRolePolicy(env);
    const bootSessions = createSessionsService({
      rolePolicy,
      db: wiringDb,
      now,
      sessionSecret,
      // #2481 — the owner row is MINTED here (`seedOwner` → `ensureUser`), so this transient service needs
      // the per-user seed too: on a fresh install the sweep below would otherwise be the only thing that
      // ever seeds the owner, and it runs once per process. `workloads` does not exist yet, so an owner whose
      // encoder this seed binds is held and its sweeps are enqueued once compose has built the queue.
      seedUserConnections: createLocalLightUserSeed({ db: wiringDb, now, onEmbedSpaceBound: (boundOwner) => ownersBoundBeforeCompose.push(boundOwner) }),
    });

    // OIDC LAZY-MINT (#1853): in OIDC mode the owner identity comes from the IdP, not from env config.
    // Don't seed a placeholder owner row at boot — the first OIDC login that claims the owner lazy-mints the
    // owner row via `provisionIdentity`: an OWNER_GROUP member, or an OWNER_HANDLES match with proof (a loopback
    // callback or the boot claim code `announceOwnerClaim` writes). For every other mode (single-user, local,
    // forward-header), seed the owner at boot as before.
    let ownerId: UserId | undefined;
    const ownerClaimFile = join(env.DATA_LAYOUT.secrets, OWNER_CLAIM_URL_FILE_NAME);
    const ownerClaim = removeOwnerClaimFileOnSpend(createOwnerClaimCode(), ownerClaimFile);
    if (env.AUTH_MODE === "oidc") {
      ownerId = await bootSessions.getOwnerUserId();
      if (ownerId !== undefined) {
        log.info({ ownerId }, "boot(oidc): existing owner row found (from a prior OIDC login)");
      } else {
        log.info("boot(oidc): no owner row yet — the first owner-policy OIDC login will create it; owner-dependent boot seeds are deferred");
      }
      await announceOwnerClaim({
        log,
        sessions: bootSessions,
        ownerId,
        ownerClaim,
        redirectAllowlist: oidcRedirectAllowlist(env.OIDC_REDIRECT_URIS),
        claimUrlFile: ownerClaimFile,
        inContainer: bindPostureInput().inContainer,
      });
    } else {
      const handles = rolePolicy.ownerHandles();
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

    // `admin.restart`'s port: close the app as a signal does, then exit with the code the supervisor respawns on. It
    // runs on a later tick so the owner's answer is sent first. A shutdown already under way (a signal) wins, because
    // a second `shutdown()` returns at once and the exit would cut its drain. A failed close still exits with the
    // code, so the respawned boot is the one that reports what is wrong.
    const serverRestart: ServerRestartPort = {
      supervised: launchedBySupervisor(),
      serverInstanceId: SERVER_INSTANCE_ID,
      restart: (): void => {
        setImmediate(() => {
          if (isShuttingDown) {
            log.warn("restart: a shutdown is already under way, so the restart request is dropped");
            return;
          }
          log.info("restart: the owner asked for a restart; shutting down for the supervisor to start this server again");
          shutdown().then(
            () => {
              process.exit(RESTART_EXIT_CODE);
            },
            (err: unknown) => {
              log.error({ err }, "restart: shutdown failed; exiting for the supervisor anyway");
              process.exit(RESTART_EXIT_CODE);
            },
          );
        });
      },
    };

    // The DEPLOY-MODE INVARIANT (foundation/env/bind.ts holds the model): `hostname` is OMITTED rather than
    // defaulted to "0.0.0.0" so the production path stays byte-identical to node's own default — passing
    // "0.0.0.0" would silently drop the IPv6 listener. The IP certificate's listeners take the same interface.
    const bind = resolveBindPosture(bindPostureInput());

    // The share relay: the server's one long-lived child, spawned in this process group. Built once, before compose,
    // because it holds the relay registry's write side; the port is read when a relay starts, after the bind.
    const listenPort = (): number => listenerAddress?.port ?? options.listenPort ?? env.PORT;
    sharing = await createShareGraph({
      bind,
      appPort: listenPort,
      relayDir: env.DATA_LAYOUT.relay,
      secretsDir: env.DATA_LAYOUT.secrets,
      now,
      timers: { timeout: scheduleOnce, timeoutUnref: scheduleOnce, interval: scheduleInterval },
      ...(options.relaySeams === undefined ? {} : { relaySeams: options.relaySeams }),
    });
    const relay = sharing.share.relay;

    const authConfig = authConfigFromEnv();
    const built = await createServices({
      rolePolicy,
      authConfig,
      db: wiringDb,
      now,
      ownerId,
      secretBoxKey,
      casDir: env.ASSETS_DIR,
      variantDir: env.DATA_LAYOUT.variants,
      importStagingDir: env.IMPORT_STAGING_DIR,
      ...(env.ST_PROFILE_DIR !== undefined ? { stProfileDir: env.ST_PROFILE_DIR } : {}),
      sessionSecret,
      holder,
      ...(options.providerSeams === undefined ? {} : { providerSeams: options.providerSeams }),
      serverRestart,
      share: sharing.share,
    });
    closeLocalLight = async (): Promise<void> => {
      await built[Symbol.asyncDispose]();
    };

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
    await seedLocalLightOnBoot({ db: wiringDb, now, onEmbedSpaceBound: built.detachEmbedReindex });
    for (const boundOwner of ownersBoundBeforeCompose) {
      built.detachEmbedReindex(boundOwner);
    }
    // An owner whose stored generation no longer matches their binding (a release moved generation identity), or
    // whose rebuild died before promotion, has no user action to raise the re-index trigger, so boot raises it.
    // Idempotent: a rebuilt, promoted owner matches.
    built.detachStaleSpaceReindex();

    // Owner-DEPENDENT boot seeds: guarded behind ownerId so a fresh OIDC box (no owner yet) can still boot.
    // In OIDC mode without an owner, these are deferred: per-user seeds (the user seed's characters, persona and rosters,
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
      // BEFORE the cards: they dress through this seeder, and seeding it first is what lands the owner's
      // background library in pack order. It also carries the `kind:"seeded"` retirement's data rewrite for
      // this user (see `boot/seed-default-backgrounds.ts`).
      await seedDefaultBackgrounds({ seeder: built.backgroundSeeder, owner });
      // The user seed (D263): the manifest's characters, persona and roster presets the ledger lacks.
      await seedUserContent({ seeder: built.contentSeeder, owner });
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

    await optimizeDb(db);
    const plannerDb = db;
    stopPlannerMaintenance = startPlannerMaintenance(() => optimizeDb(plannerDb), scheduleInterval);
    await reclaimLocksOnBoot({ db, contributions: built.workloadContributions, now, holder, emitWorkloadEvent: built.workloadEvents.emitWorkloadEvent });

    // Boot-reclaim the host-offline deferred-turn queue (chat Part III §5): each row runs (consent/budget
    // re-validated in-lock) or is dropped. Fire-and-forget — the drain does real generation, so it must
    // NOT block boot/listen; its own log reports ran/dropped and one row's fault can't abort the sweep.
    void built.services.chat
      .drainDeferredTurns({ all: true })
      .then((report) => log.info(report, "boot: drained deferred turns (pending_turns reclaim)"))
      .catch((err: unknown) => log.error({ err }, "boot: deferred-turn drain failed"));

    built.startJobs();

    const oidcWiring = env.AUTH_MODE === "oidc" ? await createConfiguredOidc({ db: wiringDb, now, built, ownerClaim }) : undefined;
    oidcLifetime = oidcWiring ?? null;

    const app = createHttpApp({
      built,
      authConfig,
      now,
      db: wiringDb,
      importStagingDir: env.IMPORT_STAGING_DIR,
      casDir: env.ASSETS_DIR,
      sessionSecret,
      onOwnerClaimed: () => {
        superviseDetached(`share-resume:${randomUUID()}`, "share.resumeAfterOwnerClaim", {}, async () => {
          logShareBootOutcome(log, await built.services.share.resumeAfterOwnerClaim());
        });
      },
      isShuttingDown: () => isShuttingDown,
      credentialsKeyOk: () => credentialsKeyOk,
      inContainer: bindPostureInput().inContainer,
      relayHosts: sharing.relayHosts,
      shareState: relay.status,
      oidcProviderName: env.OIDC_PROVIDER_NAME,
      ...(oidcWiring === undefined ? {} : { oidc: oidcWiring }),
    });

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

    // overrideGlobalObjects would swap global Response for hono's class, so a native fetch() result fails
    // `instanceof Response`; transformers.js then never caches a downloaded model file and every local-light load fails.
    const primary = await listenApp({
      fetch: app.fetch,
      port: options.listenPort ?? env.PORT,
      ...(bind.host === undefined ? {} : { hostname: bind.host }),
    });
    server = primary.handle;
    listenerAddress = primary.address;
    log.info({ port: primary.address.port, address: primary.address.address }, "boot: listening — healthz live");
    // SECURITY: a bind to one named interface also listens on loopback at the same port, so the relay and the https
    // listener reach the app as a loopback peer (D275). It binds the loopback address only, never a wildcard: it admits
    // only this machine, as every wildcard bind already does, and each loopback gate still refuses a relay tell.
    const companion = loopbackCompanion(bind.host);
    if (companion !== null) {
      const loopback = await listenApp({ fetch: app.fetch, port: primary.address.port, hostname: companion });
      loopbackServer = loopback.handle;
      log.info({ port: loopback.address.port, address: loopback.address.address }, "boot: also listening on loopback for the relay and https");
    }

    // After the bind: the relay forwards to the listener, so it starts only once there is one to reach.
    if (env.SHARE_RELAY !== undefined) {
      superviseDetached(`share-boot:${randomUUID()}`, "share.startAtBoot", { relay: env.SHARE_RELAY }, async () => {
        logShareBootOutcome(log, await built.services.share.startAtBoot());
      });
    }
    // After the bind too: the https listener forwards to the app listener, so a stored certificate serves only once it is up.
    superviseDetached(`ip-certificate-boot:${randomUUID()}`, "share.resumeIpCertificate", {}, async () => {
      logCertificateBootOutcome(log, await built.services.share.resumeIpCertificate());
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
  async function shutdown(request: { readonly drainMs?: number } = {}): Promise<void> {
    const httpDrainMs = request.drainMs ?? SHUTDOWN_DRAIN_MS;
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    log.info("shutdown: draining");
    let shareFailure: Error | undefined;
    if (sharing !== null) {
      const graph = sharing;
      sharing = null;
      try {
        await graph[Symbol.asyncDispose]();
      } catch (error) {
        shareFailure = error instanceof Error ? error : new Error("native sharing disposal failed", { cause: error });
      }
    }

    if (server !== null) {
      const loopback = loopbackServer;
      await Promise.all([drainHttpServer(server, log, httpDrainMs), ...(loopback === null ? [] : [drainHttpServer(loopback, log, httpDrainMs)])]);
      server = null;
      loopbackServer = null;
      listenerAddress = null;
      // STAGE BREADCRUMB (#1936). Everything between `draining` and `complete` used to be silent, so when
      // `stack down prod` escalated to SIGKILL the log said only that the process had not finished — never
      // WHICH stage it was in, which is the whole reason the original report could not be diagnosed. The
      // bounded drain announces only its FORCED path (a warn); this is the quiet one. Measured 2026-09-19 on
      // an isolated prod instance: 12 ms idle, and exactly 10.001 s with one in-flight request.
      log.info("shutdown: http drained");
    }
    if (oidcLifetime !== null) {
      const oidc = oidcLifetime;
      oidcLifetime = null;
      await oidc[Symbol.asyncDispose]();
    }
    if (stopBuddyObserver !== null) {
      stopBuddyObserver();
      stopBuddyObserver = null;
    }
    // Stops the WALK before its next slot; an ONNX load already in flight has no interrupt and settles into
    // a registry nobody reads again (`local-light/prefetch.ts`). Null when this boot planned nothing.
    if (stopLocalLightPrefetch !== null) {
      stopLocalLightPrefetch();
      stopLocalLightPrefetch = null;
    }
    if (closeLocalLight !== null) {
      const close: () => Promise<void> = closeLocalLight;
      closeLocalLight = null;
      // Bounded: a native ONNX run cannot be interrupted. A close that outlasts its wait is logged, and the
      // process exit then tears the worker down mid-run, which aborts the process (exit 134) after db housekeeping.
      log.info("shutdown: closing the service graph");
      await close();
    }
    if (db !== null) {
      if (stopPlannerMaintenance !== null) {
        const stop: () => Promise<void> = stopPlannerMaintenance;
        stopPlannerMaintenance = null;
        await stop();
      }
      // STAGE BREADCRUMB (#1936) — the SECOND unbounded stage, and the last thing between here and exit:
      // bounded planner refresh + `wal_checkpoint(TRUNCATE)` (`@orb/db`'s `preCloseHousekeeping`), whose cost is a
      // function of the db, not of a timeout we control. Announced before the await for the same reason as
      // the worker join: a shutdown that stalls here must say so rather than look identical to a wedge.
      log.info("shutdown: db housekeeping");
      await preCloseHousekeeping(db);
      db = null;
    }
    log.info("shutdown: complete");
    if (shareFailure !== undefined) {
      throw shareFailure;
    }
  }

  return { boot, listeningAddress: (): Readonly<AddressInfo> | null => listenerAddress, shutdown };
}
