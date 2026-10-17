// Production HTTP graph shared by the process lifecycle and in-process embedders. Identity still resolves
// once in createApp; this factory binds real session, seed, rate-limit and route owners.

import { randomUUID } from "node:crypto";
import type { Principal } from "@orb/contracts/identity";
import type { Handle, SessionToken, UserId } from "@orb/kit/ids";
import { isReservedSignupHandle } from "#domain/sessions";
import { ownerFallbackCredentialInput, resolveOwnerFallbackCredential } from "#foundation/env";
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
  | "clientDistDir"
  | "physicalPeer"
> & {
  readonly built: Pick<
    ServicesResult,
    | "liveBuses"
    | "services"
    | "forwardJwtVerifier"
    | "rateLimit"
    | "multiHumanCapable"
    | "supervise"
    | "sessions"
    | "presence"
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
      isReservedHandle: isReservedSignupHandle,
      handleTaken: (handle: Handle): Promise<boolean> => sessions.signupHandleTaken(handle),
      hashPassword: (plain: string): Promise<string> => hasher.hash(plain),
      seedUserConnections: built.seedUserConnections,
    },
  };
}

/** Assemble the real HTTP edge from the production services graph and one authentication snapshot. */
export function createHttpApp(deps: HttpAppDeps): ReturnType<typeof createApp> {
  const { built, authConfig, now, db } = deps;
  const supervise = built.supervise;
  return createApp({
    liveBuses: built.liveBuses,
    authConfig,
    now,
    db,
    ...(deps.physicalPeer === undefined ? {} : { physicalPeer: deps.physicalPeer }),
    ...(deps.importStagingDir === undefined ? {} : { importStagingDir: deps.importStagingDir }),
    ...(deps.clientDistDir === undefined ? {} : { clientDistDir: deps.clientDistDir }),
    seam: createAuthSeam({
      emitUserEvent: built.liveBuses.user.publishUserEvent,
      sessions: built.sessions,
      config: authConfig,
      verifyForwardJwt: built.forwardJwtVerifier,
      ownerFallbackIsOperatorCredential: resolveOwnerFallbackCredential(ownerFallbackCredentialInput()),
      relayedFallbackNotice: createRelayedFallbackNotice(now),
      relayHosts: deps.relayHosts,
    }),
    services: built.services,
    rateLimit: built.rateLimit,
    multiHumanCapable: built.multiHumanCapable,
    presence: built.presence,
    sockets: built.sockets,
    ...(built.rpgTrace === undefined ? {} : { rpgTrace: createRpgTraceInspector(built.rpgTrace) }),
    wireCapture: built.wireCaptureOn,
    memoryRecall: createMemoryRecallInspector(built.recallRecorder),
    assets: built.assets,
    cas: createCas(deps.casDir),
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
      // Cards dress through scene plates, so their seed follows the background seed in pack order.
      supervise(`seed-user:${principal.userId}:content:${randomUUID()}`, "seed.user.content", { userId: principal.userId }, () =>
        built.backgroundSeeder.ensureSeeded(principal).then((): Promise<void> => built.contentSeeder.ensureSeeded(principal)),
      );
      supervise(`seed-user:${principal.userId}:example-plugin:${randomUUID()}`, "seed.user.example-plugin", { userId: principal.userId }, () =>
        built.examplePluginSeeder.ensureSeeded(principal),
      );
      supervise(`seed-user:${principal.userId}:distributed-plugins:${randomUUID()}`, "seed.user.distributed-plugins", { userId: principal.userId }, () =>
        built.distributedPluginApplier.ensureApplied(principal),
      );
    },
    oidcProviderName: deps.oidcProviderName,
    ...(authConfig.mode === "local" ? buildLocalAuthDeps(built, deps.sessionSecret, deps.onOwnerClaimed) : {}),
    ...(deps.oidc === undefined ? {} : { oidc: deps.oidc }),
  });
}
