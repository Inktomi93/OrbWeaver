// infra/storage/user-runtime-dir — the PER-USER runtime root every agent-sdk spawn points at. This is a
// containment belt, so the pins are the belt's two halves: an owner segment that is not a plain TypeID
// alphabet is REFUSED BEFORE a path is built (`../` traversal is the attack; the check must reject, not
// sanitise), and two users never share a directory. The 0700 mode is the third: the dir holds another user's
// history and tokens, so a group/other-readable dir is the leak the per-user split exists to close.

import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createUserRuntimeDirs } from "../../../../packages/server/src/infra/storage/user-runtime-dir.ts";
import { expect, test } from "../../../support/fixtures.ts";

const ALICE = castId<UserId>("user_01j9alice");
const BOB = castId<UserId>("user_01j9bob00");

async function root(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "orb-runtime-dir-"));
}

test("creates the per-user tool dir on first read, mode 0700", async () => {
  const base = await root();
  const dirs = createUserRuntimeDirs(base);
  const dir = dirs.dirFor(ALICE, "claude");
  expect(dir).toBe(join(base, ALICE, "claude"));
  const stats = await stat(dir);
  expect(stats.isDirectory()).toBe(true);
  // The permission bits are the low three octal digits of the mode (a modulo, so no bitwise operator).
  expect((stats.mode % 0o1000).toString(8), "another user's tokens and history live here").toBe("700");
  await rm(base, { recursive: true, force: true });
});

test("two users never share a directory", async () => {
  const base = await root();
  const dirs = createUserRuntimeDirs(base);
  expect(dirs.dirFor(ALICE, "claude")).not.toBe(dirs.dirFor(BOB, "claude"));
  await rm(base, { recursive: true, force: true });
});

test("a traversal-shaped owner segment is REFUSED before any path is built", async () => {
  const base = await root();
  const dirs = createUserRuntimeDirs(base);
  for (const bad of ["../escape", "user/../../etc", "user id", "USER_UPPER", ""]) {
    expect(() => dirs.dirFor(castId<UserId>(bad), "claude"), `"${bad}" must be refused, not sanitised`).toThrow(/refusing owner segment/u);
  }
  await rm(base, { recursive: true, force: true });
});

test("remove drops that user's tool dir and nothing else", async () => {
  const base = await root();
  const dirs = createUserRuntimeDirs(base);
  const aliceDir = dirs.dirFor(ALICE, "claude");
  const bobDir = dirs.dirFor(BOB, "claude");
  await writeFile(join(aliceDir, "history.json"), "[]");
  await writeFile(join(bobDir, "history.json"), "[]");
  dirs.remove(ALICE, "claude");
  await expect(stat(aliceDir)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await stat(bobDir)).isDirectory(), "one user's teardown must not touch another's").toBe(true);
  await rm(base, { recursive: true, force: true });
});

test("remove of a never-created dir is a no-op, not a throw", async () => {
  const base = await root();
  const dirs = createUserRuntimeDirs(base);
  expect(() => dirs.remove(BOB, "claude")).not.toThrow();
  await rm(base, { recursive: true, force: true });
});
