// The Node harness assembles the production graph once. Only clocks, business entropy, scheduling and
// external execution vary; identity, policy, persistence and accounting stay with their production owners.
// A root binds a public interface only with `allowPublicBind: true`: a production record binds every interface.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execPath } from "node:process";
import type { AuthMode, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { closeDb } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { AgentSdkNativeOptions, AgentSdkQuery, AgentSdkSpawn } from "@orb/inference";
import { createBinding } from "@orb/kit/binding";
import type { ExternalId, Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, createIdSource } from "@orb/kit/ids";
import { isAdmin } from "@orb/server/domain/admin";
import { stagedOwnerRoot } from "@orb/server/domain/import";
import type { SessionsRolePolicy } from "@orb/server/domain/sessions";
import { createSessionsRolePolicy } from "@orb/server/domain/sessions";
import type { ShareGraph, ShareGraphOptions } from "@orb/server/domain/share";
import { loadWorkload, runWorkload, tickWorkloadSchedules } from "@orb/server/domain/workloads";
import { authConfigFromEnv, createHostPrincipalResolver } from "@orb/server/entry/auth";
import type { BootOwner } from "@orb/server/entry/boot";
import { announceOwnerClaim, handOffBootOwnerSweeps, prepareBootOwner, removeOwnerClaimFileOnSpend } from "@orb/server/entry/boot";
import type { createConfiguredOidc, createHttpApp, ServicesDeps, ServicesResult } from "@orb/server/entry/compose";
import { OWNER_CLAIM_URL_FILE_NAME } from "@orb/server/foundation/data-layout";
import type { Env } from "@orb/server/foundation/env";
import { bindPostureInput, resolveBindPosture } from "@orb/server/foundation/env";
import { createLogger, getLog, logger } from "@orb/server/foundation/observability";
import { systemConnector, systemFetch } from "@orb/server/infra/network";
import { appRouter, createCaller, createContext } from "@orb/server/transport/trpc";
import type { Clock } from "../iso/clock.ts";
import { createFrozenClock } from "../iso/clock.ts";
import type { SeededIds } from "../iso/ids.ts";
import { createSeededIds } from "../iso/ids.ts";
import type { ControlledTimers } from "../iso/timers.ts";
import { createControlledTimers } from "../iso/timers.ts";
import { freshDb } from "./db.ts";
import type { EnvSeamOptions, RawEnvInput } from "./env-seams.ts";
import { harnessEnv } from "./env-seams.ts";
import type { OwnedHttpRequests } from "./http.ts";
import { createOwnedHttpRequests } from "./http.ts";
import { processObservability } from "./observed.ts";

type AuthConfig = ReturnType<typeof authConfigFromEnv>;

/** The root's options. Every env key reaches the record through its {@link ENV_SEAMS} row: the named options in
 *  {@link EnvSeamOptions}, or `env` for a raw row. */
export interface ServerHarnessOptions extends EnvSeamOptions, Partial<Pick<ServicesDeps, "secretBoxKey" | "variantDir" | "holder" | "showcaseBundles">> {
  /** Raw values for the raw rows, parsed with the rest of the record by the production parse, so a value production
   *  refuses is refused here. */
  readonly env?: RawEnvInput;
  /** Scripted network seams; an omitted resolver refuses, an omitted fetch is the provider transport (services) or
   *  the real platform fetch behind the refusing resolver (sharing). */
  readonly networkExecution?: Partial<ServicesDeps["networkExecution"]> | undefined;
  readonly share?: Pick<ShareGraphOptions, "relay" | "acme">;
  readonly relayDir?: string;
  readonly secretsDir?: string;
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
  /** Fields laid over the record's `authConfigFromEnv`, only for a pairing the env parse refuses, such as `single-user`
   *  with `deny`. Every reader of the record still sees the record's posture, so an accepted pairing goes in `env`. */
  readonly authConfig?: Partial<AuthConfig>;
  readonly physicalPeer?: Parameters<typeof createHttpApp>[0]["physicalPeer"];
  readonly ownerId?: UserId;
  readonly providerFetch?: typeof fetch;
  readonly sdkQuery?: AgentSdkQuery;
  readonly sdkSpawn?: AgentSdkSpawn;
  readonly sdkNative?: AgentSdkNativeOptions;
  readonly runtimeSpan?: NonNullable<ServicesDeps["providerSeams"]>["span"];
  readonly modelKernelModule?: NonNullable<NonNullable<ServicesDeps["providerSeams"]>["localLight"]>["kernelModule"];
  readonly allowRemoteModels?: NonNullable<NonNullable<ServicesDeps["providerSeams"]>["localLight"]>["allowRemoteModels"];
  /** The production sessions crypto both the boot-owner step and the graph receive; a test passes one to spy on it. */
  readonly sessionsCrypto?: ServicesDeps["sessionsCrypto"];
}

/** Raw env keys whose record composes `mode`. */
export type AuthModeEnv<Mode extends AuthMode> = NonNullable<ServerHarnessOptions["env"]> & { readonly ["AUTH_MODE"]: Mode };

/** Only `oidc` boots with no owner, so an unclaimed root states that mode in its record or, for a pairing the parse
 *  refuses, in its overlay. */
export type UnclaimedServerHarnessOptions = Omit<ServerHarnessOptions, "ownerId" | "authConfig" | "env"> & { readonly ownerId: null } & (
    | { readonly env: AuthModeEnv<"oidc">; readonly authConfig?: Partial<AuthConfig> }
    | { readonly env?: RawEnvInput; readonly authConfig: Partial<AuthConfig> & { readonly mode: "oidc" } }
  );

// What an actor mint hands back: the account's id and handle, never a stored users row (Spine-Testing §9).
interface ActorAccount {
  readonly id: UserId;
  readonly handle: Handle;
}

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
  readonly actor: (spec?: UnclaimedActorSpec) => Promise<ActorAccount>;
}

