// The Node harness assembles the production graph once. Only clocks, business entropy, scheduling and
// external execution vary; identity, policy, persistence and accounting stay with their production owners.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { closeDb, users } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { AgentSdkNativeOptions, AgentSdkQuery, AgentSdkSpawn } from "@orb/inference";
import { createBinding } from "@orb/kit/binding";
import type { ExternalId, Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, createIdSource } from "@orb/kit/ids";
import type { SessionsRolePolicy, SessionsRolePolicyConfig } from "@orb/server/domain/sessions";
import { createSessionsRolePolicy } from "@orb/server/domain/sessions";
import type { ShareGraph, ShareGraphOptions } from "@orb/server/domain/share";
import { loadWorkload, runWorkload, tickWorkloadSchedules } from "@orb/server/domain/workloads";
import { authConfigFromEnv, createHostPrincipalResolver } from "@orb/server/entry/auth";
import type { BootOwner } from "@orb/server/entry/boot";
import { announceOwnerClaim, handOffBootOwnerSweeps, prepareBootOwner, removeOwnerClaimFileOnSpend } from "@orb/server/entry/boot";
import type { createConfiguredOidc, createHttpApp, ServicesDeps, ServicesResult } from "@orb/server/entry/compose";
import { env, resolveBindPosture } from "@orb/server/foundation/env";
import { getLog, logger } from "@orb/server/foundation/observability";
import { systemConnector, systemFetch } from "@orb/server/infra/network";
import { createCaller, createContext } from "@orb/server/transport/trpc";
import { eq } from "drizzle-orm";
import type { Clock } from "../iso/clock.ts";
import { createFrozenClock } from "../iso/clock.ts";
import type { SeededIds } from "../iso/ids.ts";
import { createSeededIds } from "../iso/ids.ts";
import type { ControlledTimers } from "../iso/timers.ts";
import { createControlledTimers } from "../iso/timers.ts";
import { freshDb } from "./db.ts";
import type { UserRow } from "./factories/rows.ts";
import type { OwnedHttpRequests } from "./http.ts";
import { createOwnedHttpRequests } from "./http.ts";

