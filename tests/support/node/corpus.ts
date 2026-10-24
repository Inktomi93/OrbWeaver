// Capsules own disposable persisted graphs. Private intake preserves the source and remains Node-local;
// only fresh synthetic captures may enter portable publication.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import { ACTIVE_WORKLOAD_STATUSES } from "@orb/contracts/workloads";
import { localPath, pendingTurns, workloads } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { DataLayout } from "@orb/server/foundation/data-layout";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { count, inArray } from "drizzle-orm";
import { z } from "zod";
import { createFrozenClock } from "../iso/clock.ts";
import type { CorpusWire } from "../iso/corpus.ts";
import { encodeCorpusWire, hydrateCorpusWire, parseCorpusWire, serializeCorpusWire } from "../iso/corpus.ts";
import { createSeededIds, SEEDED_ID_MAX_CURSOR } from "../iso/ids.ts";
import type { seedCorpusChatLifecycle as produceCorpusChatLifecycle } from "./corpus-chat-lifecycle.ts";
import type { seedCorpusConnection as produceCorpusConnection } from "./corpus-connection.ts";
import type { seedCorpusImageVariants as produceCorpusImageVariants } from "./corpus-image-variants.ts";
import type { seedCorpusImagery as produceCorpusImagery } from "./corpus-imagery.ts";
import type { seedCorpusKnowledge as produceCorpusKnowledge } from "./corpus-knowledge.ts";
import type { seedCorpusKnowledgeVariants as produceCorpusKnowledgeVariants } from "./corpus-knowledge-variants.ts";
import type { seedCorpusLibraryViews as produceCorpusLibraryViews } from "./corpus-library-views.ts";
import type { seedCorpusNotifications as produceCorpusNotifications } from "./corpus-notifications.ts";
import type { seedCorpusPlugins as produceCorpusPlugins } from "./corpus-plugin.ts";
import type { seedCorpusRpg as produceCorpusRpg } from "./corpus-rpg.ts";
import type { seedCorpusRpgMembers as produceCorpusRpgMembers } from "./corpus-rpg-members.ts";
import type { seedCorpusRpgProvider as produceCorpusRpgProvider } from "./corpus-rpg-provider.ts";
import type { seedCorpusRpgRecursion as produceCorpusRpgRecursion } from "./corpus-rpg-recursion.ts";
import type { seedCorpusRpgRounds as produceCorpusRpgRounds } from "./corpus-rpg-rounds.ts";
import type { seedCorpusSdkSessions as produceCorpusSdkSessions } from "./corpus-sdk-sessions.ts";
import type {
  seedCorpusSearch as produceCorpusSearch,
  captureCorpusSearchPublication as produceSearchPublication,
  settleCorpusSearchImages,
} from "./corpus-search.ts";
import type { replayCorpusSearchWire } from "./corpus-search-wire.ts";
import type {
  captureCookieAuth as produceCookieAuth,
  seedCorpusAutomation as produceCorpusAutomation,
  seedCorpusLibraries as produceCorpusLibraries,
  seedOidcCorpus as produceOidcCorpus,
  seedSyntheticCorpus as produceSyntheticCorpus,
  SeedSyntheticCorpusOptions,
} from "./corpus-seed.ts";
import type { seedCorpusStatsSettings as produceCorpusStatsSettings } from "./corpus-stats-settings.ts";
import type { seedUserCredentialRows as produceCredential } from "./factories/rows/credentials.ts";
import type { seedRecallCorpusRows as produceRecallCorpus } from "./factories/rows/recall.ts";
import type { seedStatsRows as produceSearchStats } from "./factories/rows/stats.ts";
import type { AuthModeEnv, ServerHarnessOptions, ServerTestHarness } from "./server.ts";

const CORPUS_WIRE_FILE = "corpus.json";
const CORPUS_REPLAY_FILE = "replay.json";
const CORPUS_PRIVATE_FILE = ".private-corpus.json";
const CORPUS_PRIVATE_FAILURE_FILE = "failure.txt";
const PRIVATE_PERMISSION_MODULUS = 0o100;
const SHARED_MEMBER_PASSWORD = "synthetic-corpus-shared-member-password";

const corpusReplaySchema = z.strictObject({ version: z.literal(1), nowMs: z.int().nonnegative(), idCursor: z.int().min(0).max(SEEDED_ID_MAX_CURSOR) });
type CorpusReplayState = z.output<typeof corpusReplaySchema>;

/** What private-corpus admission reads from the host. Absent means the live process; a test passes values instead of mutating it. */
export interface CorpusAdmissionHost {
  readonly environment?: NodeJS.ProcessEnv | undefined;
  readonly temporaryDirectory?: string | undefined;
}

export interface CorpusCapsuleOptions {
  readonly directory: string;
  readonly server: Omit<
    ServerHarnessOptions,
    "db" | "ownerId" | "physicalPeer" | "authConfig" | "env" | "casDir" | "variantDir" | "importStagingDir" | "timers" | "oidc" | "random"
  > & {
    /** The capsule's record posture: a `local` box, which the owner's oidc claim root and the private root restate. */
    readonly env: AuthModeEnv<"local">;
    readonly pluginSpawn: NonNullable<ServerHarnessOptions["pluginSpawn"]>;
  };
  readonly seed: SeedSyntheticCorpusOptions;
  readonly privateCredential: Omit<Parameters<typeof produceCredential>[1], "principal">;
}

