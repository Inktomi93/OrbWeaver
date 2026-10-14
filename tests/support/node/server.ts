// The Node harness assembles the production graph once. Only clocks, business entropy, scheduling and
// external execution vary; identity, policy, persistence and accounting stay with their production owners.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "@orb/db";
import { closeDb } from "@orb/db";
import type { AgentSdkQuery, AgentSdkSpawn } from "@orb/inference";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, createIdSource } from "@orb/kit/ids";
import { ownerHandles } from "@orb/server/domain/sessions";
import { authConfigFromEnv, createHostPrincipalResolver } from "@orb/server/entry/auth";
import type { createHttpApp, ServicesDeps, ServicesResult } from "@orb/server/entry/compose";
import { getLog } from "@orb/server/foundation/observability";
import { createCaller, createContext } from "@orb/server/transport/trpc";
import type { Clock } from "../iso/clock.ts";
import { createFrozenClock } from "../iso/clock.ts";
import type { SeededIds } from "../iso/ids.ts";
import { createSeededIds } from "../iso/ids.ts";
import type { ControlledTimers } from "../iso/timers.ts";
import { createControlledTimers } from "../iso/timers.ts";
import { freshDb } from "./db.ts";
import type { UserRow } from "./factories/user.ts";
import { seedUser } from "./factories/user.ts";
import type { OwnedHttpRequests } from "./http.ts";
import { createOwnedHttpRequests } from "./http.ts";

export interface ServerHarnessOptions
  extends Partial<Pick<ServicesDeps, "secretBoxKey" | "casDir" | "variantDir" | "importStagingDir" | "rpgTrace" | "wireCapture" | "wireCaptureReply">> {
  readonly networkExecution?: ServicesDeps["networkExecution"];
  readonly pluginSpawn?: NonNullable<ServicesDeps["pluginExecution"]>["spawn"];
  readonly db?: Db;
  readonly clock?: Clock;
  /** Ownership transfers to this root; the supplied scheduler is disposed even when construction fails. */
  readonly timers?: ControlledTimers;
  readonly temporaryParentDir?: ReturnType<typeof tmpdir>;
  readonly ids?: SeededIds;
  readonly random?: () => number;
  readonly authConfig?: Parameters<typeof createHttpApp>[0]["authConfig"];
  readonly physicalPeer?: Parameters<typeof createHttpApp>[0]["physicalPeer"];
  readonly ownerId?: UserId;
  readonly providerFetch?: typeof fetch;
  readonly sdkQuery?: AgentSdkQuery;
  readonly sdkSpawn?: AgentSdkSpawn;
  readonly runtimeSpan?: NonNullable<ServicesDeps["providerSeams"]>["span"];
  readonly modelKernelModule?: NonNullable<NonNullable<ServicesDeps["providerSeams"]>["localLight"]>["kernelModule"];
  readonly allowRemoteModels?: NonNullable<NonNullable<ServicesDeps["providerSeams"]>["localLight"]>["allowRemoteModels"];
}

export interface ServerTestHarness extends AsyncDisposable {
  readonly app: ServicesResult;
  readonly services: ServicesResult["services"];
  readonly db: Db;
  readonly clock: Clock;
  readonly ids: SeededIds;
  readonly idSource: ReturnType<typeof createIdSource>;
  readonly timers: Omit<ControlledTimers, keyof Disposable>;
  readonly ownerId: UserId;
  readonly principalFor: ReturnType<typeof createHostPrincipalResolver>;
  /** Internal row-derived tRPC calls, not request authentication; HTTP owns cookie/session admission proof. */
  readonly internalCallerFor: (userId: UserId | null) => Promise<ReturnType<typeof createCaller>>;
  readonly actor: (overrides?: Partial<UserRow>) => ReturnType<typeof seedUser>;
  readonly http: Pick<ReturnType<typeof createHttpApp>, "request">;
  readonly listen: () => Promise<Readonly<AddressInfo>>;
  readonly importStagingDir: string;
  readonly modelCacheDir: string;
  readonly settleBackground: ServicesResult["settleBackground"];
}

const SESSION_SECRET = "server-harness-session-secret-at-least-32-chars";
const IN_PROCESS_CLIENT_IP = "127.0.0.1";

function refusingProviderFetch(): typeof fetch {
  return (): Promise<Response> => Promise.reject(new Error("server harness: unscripted external provider execution"));
}

