// @subject tests/support/node/corpus.ts

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FROZEN_AT_MS } from "../iso/clock.ts";
import { serializeCorpusWire } from "../iso/corpus.ts";
import { createSeededIds, SEEDED_ID_MAX_CURSOR } from "../iso/ids.ts";
import { createCorpusCapsule, loadCorpusFixture } from "./corpus.ts";
import { createCorpusHarness, expect, test } from "./fixtures.ts";

test("capsule creation refuses an existing data root before opening or modifying its contents", async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-boundary-"));
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(() => rm(parent, { recursive: true, force: true }));
  const directory = join(parent, "existing-data");
  await mkdir(directory);
  const sentinel = join(directory, "keep.txt");
  await writeFile(sentinel, "existing caller-owned bytes", "utf8");
  await expect(
    createCorpusCapsule({
      directory,
      server: { authConfig: { mode: "local" }, pluginSpawn: spawn },
      seed: { ownerPassword: "unused-boundary-password", log: () => undefined },
      privateCredential: { provider: "custom-openai", key: "unused-boundary-credential" },
    }),
  ).rejects.toMatchObject({ code: "EEXIST" });
  expect(await readdir(directory)).toEqual(["keep.txt"]);
  expect(await readFile(sentinel, "utf8")).toBe("existing caller-owned bytes");
});

test("wire-only publications remain borrowable but cannot silently restart server continuation", async () => {
  const source = loadCorpusFixture();
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-old-publication-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  await mkdir(join(parent, "db"));
  // Only loader admission is under test: server construction must refuse before opening this sentinel.
  await writeFile(join(parent, "db", "orbweaver.db"), "unopened-database-sentinel");
  await writeFile(join(parent, "corpus.json"), serializeCorpusWire(source.wire, []));
  expect(loadCorpusFixture(parent).wire).toEqual(source.wire);
  await expect(createCorpusHarness(parent)).rejects.toThrow("requires replay state");
  expect(await readFile(join(parent, "db", "orbweaver.db"), "utf8")).toBe("unopened-database-sentinel");
  const replay = { version: 1, nowMs: FROZEN_AT_MS, idCursor: createSeededIds().snapshot() };
  await writeFile(join(parent, "replay.json"), JSON.stringify(replay));
  expect(loadCorpusFixture(parent).replay).toEqual(replay);
  for (const text of [
    JSON.stringify({ ...replay, version: 2 }),
    JSON.stringify({ ...replay, nowMs: -1 }),
    JSON.stringify({ ...replay, idCursor: -1 }),
    JSON.stringify({ ...replay, idCursor: SEEDED_ID_MAX_CURSOR + 1 }),
    JSON.stringify({ ...replay, idCursor: 1.5 }),
    JSON.stringify({ ...replay, privateInput: "must-not-echo" }),
    '{"private-input":"must-not-echo",',
  ]) {
    await writeFile(join(parent, "replay.json"), text);
    expect(() => loadCorpusFixture(parent)).toThrow("Corpus replay state is malformed");
    await expect(createCorpusHarness(parent)).rejects.toThrow(/^Corpus replay state is malformed$/);
  }
});
