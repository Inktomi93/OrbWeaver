// The Node harness assembles the production graph once. Only clocks, business entropy, scheduling and
// external execution vary; identity, policy, persistence and accounting stay with their production owners.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "@orb/db";
import { closeDb } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { AgentSdkNativeOptions, AgentSdkQuery, AgentSdkSpawn } from "@orb/inference";
import { createBinding } from "@orb/kit/binding";
import type { Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, createIdSource } from "@orb/kit/ids";
import type { SessionsRolePolicy, SessionsRolePolicyConfig } from "@orb/server/domain/sessions";
import { createSessionsRolePolicy } from "@orb/server/domain/sessions";
import type { ShareGraph, ShareGraphOptions } from "@orb/server/domain/share";
import { loadWorkload, runWorkload, tickWorkloadSchedules } from "@orb/server/domain/workloads";
import { authConfigFromEnv, createHostPrincipalResolver } from "@orb/server/entry/auth";
import { announceOwnerClaim, removeOwnerClaimFileOnSpend } from "@orb/server/entry/boot";
import type { createConfiguredOidc, createHttpApp, ServicesDeps, ServicesResult } from "@orb/server/entry/compose";
import { env, resolveBindPosture } from "@orb/server/foundation/env";
import { getLog, logger } from "@orb/server/foundation/observability";
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
  extends Partial<
    Pick<ServicesDeps, "secretBoxKey" | "casDir" | "variantDir" | "importStagingDir" | "rpgTrace" | "wireCapture" | "wireCaptureReply" | "logLevel">
  > {
  readonly networkExecution?: ServicesDeps["networkExecution"];
  readonly share?: Pick<ShareGraphOptions, "relay" | "acme">;
  readonly relayDir?: string;
  readonly secretsDir?: string;
  readonly bindHost?: string;
  readonly allowPublicBind?: boolean;
  readonly pluginSpawn?: NonNullable<ServicesDeps["pluginExecution"]>["spawn"];
  readonly db?: Db;
  readonly startJobs?: boolean;
  readonly workloadExecutionSignal?: AbortSignal;
  readonly clock?: Clock;
  /** Ownership transfers to this root; the supplied scheduler is disposed even when construction fails. */
  readonly timers?: ControlledTimers;
  readonly temporaryParentDir?: ReturnType<typeof tmpdir>;
  readonly ids?: SeededIds;
  readonly random?: () => number;
  readonly authConfig?: Parameters<typeof createHttpApp>[0]["authConfig"];
  readonly rolePolicyConfig?: SessionsRolePolicyConfig;
  readonly physicalPeer?: Parameters<typeof createHttpApp>[0]["physicalPeer"];
  readonly clientDistDir?: Parameters<typeof createHttpApp>[0]["clientDistDir"];
  readonly debugToken?: Parameters<typeof createHttpApp>[0]["debugToken"];
  readonly ownerId?: UserId;
  readonly oidc?: NonNullable<Parameters<typeof createConfiguredOidc>[0]["settings"]>;
  readonly providerFetch?: typeof fetch;
  readonly sdkQuery?: AgentSdkQuery;
  readonly sdkSpawn?: AgentSdkSpawn;
  readonly sdkNative?: AgentSdkNativeOptions;
  readonly runtimeSpan?: NonNullable<ServicesDeps["providerSeams"]>["span"];
  readonly modelKernelModule?: NonNullable<NonNullable<ServicesDeps["providerSeams"]>["localLight"]>["kernelModule"];
  readonly allowRemoteModels?: NonNullable<NonNullable<ServicesDeps["providerSeams"]>["localLight"]>["allowRemoteModels"];
}

export type UnclaimedServerHarnessOptions = Omit<ServerHarnessOptions, "ownerId" | "authConfig"> & {
  readonly ownerId: null;
  readonly authConfig: NonNullable<ServerHarnessOptions["authConfig"]> & { readonly mode: "oidc" };
};

class ComposedServerRoot {
  readonly #app: ServicesResult;
  readonly #db: Db;
  readonly #internalCallerFor: (userId: UserId | null) => Promise<ReturnType<typeof createCaller>>;
  readonly #http: Pick<OwnedHttpRequests, "request" | "routes">;