const refusingPluginSpawn: NonNullable<NonNullable<ServicesDeps["pluginExecution"]>["spawn"]> = (): never => {
  throw new Error("server harness: unscripted external plugin execution");
};

const refusingSdkQuery: AgentSdkQuery = (): never => {
  throw new Error("server harness: unscripted external SDK execution");
};

const refusingSdkSpawn: AgentSdkSpawn = (): never => {
  throw new Error("server harness: unscripted external SDK subprocess execution");
};

function refusingResolver(): Promise<never> {
  return Promise.reject(new Error("server harness: unscripted external address resolution"));
}

function providerExecutionOf(
  options: Pick<ServerHarnessOptions, "providerFetch" | "sdkQuery" | "sdkSpawn" | "modelKernelModule" | "allowRemoteModels" | "runtimeSpan">,
  modelCacheDir: string,
): NonNullable<ServicesDeps["providerSeams"]> {
  return {
    sdkFetch: options.providerFetch ?? refusingProviderFetch(),
    agentSdk: {
      ...(options.sdkQuery === undefined && options.sdkSpawn !== undefined ? {} : { query: options.sdkQuery ?? refusingSdkQuery }),
      spawnClaudeCodeProcess: options.sdkSpawn ?? refusingSdkSpawn,
    },
    ...(options.runtimeSpan === undefined ? {} : { span: options.runtimeSpan }),
    localLight: {
      cacheDir: modelCacheDir,
      allowRemoteModels: options.allowRemoteModels ?? false,
      kernelModule: options.modelKernelModule ?? new URL("./refuse-model-kernel.ts", import.meta.url).href,
    },
  };
}

function observerSettingsOf(
  options: Pick<ServerHarnessOptions, "rpgTrace" | "wireCapture" | "wireCaptureReply">,
): Pick<ServicesDeps, "rpgTrace" | "wireCapture" | "wireCaptureReply"> {
  return {
    ...(options.rpgTrace === undefined ? {} : { rpgTrace: options.rpgTrace }),
    ...(options.wireCapture === undefined ? {} : { wireCapture: options.wireCapture }),
    ...(options.wireCaptureReply === undefined ? {} : { wireCaptureReply: options.wireCaptureReply }),
  };
}

async function directoriesFor(
  rootDir: string,
  options: Pick<ServerHarnessOptions, "casDir" | "variantDir" | "importStagingDir">,
): Promise<
  Required<Pick<ServicesDeps, "casDir" | "variantDir" | "importStagingDir" | "userRuntimeDir" | "stProfileDir">> & Pick<ServerTestHarness, "modelCacheDir">
> {
  const paths = {
    casDir: options.casDir ?? join(rootDir, "cas"),
    variantDir: options.variantDir ?? join(rootDir, "variants"),
    importStagingDir: options.importStagingDir ?? join(rootDir, "import-staging"),
    userRuntimeDir: join(rootDir, "user-runtime"),
    modelCacheDir: join(rootDir, "model-cache"),
    stProfileDir: join(rootDir, "st-profile"),
  };
  await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true })));
  return paths;
}