export interface ServerTestHarness extends ComposedServerRoot, AsyncDisposable {
  readonly app: ServicesResult;
  readonly services: ServicesResult["services"];
  readonly db: Db;
  /** The env record this root parsed and composed with. */
  readonly env: Env;
  readonly clock: Clock;
  readonly ids: SeededIds;
  readonly idSource: ReturnType<typeof createIdSource>;
  readonly timers: Omit<ControlledTimers, keyof Disposable>;
  readonly ownerId: UserId;
  readonly principalFor: ReturnType<typeof createHostPrincipalResolver>;
  /** Internal row-derived tRPC calls, not request authentication; HTTP owns cookie/session admission proof. */
  readonly internalCallerFor: (userId: UserId | null) => Promise<ReturnType<typeof createCaller>>;
  readonly actor: (spec?: ActorSpec) => Promise<ActorAccount>;
  readonly http: Pick<OwnedHttpRequests, "request" | "routes">;
  readonly listen: () => Promise<Readonly<AddressInfo>>;
  readonly importStagingDir: string;
  /** Where the import routes stage one account's uploads under {@link ServerTestHarness.importStagingDir}. */
  readonly stagedImportsOf: (userId: UserId) => string;
  /** Every procedure path the root's `/api/trpc` mount serves. */
  readonly trpcProcedures: ReadonlySet<string>;
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

/** The credentials key every kit root shares; a root that needs a second distinct key owns it locally. */
export const SECRET_BOX_TEST_KEY = Buffer.alloc(32, 1);
const SESSION_SECRET = "server-harness-session-secret-at-least-32-chars";
const IN_PROCESS_CLIENT_IP = "127.0.0.1";

// A root's agent child env is fixed, not the developer's shell: the only host fact a native child needs is the
// directory of the node binary this run executes, so `node` resolves to the same runtime.
const noHostEnv: ServicesDeps["hostEnvAllowlist"] = () => ({ ["PATH"]: dirname(execPath) });

// The root's record is its whole environment, so a record that sets AUTH_MODE is the environment that supplied it.
function authModeSourceOf(options: Pick<ServerHarnessOptions, "env">): ServicesDeps["authModeSource"] {
  return options.env?.["AUTH_MODE"] === undefined ? "default" : "process-env";
}

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

// The local-light cache stays the record's `LOCAL_LIGHT_CACHE_DIR`, which compose reads itself.
function providerExecutionOf(
  options: Pick<ServerHarnessOptions, "sdkQuery" | "sdkSpawn" | "sdkNative" | "modelKernelModule" | "allowRemoteModels" | "runtimeSpan">,
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
      allowRemoteModels: options.allowRemoteModels ?? false,
      kernelModule: options.modelKernelModule ?? new URL("./refuse-model-kernel.ts", import.meta.url).href,
    },
  };
}

