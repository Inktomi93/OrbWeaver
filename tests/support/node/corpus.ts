// A capsule owns a new synthetic directory and the actual persisted graph. Private rows stay Node-owned;
// only owner-validated wire captures may feed a later, separately authorized portable publication.
import { readFileSync, statSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import { localPath } from "@orb/db";
import type { DataLayout } from "@orb/server/foundation/data-layout";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import type { CorpusWire } from "../iso/corpus.ts";
import { hydrateCorpusWire, parseCorpusWire, serializeCorpusWire } from "../iso/corpus.ts";
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
import type { seedCorpusSearch as produceCorpusSearch } from "./corpus-search.ts";
import type {
  seedCorpusAutomation as produceCorpusAutomation,
  seedCorpusLibraries as produceCorpusLibraries,
  seedOidcCorpus as produceOidcCorpus,
  seedRecallCorpus as produceRecallCorpus,
  seedSyntheticCorpus as produceSyntheticCorpus,
  SeedSyntheticCorpusOptions,
} from "./corpus-seed.ts";
import type { seedCorpusStatsSettings as produceCorpusStatsSettings } from "./corpus-stats-settings.ts";
import type { seedUserCredential as produceCredential } from "./factories/credentials.ts";
import type { ServerHarnessOptions } from "./server.ts";

const CORPUS_WIRE_FILE = "corpus.json";

export interface CorpusCapsuleOptions {
  readonly directory: string;
  readonly server: Omit<
    ServerHarnessOptions,
    "db" | "ownerId" | "physicalPeer" | "authConfig" | "casDir" | "variantDir" | "importStagingDir" | "timers" | "oidc"
  > & {
    readonly authConfig: NonNullable<ServerHarnessOptions["authConfig"]> & { readonly mode: "local" };
    readonly pluginSpawn: NonNullable<ServerHarnessOptions["pluginSpawn"]>;
  };
  readonly seed: SeedSyntheticCorpusOptions;
  readonly privateCredential: Omit<Parameters<typeof produceCredential>[2], "principal">;
}

interface CorpusPrivateCaptures {
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
}

export interface CorpusFixture {
  readonly layout: DataLayout;
  readonly wire: CorpusWire;
}

export interface PreparedCorpusFixture extends CorpusFixture, AsyncDisposable {}

function corpusDatabaseFile(layout: DataLayout): string {
  const path = localPath(layout.databaseUrl);
  if (path === undefined) {
    throw new Error("A corpus fixture requires a file-backed database");
  }
  return path;
}

/** Read only a completed, prepared clone; this loader does not construct or boot an application graph. */
export function loadCorpusFixture(directory: string): CorpusFixture {
  const layout = resolveDataLayout({ ["DATA_DIR"]: resolve(directory) });
  const wire = parseCorpusWire(readFileSync(join(layout.root, CORPUS_WIRE_FILE), "utf8"));
  if (!statSync(corpusDatabaseFile(layout)).isFile()) {
    throw new Error("Prepared corpus fixture has no database file");
  }
  return { layout, wire };
}

/** Clone only a completed capsule; the caller retains this ownership until every stage process stops. */
export async function prepareCorpusFixture(capsule: CorpusCapsule, directory: string): Promise<PreparedCorpusFixture> {
  const published = capsule.publishWire();
  const root = resolve(directory);
  await mkdir(root);
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(root, { recursive: true, force: true }));
  const layout = resolveDataLayout({ ["DATA_DIR"]: root });
  const { cloneStageDb } = await import("@orb/tooling/snap");
  cloneStageDb(corpusDatabaseFile(capsule.layout), { databaseUrl: layout.databaseUrl, assetsDir: layout.assets });
  await writeFile(join(root, CORPUS_WIRE_FILE), published, { encoding: "utf8", flag: "wx" });
  const fixture = loadCorpusFixture(root);
  const lifetime = ownership.move();
  return { ...fixture, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

interface CapturedCapsule {
  readonly wire: CorpusWire;
  readonly privateCaptures: CorpusPrivateCaptures;
  readonly publishWire: CorpusCapsule["publishWire"];
}

/** Create only a new directory; teardown removes only this capsule, never a pre-existing data root. */
export async function createCorpusCapsule(options: CorpusCapsuleOptions): Promise<CorpusCapsule> {
  const directory = resolve(options.directory);
  await mkdir(directory);
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(directory, { recursive: true, force: true }));
  const layout = resolveDataLayout({ ["DATA_DIR"]: directory });
  const captured = await captureCapsule(options, layout);
  const lifetime = ownership.move();
  return { layout, ...captured, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function captureCapsule(options: CorpusCapsuleOptions, layout: DataLayout): Promise<CapturedCapsule> {
  const { assertReferentialIntegrity, createDb, preCloseHousekeeping, runMigrations } = await import("@orb/db");
  const { SHIPPED_MIGRATIONS, createDbStatementHold } = await import("./db.ts");
  const { createCorpusChatWire } = await import("./corpus-chat-wire.ts");
  const { seedCorpusChatLifecycle } = await import("./corpus-chat-lifecycle.ts");
  const { seedCorpusImagery } = await import("./corpus-imagery.ts");
  const { seedCorpusImageVariants } = await import("./corpus-image-variants.ts");
  const { createCorpusImageWire } = await import("./corpus-image-wire.ts");
  const { createServerHarness } = await import("./server.ts");
  const { createFrozenClock } = await import("../iso/clock.ts");
  const { createControlledTimers } = await import("../iso/timers.ts");
  const { createSeededIds } = await import("../iso/ids.ts");
  const { createNativeIssuer, ISSUER, NATIVE_OIDC_SETTINGS } = await import("./oidc-issuer.ts");
  const { seedUserCredential } = await import("./factories/credentials.ts");
  const { seedCorpusPlugins } = await import("./corpus-plugin.ts");
  const { seedCorpusKnowledge } = await import("./corpus-knowledge.ts");
  const { seedCorpusKnowledgeVariants } = await import("./corpus-knowledge-variants.ts");
  const { seedCorpusLibraryViews } = await import("./corpus-library-views.ts");
  const { seedCorpusRpg } = await import("./corpus-rpg.ts");
  const { seedCorpusRpgProvider } = await import("./corpus-rpg-provider.ts");
  const { seedCorpusRpgRecursion } = await import("./corpus-rpg-recursion.ts");
  const { seedCorpusRpgMembers } = await import("./corpus-rpg-members.ts");
  const { seedCorpusRpgRounds } = await import("./corpus-rpg-rounds.ts");
  const { seedCorpusSearch } = await import("./corpus-search.ts");
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
  const { captureCorpusReads, seedCorpusActors, seedCorpusAutomation, seedCorpusLibraries, seedOidcCorpus, seedRecallCorpus, seedSyntheticCorpus } =
    await import("./corpus-seed.ts");
  await using lifetimes = new AsyncDisposableStack();
  const dbHold = createDbStatementHold();
  const chatWire = createCorpusChatWire();
  const db = await createDb(layout.databaseUrl, dbHold.wrap);
  lifetimes.defer(() => preCloseHousekeeping(db));
  await runMigrations(db, SHIPPED_MIGRATIONS);
  await assertReferentialIntegrity(db);
  const clock = options.server.clock ?? createFrozenClock();
  const rpgFlightTimers = createRpgFlightTimers(createControlledTimers(clock));
  const rpgFlightWire = createRpgFlightWire();
  const connectionWire = createCorpusConnectionWire();
  const imageWire = await createCorpusImageWire();
  const sdkExecution = createCorpusSdkExecution();
  const ids = options.server.ids ?? createSeededIds();
  const issuer = await createNativeIssuer();
  let oidc: Awaited<ReturnType<typeof produceOidcCorpus>>;
  {
    await using authentication = await createServerHarness({
      ...options.server,
      db,
      clock,
      ids,
      ownerId: null,
      authConfig: { ...options.server.authConfig, mode: "oidc", fallback: "deny" },
      // biome-ignore lint/style/useNamingConvention: OIDC_SIGNUP is the canonical startup setting; the corpus exercises the real pending-join path.
      oidc: { ...NATIVE_OIDC_SETTINGS, OIDC_SIGNUP: false },
      networkExecution: {
        fetch: issuer.fetch,
        resolver: (hostname) => {
          if (hostname !== new URL(ISSUER).hostname) {
            return Promise.reject(new Error("unscripted corpus issuer address resolution"));
          }
          return Promise.resolve(["93.184.215.14"]);
        },
      },
      casDir: layout.assets,
      variantDir: layout.variants,
      importStagingDir: layout.importStaging,
    });
    oidc = await seedOidcCorpus(authentication, issuer);
  }
  const root = lifetimes.use(
    await createServerHarness({
      ...options.server,
      db,
      clock,
      ids,
      ownerId: oidc.ownerId,
      sdkSpawn: sdkExecution.spawn,
      providerFetch: imageWire.wrap(connectionWire.wrap(rpgFlightWire.wrap(chatWire.wrap(options.server.providerFetch ?? fetch)))),
      networkExecution: {
        fetch: imageWire.wrap(
          connectionWire.wrap(rpgFlightWire.wrap(chatWire.wrap(options.server.networkExecution?.fetch ?? options.server.providerFetch ?? fetch))),
        ),
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
  const actors = await seedCorpusActors(root);
  const credential = await seedUserCredential(db, root.services.credentials.add, { ...options.privateCredential, principal: actors.owner });
  const baseline = await seedSyntheticCorpus(root, options.seed);
  const libraries = await seedCorpusLibraries(root);
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({
    section: "seeds",
    patch: { currentPersonaId: libraries.persona.id, defaultPersonaId: libraries.persona.id },
  });
  const recall = await seedRecallCorpus(root, {
    chatConnectionId: actors.connections.text.id,
    embedConnectionId: actors.connections.embed.id,
    summarizeConnectionId: actors.connections.text.id,
  });
  const knowledge = await seedCorpusKnowledge(root, recall);
  const automation = await seedCorpusAutomation(root, libraries.room.chat.id);
  const plugins = await seedCorpusPlugins(root, oidc.joiner.id);
  const rpg = await seedCorpusRpg(root);
  const rpgProvider = await seedCorpusRpgProvider(root, actors.connections.text.id);
  const knowledgeVariants = await seedCorpusKnowledgeVariants(root);
  const chatLifecycle = await seedCorpusChatLifecycle(root, chatWire, actors.secondUserId, dbHold);
  const imagery = await seedCorpusImagery(root, actors.secondUserId);
  const rpgRecursion = await seedCorpusRpgRecursion(root);
  const rpgMembers = await seedCorpusRpgMembers(root, rpgRecursion, actors.secondUserId);
  const rpgRounds = await seedCorpusRpgRounds(root, rpgFlightWire, rpgFlightTimers, actors.secondUserId);
  const search = await seedCorpusSearch(root, { actors, libraries, recall, images: knowledgeVariants.images });
  const connection = await seedCorpusConnection(root, actors, connectionWire);
  if (connectionWire.remaining() !== 0) {
    throw new Error("completed native connection corpus left unspent physical recipes");
  }
  const libraryViews = await seedCorpusLibraryViews(root, libraries, actors);
  const imageVariants = await seedCorpusImageVariants(root, imageWire, options.seed.ownerPassword);
  const statsSettings = await seedCorpusStatsSettings(root, {
    characterId: knowledgeVariants.character.id,
    personaId: libraries.persona.id,
    foreignUserId: actors.secondUserId,
  });
  const sdkSessions = await seedCorpusSdkSessions(root, sdkExecution);
  const notifications = await seedCorpusNotifications(root);
  await root.settleBackground();
  await assertReferentialIntegrity(db);
  const response = await root.http.request("/healthz");
  if (!response.ok) {
    throw new Error(`synthetic capsule health request failed (${response.status})`);
  }
  const health = healthResponseSchema.parse(await response.json());
  const reads = await captureCorpusReads(root, { ...baseline.identities, personaIds: [libraries.persona.id] });
  const wire = hydrateCorpusWire({
    auth: baseline.auth,
    oidc: oidc.wire,
    health,
    reads,
    notificationInbox: notifications.publication,
    chatLifecycleMember: chatLifecycle.publication,
    worldInfoLibrary: libraryViews.publication.worldInfo,
    regexLibrary: libraryViews.publication.regex,
  });
  const secrets = [
    options.privateCredential.key,
    options.seed.ownerPassword,
    options.server.secretBoxKey?.toString("hex"),
    NATIVE_OIDC_SETTINGS.OIDC_CLIENT_SECRET,
    CORPUS_CONNECTION_KEY,
    CORPUS_CONNECTION_FOREIGN_KEY,
    CORPUS_CONNECTION_HOSTED_KEY,
    CORPUS_SDK_TOKEN,
    ...baseline.secrets,
    ...oidc.secrets,
    ...imageVariants.secrets,
    ...notifications.secrets,
    ...[credential, connection.own.credential, connection.foreign.credential, connection.account.hosted.credential, sdkSessions.credential].flatMap(
      ({ row }) => [row.ciphertext, row.iv, row.tag],
    ),
    ...oidc.transactions.flatMap((row) => [row.state, row.codeVerifier, row.nonce, row.inviteTokenHash]),
    oidc.pending.secretHash,
    oidc.pending.inviteTokenHash,
    oidc.pending.idTokenCiphertext,
    oidc.pending.idTokenIv,
    oidc.pending.idTokenTag,
    ...[...oidc.ownerSessions, ...oidc.joinerSessions].flatMap((row) => [row.tokenHash, row.oidcIdTokenCiphertext, row.oidcIdTokenIv, row.oidcIdTokenTag]),
    ...sdkSessions.receipts.flatMap(({ sessionId, resume }) => [sessionId, resume]),
    chatLifecycle.held.invite.tokenHash,
    chatLifecycle.aborted.invite.tokenHash,
    chatLifecycle.handoff.invite.tokenHash,
  ].filter((value) => value !== null && value !== undefined);
  return {
    wire,
    publishWire: () => serializeCorpusWire(wire, secrets),
    privateCaptures: {
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