/** Build an owned in-process server graph; a supplied database remains its caller's resource. */
export async function createServerHarness(options: ServerHarnessOptions = {}): Promise<ServerTestHarness> {
  await using construction = new AsyncDisposableStack();
  // biome-ignore lint/nursery/useDisposables: native rollback owns this timer until transfer; the missing-directory control proves disposal before adoption.
  let pendingTimers = options.timers;
  construction.defer(() => pendingTimers?.[Symbol.dispose]());
  const rootDir = await mkdtemp(join(options.temporaryParentDir ?? tmpdir(), "orb-server-harness-"));
  construction.defer(() => rm(rootDir, { recursive: true, force: true }));
  const db = options.db ?? (await freshDb());
  if (options.db === undefined) {
    construction.defer(() => closeDb(db));
  }
  const clock = options.clock ?? createFrozenClock();
  const ids = options.ids ?? createSeededIds();
  const idSource = createIdSource(ids.next);
  // biome-ignore lint/nursery/useDisposables: this exact scheduler is adopted by the moved root stack, not the factory scope.
  const timers: ServerTestHarness["timers"] = construction.use(pendingTimers ?? createControlledTimers(clock));
  pendingTimers = undefined;
  const random = options.random ?? ((): number => 0.5);
  const authConfig = options.authConfig ?? authConfigFromEnv();
  let appLifetime: ServicesResult | undefined;
  let httpLifetime: OwnedHttpRequests | undefined;
  construction.defer(async () => {
    const settled = await Promise.allSettled([httpLifetime?.[Symbol.asyncDispose](), appLifetime?.[Symbol.asyncDispose]()]);
    const failures: Error[] = [];
    for (const result of settled) {
      if (result.status === "rejected") {
        failures.push(result.reason instanceof Error ? result.reason : new Error("server harness graph disposal failed", { cause: result.reason }));
      }
    }
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, "server harness graph disposal failed");
    }
  });
  const { casDir, variantDir, importStagingDir, userRuntimeDir, modelCacheDir, stProfileDir } = await directoriesFor(rootDir, options);
  const ownerId = options.ownerId ?? idSource.unprefixed<UserId>();
  if (options.ownerId === undefined) {
    await seedUser(
      db,
      {
        id: ownerId,
        handle: castId<Handle>(ownerHandles()[0] ?? authConfig.defaultHandle),
        role: "owner",
        createdAt: clock.now(),
        updatedAt: clock.now(),
      },
      idSource,
    );
  }
  const { createHttpApp: assembleHttp, createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } = await import("@orb/server/entry/compose");
  const app = await createServices({
    authConfig,
    db,
    now: clock.now,
    timers,
    idSource,
    newOpaqueId: ids.uuid,
    random,
    randomInt: (max) => Math.floor(random() * max),
    ownerId,
    secretBoxKey: options.secretBoxKey ?? null,
    ...observerSettingsOf(options),
    sessionSecret: SESSION_SECRET,
    casDir,
    variantDir,
    importStagingDir,
    stProfileDir,
    userRuntimeDir,
    serverRestart: UNSUPERVISED_RESTART,
    share: NO_SHARE_RELAY,
    providerSeams: providerExecutionOf(options, modelCacheDir),
    pluginExecution: { spawn: options.pluginSpawn ?? refusingPluginSpawn, monotonicNow: clock.now },
    networkExecution: { ...options.networkExecution, resolver: options.networkExecution?.resolver ?? refusingResolver },
  });
  appLifetime = app;
  const principalFor = createHostPrincipalResolver(app.sessions);
  const credentialsKeyOk = await app.services.credentials.probeKeyDecrypt();
  let closing = false;
  const httpApp = assembleHttp({
    built: app,
    ...(options.physicalPeer === undefined ? {} : { physicalPeer: options.physicalPeer }),
    authConfig,
    db,
    importStagingDir,
    now: clock.now,
    casDir,
    sessionSecret: SESSION_SECRET,
    isShuttingDown: () => closing,
    credentialsKeyOk: () => credentialsKeyOk,
    inContainer: false,
    relayHosts: () => [],
    shareState: NO_SHARE_RELAY.relay.status,
    oidcProviderName: "Harness identity provider",
    onOwnerClaimed: () => {
      app.supervise("server-harness-owner-claim", "share.resumeAfterOwnerClaim", {}, async () => {
        getLog().info({ outcome: await app.services.share.resumeAfterOwnerClaim() }, "share owner claim settled");
      });
    },
  });
  const http = createOwnedHttpRequests(httpApp, timers.timeout);
  httpLifetime = http;
  const internalCallerFor = async (userId: UserId | null): Promise<ReturnType<typeof createCaller>> =>
    createCaller(
      createContext({
        liveBuses: app.liveBuses,
        auth: userId === null ? null : await principalFor(userId),
        sessionId: null,
        services: app.services,
        rateLimit: app.rateLimit,
        presence: app.presence,
        sockets: app.sockets,
        multiHumanCapable: app.multiHumanCapable(),
        csrfHeaderPresent: false,
        clientIp: IN_PROCESS_CLIENT_IP,
      }),
    );
  const actor = (overrides: Partial<UserRow> = {}): ReturnType<typeof seedUser> =>
    seedUser(
      db,
      {
        createdAt: clock.now(),
        updatedAt: clock.now(),
        ...overrides,
      },
      idSource,
    );
  app.startJobs();
  const lifetime = construction.move();
  return {
    app,
    services: app.services,
    db,
    clock,
    ids,
    idSource,
    timers,
    ownerId,
    principalFor,
    internalCallerFor,
    actor,
    http,
    listen: http.listen,
    importStagingDir,
    modelCacheDir,
    settleBackground: app.settleBackground,
    async [Symbol.asyncDispose](): Promise<void> {
      closing = true;
      await lifetime.disposeAsync();
    },
  };
}