// A second root on the same database is another replica only when it locks under its own holder tag.
function replicaOf(options: Pick<ServerHarnessOptions, "holder">): Pick<ServicesDeps, "holder"> {
  return options.holder === undefined ? {} : { holder: options.holder };
}

function httpOverridesOf(options: Pick<ServerHarnessOptions, "physicalPeer">): Pick<Parameters<typeof createHttpApp>[0], "physicalPeer"> {
  return options.physicalPeer === undefined ? {} : { physicalPeer: options.physicalPeer };
}

// The graph writes through the root's own logger, but sites item 1271 has not moved yet still write the process
// logger, so a root borrows that one's level too and restores it on dispose.
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

// The record's data slots, as boot hands them to compose; compose reads the users, reports and wire-capture slots
// from the record itself. Each directory exists before the graph starts.
async function directoriesFor(
  env: Env,
  options: Pick<ServerHarnessOptions, "variantDir">,
): Promise<Pick<ServicesDeps, "casDir" | "variantDir" | "importStagingDir" | "stProfileDir"> & Pick<ServerTestHarness, "modelCacheDir">> {
  const paths = {
    casDir: env.ASSETS_DIR,
    variantDir: options.variantDir ?? env.DATA_LAYOUT.variants,
    importStagingDir: env.IMPORT_STAGING_DIR,
    modelCacheDir: env.LOCAL_LIGHT_CACHE_DIR,
    ...(env.ST_PROFILE_DIR === undefined ? {} : { stProfileDir: env.ST_PROFILE_DIR }),
  };
  const composeOwned = [env.USER_RUNTIME_DIR, env.DATA_LAYOUT.reports, env.DATA_LAYOUT.wireCapture, env.DATA_LAYOUT.secrets];
  await Promise.all([...Object.values(paths), ...composeOwned].map((path) => mkdir(path, { recursive: true })));
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

type HarnessConstruction = Pick<ServerTestHarness, "db" | "env" | "clock" | "idSource" | "timers"> & {
  readonly authConfig: AuthConfig;
  readonly rolePolicy: SessionsRolePolicy;
};

// Boot's own pre-assembly owner step, seeded in every auth mode. A supplied id names an owner an earlier root on the
// same database already seeded.
async function prepareHarnessOwner(
  options: ServerHarnessOptions | UnclaimedServerHarnessOptions,
  {
    wiringDb,
    clock,
    idSource,
    rolePolicy,
    sessionsCrypto,
  }: Pick<HarnessConstruction, "clock" | "idSource" | "rolePolicy"> & Pick<ServicesDeps, "sessionsCrypto"> & { readonly wiringDb: ServicesDeps["db"] },
): Promise<Pick<BootOwner, "ownerId" | "ownersBoundBeforeAssembly">> {
  if (options.ownerId !== undefined) {
    return { ownerId: options.ownerId ?? undefined, ownersBoundBeforeAssembly: [] };
  }
  return await prepareBootOwner({ db: wiringDb, now: clock.now, idSource, rolePolicy, sessionSecret: SESSION_SECRET, sessionsCrypto, ownerSeed: {} });
}

const ACTOR_HANDLE_PREFIX = "actor";

// Both mint verbs resolve an existing handle to its account, so an actor refuses a held handle instead of adopting it.
async function unheldHandle(app: ServicesResult, ids: SeededIds, requested: Handle | undefined): Promise<Handle> {
  const handle = requested ?? castId<Handle>(ids.next(ACTOR_HANDLE_PREFIX));
  const held = await app.sessions.resolveHandle(handle);
  if (held !== null) {
    throw new Error(`server harness: actor handle "${handle}" is already held by ${held}`);
  }
  return handle;
}

interface ActorMint {
  readonly app: ServicesResult;
  readonly ids: SeededIds;
}

function claimedActor({ app, ids }: ActorMint, ownerId: UserId, principalFor: ServerTestHarness["principalFor"]): ServerTestHarness["actor"] {
  return async (spec = {}) => {
    const handle = await unheldHandle(app, ids, spec.handle);
    const userId = await app.sessions.ensureUser(handle);
    const principal = await principalFor(ownerId);
    const { admin } = app.services;
    if (spec.externalId !== undefined) {
      await admin.linkSsoIdentity({ principal, userId, externalId: spec.externalId });
    }
    // The role policy may already have minted the requested role; the actor's own principal says which it holds.
    if (spec.role !== undefined && (spec.role === "admin") !== isAdmin(await principalFor(userId))) {
      await admin.setRole({ principal, userId, role: spec.role });
    }
    if (spec.enabled === false) {
      await admin.setEnabled({ principal, userId, enabled: false });
    }
    if (spec.password !== undefined) {
      await admin.resetPassword({ principal, userId, password: spec.password });
    }
    return { id: userId, handle };
  };
}

function unclaimedActor({ app, ids }: ActorMint): UnclaimedServerTestHarness["actor"] {
  return async (spec = {}) => {
    const handle = await unheldHandle(app, ids, spec.handle);
    const provisioned = await app.sessions.provisionIdentity(
      { externalId: spec.externalId ?? null, handle, groups: [], email: spec.email ?? null },
      { ownerClaimProven: false, requireApproval: spec.enabled === false },
    );
    if (provisioned.outcome !== "provisioned") {
      throw new Error(`server harness: provisionIdentity refused the actor (${provisioned.reason ?? "denied"})`);
    }
    return { id: provisioned.userId, handle };
  };
}

// ensureUser and provisionIdentity both resolve an existing handle to its account and no constraint refuses the
// second caller, so the held-handle check is only sound when one root's mints never interleave.
function serialMints<Spec>(mint: (spec?: Spec) => Promise<ActorAccount>): (spec?: Spec) => Promise<ActorAccount> {
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
  app: ServicesResult,
  {
    db,
    env,
    authConfig,
    clock,
    timers,
    secretsDir,
  }: Omit<HarnessConstruction, "idSource" | "db"> & Pick<ServicesDeps, "db"> & Pick<ShareGraphOptions, "secretsDir">,
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
      settings: env,
    }),
  );
  // Boot writes the claim beside the root's other secrets, so it follows a caller's `secretsDir` as sharing does.
  const ownerClaimFile = join(secretsDir, OWNER_CLAIM_URL_FILE_NAME);
  await announceOwnerClaim({
    log: getLog(),
    sessions: app.sessions,
    ownerId: await app.sessions.getOwnerUserId(),
    ownerClaim: oidc.ownerClaim,
    redirectAllowlist: oidc.redirectAllowlist,
    claimUrlFile: ownerClaimFile,
    inContainer: bindPostureInput(env).inContainer,
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
  // Boot's own bind input over the root's record; the parse already refused every refused bind, so this posture
  // carries none.
  const bind = resolveBindPosture(bindPostureInput(inputs.env));
  // Production binds every interface by design, which a test root on a dev box must never do by accident.
  if (bind.publicBind && options.allowPublicBind !== true) {
    throw new Error(
      `server harness: this record binds ${bind.host ?? "every interface"} publicly; pass allowPublicBind: true for a root that must listen there`,
    );
  }
  return {
    bind,
    appPort,
    relayDir: options.relayDir ?? inputs.env.DATA_LAYOUT.relay,
    secretsDir: options.secretsDir ?? inputs.env.DATA_LAYOUT.secrets,
    now: inputs.clock.now,
    timers: inputs.timers,
    // The harness keeps the physical dial real; the refusing resolver is what keeps names off the network.
    buildConnector: systemConnector,
    relay: options.share?.relay ?? null,
    acme: options.share?.acme ?? null,
    // Sharing's egress keeps the platform fetch behind the refusing resolver, so an unscripted name never resolves.
    networkExecution: networkExecutionOf(options, systemFetch),
    env: inputs.env,
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

type ConfiguredOidc = Awaited<ReturnType<typeof createConfiguredOidc>>;

/** Assemble the production OIDC owner over a built root with `settings`, as boot does for an `oidc` record; the
 *  caller disposes it. A root in another mode reaches the OIDC routes' owners this way. */
export async function configureOidc(
  root: Pick<ServerTestHarness, "db" | "app" | "clock" | "timers">,
  settings: Parameters<typeof createConfiguredOidc>[0]["settings"],
): Promise<ConfiguredOidc> {
  const { createConfiguredOidc: assembleOidc } = await import("@orb/server/entry/compose");
  return await assembleOidc({ db: databaseHandle(root.db), built: root.app, now: root.clock.now, settings, scheduleInterval: root.timers.interval });
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
  const env = harnessEnv(options, { rootDir });
  const authConfig: AuthConfig = { ...authConfigFromEnv(env), ...options.authConfig };
  const rolePolicy = createSessionsRolePolicy(env);
  construction.use(processObservability.openRoot());
  construction.use(borrowLogLevel(options.logLevel));
  let appLifetime: ServicesResult | undefined;
  let httpLifetime: OwnedHttpRequests | undefined;
  let oidcLifetime: Awaited<ReturnType<typeof createConfiguredOidc>> | undefined;
  let shareLifetime: ShareGraph | undefined;
  construction.defer(() => closeHarnessGraph(httpLifetime, oidcLifetime, appLifetime, shareLifetime));
  const { modelCacheDir, ...dataSlots } = await directoriesFor(env, options);
  const inputs: HarnessConstruction = { db, env, clock, idSource, timers, authConfig, rolePolicy };
  const { createHttpApp: assembleHttp, createServices, createShareGraph, SessionsCrypto, UNSUPERVISED_RESTART } = await import("@orb/server/entry/compose");
  const wiringDb = databaseHandle(db);
  const sessionsCrypto = options.sessionsCrypto ?? SessionsCrypto.production();
  const harnessOwner = await prepareHarnessOwner(options, { ...inputs, wiringDb, sessionsCrypto });
  const { ownerId } = harnessOwner;
  const listener = createBinding<Readonly<AddressInfo>>("Share execution requires the server harness native listener");
  const shareInputs = shareInputsFor(options, inputs, () => listener.read().port);
  const { bind, relayDir, secretsDir } = shareInputs;
  const sharing = await createShareGraph(shareInputs);
  shareLifetime = sharing;
  const app = await createServices({
    env,
    logger: createLogger(env.LOG_LEVEL),
    hostEnvAllowlist: noHostEnv,
    authModeSource: authModeSourceOf(options),
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
    ...replicaOf(options),
    ...(options.showcaseBundles === undefined ? {} : { showcaseBundles: options.showcaseBundles }),
    sessionSecret: SESSION_SECRET,
    sessionsCrypto,
    ...dataSlots,
    serverRestart: UNSUPERVISED_RESTART,
    share: sharing.share,
    providerSeams: providerExecutionOf(options),
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
  const configuredOidc = await configuredOidcFor(app, { ...inputs, db: wiringDb, secretsDir });
  oidcLifetime = configuredOidc;
  let closing = false;
  const httpApp = assembleHttp({
    built: app,
    env,
    ...httpOverridesOf(options),
    authConfig,
    db: wiringDb,
    importStagingDir: env.IMPORT_STAGING_DIR,
    now: clock.now,
    casDir: env.ASSETS_DIR,
    sessionSecret: SESSION_SECRET,
    isShuttingDown: () => closing,
    credentialsKeyOk: () => credentialsKeyOk,
    inContainer: bindPostureInput(env).inContainer,
    relayHosts: sharing.relayHosts,
    shareState: sharing.share.relay.status,
    oidcProviderName: env.OIDC_PROVIDER_NAME,
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
        bugReportDiagnostics: app.bugReportDiagnostics,
      }),
    );
  const actor = actorFor({ app, ids }, ownerId, principalFor);
  const workloadDriver = workloadsFor(app, workloadExecution, manualWorkloadAbort.signal, options.startJobs);
  const lifetime = construction.move();
  return Object.assign(new ComposedServerRoot(app, db, internalCallerFor, http), {
    env,
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
    importStagingDir: env.IMPORT_STAGING_DIR,
    stagedImportsOf: (userId: UserId): string => stagedOwnerRoot(env.IMPORT_STAGING_DIR, userId),
    trpcProcedures: new Set(Object.keys(appRouter._def.procedures)),
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