  constructor(
    app: ServicesResult,
    db: Db,
    internalCallerFor: (userId: UserId | null) => Promise<ReturnType<typeof createCaller>>,
    http: Pick<OwnedHttpRequests, "request" | "routes">,
  ) {
    this.#app = app;
    this.#db = db;
    this.#internalCallerFor = internalCallerFor;
    this.#http = http;
  }

  get app(): ServicesResult {
    return this.#app;
  }

  get services(): ServicesResult["services"] {
    return this.#app.services;
  }

  get db(): Db {
    return this.#db;
  }

  get internalCallerFor(): (userId: UserId | null) => Promise<ReturnType<typeof createCaller>> {
    return this.#internalCallerFor;
  }

  get http(): Pick<OwnedHttpRequests, "request" | "routes"> {
    return this.#http;
  }
}

/** Persisted producers require the actual composed root, not a structural bag of replacement operations. */
export type ServerProducerRoot = ComposedServerRoot;

export interface UnclaimedServerTestHarness extends ComposedServerRoot, Omit<ServerTestHarness, "ownerId"> {}

export interface ServerTestHarness extends ComposedServerRoot, AsyncDisposable {
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
  readonly http: Pick<OwnedHttpRequests, "request" | "routes">;
  readonly listen: () => Promise<Readonly<AddressInfo>>;
  readonly importStagingDir: string;
  readonly modelCacheDir: string;
  readonly relayDir: string;
  readonly secretsDir: string;
  readonly ownerClaimFile?: string;
  readonly settleBackground: ServicesResult["settleBackground"];
  readonly workloadExecutionSignal?: ServerHarnessOptions["workloadExecutionSignal"];
  readonly runAdmittedWorkload?: (id: WorkloadId, signal: AbortSignal) => Promise<void>;
  readonly tickWorkloadSchedules?: () => Promise<void>;
  readonly settleSharing: ShareGraph["settle"];
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
  options: Pick<ServerHarnessOptions, "providerFetch" | "sdkQuery" | "sdkSpawn" | "sdkNative" | "modelKernelModule" | "allowRemoteModels" | "runtimeSpan">,
  modelCacheDir: string,
): NonNullable<ServicesDeps["providerSeams"]> {
  return {
    sdkFetch: options.providerFetch ?? refusingProviderFetch(),
    agentSdk: {
      ...(options.sdkQuery === undefined && (options.sdkSpawn !== undefined || options.sdkNative !== undefined)
        ? {}
        : { query: options.sdkQuery ?? refusingSdkQuery }),
      ...(options.sdkNative === undefined ? { spawnClaudeCodeProcess: options.sdkSpawn ?? refusingSdkSpawn } : {}),
      ...(options.sdkSpawn === undefined ? {} : { spawnClaudeCodeProcess: options.sdkSpawn }),
      ...(options.sdkNative === undefined ? {} : { native: options.sdkNative }),
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
  options: Pick<ServerHarnessOptions, "rpgTrace" | "wireCapture" | "wireCaptureReply" | "logLevel">,
): Pick<ServicesDeps, "rpgTrace" | "wireCapture" | "wireCaptureReply" | "logLevel"> {
  return {
    ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),
    ...(options.rpgTrace === undefined ? {} : { rpgTrace: options.rpgTrace }),
    ...(options.wireCapture === undefined ? {} : { wireCapture: options.wireCapture }),
    ...(options.wireCaptureReply === undefined ? {} : { wireCaptureReply: options.wireCaptureReply }),
  };
}

function httpOverridesOf(
  options: Pick<ServerHarnessOptions, "physicalPeer" | "clientDistDir" | "debugToken">,
): Pick<Parameters<typeof createHttpApp>[0], "physicalPeer" | "clientDistDir" | "debugToken"> {
  return {
    ...(options.physicalPeer === undefined ? {} : { physicalPeer: options.physicalPeer }),
    ...(options.clientDistDir === undefined ? {} : { clientDistDir: options.clientDistDir }),
    ...(options.debugToken === undefined ? {} : { debugToken: options.debugToken }),
  };
}

// The logger is the process singleton the root hands over, so a root borrows its level and restores it on dispose.
function borrowLogLevel(level: ServerHarnessOptions["logLevel"]): Disposable {
  const previous = logger.level;
  if (level !== undefined) {
    logger.level = level;
  }
  return {
    [Symbol.dispose]: (): void => {
      logger.level = previous;
    },
  };
}

async function directoriesFor(
  rootDir: string,
  options: Pick<ServerHarnessOptions, "casDir" | "variantDir" | "importStagingDir">,
): Promise<
  Required<Pick<ServicesDeps, "casDir" | "variantDir" | "importStagingDir" | "importReportsDir" | "userRuntimeDir" | "stProfileDir" | "wireCaptureDir">> &
    Pick<ServerTestHarness, "modelCacheDir">
> {
  const paths = {
    casDir: options.casDir ?? join(rootDir, "cas"),
    variantDir: options.variantDir ?? join(rootDir, "variants"),
    importStagingDir: options.importStagingDir ?? join(rootDir, "import-staging"),
    importReportsDir: join(rootDir, "import-reports"),
    userRuntimeDir: join(rootDir, "user-runtime"),
    modelCacheDir: join(rootDir, "model-cache"),
    stProfileDir: join(rootDir, "st-profile"),
    wireCaptureDir: join(rootDir, "wire-capture"),
  };
  await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true })));
  return paths;
}

