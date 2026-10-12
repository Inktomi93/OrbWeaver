// tooling/snap/ops/stage-source cloneStageDb — `--stage-db` copies another box's db into the stage, keeps every
// owned row, drops the rows bound to that box's boot secrets (the stage's boot refuses to start over them), and
// never writes the source.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { afterEach } from "vitest";
import { parseSnapArgs } from "../../../../tooling/src/snap/index.ts";
import { stageOwnerKey, stagePaths } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { clonedStageWarning, cloneStageDb } from "../../../../tooling/src/snap/ops/stage-source.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OWNER_ID = "owner_abc";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A WAL-mode source with an owner, a member, owned rows and every secret-bound row kind. The writer
 *  connection is left OPEN so the -wal sibling holds unflushed pages, as a live container's does. */
function sourceDb(): { readonly root: string; readonly path: string; readonly writer: DatabaseSync } {
  const root = mkdtempSync(join(tmpdir(), "orb-stage-db-clone-"));
  roots.push(root);
  mkdirSync(join(root, "src"));
  const path = join(root, "src", "orbweaver.db");
  const writer = new DatabaseSync(path);
  writer.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA wal_autocheckpoint = 0;
    CREATE TABLE users (id TEXT PRIMARY KEY, handle TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT);
    CREATE TABLE characters (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL);
    CREATE TABLE user_credentials (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, ciphertext TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    CREATE TABLE chat_invites (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    INSERT INTO users VALUES ('${OWNER_ID}', 'nate', 'owner', 'hash-a'), ('member_1', 'sam', 'user', 'hash-b');
    INSERT INTO characters VALUES ('char_1', '${OWNER_ID}', 'Ayla'), ('char_2', '${OWNER_ID}', 'Brom');
    INSERT INTO user_credentials VALUES ('cred_1', '${OWNER_ID}', 'sealed');
    INSERT INTO sessions VALUES ('sess_1', '${OWNER_ID}');
    INSERT INTO chat_invites VALUES ('inv_1', 'pending'), ('inv_2', 'accepted');
  `);
  return { root, path, writer };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("a clone keeps the owner row and its owned rows, drops secret-bound rows, and leaves the source untouched", () => {
  const { root, path, writer } = sourceDb();
  try {
    expect(existsSync(`${path}-wal`)).toBe(true);
    const before = { main: sha256(path), wal: sha256(`${path}-wal`), mtime: statSync(path).mtimeMs };
    const paths = stagePaths(join(root, "checkout"), SHA);

    const provenance = cloneStageDb(path, paths);

    const clone = new DatabaseSync(join(paths.dataDir, "db", "orbweaver.db"));
    try {
      expect(clone.prepare("SELECT id, handle, role FROM users WHERE role = 'owner'").all()).toEqual([{ id: OWNER_ID, handle: "nate", role: "owner" }]);
      expect(clone.prepare("SELECT name FROM characters WHERE owner_id = ? ORDER BY name").all(OWNER_ID)).toEqual([{ name: "Ayla" }, { name: "Brom" }]);
      expect(clone.prepare("SELECT count(*) AS n FROM user_credentials").get()).toEqual({ n: 0 });
      expect(clone.prepare("SELECT count(*) AS n FROM sessions").get()).toEqual({ n: 0 });
      expect(clone.prepare("SELECT count(*) AS n FROM users WHERE password_hash IS NOT NULL").get()).toEqual({ n: 0 });
      expect(clone.prepare("SELECT id FROM chat_invites").all()).toEqual([{ id: "inv_2" }]);
    } finally {
      clone.close();
    }
    // A reused stage serving this clone must say so; a dev-db copy and a stage with no db must not.
    expect(clonedStageWarning({ dbProvenance: provenance })).toContain(path);
    expect(clonedStageWarning({ dbProvenance: { copiedFrom: "/dev/db", copiedAt: "t", devDbMtimeAtCopy: "t" } })).toBeNull();
    expect(clonedStageWarning({ dbProvenance: null })).toBeNull();
    expect(provenance.copiedFrom).toBe(path);
    expect({ main: sha256(path), wal: sha256(`${path}-wal`), mtime: statSync(path).mtimeMs }).toEqual(before);
  } finally {
    writer.close();
  }
});

test("two sibling sessions' --stage-db runs at one sha keep separate data, each serving its own source", () => {
  const first = sourceDb();
  const second = sourceDb();
  try {
    second.writer.exec("UPDATE users SET handle = 'sam-box' WHERE role = 'owner'");
    const checkout = join(first.root, "checkout");
    const a = stagePaths(checkout, SHA, "single-user", stageOwnerKey(checkout, "side-eye-a"));
    const b = stagePaths(checkout, SHA, "single-user", stageOwnerKey(checkout, "side-eye-b"));

    cloneStageDb(first.path, a);
    cloneStageDb(second.path, b);

    const handleIn = (databaseUrl: string): unknown => {
      const db = new DatabaseSync(databaseUrl.replace(/^file:/u, ""));
      try {
        return db.prepare("SELECT handle FROM users WHERE role = 'owner'").get();
      } finally {
        db.close();
      }
    };
    expect(handleIn(a.databaseUrl)).toEqual({ handle: "nate" });
    expect(handleIn(b.databaseUrl)).toEqual({ handle: "sam-box" });
  } finally {
    first.writer.close();
    second.writer.close();
  }
});

test("a missing source refuses before it creates anything in the stage", () => {
  const { root, writer } = sourceDb();
  try {
    const paths = stagePaths(join(root, "checkout"), SHA);
    expect(() => cloneStageDb(join(root, "nope.db"), paths)).toThrow("no database file");
    expect(existsSync(paths.dataDir)).toBe(false);
  } finally {
    writer.close();
  }
});

test("--stage-db names a db source: it forces the isolated rebuild that clones it, and refuses a local stage or a --base", () => {
  const staged = parseSnapArgs(["--stage-db", "/scratch/orbweaver.db"]);
  expect(staged.errors).toEqual([]);
  expect(staged.stageDb).toBe("/scratch/orbweaver.db");
  expect(staged.isolated).toBe(true);
  expect(staged.fresh).toBe(true);
  expect(parseSnapArgs(["--stage-db", "/scratch/orbweaver.db", "--stage-auth", "local"]).errors).toHaveLength(1);
  expect(parseSnapArgs(["--stage-db", "/scratch/orbweaver.db", "--base", "http://localhost:5173"]).errors).toHaveLength(1);
});
