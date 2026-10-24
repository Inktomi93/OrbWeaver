// Production HTTP graph shared by the process lifecycle and in-process embedders. Identity still resolves
// once in createApp; this factory binds real session, seed, rate-limit and route owners.

import type { Principal } from "@orb/contracts/identity";
import type { Handle, SessionToken, UserId } from "@orb/kit/ids";
import { ownerFallbackCredentialInput, resolveOwnerFallbackCredential } from "#foundation/env/record";
import type { Logger } from "#foundation/observability";
import { createDetachedSupervision } from "#foundation/observability";
import type { AuthConfig } from "#infra/auth";
import { createPasswordHasher, createRelayedFallbackNotice, ownerFallbackAllowed } from "#infra/auth";
import { createCas } from "#infra/storage";
import { createMemoryRecallInspector, createRpgTraceInspector } from "#transport/debug-recorders";
import type { AppDeps } from "../app.ts";
import { createApp } from "../app.ts";
import { createAuthSeam } from "../auth/index.ts";
import type { ServicesResult } from "../compose/services.ts";

type HttpAppDeps = Pick<
  AppDeps,
  | "now"
  | "db"
  | "isShuttingDown"
  | "credentialsKeyOk"
  | "inContainer"
  | "relayHosts"
  | "shareState"
  | "oidcProviderName"
  | "oidc"
  | "importStagingDir"
  | "physicalPeer"
  | "env"
  | "logger"
> & {
  readonly built: Pick<
    ServicesResult,
    | "liveBuses"
    | "services"
    | "forwardJwtVerifier"
    | "trpcContext"
    | "multiHumanCapable"
    | "supervise"
    | "newOpaqueId"
    | "sessions"
    | "sockets"
    | "assets"
    | "exportService"
    | "portability"
    | "settleImportMemory"
    | "importWorldInfo"
    | "importCardScripts"
    | "rpgTrace"
    | "wireCaptureOn"
    | "recallRecorder"
    | "signupInvites"
    | "seedUserConnections"
    | "backgroundSeeder"
    | "contentSeeder"
    | "examplePluginSeeder"
    | "distributedPluginApplier"
  >;
  readonly authConfig: AuthConfig;
  readonly casDir: Parameters<typeof createCas>[0];
  readonly sessionSecret: Parameters<typeof createPasswordHasher>[0];
  readonly onOwnerClaimed: () => void;
};

// Both password-claim and first-run reads remain loopback-only, independently of the fallback peer policy.
function buildLocalAuthDeps(
  built: Pick<ServicesResult, "sessions" | "signupInvites" | "seedUserConnections">,
  sessionSecret: Parameters<typeof createPasswordHasher>[0],
  onOwnerClaimed: () => void,
): Required<Pick<AppDeps, "authenticate" | "firstRun" | "localFirstRun" | "signup">> {
  const { sessions } = built;
  const hasher = createPasswordHasher(sessionSecret);
  return {
    authenticate: (handle: Handle, password: string): Promise<UserId | null> => sessions.authenticate(handle, password),
    firstRun: {
      setOwnerPassword: async (plain: string): Promise<UserId | null> => {
        const claimed = await sessions.claimOwnerPassword(await hasher.hash(plain));
        if (claimed !== null) {
          onOwnerClaimed();
        }
        return claimed;
      },
      originAllowed: (peerIp: string | undefined, headers: Headers): boolean => ownerFallbackAllowed(peerIp, headers),
    },
    localFirstRun: async (peerIp: string | undefined, headers: Headers): Promise<boolean> =>
      ownerFallbackAllowed(peerIp, headers) ? await sessions.ownerNeedsPassword() : false,
    signup: {
      sessionIsLive: async (token: SessionToken): Promise<boolean> => (await sessions.validate(token)) !== null,
      invites: built.signupInvites,
      isReservedHandle: sessions.rolePolicy.isReservedSignupHandle,
      handleTaken: (handle: Handle): Promise<boolean> => sessions.signupHandleTaken(handle),
      hashPassword: (plain: string): Promise<string> => hasher.hash(plain),
      seedUserConnections: built.seedUserConnections,
    },
  };
}