async function closeHarnessGraph(
  http: OwnedHttpRequests | undefined,
  oidc: Awaited<ReturnType<typeof createConfiguredOidc>> | undefined,
  app: ServicesResult | undefined,
  share: ShareGraph | undefined,
): Promise<void> {
  const shareSettled = await Promise.allSettled([share?.[Symbol.asyncDispose]()]);
  const settled = [
    ...shareSettled,
    ...(await Promise.allSettled([http?.[Symbol.asyncDispose](), oidc?.[Symbol.asyncDispose](), app?.[Symbol.asyncDispose]()])),
  ];
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
}

type HarnessConstruction = Pick<ServerTestHarness, "db" | "clock" | "idSource" | "timers"> & {
  readonly authConfig: NonNullable<ServerHarnessOptions["authConfig"]>;
  readonly rolePolicy: SessionsRolePolicy;
  readonly rootDir: string;
};

async function prepareHarnessOwner(
  options: ServerHarnessOptions | UnclaimedServerHarnessOptions,
  { db, clock, idSource, authConfig, rolePolicy }: Pick<HarnessConstruction, "db" | "clock" | "idSource" | "authConfig" | "rolePolicy">,
): Promise<UserId | undefined> {
  if (options.ownerId === null) {
    return;
  }
  const ownerId = options.ownerId ?? idSource.userId();
  if (options.ownerId === undefined) {
    await seedUser(
      db,
      {
        id: ownerId,
        handle: castId<Handle>(rolePolicy.ownerHandles()[0] ?? authConfig.defaultHandle),
        role: "owner",
        createdAt: clock.now(),
        updatedAt: clock.now(),
      },
      idSource,
    );
  }
  return ownerId;
}