export interface ServerHarnessOptions
  extends Partial<
    Pick<ServicesDeps, "secretBoxKey" | "casDir" | "variantDir" | "importStagingDir" | "rpgTrace" | "wireCapture" | "wireCaptureReply" | "logLevel" | "holder">
  > {
  /** Scripted network seams; an omitted resolver refuses, an omitted fetch is the provider transport (services) or
   *  the real platform fetch behind the refusing resolver (sharing). */
  readonly networkExecution?: Partial<ServicesDeps["networkExecution"]> | undefined;
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

/** The account a claimed root mints: `sessions.ensureUser`, then the owner's audited admin verbs for each field. */
export interface ActorSpec {
  /** Defaults to a fresh seeded handle; an already-held handle is refused, never adopted. */
  readonly handle?: Handle;
  /** The owner is the bootstrap row; no verb mints a second one. */
  readonly role?: Exclude<UserRole, "owner">;
  readonly enabled?: boolean;
  /** Bound through `admin.linkSsoIdentity`. */
  readonly externalId?: ExternalId;
  /** Stored through `admin.resetPassword`, so the hash is the root's own peppered credential. */
  readonly password?: string;
}

/** An unclaimed root has no owner to run admin verbs, so its accounts arrive the way SSO users do: through
 *  `sessions.provisionIdentity`, with `enabled: false` as the pending-approval state. */
interface UnclaimedActorSpec extends Pick<ActorSpec, "handle" | "enabled" | "externalId"> {
  readonly email?: string;
}

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

export interface UnclaimedServerTestHarness extends ComposedServerRoot, Omit<ServerTestHarness, "ownerId" | "actor"> {
  readonly actor: (spec?: UnclaimedActorSpec) => Promise<UserRow>;
}

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
  readonly actor: (spec?: ActorSpec) => Promise<UserRow>;
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

/** The scripted network seams over a fallback fetch; an unscripted resolver always refuses. */
function networkExecutionOf(options: Pick<ServerHarnessOptions, "networkExecution">, fallbackFetch: typeof fetch): ServicesDeps["networkExecution"] {
  return { fetch: options.networkExecution?.fetch ?? fallbackFetch, resolver: options.networkExecution?.resolver ?? refusingResolver };
}

function providerExecutionOf(
  options: Pick<ServerHarnessOptions, "sdkQuery" | "sdkSpawn" | "sdkNative" | "modelKernelModule" | "allowRemoteModels" | "runtimeSpan">,
  modelCacheDir: string,
): NonNullable<ServicesDeps["providerSeams"]> {
  return {
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

// A second root on the same database is another replica only when it locks under its own holder tag.
function replicaOf(options: Pick<ServerHarnessOptions, "holder">): Pick<ServicesDeps, "holder"> {
  return options.holder === undefined ? {} : { holder: options.holder };
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

// Boot's own pre-assembly owner step, seeded in every auth mode. A supplied id names an owner an earlier root on the
// same database already seeded.
async function prepareHarnessOwner(
  options: ServerHarnessOptions | UnclaimedServerHarnessOptions,
  {
    db,
    wiringDb,
    clock,
    idSource,
    rolePolicy,
  }: Pick<HarnessConstruction, "db" | "clock" | "idSource" | "rolePolicy"> & { readonly wiringDb: ServicesDeps["db"] },
): Promise<Pick<BootOwner, "ownerId" | "ownersBoundBeforeAssembly">> {
  if (options.ownerId !== undefined) {
    return { ownerId: options.ownerId ?? undefined, ownersBoundBeforeAssembly: [] };
  }
  return await prepareBootOwner({ db, wiringDb, now: clock.now, idSource, rolePolicy, sessionSecret: SESSION_SECRET, ownerSeed: {} });
}

const ACTOR_HANDLE_PREFIX = "actor";

async function readActor(db: Db, userId: UserId): Promise<UserRow> {
  const row = await db.select().from(users).where(eq(users.id, userId)).get();
  if (row === undefined) {
    throw new Error("server harness: the production mint left no users row");
  }
  return row;
}

// Both mint verbs resolve an existing handle to its account, so an actor refuses a held handle instead of adopting it.
async function unheldHandle(db: Db, ids: SeededIds, requested: Handle | undefined): Promise<Handle> {
  const handle = requested ?? castId<Handle>(ids.next(ACTOR_HANDLE_PREFIX));
  const held = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).get();
  if (held !== undefined) {
    throw new Error(`server harness: actor handle "${handle}" is already held by ${held.id}`);
  }
  return handle;
}

interface ActorMint {
  readonly app: ServicesResult;
  readonly db: Db;
  readonly ids: SeededIds;
}

function claimedActor({ app, db, ids }: ActorMint, ownerId: UserId, principalFor: ServerTestHarness["principalFor"]): ServerTestHarness["actor"] {
  return async (spec = {}) => {
    const userId = await app.sessions.ensureUser(await unheldHandle(db, ids, spec.handle));
    const principal = await principalFor(ownerId);
    const { admin } = app.services;
    if (spec.externalId !== undefined) {
      await admin.linkSsoIdentity({ principal, userId, externalId: spec.externalId });
    }
    if (spec.role !== undefined && spec.role !== (await readActor(db, userId)).role) {
      await admin.setRole({ principal, userId, role: spec.role });
    }
    if (spec.enabled === false) {
      await admin.setEnabled({ principal, userId, enabled: false });
    }
    if (spec.password !== undefined) {
      await admin.resetPassword({ principal, userId, password: spec.password });
    }
    return await readActor(db, userId);
  };
}

function unclaimedActor({ app, db, ids }: ActorMint): UnclaimedServerTestHarness["actor"] {
  return async (spec = {}) => {
    const handle = await unheldHandle(db, ids, spec.handle);
    const provisioned = await app.sessions.provisionIdentity(
      { externalId: spec.externalId ?? null, handle, groups: [], email: spec.email ?? null },
      { ownerClaimProven: false, requireApproval: spec.enabled === false },
    );
    if (provisioned.outcome !== "provisioned") {
      throw new Error(`server harness: provisionIdentity refused the actor (${provisioned.reason ?? "denied"})`);
    }
    return await readActor(db, provisioned.userId);
  };
}

// ensureUser and provisionIdentity both resolve an existing handle to its account and no constraint refuses the
// second caller, so the held-handle check is only sound when one root's mints never interleave.
function serialMints<Spec>(mint: (spec?: Spec) => Promise<UserRow>): (spec?: Spec) => Promise<UserRow> {
  let tail: Promise<unknown> = Promise.resolve();
  return (spec) => {
    const run = tail.then(() => mint(spec));
    // The chain only orders mints; each caller still receives its own rejection through `run`.
    tail = run.catch(() => undefined);
    return run;
  };
}

function actorFor(
  mint: ActorMint,
  ownerId: UserId | undefined,
  principalFor: ServerTestHarness["principalFor"],
): ServerTestHarness["actor"] | UnclaimedServerTestHarness["actor"] {
  return ownerId === undefined ? serialMints(unclaimedActor(mint)) : serialMints(claimedActor(mint, ownerId, principalFor));
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
    // The harness keeps the physical dial real; the refusing resolver is what keeps names off the network.
    buildConnector: systemConnector,
    relay: options.share?.relay ?? null,
    acme: options.share?.acme ?? null,
    // Sharing's egress keeps the platform fetch behind the refusing resolver, so an unscripted name never resolves.
    networkExecution: networkExecutionOf(options, systemFetch),
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
  const { createHttpApp: assembleHttp, createServices, createShareGraph, UNSUPERVISED_RESTART } = await import("@orb/server/entry/compose");
  const wiringDb = databaseHandle(db);
  const harnessOwner = await prepareHarnessOwner(options, { ...inputs, wiringDb });
  const { ownerId } = harnessOwner;
  const listener = createBinding<Readonly<AddressInfo>>("Share execution requires the server harness native listener");
  const shareInputs = shareInputsFor(options, inputs, () => listener.read().port);
  const { bind, relayDir, secretsDir } = shareInputs;
  const sharing = await createShareGraph(shareInputs);
  shareLifetime = sharing;
  const app = await createServices({
    authConfig,
    rolePolicy,
    db: wiringDb,
    now: clock.now,
    timers,
    buildConnector: systemConnector,
    idSource,
    newOpaqueId: ids.uuid,
    random,
    randomInt: (max) => Math.floor(random() * max),
    ownerId,
    secretBoxKey: options.secretBoxKey ?? null,
    ...observerSettingsOf(options),
    ...replicaOf(options),
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
    pluginExecution: { spawn: options.pluginSpawn ?? refusingPluginSpawn },
    monotonicNow: clock.now,
    networkExecution: networkExecutionOf(options, options.providerFetch ?? refusingProviderFetch()),
  });
  appLifetime = app;
  handOffBootOwnerSweeps(harnessOwner, app.detachEmbedReindex);
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
  const actor = actorFor({ app, db, ids }, ownerId, principalFor);
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