interface CorpusPrivateCaptures {
  readonly publicationSecrets: readonly string[];
  readonly searchPublication: Awaited<ReturnType<typeof produceSearchPublication>>;
  readonly searchPhysical: Parameters<typeof replayCorpusSearchWire>[0];
  readonly searchImageJobs: Awaited<ReturnType<typeof settleCorpusSearchImages>>;
  readonly postSearchStats: Awaited<ReturnType<typeof produceSearchStats>>;
  readonly sharedMemberAuthentication: Awaited<ReturnType<typeof produceCookieAuth>>;
  readonly imageVariants: Awaited<ReturnType<typeof produceCorpusImageVariants>>;
  readonly notifications: Awaited<ReturnType<typeof produceCorpusNotifications>>;
  readonly sdkSessions: Awaited<ReturnType<typeof produceCorpusSdkSessions>>;
  readonly statsSettings: Awaited<ReturnType<typeof produceCorpusStatsSettings>>;
  readonly libraryViews: Awaited<ReturnType<typeof produceCorpusLibraryViews>>;
  readonly connection: Awaited<ReturnType<typeof produceCorpusConnection>>;
  readonly search: Awaited<ReturnType<typeof produceCorpusSearch>>;
  readonly rpgRecursion: Awaited<ReturnType<typeof produceCorpusRpgRecursion>>;
  readonly rpgMembers: Awaited<ReturnType<typeof produceCorpusRpgMembers>>;
  readonly rpgRounds: Awaited<ReturnType<typeof produceCorpusRpgRounds>>;
  readonly chatLifecycle: Awaited<ReturnType<typeof produceCorpusChatLifecycle>>;
  readonly imagery: Awaited<ReturnType<typeof produceCorpusImagery>>;
  readonly knowledgeVariants: Awaited<ReturnType<typeof produceCorpusKnowledgeVariants>>;
  readonly rpgProvider: Awaited<ReturnType<typeof produceCorpusRpgProvider>>;
  readonly rpg: Awaited<ReturnType<typeof produceCorpusRpg>>;
  readonly knowledge: Awaited<ReturnType<typeof produceCorpusKnowledge>>;
  readonly plugins: Awaited<ReturnType<typeof produceCorpusPlugins>>;
  readonly automation: Awaited<ReturnType<typeof produceCorpusAutomation>>;
  readonly oidc: Awaited<ReturnType<typeof produceOidcCorpus>>;
  readonly credential: Awaited<ReturnType<typeof produceCredential>>;
  readonly baseline: Awaited<ReturnType<typeof produceSyntheticCorpus>>;
  readonly recall: Awaited<ReturnType<typeof produceRecallCorpus>>;
  readonly libraries: Awaited<ReturnType<typeof produceCorpusLibraries>>;
}

export interface CorpusCapsule extends AsyncDisposable {
  readonly layout: DataLayout;
  readonly wire: CorpusWire;
  readonly privateCaptures: CorpusPrivateCaptures;
  readonly publishWire: () => string;
  readonly replay: CorpusReplayState;
}

/** The producers a clone-boundary capsule runs; every other corpus section stays with its own producer suite. */
type CloneBoundaryCaptures = Pick<CorpusPrivateCaptures, "publicationSecrets" | "oidc" | "credential" | "baseline" | "libraries" | "chatLifecycle">;

/** A capsule holding only what its clone boundary needs: messages, a released lock, a credential, a session and a CAS asset. */
export interface CloneBoundaryCorpusCapsule extends Omit<CorpusCapsule, "privateCaptures"> {
  readonly privateCaptures: CloneBoundaryCaptures;
}

export interface PrivateCorpusCapsule extends Omit<CorpusCapsule, "privateCaptures"> {
  readonly privateParent: string;
}

export interface CorpusFixture {
  readonly layout: DataLayout;
  readonly wire: CorpusWire;
  readonly replay?: CorpusReplayState;
  readonly privateParent?: string;
}

export interface PreparedCorpusFixture extends CorpusFixture, AsyncDisposable {}

export interface CorpusServerHarness extends ServerTestHarness {
  readonly corpus: PreparedCorpusFixture;
}

/** A resumed corpus root's record posture; a caller's `env` keys lay over it. */
const CORPUS_RECORD_POSTURE = { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } as const satisfies AuthModeEnv<"local">;

// The retained owner's handle is the fallback placeholder, while the owner policy stays the default record's.
async function retainedOwnerPolicy(handle: string): Promise<NonNullable<ServerHarnessOptions["rolePolicyConfig"]>> {
  const { createTestEnv } = await import("./env.ts");
  return { ["DEFAULT_USER_HANDLE"]: handle, ["OWNER_HANDLES"]: createTestEnv().DEFAULT_USER_HANDLE };
}

export type CorpusHarnessOptions = Omit<
  ServerHarnessOptions,
  "db" | "clock" | "ids" | "timers" | "ownerId" | "casDir" | "variantDir" | "importStagingDir" | "temporaryParentDir" | "relayDir" | "secretsDir" | "random"
>;

/** Resume a publication through the existing graph, joining it before closing and deleting its independent clone. */
export async function createCorpusHarness(directory?: string, options: CorpusHarnessOptions = {}): Promise<CorpusServerHarness> {
  const source = loadCorpusFixture(directory);
  if (source.replay === undefined) {
    throw new Error("Corpus server continuation requires replay state; publish this fixture with the canonical producer");
  }
  const owner = source.wire.reads["sessions.me"][0]?.output;
  if (owner === undefined) {
    throw new Error("Corpus server continuation requires its captured owner");
  }
  await using ownership = new AsyncDisposableStack();
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-server-"));
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const corpus = ownership.use(await cloneCorpusFixture(source, join(parent, "consumer")));
  const { createDb, preCloseHousekeeping } = await import("@orb/db");
  const db = await createDb(corpus.layout.databaseUrl);
  ownership.defer(() => preCloseHousekeeping(db));
  const { createServerHarness } = await import("./server.ts");
  const { timers: _timers, relayDir: _relayDir, secretsDir: _secretsDir, ...execution } = corpusServerOptions(options);
  const root = ownership.use(
    await createServerHarness({
      ...execution,
      ...(source.privateParent === undefined ? {} : { startJobs: false }),
      db,
      ownerId: brandedId("UserId").parse(owner.userId),
      clock: createFrozenClock(source.replay.nowMs),
      ids: createSeededIds(source.replay.idCursor),
      env: { ...CORPUS_RECORD_POSTURE, ...options.env },
      rolePolicyConfig: { ...(await retainedOwnerPolicy(owner.handle)), ...options.rolePolicyConfig },
      casDir: corpus.layout.assets,
      variantDir: corpus.layout.variants,
      importStagingDir: corpus.layout.importStaging,
      temporaryParentDir: parent,
    }),
  );
  const lifetime = ownership.move();
  return Object.assign(root, { corpus, [Symbol.asyncDispose]: () => lifetime.disposeAsync() });
}

// Producers and resumed graphs share the canonical stateless corpus random, not caller overrides.
function corpusServerOptions(options: ServerHarnessOptions): ServerHarnessOptions {
  const { random: _random, ...server } = options;
  return server;
}

function corpusDatabaseFile(layout: DataLayout): string {
  const path = localPath(layout.databaseUrl);
  if (path === undefined) {
    throw new Error("A corpus fixture requires a file-backed database");
  }
  return path;
}