async function configuredOidcFor(
  options: ServerHarnessOptions | UnclaimedServerHarnessOptions,
  app: ServicesResult,
  { db, authConfig, clock, timers, rootDir }: Omit<HarnessConstruction, "idSource" | "db"> & Pick<ServicesDeps, "db">,
): Promise<(Awaited<ReturnType<typeof createConfiguredOidc>> & { readonly ownerClaimFile: string }) | undefined> {
  if (authConfig.mode !== "oidc") {
    return;
  }
  await using construction = new AsyncDisposableStack();
  const { createConfiguredOidc: assembleOidc } = await import("@orb/server/entry/compose");
  const oidc = construction.use(
    await assembleOidc({
      db,
      now: clock.now,
      built: app,
      scheduleInterval: timers.interval,
      ...(options.oidc === undefined ? {} : { settings: options.oidc }),
    }),
  );
  const ownerClaimFile = join(rootDir, "owner-claim-url");
  await announceOwnerClaim({
    log: getLog(),
    sessions: app.sessions,
    ownerId: await app.sessions.getOwnerUserId(),
    ownerClaim: oidc.ownerClaim,
    redirectAllowlist: oidc.redirectAllowlist,
    claimUrlFile: ownerClaimFile,
    inContainer: false,
  });
  const lifetime = construction.move();
  return {
    ...oidc,
    ownerClaim: removeOwnerClaimFileOnSpend(oidc.ownerClaim, ownerClaimFile, app.newOpaqueId),
    ownerClaimFile,
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

function shareInputsFor(options: ServerHarnessOptions | UnclaimedServerHarnessOptions, inputs: HarnessConstruction, appPort: () => number): ShareGraphOptions {
  const bind = resolveBindPosture({
    nodeEnv: "test",
    authMode: inputs.authConfig.mode,
    bindHost: options.bindHost ?? "127.0.0.1",
    allowDevPublicBind: options.allowPublicBind ?? false,
    ownerPeersDeclared: false,
    inContainer: false,
  });
  if (bind.refusal !== null) {
    throw new Error(bind.refusal);
  }
  return {
    bind,
    appPort,
    relayDir: options.relayDir ?? join(inputs.rootDir, "relay"),
    secretsDir: options.secretsDir ?? join(inputs.rootDir, "secrets"),
    now: inputs.clock.now,
    timers: inputs.timers,
    relay: options.share?.relay ?? null,
    acme: options.share?.acme ?? null,
    networkExecution: { ...options.networkExecution, resolver: options.networkExecution?.resolver ?? refusingResolver },
  };
}

function workloadsFor(
  app: ServicesResult,
  execution: Parameters<typeof runWorkload>[0],
  shutdown: AbortSignal,
  startJobs: ServerHarnessOptions["startJobs"],
): Pick<ServerTestHarness, "runAdmittedWorkload" | "tickWorkloadSchedules"> {
  if (startJobs !== false) {
    app.startJobs();
    return {};
  }
  const runAdmittedWorkload: NonNullable<ServerTestHarness["runAdmittedWorkload"]> = async (id, signal) => {
    shutdown.throwIfAborted();
    signal.throwIfAborted();
    const completion = (async (): Promise<void> => {
      const row = await loadWorkload(execution.db, app.workloadContributions, id);
      if (row === null || row.poison) {
        throw new Error("The admitted workload has no runnable native row");
      }
      await runWorkload(execution, row, AbortSignal.any([signal, shutdown]));
    })();
    app.supervise(`server-harness-workload:${id}`, "workloads.run", { workloadId: id }, () => completion);
    await completion;
  };
  const tickWorkloadSchedulesOnce = async (): Promise<void> => {
    shutdown.throwIfAborted();
    await tickWorkloadSchedules({ db: execution.db, now: execution.now, start: app.services.workloads.start });
  };
  return { runAdmittedWorkload, tickWorkloadSchedules: tickWorkloadSchedulesOnce };
}

/** Build an owned in-process server graph; a supplied database remains its caller's resource. */
export function createServerHarness(options: UnclaimedServerHarnessOptions): Promise<UnclaimedServerTestHarness>;
export function createServerHarness(options?: ServerHarnessOptions): Promise<ServerTestHarness>;
export async function createServerHarness(
  options: ServerHarnessOptions | UnclaimedServerHarnessOptions = {},
): Promise<ServerTestHarness | UnclaimedServerTestHarness> {
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
  const rolePolicy = createSessionsRolePolicy(options.rolePolicyConfig ?? env);
  construction.use(borrowLogLevel(options.logLevel));
  let appLifetime: ServicesResult | undefined;
  let httpLifetime: OwnedHttpRequests | undefined;
  let oidcLifetime: Awaited<ReturnType<typeof createConfiguredOidc>> | undefined;
  let shareLifetime: ShareGraph | undefined;
  construction.defer(() => closeHarnessGraph(httpLifetime, oidcLifetime, appLifetime, shareLifetime));
  const { casDir, variantDir, importStagingDir, importReportsDir, userRuntimeDir, modelCacheDir, stProfileDir, wireCaptureDir } = await directoriesFor(
    rootDir,
    options,
  );
  const inputs: HarnessConstruction = { db, clock, idSource, timers, authConfig, rolePolicy, rootDir };
  const ownerId = await prepareHarnessOwner(options, inputs);
  const { createHttpApp: assembleHttp, createServices, createShareGraph, UNSUPERVISED_RESTART } = await import("@orb/server/entry/compose");
  const listener = createBinding<Readonly<AddressInfo>>("Share execution requires the server harness native listener");
  const shareInputs = shareInputsFor(options, inputs, () => listener.read().port);
  const { bind, relayDir, secretsDir } = shareInputs;
  const sharing = await createShareGraph(shareInputs);
  shareLifetime = sharing;
  const wiringDb = databaseHandle(db);
  const app = await createServices({
    authConfig,
    rolePolicy,
    db: wiringDb,
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
    importReportsDir,
    stProfileDir,
    userRuntimeDir,
    wireCaptureDir,
    serverRestart: UNSUPERVISED_RESTART,
    share: sharing.share,
    providerSeams: providerExecutionOf(options, modelCacheDir),
    pluginExecution: { spawn: options.pluginSpawn ?? refusingPluginSpawn, monotonicNow: clock.now },
    networkExecution: { ...options.networkExecution, resolver: options.networkExecution?.resolver ?? refusingResolver },
  });
  appLifetime = app;
  const manualWorkloadAbort = new AbortController();
  construction.defer(() => manualWorkloadAbort.abort());
  const workloadExecution = {
    db: wiringDb,
    now: clock.now,
    contributions: app.workloadContributions,
    audit: app.audit,
    emitEvent: app.workloadEvents.emitWorkloadEvent,
    scheduleInterval: timers.interval,
  } satisfies Parameters<typeof runWorkload>[0];
  const principalFor = createHostPrincipalResolver(app.sessions);
  const credentialsKeyOk = await app.services.credentials.probeKeyDecrypt();
  const configuredOidc = await configuredOidcFor(options, app, { ...inputs, db: wiringDb });
  oidcLifetime = configuredOidc;
  let closing = false;
  const httpApp = assembleHttp({
    built: app,
    ...httpOverridesOf(options),
    authConfig,
    db: wiringDb,
    importStagingDir,
    now: clock.now,
    casDir,
    sessionSecret: SESSION_SECRET,
    isShuttingDown: () => closing,
    credentialsKeyOk: () => credentialsKeyOk,
    inContainer: false,
    relayHosts: sharing.relayHosts,
    shareState: sharing.share.relay.status,
    oidcProviderName: "Harness identity provider",
    ...(oidcLifetime === undefined ? {} : { oidc: oidcLifetime }),
    onOwnerClaimed: () => {
      app.supervise("server-harness-owner-claim", "share.resumeAfterOwnerClaim", {}, async () => {
        getLog().info({ outcome: await app.services.share.resumeAfterOwnerClaim() }, "share owner claim settled");
      });
    },
  });
  // biome-ignore lint/nursery/useDisposables: httpLifetime owns this resource through closeHarnessGraph's share-first teardown; local disposal would close the returned harness.
  const http = createOwnedHttpRequests(httpApp, timers.timeout, bind.host);
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
  const workloadDriver = workloadsFor(app, workloadExecution, manualWorkloadAbort.signal, options.startJobs);
  const lifetime = construction.move();
  return Object.assign(new ComposedServerRoot(app, db, internalCallerFor, http), {
    clock,
    ids,
    idSource,
    timers,
    ...(ownerId === undefined ? {} : { ownerId }),
    ...(configuredOidc === undefined ? {} : { ownerClaimFile: configuredOidc.ownerClaimFile }),
    principalFor,
    actor,
    listen: async (): Promise<Readonly<AddressInfo>> => {
      const address = await http.listen();
      listener.bind(address);
      return address;
    },
    importStagingDir,
    modelCacheDir,
    relayDir,
    secretsDir,
    settleBackground: app.settleBackground,
    ...workloadDriver,
    workloadExecutionSignal: options.workloadExecutionSignal,
    settleSharing: sharing.settle,
    async [Symbol.asyncDispose](): Promise<void> {
      closing = true;
      await lifetime.disposeAsync();
    },
  });
}
