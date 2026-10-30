// Persistence: the one-time move of a legacy flat data dir into the current tree, on a real filesystem with a real
// database. A legacy flat tree is the historic state the move exists for. Every case is about what the step moves,
// refuses, resumes or leaves alone; a crash state is produced by failing a real rename, never written by hand.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDb, listBackupFiles, preCloseHousekeeping } from "@orb/db";
import { migrateDataLayout } from "@orb/server/entry/boot";
import { DB_FILE_NAME, LEGACY_ENTRIES } from "@orb/server/foundation/data-layout";
import { expect, test } from "@orb/testkit/node";
import { createTestEnv, createTestLogger } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import { onTestFinished } from "vitest";
import { z } from "zod";

type DataLayoutMigrationReport = Awaited<ReturnType<typeof migrateDataLayout>>;
type DataLayout = Parameters<typeof migrateDataLayout>[0]["layout"];
type EnvInput = Parameters<typeof createTestEnv>[0];

// What the child migration wrote: the fields this file reads, parsed at the process boundary. A warning keeps only
// its structured fields; the message text is copy and is never read.
const warningSchema = z.looseObject({
  kept: z.array(z.object({ entry: z.string(), keptBy: z.string() })).optional(),
  entries: z.array(z.string()).optional(),
  keptBy: z.string().optional(),
  legacyKeyfile: z.string().optional(),
});
const childOutcomeSchema = z.object({
  report: z.object({ moved: z.array(z.object({ from: z.string() })) }).optional(),
  error: z.string().optional(),
  warnings: z.array(warningSchema),
});
type ChildOutcome = z.infer<typeof childOutcomeSchema>;

const HOLDER_SCRIPT = fileURLToPath(new URL("../../../../support/node/db-holder.ts", import.meta.url));
const MIGRATE_SCRIPT = fileURLToPath(new URL("../../../../support/node/migrate-data-layout.ts", import.meta.url));
const HOLDER_TEST_TIMEOUT_MS = 60_000;
// Each child boot is its own node process; a case that runs several of them is billed for each start.
const CHILD_BOOTS_TEST_TIMEOUT_MS = 60_000;
const OPERATOR_FILE = "notes.txt";
const MARKER = "marker.txt";
const KEY_BYTES = `${"ab".repeat(32)}\n`;
const OWNER_ONLY = 0o600;
const PERMISSION_BITS = 0o777;
const SAME_DEVICE = (): number => 1;
const CRASHED_PID = 4242;
const LEGACY_BACKUPS = [`${DB_FILE_NAME}.backup-1`, `${DB_FILE_NAME}.backup-1.keep`, `${DB_FILE_NAME}.backup-2`] as const;

const ENTRY_NAMES = Object.keys(LEGACY_ENTRIES);
const FILE_ENTRIES = ENTRY_NAMES.filter((name) => LEGACY_ENTRIES[name]?.requireBytes === true && name !== DB_FILE_NAME);
const DIR_ENTRIES = ENTRY_NAMES.filter((name) => LEGACY_ENTRIES[name]?.requireBytes === false);
const KEYED = ENTRY_NAMES.flatMap((name) => {
  const keptBy = LEGACY_ENTRIES[name]?.keptBy;
  return keptBy === null || keptBy === undefined ? [] : [{ name, keptBy }];
});

const targetOf = (name: string): string => LEGACY_ENTRIES[name]?.to ?? "missing-entry";

function freshRoot(parent: string): string {
  return join(mkdtempSync(join(parent, "layout-")), "data");
}

// The layout a boot resolves: the parsed record's own, so a key the parse refuses is refused here.
function layoutFor(root: string, over: EnvInput = {}): DataLayout {
  return createTestEnv({ ["DATA_DIR"]: root, ...over }).DATA_LAYOUT;
}

function migrate(layout: DataLayout, deps: Partial<Parameters<typeof migrateDataLayout>[0]> = {}): Promise<DataLayoutMigrationReport> {
  return migrateDataLayout({ layout, logger: createTestLogger(), env: { ["SESSION_SECRET"]: undefined, ["NODE_ENV"]: "test" }, ...deps });
}

/** A rename that fails for the one target the entry `from` moves to, the way a same-device mount answers EBUSY. */
function busyOn(root: string, from: string): (from: string, to: string) => void {
  return (source, to) => {
    if (to === join(root, targetOf(from))) {
      throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    }
    renameSync(source, to);
  };
}