/** Assemble the real HTTP edge from the production services graph and one authentication snapshot. */
export function createHttpApp(deps: HttpAppDeps): ReturnType<typeof createApp> {
  const { built, authConfig, now, db } = deps;
  const { supervise, newOpaqueId } = built;
  let seedQueue: Promise<void> = Promise.resolve();
  return createApp({
    logger: deps.logger,
    liveBuses: built.liveBuses,
    authConfig,
    now,
    newOpaqueId,
    db,
    env: deps.env,
    ...(deps.physicalPeer === undefined ? {} : { physicalPeer: deps.physicalPeer }),
    importStagingDir: deps.importStagingDir,
    seam: createAuthSeam({
      logger: deps.logger,
      emitUserEvent: built.liveBuses.user.publishUserEvent,
      sessions: built.sessions,
      config: authConfig,
      verifyForwardJwt: built.forwardJwtVerifier,
      ownerFallbackIsOperatorCredential: resolveOwnerFallbackCredential(ownerFallbackCredentialInput(deps.env)),
      relayedFallbackNotice: createRelayedFallbackNotice(now, deps.logger),
      relayHosts: deps.relayHosts,
    }),
    services: built.services,
    trpcContext: built.trpcContext,
    multiHumanCapable: built.multiHumanCapable,
    sockets: built.sockets,
    ...(built.rpgTrace === undefined ? {} : { rpgTrace: createRpgTraceInspector(built.rpgTrace) }),
    wireCapture: built.wireCaptureOn,
    memoryRecall: createMemoryRecallInspector(built.recallRecorder),
    assets: built.assets,
    cas: createCas(deps.casDir, deps.logger),
    character: built.services.character,
    exportService: built.exportService,
    portability: built.portability,
    settleImportMemory: built.settleImportMemory,
    importWorldInfo: built.importWorldInfo,
    importCardScripts: built.importCardScripts,
    sessions: built.sessions,
    isShuttingDown: deps.isShuttingDown,
    credentialsKeyOk: deps.credentialsKeyOk,
    inContainer: deps.inContainer,
    relayHosts: deps.relayHosts,
    shareState: deps.shareState,
    seedUserCharacters: (principal: Principal): void => {
      const attrs = { userId: principal.userId };
      // Seeding is one queue for the process, across users and seeders, because every seeder draws from the
      // injected id source: concurrent seeders let I/O timing decide which row gets which id, and a seeded
      // replay could not reproduce its own fixture. Each step keeps its own span and failure report, so one
      // failed seeder still leaves the next one running.
      const run = seedQueue.then(() => seedUser(built, principal, attrs, deps.logger));
      // The supervise below reports this run's failure; the queue only orders, so a failed run never stalls the next.
      seedQueue = run.then(
        () => undefined,
        () => undefined,
      );
      supervise(`seed-user:${principal.userId}:${newOpaqueId()}`, "seed.user", attrs, () => run);
    },
    oidcProviderName: deps.oidcProviderName,
    ...(authConfig.mode === "local" ? buildLocalAuthDeps(built, deps.sessionSecret, deps.onOwnerClaimed) : {}),
    ...(deps.oidc === undefined ? {} : { oidc: deps.oidc }),
  });
}

/** One user's seeders in order. Cards dress through scene plates, so their seed follows the background seed. */
async function seedUser(
  built: Pick<HttpAppDeps["built"], "backgroundSeeder" | "contentSeeder" | "examplePluginSeeder" | "distributedPluginApplier" | "newOpaqueId">,
  principal: Principal,
  attrs: { readonly userId: UserId },
  logger: Logger,
): Promise<void> {
  const { newOpaqueId } = built;
  const { superviseSettled } = createDetachedSupervision(logger);
  await superviseSettled(`seed-user:${principal.userId}:content:${newOpaqueId()}`, "seed.user.content", attrs, () =>
    built.backgroundSeeder.ensureSeeded(principal).then((): Promise<void> => built.contentSeeder.ensureSeeded(principal)),
  );
  await superviseSettled(`seed-user:${principal.userId}:example-plugin:${newOpaqueId()}`, "seed.user.example-plugin", attrs, () =>
    built.examplePluginSeeder.ensureSeeded(principal),
  );
  await superviseSettled(`seed-user:${principal.userId}:distributed-plugins:${newOpaqueId()}`, "seed.user.distributed-plugins", attrs, () =>
    built.distributedPluginApplier.ensureApplied(principal),
  );
}
