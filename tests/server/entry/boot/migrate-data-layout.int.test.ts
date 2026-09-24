// entry/boot/migrate-data-layout — the one-time move of a legacy flat data dir into the current tree, on a
// real filesystem with a real libSQL db. The moves are renames under a journal, so every arm here is about
// what the step refuses, resumes or leaves alone, as much as about what it moves.

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import process, { pid } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createDb, preCloseHousekeeping } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { DataLayoutMigrationReport } from "@orb/server/entry/boot";
import { LAYOUT_JOURNAL, migrateDataLayout } from "@orb/server/entry/boot";
import type { DataLayout } from "@orb/server/foundation/data-layout";
import { DB_FILE_NAME, resolveDataLayout, SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import { getLog } from "@orb/server/foundation/observability";
import { createCas } from "@orb/server/infra/storage";
import type { NicedChild } from "@orb/tooling/_shared/proc";
import { spawnNicedChild } from "@orb/tooling/_shared/proc";
import { sql } from "drizzle-orm";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("user_layout_owner");
const NOW = 1_700_000_000_000;
const BACKUP_RE = /^orbweaver\.db\.backup-\d+$/u;
const KEY_HEX = `${"ab".repeat(32)}\n`;
const SECRET_HEX = `${"cd".repeat(32)}\n`;
// The holder test boots two more node processes on the tree and waits for each to settle.
const HOLDER_TEST_TIMEOUT_MS = 60_000;
const HOLDER_SCRIPT = fileURLToPath(new URL("../../../support/node/db-holder.ts", import.meta.url));
const MIGRATE_SCRIPT = fileURLToPath(new URL("../../../support/node/migrate-data-layout.ts", import.meta.url));
const CHILD_POLL_MS = 50;
const CHILD_POLL_ATTEMPTS = 400;
const VARIANT_REL = join("user_x", "ab", "cd", `${"ab".repeat(32)}`, "w64-q80.webp");

const roots: string[] = [];
function freshRoot(): string {
  const parent = mkdtempSync(join(tmpdir(), `orb-layout-${pid}-`));
  roots.push(parent);
  return join(parent, "data");
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function layoutFor(root: string, overrides: Record<string, string> = {}): DataLayout {
  return resolveDataLayout({ ["DATA_DIR"]: root, ...overrides });
}

/** A db file whose newest row is committed only in the WAL: built under an open connection in a scratch
 *  dir and copied in with its sidecars, which is what a crashed or killed server leaves behind. */
async function plantLegacyDb(root: string): Promise<void> {
  const scratch = mkdtempSync(join(tmpdir(), `orb-layout-src-${pid}-`));
  roots.push(scratch);
  const scratchDb = join(scratch, DB_FILE_NAME);
  const db = await createDb(`file:${scratchDb}`);
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

/** Every legacy name the table knows, plus one entry it does not and one it owns unchanged. */
async function plantLegacyTree(root: string): Promise<{ readonly hash: string }> {
  mkdirSync(root, { recursive: true });
  await plantLegacyDb(root);
  const { hash } = await createCas(join(root, "assets")).putBytes(OWNER, new Uint8Array([1, 2, 3, 4]), NOW);
  mkdirSync(join(root, "variants", VARIANT_REL, ".."), { recursive: true });
  writeFileSync(join(root, "variants", VARIANT_REL), "webp-bytes");
  writeFileSync(join(root, `${DB_FILE_NAME}.backup-1`), "backup-one");
  writeFileSync(join(root, `${DB_FILE_NAME}.backup-1.keep`), "");
  writeFileSync(join(root, `${DB_FILE_NAME}.backup-2`), "backup-two");
  writeFileSync(join(root, ".credentials-key"), KEY_HEX, { mode: 0o600 });
  writeFileSync(join(root, ".session-secret"), SECRET_HEX, { mode: 0o600 });
  mkdirSync(join(root, "models", "transformers"), { recursive: true });
  writeFileSync(join(root, "models", "transformers", "weights.onnx"), "weights");
  mkdirSync(join(root, "import-staging", "user_x"), { recursive: true });
  writeFileSync(join(root, "import-staging", "user_x", "upload.zip"), "zip");
  mkdirSync(join(root, "import-reports"));
  writeFileSync(join(root, "import-reports", "import-1.md"), "# report");
  mkdirSync(join(root, "users", "user_x"), { recursive: true });
  writeFileSync(join(root, "users", "user_x", "state.json"), "{}");
  writeFileSync(join(root, "notes.txt"), "the operator's own file");
  return { hash };
}

async function probeValues(dbPath: string): Promise<string[]> {
  const db = await createDb(`file:${dbPath}`);
  try {
    const rows = await db.all<{ value: string }>(sql`SELECT value FROM probe ORDER BY value`);
    return rows.map((row) => row.value);
  } finally {
    await preCloseHousekeeping(db);
  }
}

async function settled(done: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < CHILD_POLL_ATTEMPTS && !done(); attempt += 1) {
    await sleep(CHILD_POLL_MS);
  }
  return done();
}

/** A support script in a second node process, resolved once it has written `output` or exited. */
async function runSupportScript(script: string, args: readonly string[], output: string, logPath: string): Promise<NicedChild> {
  const child = spawnNicedChild(process.execPath, [script, ...args, output], { logPath });
  if (!(await settled(() => existsSync(output) || child.hasExited()))) {
    child.killGroup("SIGKILL");
    throw new Error(`${script} did not settle: ${readFileSync(logPath, "utf8")}`);
  }
  return child;
}

/** A second process holding an idle, already-used connection on `dbPath`. */
async function holdDbInChild(dbPath: string, scratch: string): Promise<{ readonly release: () => Promise<void> }> {
  const logPath = join(scratch, "holder.log");
  const child = await runSupportScript(HOLDER_SCRIPT, [dbPath], join(scratch, "holder.ready"), logPath);
  if (child.hasExited()) {
    throw new Error(`db holder exited before holding: ${readFileSync(logPath, "utf8")}`);
  }
  return {
    release: async (): Promise<void> => {
      child.killGroup("SIGKILL");
      if (!(await settled(() => child.hasExited()))) {
        throw new Error("db holder did not exit after SIGKILL");
      }
    },
  };
}

interface ChildMigrationOutcome {
  readonly report?: DataLayoutMigrationReport;
  readonly error?: string;
}

/** The migration run by its own process, as a boot runs it; `label` keeps two boots' outcomes apart. */
async function migrateInChild(root: string, scratch: string, label: string): Promise<ChildMigrationOutcome> {
  const logPath = join(scratch, `migrate-${label}.log`);
  const outcomePath = join(scratch, `migrate-${label}.json`);
  await runSupportScript(MIGRATE_SCRIPT, [root], outcomePath, logPath);
  if (!existsSync(outcomePath)) {
    throw new Error(`the child migration wrote no outcome: ${readFileSync(logPath, "utf8")}`);
  }
  return JSON.parse(readFileSync(outcomePath, "utf8")) as ChildMigrationOutcome;
}

describe("migrateDataLayout", () => {
  test("a fresh install gets the container dirs, no journal and no move", async () => {
    const root = freshRoot();
    const report = await migrateDataLayout({ layout: layoutFor(root) });
    expect(report).toEqual({ moved: [], leftInPlace: [], resumed: false });
    expect(readdirSync(root).sort()).toEqual(["backups", "cache", "db", "reports", "secrets"]);
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);
  });

  test("a legacy tree moves every named entry, byte for byte, with a snapshot first and nothing legacy left", async () => {
    const root = freshRoot();
    const { hash } = await plantLegacyTree(root);
    const layout = layoutFor(root);

    const report = await migrateDataLayout({ layout, pid });

    expect(report.resumed).toBe(false);
    expect(report.leftInPlace).toEqual(["notes.txt"]);
    expect(readdirSync(root).sort()).toEqual(["assets", "backups", "cache", "db", "notes.txt", "reports", "secrets", "users"]);
    // The db moved as ONE file: leaving WAL folded the planted sidecars into it, so none is left at the root
    // (the listing above) or beside the moved db, and a journal can never hold a sidecar entry to lose. Checked
    // BEFORE anything opens the moved db, which would create fresh sidecars.
    expect(readdirSync(join(root, "db"))).toEqual([DB_FILE_NAME]);
    // The db reads at its new path, including the row that was only in the WAL.
    expect(await probeValues(join(root, "db", DB_FILE_NAME))).toEqual(["checkpointed", "wal-only"]);
    // The legacy backups and the pin moved, and the pre-move snapshot joined them as a complete db.
    const backups = readdirSync(join(root, "backups")).sort();
    expect(backups).toContain(`${DB_FILE_NAME}.backup-1`);
    expect(backups).toContain(`${DB_FILE_NAME}.backup-1.keep`);
    expect(backups).toContain(`${DB_FILE_NAME}.backup-2`);
    expect(readFileSync(join(root, "backups", `${DB_FILE_NAME}.backup-2`), "utf-8")).toBe("backup-two");
    const snapshots = backups.filter((name) => BACKUP_RE.test(name) && !name.endsWith("-1") && !name.endsWith("-2"));
    expect(snapshots).toHaveLength(1);
    expect(await probeValues(join(root, "backups", snapshots[0] ?? ""))).toEqual(["checkpointed", "wal-only"]);
    // The keys moved by rename: same bytes, same mode, no rotation.
    const keyPath = join(root, "secrets", SECRET_FILE_NAMES.credentialsKey);
    expect(readFileSync(keyPath, "utf-8")).toBe(KEY_HEX);
    // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission bits require a bitwise mask.
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(root, "secrets", SECRET_FILE_NAMES.sessionSecret), "utf-8")).toBe(SECRET_HEX);
    // The caches and the reports moved as whole directories.
    expect(readFileSync(join(root, "cache", "variants", VARIANT_REL), "utf-8")).toBe("webp-bytes");
    expect(readFileSync(join(root, "cache", "models", "transformers", "weights.onnx"), "utf-8")).toBe("weights");
    expect(readFileSync(join(root, "cache", "import-staging", "user_x", "upload.zip"), "utf-8")).toBe("zip");
    expect(readFileSync(join(root, "reports", "import-1.md"), "utf-8")).toBe("# report");
    // The stores that never move still verify in place.
    expect(await createCas(layout.assets).verify(OWNER, hash)).toBe(true);
    expect(readFileSync(join(root, "users", "user_x", "state.json"), "utf-8")).toBe("{}");
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);
    expect(report.moved.map((move) => move.from).sort()).toEqual(
      [
        ".credentials-key",
        ".session-secret",
        "import-reports",
        "import-staging",
        "models",
        DB_FILE_NAME,
        `${DB_FILE_NAME}.backup-1`,
        `${DB_FILE_NAME}.backup-1.keep`,
        `${DB_FILE_NAME}.backup-2`,
        "variants",
      ].sort(),
    );
  });

  test("a second run on the migrated tree is a no-op with zero renames", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    await migrateDataLayout({ layout: layoutFor(root), pid });
    const before = readdirSync(join(root, "backups")).sort();
    const again = await migrateDataLayout({ layout: layoutFor(root), pid });
    expect(again).toEqual({ moved: [], leftInPlace: [], resumed: false });
    expect(readdirSync(join(root, "backups")).sort()).toEqual(before);
  });

  test("a legacy path whose target holds data refuses before any rename and names both paths with their sizes", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    mkdirSync(join(root, "db"));
    writeFileSync(join(root, "db", DB_FILE_NAME), "a newer db");
    const legacyBytes = statSync(join(root, DB_FILE_NAME)).size;
    await expect(migrateDataLayout({ layout: layoutFor(root), pid })).rejects.toThrow(
      `${join(root, DB_FILE_NAME)} (${legacyBytes} bytes) and ${join(root, "db", DB_FILE_NAME)} (10 bytes)`,
    );
    // Nothing moved, no journal, both files as planted.
    expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
    expect(readFileSync(join(root, "db", DB_FILE_NAME), "utf-8")).toBe("a newer db");
    expect(existsSync(join(root, ".credentials-key"))).toBe(true);
    expect(existsSync(join(root, "secrets"))).toBe(false);
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);
  });

  test("an explicitly set slot stays where it is and is named as left in place; the control moves it", async () => {
    const explicitRoot = freshRoot();
    await plantLegacyTree(explicitRoot);
    const report = await migrateDataLayout({
      layout: layoutFor(explicitRoot, { ["LOCAL_LIGHT_CACHE_DIR"]: join(explicitRoot, "models", "transformers") }),
      pid,
    });
    expect(existsSync(join(explicitRoot, "models", "transformers", "weights.onnx"))).toBe(true);
    expect(existsSync(join(explicitRoot, "cache", "models"))).toBe(false);
    expect(report.moved.some((move) => move.from === "models")).toBe(false);
    expect(report.leftInPlace).toEqual(["models", "notes.txt"]);

    const controlRoot = freshRoot();
    await plantLegacyTree(controlRoot);
    const control = await migrateDataLayout({ layout: layoutFor(controlRoot), pid });
    expect(control.moved.some((move) => move.from === "models")).toBe(true);
    expect(existsSync(join(controlRoot, "models"))).toBe(false);
  });

  test("an explicit DATABASE_URL leaves the legacy db at the root while the rest still moves", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    const report = await migrateDataLayout({ layout: layoutFor(root, { ["DATABASE_URL"]: `file:${join(root, DB_FILE_NAME)}` }), pid });
    expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
    expect(existsSync(join(root, "db", DB_FILE_NAME))).toBe(false);
    expect(report.moved.some((move) => move.from === DB_FILE_NAME)).toBe(false);
    expect(report.moved.some((move) => move.from === ".credentials-key")).toBe(true);
    // No snapshot was taken: the db did not move, so the backups dir holds only the planted copies.
    expect(
      readdirSync(join(root, "backups"))
        .filter((name) => BACKUP_RE.test(name))
        .sort(),
    ).toEqual([`${DB_FILE_NAME}.backup-1`, `${DB_FILE_NAME}.backup-2`]);
  });

  test("a journal held by another live pid refuses, names the journal file, and touches nothing", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    writeFileSync(join(root, LAYOUT_JOURNAL), JSON.stringify({ pid: 4242, moves: [{ from: ".credentials-key", to: "secrets/credentials_key" }] }));
    const refusal = migrateDataLayout({ layout: layoutFor(root), pid, isPidAlive: () => true });
    await expect(refusal).rejects.toThrow("4242");
    await expect(refusal).rejects.toThrow(join(root, LAYOUT_JOURNAL));
    expect(existsSync(join(root, ".credentials-key"))).toBe(true);
    expect(existsSync(join(root, "secrets"))).toBe(false);
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(true);
  });

  // A container restart hands node the SAME pid, so a crash between the journal write and its removal must
  // resume under the default liveness check, not lock the box out as "another process".
  test("a journal recorded under this process's own pid resumes with the default liveness check", async () => {
    const root = freshRoot();
    mkdirSync(join(root, "secrets"), { recursive: true });
    writeFileSync(join(root, ".credentials-key"), KEY_HEX);
    const moves = [{ from: ".credentials-key", to: join("secrets", SECRET_FILE_NAMES.credentialsKey) }];
    writeFileSync(join(root, LAYOUT_JOURNAL), JSON.stringify({ pid: process.pid, moves }));

    const report = await migrateDataLayout({ layout: layoutFor(root) });

    expect(report.resumed).toBe(true);
    expect(report.moved).toEqual(moves);
    expect(readFileSync(join(root, "secrets", SECRET_FILE_NAMES.credentialsKey), "utf-8")).toBe(KEY_HEX);
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);
  });

  // rename(2) cannot cross a filesystem or a mount point. The device probe is injected: a real second
  // filesystem is not a fixture a unit test owns, and the refusal's shape is what the test pins.
  test("a source on another filesystem refuses before any write and names the entry and the key that keeps it", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    const onOtherDevice = (path: string): number => (path.endsWith(`${sep}models`) ? 2 : 1);
    const refusal = migrateDataLayout({ layout: layoutFor(root), pid, deviceOf: onOtherDevice });
    await expect(refusal).rejects.toThrow(join(root, "models"));
    await expect(refusal).rejects.toThrow("LOCAL_LIGHT_CACHE_DIR");
    // Nothing was written: no journal, no snapshot, the db and the keys where they were.
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);
    expect(existsSync(join(root, "backups"))).toBe(false);
    expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
    expect(existsSync(join(root, ".credentials-key"))).toBe(true);
    // CONTROL: the same tree with every entry on the root's device moves.
    const report = await migrateDataLayout({ layout: layoutFor(root), pid, deviceOf: () => 1 });
    expect(report.moved.some((move) => move.from === "models")).toBe(true);
  });

  // The other end of the rename: a target container that is a symlink onto another filesystem fails rename(2)
  // the same way, and it is not a legacy entry, so the source-side probe never sees it. The probe is handed the
  // container's REAL path, which is what following the link proves.
  test("a target container linked onto another filesystem refuses before any write and names every entry it catches", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    const elsewhere = mkdtempSync(join(tmpdir(), `orb-layout-elsewhere-${pid}-`));
    roots.push(elsewhere);
    const elsewhereReal = realpathSync(elsewhere);
    symlinkSync(elsewhere, join(root, "cache"));
    const cacheIsForeign = (path: string): number => (path.startsWith(elsewhereReal) ? 2 : 1);
    const refusal = migrateDataLayout({ layout: layoutFor(root), pid, deviceOf: cacheIsForeign });
    // Both entries that land in `cache/`: the one a key can keep and the one no key governs.
    await expect(refusal).rejects.toThrow(elsewhereReal);
    await expect(refusal).rejects.toThrow(join(root, "variants"));
    await expect(refusal).rejects.toThrow(join(root, "models"));
    await expect(refusal).rejects.toThrow("LOCAL_LIGHT_CACHE_DIR");
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);
    expect(existsSync(join(root, "backups"))).toBe(false);
    expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
    expect(readdirSync(elsewhere)).toEqual([]);
    // CONTROL: the same linked container on the root's device takes the moves through the link.
    const report = await migrateDataLayout({ layout: layoutFor(root), pid, deviceOf: () => 1 });
    expect(report.moved.some((move) => move.from === "variants")).toBe(true);
    expect(readFileSync(join(elsewhere, "variants", VARIANT_REL), "utf-8")).toBe("webp-bytes");
  });

  // A DATA_DIR that is itself a symlink has its entries on the link's target. The probe answers "foreign" for
  // the link path alone, so the run passes only when the root is resolved before it is compared.
  test("a data root that is a symlink is compared through the link, not beside it", async () => {
    const real = freshRoot();
    await plantLegacyTree(real);
    const link = join(mkdtempSync(join(tmpdir(), `orb-layout-link-${pid}-`)), "data");
    roots.push(join(link, ".."));
    symlinkSync(real, link);
    const linkAlone = (path: string): number => (path === link ? 2 : 1);
    const report = await migrateDataLayout({ layout: layoutFor(link), pid, deviceOf: linkAlone });
    expect(report.moved.some((move) => move.from === DB_FILE_NAME)).toBe(true);
    expect(existsSync(join(real, "db", DB_FILE_NAME))).toBe(true);
  });

  // A journal replay must not re-fail forever: the pending entries are re-planned against the CURRENT env,
  // so setting the slot key after a failed move is enough to recover.
  test("a resume re-plans against the current env: a slot key set after a failed move keeps its entry in place", async () => {
    const root = freshRoot();
    mkdirSync(join(root, "models", "transformers"), { recursive: true });
    writeFileSync(join(root, "models", "transformers", "weights.onnx"), "weights");
    writeFileSync(join(root, ".session-secret"), SECRET_HEX);
    const moves = [
      { from: "models", to: "cache/models" },
      { from: ".session-secret", to: join("secrets", SECRET_FILE_NAMES.sessionSecret) },
    ];
    writeFileSync(join(root, LAYOUT_JOURNAL), JSON.stringify({ pid: 4242, moves }));

    const report = await migrateDataLayout({
      layout: layoutFor(root, { ["LOCAL_LIGHT_CACHE_DIR"]: join(root, "models", "transformers") }),
      pid,
      isPidAlive: () => false,
    });

    expect(report.resumed).toBe(true);
    expect(report.moved).toEqual([moves[1]]);
    expect(existsSync(join(root, "models", "transformers", "weights.onnx"))).toBe(true);
    expect(existsSync(join(root, "cache", "models"))).toBe(false);
    expect(readFileSync(join(root, "secrets", SECRET_FILE_NAMES.sessionSecret), "utf-8")).toBe(SECRET_HEX);
    expect(report.leftInPlace).toEqual(["models"]);
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);

    // CONTROL: the same journal under the default env replays both entries.
    const controlRoot = freshRoot();
    mkdirSync(join(controlRoot, "models", "transformers"), { recursive: true });
    writeFileSync(join(controlRoot, "models", "transformers", "weights.onnx"), "weights");
    writeFileSync(join(controlRoot, ".session-secret"), SECRET_HEX);
    writeFileSync(join(controlRoot, LAYOUT_JOURNAL), JSON.stringify({ pid: 4242, moves }));
    const control = await migrateDataLayout({ layout: layoutFor(controlRoot), pid, isPidAlive: () => false });
    expect(control.moved).toEqual(moves);
    expect(existsSync(join(controlRoot, "cache", "models", "transformers", "weights.onnx"))).toBe(true);
  });

  // Moving the db out from under a running server would let it reopen by the old path into an empty file. The
  // hard case is the server BETWEEN requests: a connection that has run a query and now sits idle holds no
  // write lock and blocks no checkpoint, yet it must still be a refusal. Every party is its own process, as in
  // production: a handle a process has closed still holds the WAL lock, so a refused boot's own handle would
  // block a retry in the same process, and a boot that is refused ends. The control is the next boot.
  test(
    "an idle holder of the legacy db refuses before any move; once it is gone, the same tree moves on the next boot",
    async () => {
      const root = freshRoot();
      const scratch = join(root, "..");
      await plantLegacyTree(root);
      const holder = await holdDbInChild(join(root, DB_FILE_NAME), scratch);
      try {
        const refused = await migrateInChild(root, scratch, "held");
        expect(refused.report).toBeUndefined();
        expect(refused.error).toContain(join(root, DB_FILE_NAME));
        expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
        expect(existsSync(join(root, "db", DB_FILE_NAME))).toBe(false);
        expect(existsSync(join(root, "backups"))).toBe(false);
        expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);
        expect(existsSync(join(root, ".credentials-key"))).toBe(true);
      } finally {
        await holder.release();
      }
      // CONTROL: with the holder gone the same tree moves, and the moved db carries the rows.
      const control = await migrateInChild(root, scratch, "released");
      expect(control.error).toBeUndefined();
      expect(control.report?.moved.some((move) => move.from === DB_FILE_NAME)).toBe(true);
      expect(readdirSync(join(root, "db"))).toEqual([DB_FILE_NAME]);
      expect(await probeValues(join(root, "db", DB_FILE_NAME))).toEqual(["checkpointed", "wal-only"]);
    },
    HOLDER_TEST_TIMEOUT_MS,
  );

  // A holder that reopened the moved db by its old path leaves a 0-byte file there. That is not data: the
  // boot IGNORES it (never deletes a file it did not write) rather than refusing on a phantom conflict.
  test("a 0-byte legacy db at the root is ignored, not a conflict", async () => {
    const root = freshRoot();
    mkdirSync(join(root, "db"), { recursive: true });
    writeFileSync(join(root, "db", DB_FILE_NAME), "the real db");
    writeFileSync(join(root, DB_FILE_NAME), "");
    const report = await migrateDataLayout({ layout: layoutFor(root), pid });
    expect(report).toEqual({ moved: [], leftInPlace: [], resumed: false });
    expect(readFileSync(join(root, "db", DB_FILE_NAME), "utf-8")).toBe("the real db");
    expect(statSync(join(root, DB_FILE_NAME)).size).toBe(0);
  });

  test("a journal left by a dead pid resumes: applied entries are accepted, pending ones are renamed", async () => {
    const root = freshRoot();
    mkdirSync(join(root, "secrets"), { recursive: true });
    // Entry one already happened (source gone, target present); entry two never did.
    writeFileSync(join(root, "secrets", SECRET_FILE_NAMES.credentialsKey), KEY_HEX);
    writeFileSync(join(root, ".session-secret"), SECRET_HEX);
    const moves = [
      { from: ".credentials-key", to: join("secrets", SECRET_FILE_NAMES.credentialsKey) },
      { from: ".session-secret", to: join("secrets", SECRET_FILE_NAMES.sessionSecret) },
    ];
    writeFileSync(join(root, LAYOUT_JOURNAL), JSON.stringify({ pid: 4242, moves }));

    const report = await migrateDataLayout({ layout: layoutFor(root), pid, isPidAlive: () => false });

    expect(report.resumed).toBe(true);
    expect(report.moved).toEqual(moves);
    expect(readFileSync(join(root, "secrets", SECRET_FILE_NAMES.credentialsKey), "utf-8")).toBe(KEY_HEX);
    expect(readFileSync(join(root, "secrets", SECRET_FILE_NAMES.sessionSecret), "utf-8")).toBe(SECRET_HEX);
    expect(existsSync(join(root, ".session-secret"))).toBe(false);
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);
  });

  test("CONTROL: a journal entry whose source and target both hold data refuses the resume and keeps the journal", async () => {
    const root = freshRoot();
    mkdirSync(join(root, "secrets"), { recursive: true });
    writeFileSync(join(root, ".credentials-key"), KEY_HEX);
    writeFileSync(join(root, "secrets", SECRET_FILE_NAMES.credentialsKey), "a different key\n");
    const moves = [{ from: ".credentials-key", to: join("secrets", SECRET_FILE_NAMES.credentialsKey) }];
    writeFileSync(join(root, LAYOUT_JOURNAL), JSON.stringify({ pid: 4242, moves }));
    const refusal = migrateDataLayout({ layout: layoutFor(root), pid, isPidAlive: () => false });
    await expect(refusal).rejects.toThrow(join(root, ".credentials-key"));
    await expect(refusal).rejects.toThrow(join(root, "secrets", SECRET_FILE_NAMES.credentialsKey));
    expect(readFileSync(join(root, ".credentials-key"), "utf-8")).toBe(KEY_HEX);
    expect(readFileSync(join(root, "secrets", SECRET_FILE_NAMES.credentialsKey), "utf-8")).toBe("a different key\n");
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(true);
  });

  test("a journal entry with neither side present refuses too: a rename cannot produce that state", async () => {
    const root = freshRoot();
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, LAYOUT_JOURNAL), JSON.stringify({ pid: 4242, moves: [{ from: "variants", to: "cache/variants" }] }));
    const refusal = migrateDataLayout({ layout: layoutFor(root), pid, isPidAlive: () => false });
    await expect(refusal).rejects.toThrow(join(root, "variants"));
    await expect(refusal).rejects.toThrow(join(root, "cache", "variants"));
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(true);
  });

  // An EMPTY directory is a legal rename target, so the conflict check lets it through; an empty mount point
  // at that path (a tmpfs at `cache/models`, a disk at `reports`) is not, and neither its parent nor the
  // source shows it. The target itself must be probed when it exists.
  test("an empty mount point at a target refuses before any write and names every entry it catches, keyed or not", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    mkdirSync(join(root, "cache", "models"), { recursive: true });
    mkdirSync(join(root, "reports"));
    const mounted = new Set([realpathSync(join(root, "cache", "models")), realpathSync(join(root, "reports"))]);
    const refusal = migrateDataLayout({ layout: layoutFor(root), pid, deviceOf: (path) => (mounted.has(path) ? 2 : 1) });
    await expect(refusal).rejects.toThrow(join(root, "models"));
    await expect(refusal).rejects.toThrow("LOCAL_LIGHT_CACHE_DIR");
    await expect(refusal).rejects.toThrow(join(root, "import-reports"));
    await expect(refusal).rejects.toThrow("DATA_LAYOUT_SKIP");
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);
    expect(existsSync(join(root, "backups"))).toBe(false);
    expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
    expect(existsSync(join(root, ".credentials-key"))).toBe(true);
    // The remedies work: the keyed entry stays by its key, the keyless one by the skip, and the rest moves.
    const layout = layoutFor(root, { ["LOCAL_LIGHT_CACHE_DIR"]: join(root, "models", "transformers"), ["DATA_LAYOUT_SKIP"]: "import-reports" });
    const report = await migrateDataLayout({ layout, pid, deviceOf: (path) => (mounted.has(path) ? 2 : 1) });
    expect(report.leftInPlace).toEqual(["import-reports", "models", "notes.txt"]);
    expect(report.moved.some((move) => move.from === DB_FILE_NAME)).toBe(true);
    expect(readFileSync(join(root, "import-reports", "import-1.md"), "utf-8")).toBe("# report");
    expect(readdirSync(join(root, "reports"))).toEqual([]);
  });

  // An explicit secret replaces its keyfile the way a slot key replaces its slot, so the legacy keyfile is the
  // operator's and stays; the other keyfile, with no explicit value, still moves.
  test("an explicit CREDENTIALS_KEY keeps the legacy keyfile where it is and names it as left in place", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    const report = await migrateDataLayout({ layout: layoutFor(root, { ["CREDENTIALS_KEY"]: "ab".repeat(32) }), pid });
    expect(readFileSync(join(root, ".credentials-key"), "utf-8")).toBe(KEY_HEX);
    expect(existsSync(join(root, "secrets", SECRET_FILE_NAMES.credentialsKey))).toBe(false);
    expect(readFileSync(join(root, "secrets", SECRET_FILE_NAMES.sessionSecret), "utf-8")).toBe(SECRET_HEX);
    expect(report.leftInPlace).toEqual([".credentials-key", "notes.txt"]);
  });

  // A resume claims a pending db again, and the claim rewrites the file's mtime, which is what names a
  // snapshot copy. A snapshot per resume would fill the volume under a restart policy that retries a failing
  // move forever; the first boot's snapshot still covers the db, so a resume never takes another.
  test("failing resume boots leave exactly the first boot's snapshot", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    const reportsIsBusy = (from: string, to: string): void => {
      if (to === join(root, "reports")) {
        throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
      }
      renameSync(from, to);
    };
    const snapshots = (): string[] => readdirSync(join(root, "backups")).filter((name) => BACKUP_RE.test(name) && !name.endsWith("-1") && !name.endsWith("-2"));
    const failingBoot = async (): Promise<void> => {
      await expect(migrateDataLayout({ layout: layoutFor(root), pid, rename: reportsIsBusy })).rejects.toThrow(join(root, "import-reports"));
      expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
      expect(snapshots()).toHaveLength(1);
    };
    await failingBoot();
    await failingBoot();
    await failingBoot();
    await failingBoot();
  });

  // The pre-flight cannot foresee every failure (a bind mount of the same filesystem answers EBUSY with the
  // same device number). Whatever rename(2) says, the boot must name the entry and a remedy, keep the journal
  // for the next boot, and the remedy must let the box boot without anyone editing the journal.
  test("a rename that fails at apply time is a named refusal every boot until the env names the remedy, then the rest moves", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    const reportsIsBusy = (from: string, to: string): void => {
      if (to === join(root, "reports")) {
        throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
      }
      renameSync(from, to);
    };
    // Boot 1: the entries before `import-reports` moved, the failure is named, the db (planned last) stayed.
    const first = migrateDataLayout({ layout: layoutFor(root), pid, rename: reportsIsBusy });
    await expect(first).rejects.toThrow(join(root, "import-reports"));
    await expect(first).rejects.toThrow("EBUSY");
    await expect(first).rejects.toThrow("DATA_LAYOUT_SKIP");
    await expect(first).rejects.toThrow(join(root, LAYOUT_JOURNAL));
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(true);
    expect(existsSync(join(root, "secrets", SECRET_FILE_NAMES.credentialsKey))).toBe(true);
    expect(existsSync(join(root, DB_FILE_NAME))).toBe(true);
    expect(existsSync(join(root, "db", DB_FILE_NAME))).toBe(false);
    // Boot 2, nothing changed: the same named refusal from the resume, never a raw errno.
    const second = migrateDataLayout({ layout: layoutFor(root), pid, rename: reportsIsBusy });
    await expect(second).rejects.toThrow(join(root, "import-reports"));
    await expect(second).rejects.toThrow("DATA_LAYOUT_SKIP");
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(true);
    // Boot 3 with the remedy: the resume leaves the entry, moves the db, and clears the journal.
    const third = await migrateDataLayout({ layout: layoutFor(root, { ["DATA_LAYOUT_SKIP"]: "import-reports" }), pid, rename: reportsIsBusy });
    expect(third.resumed).toBe(true);
    expect(third.moved.some((move) => move.from === DB_FILE_NAME)).toBe(true);
    expect(third.leftInPlace).toEqual(["import-reports", "notes.txt"]);
    expect(existsSync(join(root, LAYOUT_JOURNAL))).toBe(false);
    expect(readFileSync(join(root, "import-reports", "import-1.md"), "utf-8")).toBe("# report");
    expect(readdirSync(join(root, "db"))).toEqual([DB_FILE_NAME]);
    expect(await probeValues(join(root, "db", DB_FILE_NAME))).toEqual(["checkpointed", "wal-only"]);
    // Boot 4, the remedy kept: a no-op that still names what stayed.
    const fourth = await migrateDataLayout({ layout: layoutFor(root, { ["DATA_LAYOUT_SKIP"]: "import-reports" }), pid, rename: reportsIsBusy });
    expect(fourth).toEqual({ moved: [], leftInPlace: [], resumed: false });
  });

  // The db's way out is a value, not only a key: the refusal carries the DATABASE_URL that keeps the legacy
  // db under this root, and that exact value, set, is what lets the boot through.
  test("a legacy db on another filesystem refuses with the DATABASE_URL value that keeps it, and that value boots", async () => {
    const root = freshRoot();
    await plantLegacyTree(root);
    const dbOnOtherDevice = (path: string): number => (path.endsWith(`${sep}${DB_FILE_NAME}`) ? 2 : 1);
    const refusal = migrateDataLayout({ layout: layoutFor(root), pid, deviceOf: dbOnOtherDevice });
    await expect(refusal).rejects.toThrow(`DATABASE_URL=file:${join(root, DB_FILE_NAME)} `);
    const message = await refusal.then(
      () => "",
      (err: Error) => err.message,
    );
    const remedy = message.match(/DATABASE_URL=(\S+)/u)?.[1];
    expect(remedy).toBe(`file:${join(root, DB_FILE_NAME)}`);
    const report = await migrateDataLayout({ layout: layoutFor(root, { ["DATABASE_URL"]: remedy ?? "" }), pid, deviceOf: dbOnOtherDevice });
    expect(report.moved.some((move) => move.from === DB_FILE_NAME)).toBe(false);
    expect(await probeValues(join(root, DB_FILE_NAME))).toEqual(["checkpointed", "wal-only"]);
  });

  // A keyfile an explicit key keeps is named by the layout, so the warn that lists it names the key that
  // keeps it, and the does-not-name warn carries only the operator's own entries.
  test("a keyfile kept by an explicit key is warned with its keeper, never as an entry the layout does not name", async () => {
    const warn = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    const root = freshRoot();
    await plantLegacyTree(root);
    await migrateDataLayout({ layout: layoutFor(root, { ["CREDENTIALS_KEY"]: "ab".repeat(32) }), pid });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ kept: [{ entry: ".credentials-key", keptBy: "CREDENTIALS_KEY" }] }), expect.any(String));
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ entries: ["notes.txt"] }), expect.any(String));
    expect(warn).not.toHaveBeenCalledWith(expect.objectContaining({ entries: expect.arrayContaining([".credentials-key"]) }), expect.any(String));
  });

  // A volume whose `.session-secret` an explicit SESSION_SECRET keeps in place (the container mints one for a
  // single-user volume switched to a cookie mode) peppers with the new value, so every live invite hashed
  // with the old one stops matching. The boot warns on every run while the two differ, naming the file and
  // its keeper; a SESSION_SECRET equal to the file's pepper, or none at all, is silent.
  test("a legacy session secret kept beside a different explicit SESSION_SECRET is warned on every boot; an equal one is not", async () => {
    const warn = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    const stranded = expect.objectContaining({ keptBy: "SESSION_SECRET", legacyKeyfile: expect.any(String) });
    const minted = "ef".repeat(32);
    const root = freshRoot();
    await plantLegacyTree(root);
    const layout = layoutFor(root, { ["SESSION_SECRET"]: minted });
    await migrateDataLayout({ layout, pid, sessionSecret: minted });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ keptBy: "SESSION_SECRET", legacyKeyfile: join(root, ".session-secret") }), expect.any(String));
    warn.mockClear();
    const again = await migrateDataLayout({ layout, pid, sessionSecret: minted });
    expect(again.moved).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ keptBy: "SESSION_SECRET", legacyKeyfile: join(root, ".session-secret") }), expect.any(String));

    warn.mockClear();
    const sameRoot = freshRoot();
    await plantLegacyTree(sameRoot);
    const legacyPepper = SECRET_HEX.trim();
    await migrateDataLayout({ layout: layoutFor(sameRoot, { ["SESSION_SECRET"]: legacyPepper }), pid, sessionSecret: legacyPepper });
    expect(warn).not.toHaveBeenCalledWith(stranded, expect.any(String));

    const unsetRoot = freshRoot();
    await plantLegacyTree(unsetRoot);
    await migrateDataLayout({ layout: layoutFor(unsetRoot), pid });
    expect(warn).not.toHaveBeenCalledWith(stranded, expect.any(String));
    expect(readFileSync(join(unsetRoot, "secrets", SECRET_FILE_NAMES.sessionSecret), "utf-8")).toBe(SECRET_HEX);
  });
});