function parsePrivateCorpusWire(serialized: string): CorpusWire {
  let wire: CorpusWire | undefined;
  // Schema errors can embed captured content; the boundary reports only the refusal below.
  try {
    wire = parseCorpusWire(serialized);
  } catch {
    wire = undefined;
  }
  if (wire === undefined) {
    throw new Error("Private corpus wire is malformed");
  }
  return wire;
}

/** Borrow a completed publication; the committed synthetic input is the lazy default, never a writable app root. */
export function loadCorpusFixture(
  directory = fileURLToPath(new URL("./corpus-data", import.meta.url)),
  environment: NodeJS.ProcessEnv = inheritedProcessEnv(),
): CorpusFixture {
  const layout = resolveDataLayout({ ["DATA_DIR"]: resolve(directory) });
  const privateParent = privateCorpusParent(layout.root, environment);
  const serialized = readFileSync(join(layout.root, CORPUS_WIRE_FILE), "utf8");
  const wire = privateParent === undefined ? parseCorpusWire(serialized) : parsePrivateCorpusWire(serialized);
  if (!statSync(corpusDatabaseFile(layout)).isFile()) {
    throw new Error("Prepared corpus fixture has no database file");
  }
  const replayFile = join(layout.root, CORPUS_REPLAY_FILE);
  if (!existsSync(replayFile)) {
    return { layout, wire, ...(privateParent === undefined ? {} : { privateParent }) };
  }
  const replayText = readFileSync(replayFile, "utf8");
  // This Node-only boundary reports no malformed field values or keys that could contain private input.
  let replay: ReturnType<typeof corpusReplaySchema.safeParse> | null;
  try {
    replay = corpusReplaySchema.safeParse(JSON.parse(replayText));
  } catch {
    replay = null;
  }
  if (replay === null || !replay.success) {
    throw new Error("Corpus replay state is malformed");
  }
  return { layout, wire, replay: replay.data, ...(privateParent === undefined ? {} : { privateParent }) };
}

/** Read privacy routing before any captured user content or application graph is loaded. */
export function privateCorpusParent(directory: string, environment: NodeJS.ProcessEnv = inheritedProcessEnv()): string | undefined {
  const privacyFile = join(directory, CORPUS_PRIVATE_FILE);
  if (!existsSync(privacyFile)) {
    return;
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(privacyFile, "utf8"));
  } catch {
    value = null;
  }
  const parsed = z.strictObject({ parent: z.string() }).safeParse(value);
  if (!parsed.success) {
    throw new Error("Private corpus classification is invalid");
  }
  assertPrivateCorpusOutput(parsed.data.parent, directory, environment);
  return parsed.data.parent;
}

/** Native artifact and source-update switches cannot redirect a private consumer away from its configured owner. */
export function assertPrivateCorpusOutputArguments(args: readonly string[]): void {
  if (args.some((argument) => /^(?:--(?:output|reporter|last-failed-file|update-snapshots|update-source-method)(?:=|$)|-u)/u.test(argument))) {
    throw new Error("Private corpus artifacts cannot override native output ownership");
  }
}

/** A native config switch would move the consumer off the owner's configuration; the CLI refuses it before the output-argument check. */
export function isPrivateCorpusConfigArgument(argument: string): boolean {
  return /^(?:--config(?:=|$)|-c)/u.test(argument);
}

/** Durably retain private diagnostic causes, then reject with the original intake failure. */
export async function rethrowPrivateCorpusFailure(directory: string, error: unknown, environment: NodeJS.ProcessEnv = inheritedProcessEnv()): Promise<never> {
  try {
    const artifact = join(directory, CORPUS_PRIVATE_FAILURE_FILE);
    assertPrivateCorpusOutput(directory, artifact, environment);
    await using file = await open(artifact, "wx", 0o600);
    // Trusted native Errors may materialize stack/cause; decoded row getters and custom inspectors stay disabled.
    await file.writeFile(
      inspect(error, {
        depth: null,
        maxArrayLength: null,
        maxStringLength: null,
        customInspect: false,
        getters: false,
        showHidden: true,
        colors: false,
        compact: false,
        breakLength: Number.POSITIVE_INFINITY,
      }),
      "utf8",
    );
    await file.sync();
  } catch (captureError) {
    // biome-ignore lint/style/useErrorCause: Native SuppressedError retains the capture failure in .error and the original in .suppressed; it has no ErrorOptions cause parameter.
    throw new SuppressedError(captureError, error, "Private corpus intake failed and its failure evidence could not be retained");
  }
  throw error;
}

/** Private descendants must remain beneath their original inaccessible, non-repository output owner. */
export function assertPrivateCorpusOutput(parent: string, directory: string, environment: NodeJS.ProcessEnv = inheritedProcessEnv()): void {
  if (environment["CI"] !== undefined || environment["GITHUB_ACTIONS"] !== undefined) {
    throw new Error("Private corpus is local-only and cannot enter CI");
  }
  // Native reporter environment wins over configured destinations; loader/cache overrides also escape that owner.
  const outputOverride =
    /^(?:PLAYWRIGHT_(?:(?:JSON|JUNIT|BLOB)_OUTPUT_(?:FILE|DIR|NAME)|HTML_(?:OUTPUT_DIR|REPORT|OPEN|ATTACHMENTS_BASE_URL|HOST|PORT)|LAST_RUN_OUTPUT_FILE)|PW_TEST_(?:REPORTER|HTML_REPORT_OPEN)|PWTEST_CACHE_DIR)$/u;
  if (Object.keys(environment).some((name) => outputOverride.test(name))) {
    throw new Error("Private corpus artifacts cannot override native output ownership");
  }
  const root = realpathSync(parent);
  if (statSync(root).mode % PRIVATE_PERMISSION_MODULUS !== 0 || !resolve(directory).startsWith(`${root}${sep}`)) {
    throw new Error("Private corpus output requires its private parent");
  }
  let ancestor = existsSync(directory) ? realpathSync(directory) : realpathSync(dirname(directory));
  if (ancestor !== root && !ancestor.startsWith(`${root}${sep}`)) {
    throw new Error("Private corpus output escapes its private parent");
  }
  for (;;) {
    if (existsSync(join(ancestor, ".git"))) {
      throw new Error("Private corpus output cannot enter a repository");
    }
    const next = dirname(ancestor);
    if (next === ancestor) {
      break;
    }
    ancestor = next;
  }
}