/** A db file whose newest row is committed only in the WAL, as a killed server leaves it: built under an open
 *  connection in a scratch dir and copied in with its sidecars. */
async function plantLegacyDb(root: string, scratchParent: string): Promise<void> {
  const scratch = mkdtempSync(join(scratchParent, "legacy-db-"));
  const scratchDb = join(scratch, DB_FILE_NAME);
  const db = await createDb(pathToFileURL(scratchDb).href);
  await db.run(sql`CREATE TABLE probe (value text not null)`);
  await db.run(sql`INSERT INTO probe (value) VALUES ('checkpointed')`);
  await db.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`);
  await db.run(sql`INSERT INTO probe (value) VALUES ('wal-only')`);
  expect(statSync(`${scratchDb}-wal`).size).toBeGreaterThan(0);
  for (const suffix of ["", "-wal", "-shm"]) {
    cpSync(scratchDb + suffix, join(root, DB_FILE_NAME + suffix));
  }
  await preCloseHousekeeping(db);
}

/** Every legacy name the layout knows, the operator's own file the layout does not, and stores that never move. */
async function plantLegacyTree(root: string, scratchParent: string): Promise<void> {
  mkdirSync(root, { recursive: true });
  await plantLegacyDb(root, scratchParent);
  for (const name of FILE_ENTRIES) {
    writeFileSync(join(root, name), KEY_BYTES, { mode: OWNER_ONLY });
  }
  for (const name of DIR_ENTRIES) {
    mkdirSync(join(root, name, "nested"), { recursive: true });
    writeFileSync(join(root, name, MARKER), `legacy ${name}`);
  }
  for (const name of LEGACY_BACKUPS) {
    writeFileSync(join(root, name), `planted ${name}`);
  }
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", MARKER), "assets stay");
  writeFileSync(join(root, OPERATOR_FILE), "the operator's own file");
}

async function probeValues(dbPath: string): Promise<readonly string[]> {
  const db = await createDb(pathToFileURL(dbPath).href);
  try {
    return (await db.all<{ value: string }>(sql`SELECT value FROM probe ORDER BY value`)).map((row) => row.value);
  } finally {
    await preCloseHousekeeping(db);
  }
}

/** The pre-move snapshots: complete db copies in the backup dir that are not a planted legacy backup. */
function snapshotsIn(layout: DataLayout): readonly string[] {
  return listBackupFiles(layout.backups, DB_FILE_NAME).filter((name) => !(LEGACY_BACKUPS as readonly string[]).includes(name));
}

const movedFrom = (report: DataLayoutMigrationReport): readonly string[] => report.moved.map((move) => move.from).sort();

/** One boot's migration in its own process, under the env keys a boot would hold, with the warnings it logged. */
async function migrateInChild(root: string, outcomePath: string, keepers: EnvInput = {}): Promise<ChildOutcome> {
  const child = spawn(process.execPath, [MIGRATE_SCRIPT, root, outcomePath, JSON.stringify(keepers)], { stdio: ["ignore", "ignore", "inherit"] });
  await once(child, "exit");
  return childOutcomeSchema.parse(JSON.parse(readFileSync(outcomePath, "utf8")));
}

function keyedBy(keptBy: string): string {
  const entry = KEYED.find((keyed) => keyed.keptBy === keptBy);
  if (entry === undefined) {
    throw new Error(`no legacy entry is kept by ${keptBy}`);
  }
  return entry.name;
}
const rootListing = (root: string): readonly string[] => readdirSync(root).sort();

test("a fresh install gets the container dirs and no move", async ({ importStagingDir }) => {
  const layout = layoutFor(freshRoot(importStagingDir));
  expect(await migrate(layout)).toEqual({ moved: [], leftInPlace: [], resumed: false });
  for (const dir of [layout.dbDir, layout.backups, layout.secrets, layout.cache, layout.reports]) {
    expect(statSync(dir).isDirectory(), dir).toBe(true);
  }
});

test("a legacy tree moves every named entry byte for byte, snapshots the db first and leaves the operator's file and the stores that never move", async ({
  importStagingDir,
}) => {
  const root = freshRoot(importStagingDir);
  await plantLegacyTree(root, importStagingDir);
  const layout = layoutFor(root);

  const report = await migrate(layout);

  expect(report.resumed).toBe(false);
  expect(report.leftInPlace).toEqual([OPERATOR_FILE]);
  expect(movedFrom(report)).toEqual([...ENTRY_NAMES, ...LEGACY_BACKUPS].sort());
  for (const name of ENTRY_NAMES) {
    expect(existsSync(join(root, name)), name).toBe(false);
  }
  for (const name of FILE_ENTRIES) {
    expect(readFileSync(join(root, targetOf(name)), "utf8"), name).toBe(KEY_BYTES);
    // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission bits require a bitwise mask.
    expect(statSync(join(root, targetOf(name))).mode & PERMISSION_BITS, name).toBe(OWNER_ONLY);
  }
  for (const name of DIR_ENTRIES) {
    expect(readFileSync(join(root, targetOf(name), MARKER), "utf8"), name).toBe(`legacy ${name}`);
  }
  // The db moved as one file, carrying the row that existed only in the WAL; nothing is left beside it.
  expect(readdirSync(layout.dbDir)).toEqual([DB_FILE_NAME]);
  expect(await probeValues(join(layout.dbDir, DB_FILE_NAME))).toEqual(["checkpointed", "wal-only"]);
  // The legacy backups and pin moved, and the pre-move snapshot joined them as a complete copy.
  const backups = listBackupFiles(layout.backups, DB_FILE_NAME);
  for (const name of LEGACY_BACKUPS) {
    expect(backups).toContain(name);
    expect(readFileSync(join(layout.backups, name), "utf8")).toBe(`planted ${name}`);
  }
  const [snapshot, ...extra] = snapshotsIn(layout);
  expect(extra).toEqual([]);
  expect(await probeValues(join(layout.backups, snapshot ?? "missing-snapshot"))).toEqual(["checkpointed", "wal-only"]);
  expect(readFileSync(join(layout.assets, MARKER), "utf8")).toBe("assets stay");
  // Nothing but the owned tree and the operator's file remains, so no journal is left either.
  expect(rootListing(root)).toEqual(
    [layout.dbDir, layout.backups, layout.assets, layout.users, layout.secrets, layout.reports, layout.cache]
      .map((path) => path.slice(root.length + 1))
      .concat(OPERATOR_FILE)
      .filter((name) => existsSync(join(root, name)))
      .sort(),
  );

  // A second run on the migrated tree moves nothing and takes no further snapshot.
  const before = listBackupFiles(layout.backups, DB_FILE_NAME);
  expect((await migrate(layout)).moved).toEqual([]);
  expect(listBackupFiles(layout.backups, DB_FILE_NAME)).toEqual(before);
});

test.for(KEYED)(
  "an explicit $keptBy keeps legacy $name where it is and names it as left in place; every other entry still moves",
  async ({ name, keptBy }, { importStagingDir }) => {
    const root = freshRoot(importStagingDir);
    await plantLegacyTree(root, importStagingDir);
    const kept: Partial<Record<typeof keptBy, string>> = {
      ["CREDENTIALS_KEY"]: "cd".repeat(32),
      ["SESSION_SECRET"]: "ef".repeat(32),
      ["DATABASE_URL"]: pathToFileURL(join(root, DB_FILE_NAME)).href,
      ["LOCAL_LIGHT_CACHE_DIR"]: join(root, name, "transformers"),
      ["IMPORT_STAGING_DIR"]: join(root, name),
    };
    const value = kept[keptBy];
    if (value === undefined) {
      throw new Error(`a legacy entry is kept by ${keptBy}, which this case has no value for`);
    }
    const layout = layoutFor(root, { [keptBy]: value });

    const report = await migrate(layout);

    expect(movedFrom(report)).toEqual([...ENTRY_NAMES.filter((entry) => entry !== name), ...LEGACY_BACKUPS].sort());
    // A kept db stays with its sidecars, so the report may name them too.
    expect(report.leftInPlace).toContain(name);
    expect(report.leftInPlace.filter((entry) => !entry.startsWith(name))).toEqual([OPERATOR_FILE]);
    expect(existsSync(join(root, name))).toBe(true);
    expect(existsSync(join(root, targetOf(name)))).toBe(false);
    // The db is snapshotted only when it moves, since the snapshot protects the move.
    expect(snapshotsIn(layout)).toHaveLength(keptBy === "DATABASE_URL" ? 0 : 1);
  },
);

test("a legacy path whose target holds data refuses before any move, and moves once the target is cleared", async ({ importStagingDir }) => {
  const root = freshRoot(importStagingDir);
  await plantLegacyTree(root, importStagingDir);
  const layout = layoutFor(root);
  mkdirSync(layout.dbDir);
  writeFileSync(join(layout.dbDir, DB_FILE_NAME), "a newer db");
  const before = rootListing(root);

  await expect(migrate(layout)).rejects.toThrow();

  expect(rootListing(root)).toEqual(before);
  expect(readFileSync(join(layout.dbDir, DB_FILE_NAME), "utf8")).toBe("a newer db");
  expect(existsSync(layout.secrets)).toBe(false);

  // Control: the same tree with the target emptied moves, so the refusal was the target's data.
  writeFileSync(join(layout.dbDir, DB_FILE_NAME), "");
  expect(movedFrom(await migrate(layout))).toContain(DB_FILE_NAME);
});

test("a zero-byte legacy db at the root is not data: it is ignored, never deleted and never a conflict", async ({ importStagingDir }) => {
  const root = freshRoot(importStagingDir);
  const layout = layoutFor(root);
  mkdirSync(layout.dbDir, { recursive: true });
  writeFileSync(join(layout.dbDir, DB_FILE_NAME), "the real db");
  writeFileSync(join(root, DB_FILE_NAME), "");

  expect((await migrate(layout)).moved).toEqual([]);
  expect(readFileSync(join(layout.dbDir, DB_FILE_NAME), "utf8")).toBe("the real db");
  expect(statSync(join(root, DB_FILE_NAME)).size).toBe(0);
});

test.for(["models", "variants"].filter((name) => name in LEGACY_ENTRIES))(
  "a source on another filesystem ($0) refuses before any write; with the root's device it moves",
  async (name, { importStagingDir }) => {
    const root = freshRoot(importStagingDir);
    await plantLegacyTree(root, importStagingDir);
    const layout = layoutFor(root);
    const before = rootListing(root);

    await expect(migrate(layout, { deviceOf: (path) => (path === join(root, name) ? 2 : 1) })).rejects.toThrow();

    expect(rootListing(root)).toEqual(before);
    expect(existsSync(layout.backups)).toBe(false);
    expect(movedFrom(await migrate(layout, { deviceOf: SAME_DEVICE }))).toContain(name);
  },
);

test("a target container linked onto another filesystem refuses before any write, and takes the moves through the link on the root's device", async ({
  importStagingDir,
}) => {
  const root = freshRoot(importStagingDir);
  await plantLegacyTree(root, importStagingDir);
  const layout = layoutFor(root);
  const elsewhere = mkdtempSync(join(importStagingDir, "elsewhere-"));
  const elsewhereReal = realpathSync(elsewhere);
  symlinkSync(elsewhere, layout.cache);

  await expect(migrate(layout, { deviceOf: (path) => (path.startsWith(elsewhereReal) ? 2 : 1) })).rejects.toThrow();

  expect(readdirSync(elsewhere)).toEqual([]);
  expect(existsSync(layout.backups)).toBe(false);
  expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);

  await migrate(layout, { deviceOf: SAME_DEVICE });
  expect(readFileSync(join(elsewhere, targetOf("variants").split("/").slice(1).join("/"), MARKER), "utf8")).toBe("legacy variants");
});

test("a data root that is itself a symlink is compared through the link, not beside it", async ({ importStagingDir }) => {
  const real = freshRoot(importStagingDir);
  await plantLegacyTree(real, importStagingDir);
  const link = join(mkdtempSync(join(importStagingDir, "link-")), "data");
  symlinkSync(real, link);

  const report = await migrate(layoutFor(link), { deviceOf: (path) => (path === link ? 2 : 1) });

  expect(movedFrom(report)).toContain(DB_FILE_NAME);
  expect(existsSync(join(real, targetOf(DB_FILE_NAME)))).toBe(true);
});

test("an empty mount point at a target refuses before any write; the keyed entry stays by its key, the keyless one by the skip list, and the rest moves", async ({
  importStagingDir,
}) => {
  const root = freshRoot(importStagingDir);
  await plantLegacyTree(root, importStagingDir);
  const keyedName = KEYED.find(({ name }) => DIR_ENTRIES.includes(name));
  const keylessName = DIR_ENTRIES.find((name) => LEGACY_ENTRIES[name]?.keptBy === null);
  if (keyedName === undefined || keylessName === undefined) {
    throw new Error("the layout has no keyed and keyless directory entry to mount over");
  }
  const mounted = new Set([keyedName.name, keylessName].map((name) => join(root, targetOf(name))));
  for (const path of mounted) {
    mkdirSync(path, { recursive: true });
  }
  const real = new Set([...mounted].map((path) => realpathSync(path)));
  const deviceOf = (path: string): number => (real.has(path) ? 2 : 1);
  const before = rootListing(root);

  await expect(migrate(layoutFor(root), { deviceOf })).rejects.toThrow();
  expect(existsSync(layoutFor(root).backups)).toBe(false);
  expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
  expect(rootListing(root)).toEqual(before);

  const remedied = layoutFor(root, { [keyedName.keptBy]: join(root, keyedName.name, "transformers"), ["DATA_LAYOUT_SKIP"]: keylessName });
  const report = await migrate(remedied, { deviceOf });
  expect(report.leftInPlace).toEqual([keyedName.name, keylessName, OPERATOR_FILE].sort());
  expect(movedFrom(report)).toContain(DB_FILE_NAME);
  expect(readFileSync(join(root, keylessName, MARKER), "utf8")).toBe(`legacy ${keylessName}`);
});

// Entries move in the layout's own order with the db last, so a failure on the second to last entry leaves a real
// journal with applied entries behind it and the db still pending.
const FAILING = DIR_ENTRIES.filter((name) => name !== "variants").at(-1) ?? "missing-entry";

async function crashedBoot(root: string, scratchParent: string, over: Parameters<typeof migrate>[1] = {}): Promise<DataLayout> {
  await plantLegacyTree(root, scratchParent);
  const layout = layoutFor(root);
  await expect(migrate(layout, { rename: busyOn(root, FAILING), ...over })).rejects.toThrow();
  expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
  expect(existsSync(join(root, targetOf(FAILING)))).toBe(false);
  return layout;
}

test("a boot that crashed mid-move resumes on the next: applied entries are accepted, pending ones move, the db included", async ({ importStagingDir }) => {
  const root = freshRoot(importStagingDir);
  const layout = await crashedBoot(root, importStagingDir, { pid: CRASHED_PID });

  const report = await migrate(layout, { isPidAlive: () => false });

  expect(report.resumed).toBe(true);
  expect(movedFrom(report)).toEqual([...ENTRY_NAMES, ...LEGACY_BACKUPS].sort());
  expect(readFileSync(join(root, targetOf(FAILING), MARKER), "utf8")).toBe(`legacy ${FAILING}`);
  expect(await probeValues(join(layout.dbDir, DB_FILE_NAME))).toEqual(["checkpointed", "wal-only"]);
  expect((await migrate(layout)).resumed).toBe(false);
});

test("a journal held by another live process refuses and touches nothing, until that process is gone", async ({ importStagingDir }) => {
  const root = freshRoot(importStagingDir);
  const layout = await crashedBoot(root, importStagingDir, { pid: CRASHED_PID });
  const before = rootListing(root);

  await expect(migrate(layout, { isPidAlive: () => true })).rejects.toThrow();

  expect(rootListing(root)).toEqual(before);
  expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
  expect((await migrate(layout, { isPidAlive: () => false })).resumed).toBe(true);
});

// A container restart hands node the same pid, so a crash between the journal write and its removal must resume
// under the default liveness check instead of locking the box out as "another process".
test("a journal recorded under this process's own pid resumes with the default liveness check", async ({ importStagingDir }) => {
  const root = freshRoot(importStagingDir);
  const layout = await crashedBoot(root, importStagingDir);

  const report = await migrate(layout);

  expect(report.resumed).toBe(true);
  expect(movedFrom(report)).toContain(DB_FILE_NAME);
});

test("a resume refuses when a pending entry's source and target both hold data, keeping the journal for the operator", async ({ importStagingDir }) => {
  const root = freshRoot(importStagingDir);
  const layout = await crashedBoot(root, importStagingDir, { pid: CRASHED_PID });
  mkdirSync(layout.dbDir, { recursive: true });
  writeFileSync(join(layout.dbDir, DB_FILE_NAME), "a different db");

  await expect(migrate(layout, { isPidAlive: () => false })).rejects.toThrow();
  expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
  expect(readFileSync(join(layout.dbDir, DB_FILE_NAME), "utf8")).toBe("a different db");

  // The journal survived the refusal: once the target is cleared the same boot resumes.
  writeFileSync(join(layout.dbDir, DB_FILE_NAME), "");
  expect((await migrate(layout, { isPidAlive: () => false })).resumed).toBe(true);
});

test("a resume refuses when a pending entry has neither side, a state a rename cannot produce", async ({ importStagingDir }) => {
  const root = freshRoot(importStagingDir);
  const layout = await crashedBoot(root, importStagingDir, { pid: CRASHED_PID });
  const moved = join(root, FAILING);
  const gone = join(importStagingDir, "removed-by-the-operator");
  renameSync(moved, gone);

  await expect(migrate(layout, { isPidAlive: () => false })).rejects.toThrow();
  expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);

  // The journal survived the refusal: putting the entry back lets the same boot resume.
  renameSync(gone, moved);
  expect((await migrate(layout, { isPidAlive: () => false })).resumed).toBe(true);
});

test.for(KEYED.filter(({ name }) => DIR_ENTRIES.includes(name)).map(({ name, keptBy }) => ({ name, keptBy })))(
  "a rename that fails at apply time refuses every boot with one snapshot until the env keeps $name, then the rest moves",
  async ({ name, keptBy }, { importStagingDir }) => {
    const root = freshRoot(importStagingDir);
    await plantLegacyTree(root, importStagingDir);
    const layout = layoutFor(root);
    const rename = busyOn(root, name);

    for (let boot = 0; boot < 3; boot += 1) {
      await expect(migrate(layout, { rename }), `boot ${boot}`).rejects.toThrow();
      expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
      // A resume never snapshots again: the first boot's copy still covers the db.
      expect(snapshotsIn(layout)).toHaveLength(1);
    }

    const remedied = layoutFor(root, { [keptBy]: keptBy === "LOCAL_LIGHT_CACHE_DIR" ? join(root, name, "transformers") : join(root, name) });
    const report = await migrate(remedied, { rename });
    expect(report.resumed).toBe(true);
    expect(movedFrom(report)).toContain(DB_FILE_NAME);
    expect(report.leftInPlace).toEqual([name, OPERATOR_FILE].sort());
    expect(readFileSync(join(root, name, MARKER), "utf8")).toBe(`legacy ${name}`);
    expect(await probeValues(join(remedied.dbDir, DB_FILE_NAME))).toEqual(["checkpointed", "wal-only"]);
    // The remedy kept, a further boot is a no-op.
    expect((await migrate(remedied, { rename })).moved).toEqual([]);
  },
);

// Moving the db from under a running server would let it reopen by the old path into an empty file, so an idle
// connection that holds no lock must still be a refusal. Each party is its own process, as in production.
test(
  "an idle holder of the legacy db refuses the move before any write; once it is gone the same tree moves on the next boot",
  async ({ importStagingDir }) => {
    const root = freshRoot(importStagingDir);
    await plantLegacyTree(root, importStagingDir);
    const layout = layoutFor(root);

    const holder = spawn(process.execPath, [HOLDER_SCRIPT, join(root, DB_FILE_NAME)], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
    const holderExit = once(holder, "exit");
    onTestFinished(async () => {
      holder.kill("SIGKILL");
      await holderExit;
    });
    await Promise.race([once(holder, "message"), holderExit.then(() => Promise.reject(new Error("the db holder exited before holding the db")))]);

    const outcomePath = (label: string): string => join(importStagingDir, `${label}.json`);
    const run = (label: string): Promise<ChildOutcome> => migrateInChild(root, outcomePath(label));

    const refused = await run("held");
    expect(refused.report).toBeUndefined();
    expect(refused.error).toBeDefined();
    expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
    expect(existsSync(layout.backups)).toBe(false);
    expect(existsSync(join(root, FILE_ENTRIES[0] ?? "missing-entry"))).toBe(true);

    holder.kill("SIGKILL");
    await holderExit;

    // Control: with the holder gone the same tree moves, and the moved db carries the rows.
    const released = await run("released");
    expect(released.error).toBeUndefined();
    expect(released.report?.moved.some((move) => move.from === DB_FILE_NAME)).toBe(true);
    expect(await probeValues(join(layout.dbDir, DB_FILE_NAME))).toEqual(["checkpointed", "wal-only"]);
  },
  HOLDER_TEST_TIMEOUT_MS,
);

// An operator who pins a key by env keeps its legacy keyfile where it is; the boot names that keyfile with its keeper,
// so it never reads as an entry the layout does not know, and it is never silently left behind.
test("a keyfile kept by an explicit key is warned with its keeper, never as an entry the layout does not name", {
  timeout: CHILD_BOOTS_TEST_TIMEOUT_MS,
}, async ({ importStagingDir }) => {
  const keyfile = keyedBy("CREDENTIALS_KEY");
  const root = freshRoot(importStagingDir);
  await plantLegacyTree(root, importStagingDir);

  const kept = await migrateInChild(root, join(importStagingDir, "kept.json"), { ["CREDENTIALS_KEY"]: "cd".repeat(32) });
  expect(kept.error).toBeUndefined();
  expect(kept.warnings.flatMap((warning) => warning.kept ?? [])).toEqual([{ entry: keyfile, keptBy: "CREDENTIALS_KEY" }]);
  expect(kept.warnings.flatMap((warning) => warning.entries ?? [])).toEqual([OPERATOR_FILE]);
  expect(existsSync(join(root, keyfile))).toBe(true);

  // Control: with no explicit key the same keyfile moves, and nothing is warned as kept.
  const movedRoot = freshRoot(importStagingDir);
  await plantLegacyTree(movedRoot, importStagingDir);
  const moved = await migrateInChild(movedRoot, join(importStagingDir, "moved.json"));
  expect(moved.warnings.flatMap((warning) => warning.kept ?? [])).toEqual([]);
  expect(existsSync(join(movedRoot, keyfile))).toBe(false);
});

// A legacy session keyfile an explicit SESSION_SECRET keeps in place holds the pepper every earlier password,
// session and invite was hashed with. While a different SESSION_SECRET is in use those stop matching, so each boot
// names the stranded file and its keeper; the same pepper, or no explicit secret, is silent.
test("a legacy session secret kept beside a different explicit SESSION_SECRET is warned on every boot; the same one, or none, is not", {
  timeout: CHILD_BOOTS_TEST_TIMEOUT_MS,
}, async ({ importStagingDir }) => {
  const keyfile = keyedBy("SESSION_SECRET");
  const stranded = (outcome: ChildOutcome): readonly z.infer<typeof warningSchema>[] =>
    outcome.warnings.filter((warning) => warning.legacyKeyfile !== undefined);
  const root = freshRoot(importStagingDir);
  await plantLegacyTree(root, importStagingDir);
  const minted = { ["SESSION_SECRET"]: "ef".repeat(32) };

  for (const boot of ["first", "second"]) {
    const outcome = await migrateInChild(root, join(importStagingDir, `${boot}.json`), minted);
    expect(outcome.error, boot).toBeUndefined();
    expect(stranded(outcome), boot).toEqual([expect.objectContaining({ keptBy: "SESSION_SECRET", legacyKeyfile: join(root, keyfile) })]);
  }

  const sameRoot = freshRoot(importStagingDir);
  await plantLegacyTree(sameRoot, importStagingDir);
  const same = await migrateInChild(sameRoot, join(importStagingDir, "same.json"), { ["SESSION_SECRET"]: KEY_BYTES.trim() });
  expect(same.error).toBeUndefined();
  expect(stranded(same)).toEqual([]);

  const unsetRoot = freshRoot(importStagingDir);
  await plantLegacyTree(unsetRoot, importStagingDir);
  const unset = await migrateInChild(unsetRoot, join(importStagingDir, "unset.json"));
  expect(stranded(unset)).toEqual([]);
  expect(readFileSync(join(unsetRoot, targetOf(keyfile)), "utf8")).toBe(KEY_BYTES);
});
