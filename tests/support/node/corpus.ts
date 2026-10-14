// A capsule owns a new synthetic directory and the actual persisted graph. Private rows stay Node-owned;
// only owner-validated wire captures may feed a later, separately authorized portable publication.
import { readFileSync, statSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import type { DataLayout } from "@orb/server/foundation/data-layout";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import type { CorpusWire } from "../iso/corpus.ts";
import { hydrateCorpusWire, parseCorpusWire, serializeCorpusWire } from "../iso/corpus.ts";
import type {
  seedCorpusLibraries as produceCorpusLibraries,
  seedRecallCorpus as produceRecallCorpus,
  seedSyntheticCorpus as produceSyntheticCorpus,
  SeedSyntheticCorpusOptions,
} from "./corpus-seed.ts";
import type { ServerHarnessOptions } from "./server.ts";

const CORPUS_WIRE_FILE = "corpus.json";

export interface CorpusCapsuleOptions {
  readonly directory: string;
  readonly server: Omit<ServerHarnessOptions, "db" | "ownerId" | "physicalPeer" | "authConfig" | "casDir" | "variantDir" | "importStagingDir"> & {
    readonly authConfig: NonNullable<ServerHarnessOptions["authConfig"]> & { readonly mode: "local" };
  };
  readonly seed: SeedSyntheticCorpusOptions;
}

interface CorpusPrivateCaptures {
  readonly baseline: Awaited<ReturnType<typeof produceSyntheticCorpus>>;
  readonly recall: Awaited<ReturnType<typeof produceRecallCorpus>>;
  readonly libraries: Awaited<ReturnType<typeof produceCorpusLibraries>>;
}

export interface CorpusCapsule extends AsyncDisposable {
  readonly layout: DataLayout;
  readonly wire: CorpusWire;
  readonly privateCaptures: CorpusPrivateCaptures;
}

export interface CorpusFixture {
  readonly layout: DataLayout;
  readonly wire: CorpusWire;
}

export interface PreparedCorpusFixture extends CorpusFixture, AsyncDisposable {}

/** Read only a completed, prepared clone; this loader does not construct or boot an application graph. */
export function loadCorpusFixture(directory: string): CorpusFixture {
  const layout = resolveDataLayout({ ["DATA_DIR"]: resolve(directory) });
  const wire = parseCorpusWire(readFileSync(join(layout.root, CORPUS_WIRE_FILE), "utf8"));
  if (!statSync(fileURLToPath(layout.databaseUrl)).isFile()) {
    throw new Error("Prepared corpus fixture has no database file");
  }
  return { layout, wire };
}

/** Clone only a completed capsule; the caller retains this ownership until every stage process stops. */
export async function prepareCorpusFixture(capsule: CorpusCapsule, directory: string): Promise<PreparedCorpusFixture> {
  const root = resolve(directory);
  await mkdir(root);
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(root, { recursive: true, force: true }));
  const layout = resolveDataLayout({ ["DATA_DIR"]: root });
  const { cloneStageDb } = await import("@orb/tooling/snap");
  cloneStageDb(fileURLToPath(capsule.layout.databaseUrl), { databaseUrl: layout.databaseUrl, assetsDir: layout.assets });
  await writeFile(join(root, CORPUS_WIRE_FILE), serializeCorpusWire(capsule.wire), { encoding: "utf8", flag: "wx" });
  const fixture = loadCorpusFixture(root);
  const lifetime = ownership.move();
  return { ...fixture, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

interface CapturedCapsule {
  readonly wire: CorpusWire;
  readonly privateCaptures: CorpusPrivateCaptures;
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
  const { SHIPPED_MIGRATIONS } = await import("./db.ts");
  const { createServerHarness } = await import("./server.ts");
  const { captureCorpusReads, seedCorpusActors, seedCorpusLibraries, seedRecallCorpus, seedSyntheticCorpus } = await import("./corpus-seed.ts");
  await using lifetimes = new AsyncDisposableStack();
  const db = await createDb(layout.databaseUrl);
  lifetimes.defer(() => preCloseHousekeeping(db));
  await runMigrations(db, SHIPPED_MIGRATIONS);
  await assertReferentialIntegrity(db);
  const root = lifetimes.use(
    await createServerHarness({
      ...options.server,
      db,
      casDir: layout.assets,
      variantDir: layout.variants,
      importStagingDir: layout.importStaging,
    }),
  );
  const actors = await seedCorpusActors(root);
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
  await root.settleBackground();
  await assertReferentialIntegrity(db);
  const response = await root.http.request("/healthz");
  if (!response.ok) {
    throw new Error(`synthetic capsule health request failed (${response.status})`);
  }
  const health = healthResponseSchema.parse(await response.json());
  const reads = await captureCorpusReads(root, { ...baseline.identities, personaIds: [libraries.persona.id] });
  return { wire: hydrateCorpusWire({ auth: baseline.auth, health, reads }), privateCaptures: { baseline, recall, libraries } };
}