/** Private native consumers inherit a real loopback-only namespace, never an asserted environment flag. */
export function assertPrivateCorpusNetwork(): void {
  const interfaces = networkInterfaces();
  const addresses = Object.values(interfaces).flatMap((entries) => entries ?? []);
  if (addresses.length === 0 || addresses.some((address) => !address.internal)) {
    throw new Error("Private corpus requires an isolated loopback-only network namespace");
  }
  for (const family of ["-4", "-6"]) {
    const result = runNicedSync("ip", ["-j", family, "route", "show"]);
    if (result.status !== 0) {
      throw new Error("Private corpus network routes could not be established");
    }
    const routes = z.array(z.object({ dst: z.string(), dev: z.string() })).parse(JSON.parse(result.stdout));
    if (routes.some((route) => route.dst !== "::1" || route.dev !== "lo")) {
      throw new Error("Private corpus refuses non-loopback network routes");
    }
  }
}

type CloneOptions = Parameters<typeof import("@orb/tooling/snap")["cloneStageDb"]>[2];

async function copyCorpusFixture(
  source: Pick<CorpusFixture, "layout" | "replay" | "privateParent">,
  published: string,
  directory: string,
  options: CloneOptions & Pick<ServerHarnessOptions, "workloadExecutionSignal"> & Pick<CorpusAdmissionHost, "environment"> = {},
): Promise<CorpusFixture> {
  const { workloadExecutionSignal: executionSignal, environment, ...cloneOptions } = options;
  executionSignal?.throwIfAborted();
  const root = resolve(directory);
  if (source.privateParent !== undefined) {
    if (options.publication !== undefined) {
      throw new Error("Private corpus cannot enter portable publication");
    }
    assertPrivateCorpusOutput(source.privateParent, root, environment);
  }
  await mkdir(root);
  let completed = false;
  try {
    executionSignal?.throwIfAborted();
    const layout = resolveDataLayout({ ["DATA_DIR"]: root });
    const { cloneMigratedStageDb } = await import("@orb/tooling/snap");
    executionSignal?.throwIfAborted();
    await cloneMigratedStageDb(corpusDatabaseFile(source.layout), { databaseUrl: layout.databaseUrl, assetsDir: layout.assets }, cloneOptions);
    executionSignal?.throwIfAborted();
    if (source.privateParent !== undefined) {
      await writeFile(join(root, CORPUS_PRIVATE_FILE), JSON.stringify({ parent: source.privateParent }), { flag: "wx", mode: 0o600 });
    }
    executionSignal?.throwIfAborted();
    await writeFile(join(root, CORPUS_WIRE_FILE), published, { encoding: "utf8", flag: "wx" });
    executionSignal?.throwIfAborted();
    if (source.replay !== undefined) {
      await writeFile(join(root, CORPUS_REPLAY_FILE), JSON.stringify(corpusReplaySchema.parse(source.replay)), { encoding: "utf8", flag: "wx" });
    }
    executionSignal?.throwIfAborted();
    const fixture = loadCorpusFixture(root, environment);
    executionSignal?.throwIfAborted();
    completed = true;
    return fixture;
  } finally {
    if (!completed) {
      await rm(root, { recursive: true, force: true });
    }
  }
}

function ownedCorpusFixture(fixture: CorpusFixture): PreparedCorpusFixture {
  return { ...fixture, [Symbol.asyncDispose]: () => rm(fixture.layout.root, { recursive: true, force: true }) };
}

/** A private stage clone retains backend lineage; its caller owns deletion after every stage process stops. */
export async function prepareCorpusFixture(
  capsule: CorpusCapsule | CloneBoundaryCorpusCapsule | PrivateCorpusCapsule,
  directory: string,
  environment?: NodeJS.ProcessEnv,
): Promise<PreparedCorpusFixture> {
  const published = "privateParent" in capsule ? encodeCorpusWire(capsule.wire) : capsule.publishWire();
  return ownedCorpusFixture(await copyCorpusFixture(capsule, published, directory, { environment }));
}

/** Retain a local-only fixture for later owner drives without portable publication or automatic deletion. */
export async function writePrivateCorpusFixture(
  capsule: Pick<PrivateCorpusCapsule, "layout" | "wire" | "replay" | "privateParent">,
  directory: string,
  executionSignal?: ServerHarnessOptions["workloadExecutionSignal"],
  environment?: NodeJS.ProcessEnv,
): Promise<CorpusFixture> {
  executionSignal?.throwIfAborted();
  return await copyCorpusFixture(capsule, encodeCorpusWire(capsule.wire), directory, {
    ...(executionSignal === undefined ? {} : { workloadExecutionSignal: executionSignal }),
    environment,
  });
}

/** Publish a durable, completed DB/CAS and portable envelope; source runtime identities and known echoes cannot leave. */
export async function publishCorpusFixture(capsule: CorpusCapsule | PrivateCorpusCapsule, directory: string): Promise<CorpusFixture> {
  if ("privateParent" in capsule || existsSync(join(capsule.layout.root, CORPUS_PRIVATE_FILE))) {
    throw new Error("Private corpus cannot enter portable publication");
  }
  return await copyCorpusFixture(capsule, capsule.publishWire(), directory, {
    publication: { privateLiterals: capsule.privateCaptures.publicationSecrets },
  });
}

/** Each consumer owns an independent writable copy; disposing it never deletes or modifies the durable publication. */
export async function cloneCorpusFixture(fixture: CorpusFixture, directory: string, environment?: NodeJS.ProcessEnv): Promise<PreparedCorpusFixture> {
  const privateParent =
    fixture.privateParent ??
    (existsSync(join(fixture.layout.root, CORPUS_PRIVATE_FILE)) ? loadCorpusFixture(fixture.layout.root, environment).privateParent : undefined);
  return ownedCorpusFixture(
    await copyCorpusFixture(
      { ...fixture, ...(privateParent === undefined ? {} : { privateParent }) },
      privateParent === undefined ? serializeCorpusWire(fixture.wire, []) : encodeCorpusWire(fixture.wire),
      directory,
      { ...(privateParent === undefined ? { publication: { privateLiterals: [] } } : {}), environment },
    ),
  );
}

type CapturedCaptures<T extends { readonly oidc: CorpusPrivateCaptures["oidc"] }> = Omit<T, "oidc"> & { readonly oidc: T["oidc"] | undefined };

interface CapturedCapsule {
  readonly wire: CorpusWire;
  readonly privateCaptures: CapturedCaptures<CorpusPrivateCaptures> | CapturedCaptures<CloneBoundaryCaptures>;
  readonly publishWire: CorpusCapsule["publishWire"];
  readonly snapshotReplay: () => CorpusReplayState;
}

/** Absent runs every producer; `clone-boundary` runs only the producers {@link CloneBoundaryCaptures} names. */
interface CorpusCapsuleProducers {
  readonly producers?: "clone-boundary";
}

/** Create only a new directory; teardown removes only this capsule, never a pre-existing data root. */
export function createCorpusCapsule(
  options: CorpusCapsuleOptions & CorpusAdmissionHost & { readonly privateSourceDirectory: string },
): Promise<PrivateCorpusCapsule>;
export function createCorpusCapsule(options: CorpusCapsuleOptions & { readonly producers: "clone-boundary" }): Promise<CloneBoundaryCorpusCapsule>;
export function createCorpusCapsule(options: CorpusCapsuleOptions): Promise<CorpusCapsule>;
export async function createCorpusCapsule(
  options: CorpusCapsuleOptions & CorpusAdmissionHost & CorpusCapsuleProducers & { readonly privateSourceDirectory?: string },
): Promise<CorpusCapsule | CloneBoundaryCorpusCapsule | PrivateCorpusCapsule> {
  const signal = options.server.workloadExecutionSignal;
  signal?.throwIfAborted();
  const directory = resolve(options.directory);
  const sourceDirectory = options.privateSourceDirectory === undefined ? undefined : realpathSync(options.privateSourceDirectory);
  const privateParent = sourceDirectory === undefined ? undefined : realpathSync(dirname(directory));
  if (privateParent !== undefined) {
    const sourceParent = dirname(sourceDirectory ?? "");
    const { environment, temporaryDirectory = tmpdir() } = options;
    assertPrivateCorpusOutput(sourceParent, privateParent, environment);
    assertPrivateCorpusOutput(privateParent, directory, environment);
    assertPrivateCorpusOutput(sourceParent, join(temporaryDirectory, "private-corpus-temporary"), environment);
    if (sourceDirectory === directory || directory.startsWith(`${sourceDirectory}${sep}`) || sourceDirectory?.startsWith(`${directory}${sep}`) === true) {
      throw new Error("Private corpus source cannot be its working clone");
    }
  }
  await mkdir(directory);
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(directory, { recursive: true, force: true }));
  signal?.throwIfAborted();
  const layout = resolveDataLayout({ ["DATA_DIR"]: directory });
  if (options.privateSourceDirectory !== undefined) {
    const source = resolveDataLayout({ ["DATA_DIR"]: resolve(options.privateSourceDirectory) });
    const { cloneMigratedStageDb } = await import("@orb/tooling/snap");
    signal?.throwIfAborted();
    await cloneMigratedStageDb(corpusDatabaseFile(source), { databaseUrl: layout.databaseUrl, assetsDir: layout.assets });
    signal?.throwIfAborted();
    await writeFile(join(directory, CORPUS_PRIVATE_FILE), JSON.stringify({ parent: privateParent }), { flag: "wx", mode: 0o600 });
  }
  signal?.throwIfAborted();
  const { snapshotReplay, ...captured } = await captureCapsule(options, layout, privateParent !== undefined);
  signal?.throwIfAborted();
  const replay = corpusReplaySchema.parse(snapshotReplay());
  if (privateParent !== undefined) {
    const lifetime = ownership.move();
    return {
      layout,
      wire: captured.wire,
      replay,
      privateParent,
      publishWire: (): never => {
        throw new Error("Private corpus cannot enter portable publication");
      },
      [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
    };
  }
  const oidc = captured.privateCaptures.oidc;
  if (oidc === undefined) {
    throw new Error("Synthetic corpus requires its native OIDC initialization");
  }
  const lifetime = ownership.move();
  return { layout, ...captured, privateCaptures: { ...captured.privateCaptures, oidc }, replay, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

interface CorpusOwnerInitialization {
  readonly ownerId: UserId;
  readonly ownerHandle: string | undefined;
  readonly oidc: CorpusPrivateCaptures["oidc"] | undefined;
}

async function assertPrivateCorpusIdle(db: NonNullable<ServerHarnessOptions["db"]>): Promise<void> {
  const active = await db.select({ count: count() }).from(workloads).where(inArray(workloads.status, ACTIVE_WORKLOAD_STATUSES));
  const pending = await db.select({ count: count() }).from(pendingTurns);
  if (active[0]?.count !== 0 || pending[0]?.count !== 0) {
    throw new Error(`Private corpus refuses copied unfinished work: ${JSON.stringify({ activeWorkloads: active[0]?.count, pendingTurns: pending[0]?.count })}`);
  }
}

async function initializeCorpusOwner(
  options: CorpusCapsuleOptions,
  layout: DataLayout,
  runtime: Required<Pick<ServerHarnessOptions, "db" | "clock" | "ids">>,
  privateSource: boolean,
): Promise<CorpusOwnerInitialization> {
  const { createServerHarness } = await import("./server.ts");
  const { createNativeIssuer, ISSUER, NATIVE_OIDC_SETTINGS } = await import("./oidc-issuer.ts");
  const { seedOidcCorpus } = await import("./corpus-seed.ts");
  const issuer = await createNativeIssuer();
  await using authentication = await createServerHarness({
    ...corpusServerOptions(options.server),
    ...runtime,
    startJobs: !privateSource,
    ownerId: null,
    env: { ...options.server.env, ["AUTH_MODE"]: "oidc", ["AUTH_FALLBACK"]: "deny" },
    // biome-ignore lint/style/useNamingConvention: OIDC_SIGNUP is the canonical startup setting; the fresh corpus exercises the real pending-join path.
    oidc: { ...NATIVE_OIDC_SETTINGS, OIDC_SIGNUP: false },
    networkExecution: {
      fetch: issuer.fetch,
      resolver: (hostname) =>
        hostname === new URL(ISSUER).hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error("unscripted corpus issuer address resolution")),
    },
    casDir: layout.assets,
    variantDir: layout.variants,
    importStagingDir: layout.importStaging,
  });
  if (privateSource) {
    const { listEnabledAcrossOwners } = await import("@orb/server/domain/plugin");
    const ownerId = await authentication.app.sessions.getOwnerUserId();
    const fields = ownerId === undefined ? null : await authentication.app.sessions.loadUserById(ownerId);
    if (ownerId === undefined || fields === null) {
      throw new Error("Private corpus requires its existing singleton owner");
    }
    const schedules = await authentication.services.workloads.listSchedules({ caller: null });
    if (schedules.some(({ enabled }) => enabled)) {
      throw new Error("Private corpus requires copied enabled schedules to be resolved before native ticking");
    }
    for (const { ownerId: pluginOwner, pluginId } of await listEnabledAcrossOwners(databaseHandle(runtime.db))) {
      const caller = await authentication.principalFor(pluginOwner);
      await authentication.services.plugin.setEnabled({ caller, pluginId, enabled: false });
    }
    return { ownerId, ownerHandle: fields.handle, oidc: undefined };
  }
  const oidc = await seedOidcCorpus(authentication, issuer);
  return { ownerId: oidc.ownerId, ownerHandle: undefined, oidc };
}

interface CapsuleGraph {
  readonly root: ServerTestHarness;
  readonly db: NonNullable<ServerHarnessOptions["db"]>;
  readonly signal: AbortSignal | undefined;
}

/** Every capsule closes on a referential check, the served health and the captured reads, whichever producers ran. */
async function captureHealthAndReads({
  root,
  db,
  signal,
  baseline,
  libraries,
}: CapsuleGraph & Pick<CorpusPrivateCaptures, "baseline" | "libraries">): Promise<Pick<Parameters<typeof hydrateCorpusWire>[0], "health" | "reads">> {
  const { assertReferentialIntegrity } = await import("@orb/db");
  const { captureCorpusReads } = await import("./corpus-seed.ts");
  await assertReferentialIntegrity(db);
  signal?.throwIfAborted();
  const response = await root.http.request("/healthz");
  if (!response.ok) {
    throw new Error(`synthetic capsule health request failed (${response.status})`);
  }
  const health = healthResponseSchema.parse(await response.json());
  signal?.throwIfAborted();
  return { health, reads: await captureCorpusReads(root, { ...baseline.identities, personaIds: [libraries.persona.id] }) };
}

/** The literals every capsule withholds from publication; each producer set adds its own secrets. */
function sharedPublicationSecrets({
  options,
  oidcClientSecret,
  baseline,
  credential,
  oidc,
}: {
  readonly options: CorpusCapsuleOptions;
  readonly oidcClientSecret: string;
  readonly oidc: CorpusPrivateCaptures["oidc"] | undefined;
} & Pick<CorpusPrivateCaptures, "baseline" | "credential">): readonly (string | null | undefined)[] {
  return [
    options.privateCredential.key,
    options.seed.ownerPassword,
    options.server.secretBoxKey?.toString("hex"),
    oidcClientSecret,
    ...baseline.secrets,
    ...(oidc?.secrets ?? []),
    credential.row.ciphertext,
    credential.row.iv,
    credential.row.tag,
    ...(oidc === undefined
      ? []
      : [
          ...oidc.transactions.flatMap((row) => [row.state, row.codeVerifier, row.nonce, row.inviteTokenHash]),
          oidc.pending.secretHash,
          oidc.pending.inviteTokenHash,
          oidc.pending.idTokenCiphertext,
          oidc.pending.idTokenIv,
          oidc.pending.idTokenTag,
          ...[...oidc.ownerSessions, ...oidc.joinerSessions].flatMap((row) => [
            row.tokenHash,
            row.oidcIdTokenCiphertext,
            row.oidcIdTokenIv,
            row.oidcIdTokenTag,
          ]),
        ]),
  ];
}

function lifecycleSecrets(lifecycle: CorpusPrivateCaptures["chatLifecycle"]): readonly string[] {
  return [lifecycle.held.invite.tokenHash, lifecycle.aborted.invite.tokenHash, lifecycle.handoff.invite.tokenHash];
}

/** The clone-boundary producer set: the baseline already holds chats, messages, a password session, the credential and
 *  the libraries' CAS asset; the chat lifecycle adds the held turn lock and the handoff a clone must find released. */
async function captureCloneBoundary(
  graph: CapsuleGraph &
    Pick<CorpusPrivateCaptures, "baseline" | "libraries" | "credential"> & {
      readonly options: CorpusCapsuleOptions;
      readonly oidcClientSecret: string;
      readonly oidc: CorpusPrivateCaptures["oidc"] | undefined;
      readonly clock: Pick<ReturnType<typeof createFrozenClock>, "now">;
      readonly ids: Pick<ReturnType<typeof createSeededIds>, "snapshot">;
    },
  seedChatLifecycle: () => Promise<CorpusPrivateCaptures["chatLifecycle"]>,
): Promise<CapturedCapsule> {
  const { root, signal, baseline, libraries, credential, oidc, clock, ids } = graph;
  const chatLifecycle = await seedChatLifecycle();
  signal?.throwIfAborted();
  await root.settleBackground();
  signal?.throwIfAborted();
  const wire = hydrateCorpusWire({
    auth: baseline.auth,
    ...(oidc === undefined ? {} : { oidc: oidc.wire }),
    ...(await captureHealthAndReads(graph)),
    chatLifecycleMember: chatLifecycle.publication,
  });
  signal?.throwIfAborted();
  const secrets = [...sharedPublicationSecrets(graph), ...lifecycleSecrets(chatLifecycle)].filter((value) => value !== null && value !== undefined);
  return {
    wire,
    snapshotReplay: () => ({ version: 1, nowMs: clock.now(), idCursor: ids.snapshot() }),
    publishWire: () => serializeCorpusWire(wire, secrets),
    privateCaptures: { publicationSecrets: secrets, oidc, credential, baseline, libraries, chatLifecycle },
  };
}

async function captureCapsule(options: CorpusCapsuleOptions & CorpusCapsuleProducers, layout: DataLayout, privateSource = false): Promise<CapturedCapsule> {
  const server = corpusServerOptions(options.server);
  const signal = server.workloadExecutionSignal;
  signal?.throwIfAborted();
  const { assertReferentialIntegrity, createDb, preCloseHousekeeping, runMigrations } = await import("@orb/db");
  const { SHIPPED_MIGRATIONS, createDbStatementHold } = await import("./db.ts");
  const { createCorpusChatWire } = await import("./corpus-chat-wire.ts");
  const { seedCorpusChatLifecycle } = await import("./corpus-chat-lifecycle.ts");
  const { seedCorpusImagery } = await import("./corpus-imagery.ts");
  const { seedCorpusImageVariants } = await import("./corpus-image-variants.ts");
  const { createCorpusImageWire } = await import("./corpus-image-wire.ts");
  const { createServerHarness } = await import("./server.ts");
  const { createControlledTimers } = await import("../iso/timers.ts");
  const { NATIVE_OIDC_SETTINGS } = await import("./oidc-issuer.ts");
  const { seedUserCredentialRows } = await import("./factories/rows/credentials.ts");
  const { seedCorpusPlugins } = await import("./corpus-plugin.ts");
  const { seedCorpusKnowledge } = await import("./corpus-knowledge.ts");
  const { seedCorpusKnowledgeVariants } = await import("./corpus-knowledge-variants.ts");
  const { seedCorpusLibraryViews } = await import("./corpus-library-views.ts");
  const { seedCorpusRpg } = await import("./corpus-rpg.ts");
  const { seedCorpusRpgProvider } = await import("./corpus-rpg-provider.ts");
  const { seedCorpusRpgRecursion } = await import("./corpus-rpg-recursion.ts");
  const { seedCorpusRpgMembers } = await import("./corpus-rpg-members.ts");
  const { seedCorpusRpgRounds } = await import("./corpus-rpg-rounds.ts");
  const { seedCorpusSearch, captureCorpusSearchPublication, settleCorpusSearchImages: settleSearchImages } = await import("./corpus-search.ts");
  const { createCorpusSearchWire } = await import("./corpus-search-wire.ts");
  const { seedStatsRows } = await import("./factories/rows/stats.ts");
  const { seedCorpusConnection } = await import("./corpus-connection.ts");
  const { seedCorpusStatsSettings } = await import("./corpus-stats-settings.ts");
  const { seedCorpusSdkSessions } = await import("./corpus-sdk-sessions.ts");
  const { seedCorpusNotifications } = await import("./corpus-notifications.ts");
  const { createCorpusSdkExecution } = await import("./corpus-sdk-wire.ts");
  const { CORPUS_SDK_TOKEN } = await import("./corpus-sdk-protocol.ts");
  const { createCorpusConnectionWire, CORPUS_CONNECTION_KEY, CORPUS_CONNECTION_FOREIGN_KEY, CORPUS_CONNECTION_HOSTED_KEY } = await import(
    "./corpus-connection-wire.ts"
  );
  const { createRpgFlightWire, createRpgFlightTimers } = await import("./corpus-rpg-flight-wire.ts");
  const { seedRecallCorpusRows } = await import("./factories/rows/recall.ts");
  const { seedCorpusActors } = await import("./corpus-actors.ts");
  const { captureCookieAuth, seedCorpusAutomation, seedCorpusLibraries, seedSyntheticCorpus } = await import("./corpus-seed.ts");
  const { seedCorpusAccount } = await import("./corpus-auth.ts");
  signal?.throwIfAborted();
  await using lifetimes = new AsyncDisposableStack();
  const dbHold = createDbStatementHold();
  const chatWire = createCorpusChatWire();
  const db = await createDb(layout.databaseUrl, dbHold.wrap);
  lifetimes.defer(() => preCloseHousekeeping(db));
  signal?.throwIfAborted();
  await runMigrations(db, SHIPPED_MIGRATIONS);
  signal?.throwIfAborted();
  await assertReferentialIntegrity(db);
  signal?.throwIfAborted();
  const clock = options.server.clock ?? createFrozenClock();
  const rpgFlightTimers = createRpgFlightTimers(createControlledTimers(clock));
  const rpgFlightWire = createRpgFlightWire();
  const connectionWire = createCorpusConnectionWire();
  const imageWire = await createCorpusImageWire();
  const sdkExecution = createCorpusSdkExecution();
  const searchWire = createCorpusSearchWire(
    imageWire.wrap(connectionWire.wrap(rpgFlightWire.wrap(chatWire.wrap(options.server.networkExecution?.fetch ?? options.server.providerFetch ?? fetch)))),
  );
  const ids = options.server.ids ?? createSeededIds();
  if (privateSource) {
    await assertPrivateCorpusIdle(db);
  }
  signal?.throwIfAborted();
  const { ownerId, ownerHandle, oidc } = await initializeCorpusOwner(options, layout, { db, clock, ids }, privateSource);
  signal?.throwIfAborted();
  const root = lifetimes.use(
    await createServerHarness({
      ...server,
      startJobs: !privateSource,
      db,
      clock,
      ids,
      ownerId,
      ...(ownerHandle === undefined
        ? {}
        : {
            env: { ...options.server.env, ["AUTH_FALLBACK"]: "deny" },
            rolePolicyConfig: { ...(await retainedOwnerPolicy(ownerHandle)), ...options.server.rolePolicyConfig },
          }),
      sdkSpawn: sdkExecution.spawn,
      providerFetch: imageWire.wrap(connectionWire.wrap(rpgFlightWire.wrap(chatWire.wrap(options.server.providerFetch ?? fetch)))),
      networkExecution: {
        fetch: searchWire.execute,
        resolver: (hostname) => {
          if (hostname === connectionWire.hostname) {
            return connectionWire.resolver(hostname);
          }
          return options.server.networkExecution?.resolver?.(hostname) ?? Promise.reject(new Error("unscripted corpus connection address resolution"));
        },
      },
      timers: rpgFlightTimers.timers,
      rpgTrace: true,
      casDir: layout.assets,
      variantDir: layout.variants,
      importStagingDir: layout.importStaging,
    }),
  );
  signal?.throwIfAborted();
  const actors = await seedCorpusActors(root, privateSource);
  signal?.throwIfAborted();
  const credential = await seedUserCredentialRows(root, { ...options.privateCredential, principal: actors.owner });
  signal?.throwIfAborted();
  const baseline = await seedSyntheticCorpus(root, { ...options.seed, secondUserId: actors.secondUserId });
  signal?.throwIfAborted();
  const libraries = await seedCorpusLibraries(root);
  signal?.throwIfAborted();
  const caller = await root.internalCallerFor(root.ownerId);
  signal?.throwIfAborted();
  await caller.settings.updateUserSettingsSection({
    section: "seeds",
    patch: { currentPersonaId: libraries.persona.id, defaultPersonaId: libraries.persona.id },
  });
  signal?.throwIfAborted();
  if (options.producers === "clone-boundary") {
    const graph = { root, db, signal, options, oidcClientSecret: NATIVE_OIDC_SETTINGS.OIDC_CLIENT_SECRET, baseline, libraries, credential, oidc, clock, ids };
    return await captureCloneBoundary(graph, () => seedCorpusChatLifecycle(root, chatWire, actors.secondUserId, dbHold));
  }
  const recall = await seedRecallCorpusRows(root, {
    chatConnectionId: actors.connections.text.id,
    embedConnectionId: actors.connections.embed.id,
    summarizeConnectionId: actors.connections.text.id,
  });
  signal?.throwIfAborted();
  const knowledge = await seedCorpusKnowledge(root, recall);
  signal?.throwIfAborted();
  const automation = await seedCorpusAutomation(root, libraries.room.chat.id);
  signal?.throwIfAborted();
  const plugins = await seedCorpusPlugins(root, oidc?.joiner.id ?? (await seedCorpusAccount(root)).userId);
  signal?.throwIfAborted();
  const rpg = await seedCorpusRpg(root);
  signal?.throwIfAborted();
  const rpgProvider = await seedCorpusRpgProvider(root, actors.connections.text.id);
  signal?.throwIfAborted();
  const knowledgeVariants = await seedCorpusKnowledgeVariants(root);
  signal?.throwIfAborted();
  const chatLifecycle = await seedCorpusChatLifecycle(root, chatWire, actors.secondUserId, dbHold);
  signal?.throwIfAborted();
  const imagery = await seedCorpusImagery(root, actors.secondUserId);
  signal?.throwIfAborted();
  const rpgRecursion = await seedCorpusRpgRecursion(root);
  signal?.throwIfAborted();
  const rpgMembers = await seedCorpusRpgMembers(root, rpgRecursion, actors.secondUserId);
  signal?.throwIfAborted();
  const rpgRounds = await seedCorpusRpgRounds(root, rpgFlightWire, rpgFlightTimers, actors.secondUserId);
  signal?.throwIfAborted();
  const search = await seedCorpusSearch(root, { actors, libraries, recall, images: knowledgeVariants.images });
  signal?.throwIfAborted();
  const connection = await seedCorpusConnection(root, actors, connectionWire);
  if (connectionWire.remaining() !== 0) {
    throw new Error("completed native connection corpus left unspent physical recipes");
  }
  signal?.throwIfAborted();
  const libraryViews = await seedCorpusLibraryViews(root, libraries, actors);
  signal?.throwIfAborted();
  const imageVariants = await seedCorpusImageVariants(root, imageWire, options.seed.ownerPassword);
  signal?.throwIfAborted();
  const sharedMemberAuthentication = await captureCookieAuth(root, await root.principalFor(actors.secondUserId), SHARED_MEMBER_PASSWORD);
  signal?.throwIfAborted();
  const statsSettings = await seedCorpusStatsSettings(root, {
    characterId: knowledgeVariants.character.id,
    personaId: libraries.persona.id,
    foreignUserId: actors.secondUserId,
  });
  signal?.throwIfAborted();
  const sdkSessions = await seedCorpusSdkSessions(root, sdkExecution);
  signal?.throwIfAborted();
  const notifications = await seedCorpusNotifications(root);
  signal?.throwIfAborted();
  await root.settleBackground();
  signal?.throwIfAborted();
  const searchImageJobs = await settleSearchImages(root);
  signal?.throwIfAborted();
  const searchFinal = await searchWire.capture(() => captureCorpusSearchPublication(root, search));
  signal?.throwIfAborted();
  const postSearchStats = await seedStatsRows(root, root.ownerId);
  signal?.throwIfAborted();
  const wire = hydrateCorpusWire({
    auth: baseline.auth,
    ...(oidc === undefined ? {} : { oidc: oidc.wire }),
    ...(await captureHealthAndReads({ root, db, signal, baseline, libraries })),
    searchLibrary: searchFinal.value,
    pluginLibrary: plugins.library,
    notificationInbox: notifications.publication,
    chatLifecycleMember: chatLifecycle.publication,
    worldInfoLibrary: libraryViews.publication.worldInfo,
    regexLibrary: libraryViews.publication.regex,
    libraryRelations: libraryViews.publication.relations,
    memberIdentities: { notificationReader: notifications.admission.identity, sharedMember: sharedMemberAuthentication.identity },
  });
  signal?.throwIfAborted();
  const secrets = [
    ...sharedPublicationSecrets({ options, oidcClientSecret: NATIVE_OIDC_SETTINGS.OIDC_CLIENT_SECRET, baseline, credential, oidc }),
    CORPUS_CONNECTION_KEY,
    CORPUS_CONNECTION_FOREIGN_KEY,
    CORPUS_CONNECTION_HOSTED_KEY,
    CORPUS_SDK_TOKEN,
    ...sharedMemberAuthentication.secrets,
    ...imageVariants.secrets,
    ...notifications.secrets,
    ...[connection.own.credential, connection.foreign.credential, connection.account.hosted.credential, sdkSessions.credential].flatMap(({ row }) => [
      row.ciphertext,
      row.iv,
      row.tag,
    ]),
    ...sdkSessions.receipts.flatMap(({ sessionId, resume }) => [sessionId, resume]),
    ...lifecycleSecrets(chatLifecycle),
  ].filter((value) => value !== null && value !== undefined);
  return {
    wire,
    snapshotReplay: () => ({ version: 1, nowMs: clock.now(), idCursor: ids.snapshot() }),
    publishWire: () => serializeCorpusWire(wire, [...secrets, ...plugins.wirePrivateLiterals]),
    privateCaptures: {
      publicationSecrets: secrets,
      searchPublication: searchFinal.value,
      searchPhysical: searchFinal.exchanges,
      searchImageJobs,
      postSearchStats,
      sharedMemberAuthentication,
      imageVariants,
      notifications,
      sdkSessions,
      oidc,
      credential,
      baseline,
      recall,
      libraries,
      automation,
      plugins,
      knowledge,
      rpg,
      rpgProvider,
      knowledgeVariants,
      chatLifecycle,
      imagery,
      rpgRecursion,
      rpgMembers,
      rpgRounds,
      search,
      connection,
      libraryViews,
      statsSettings,
    },
  };
}
