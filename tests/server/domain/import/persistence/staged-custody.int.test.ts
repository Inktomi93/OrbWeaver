// A staged upload imports only the bytes the server wrote, whatever a local actor does to the tree before the run reads
// it. The operator's ST_PROFILE_DIR has no writer to check against, so its links follow and a dangling plane fails loudly.
// @subject packages/server/src/infra/storage/staged-manifest.ts
// @subject packages/server/src/infra/storage/profile-fs.ts
// @subject packages/server/src/infra/storage/stage-dir.ts
// @subject packages/server/src/domain/import/workload-contributions.ts

import builtinFs, { copyFile, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { basename, dirname, join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import { importStartedSchema, ST_SETTINGS_FILE, STAGED_MANIFEST_FILE, STAGED_UPLOAD_OUTDATED } from "@orb/contracts/import";
import { PORTABILITY_ROUTES, PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { WORKLOAD_NOT_ADMISSIBLE } from "@orb/contracts/workloads";
import { workloads } from "@orb/db";
import type { WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { exportLibrary, restoreBundle, signedInBox, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { CSRF_HEADERS } from "../../../entry/http/_body-limit-inputs.ts";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, chatOf, finish, harness, post, settings, stagedEntries, stagedTree, tableContents } from "./_st-tree-door.ts";

// The same length, so a replaced leaf passes the size check and only its hash can refuse it.
const ORIGINAL = "the-staged-original";
const REPLACEMENT = "the-late-substitute";
const CHAT_LEAF = join("chats", "Aria", "first.jsonl");
const CARD_PLANE = PORTABLE_DIRECTORIES.character.slice(0, -1);
// A directory link that needs no privilege on Windows. POSIX ignores the type.
const DIRECTORY_LINK = "junction";
// Every case boots at least one composed root, and the zip cases build and export another. A loaded or slow runner
// spends more than the default budget on that setup, and the budget says nothing about the custody check itself.
const SLOW = { tags: "slow" } as const;
// What the control that owns each case raises. A case that only said "failed" would stay green with its control gone,
// because the next control down also refuses.
const LEAF_CHANGED = "a staged file changed after the server wrote it";
// The label tells a leaf refusal from a manifest refusal, so a fixture that lost its carried manifest cannot pass as one.
const PROFILE_LEAF_CHANGED = `${LEAF_CHANGED}: profile/`;
const BUNDLE_LEAF_CHANGED = `${LEAF_CHANGED}: ${CARD_PLANE}/`;
const MANIFEST_CHANGED = `${LEAF_CHANGED}: ${STAGED_MANIFEST_FILE}`;
const zipChanged = (token: string): string => `${LEAF_CHANGED}: ${token}`;
const PATH_ESCAPED = "escapes the staging root (symlinked path)";

function profileTree(root: ServerTestHarness, text: string): Files {
  return {
    [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }),
    "characters/Aria.png": cardPng(root, "Aria"),
    "chats/Aria/first.jsonl": chatOf(`${text}-solo`),
    "groups/g.json": JSON.stringify({ name: "G", members: ["Aria.png"], chats: ["real"] }),
    "group chats/real.jsonl": chatOf(`${text}-group`),
    "User Avatars/bob.png": cardPng(root, `${text}-avatar`),
  };
}

function bundleTree(root: ServerTestHarness, text: string): Files {
  return { [`${PORTABLE_DIRECTORIES.character}aria.png`]: cardPng(root, text), [`${PORTABLE_DIRECTORIES.tag}first.json`]: "{}" };
}

async function writeTree(dir: string, files: Files): Promise<void> {
  for (const [path, bytes] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), bytes);
  }
}

/** Run an admitted row and hand back its terminal state: a refusal is a failed row, never a thrown test. */
async function run(root: ServerTestHarness, id: WorkloadId): Promise<{ readonly status: string; readonly error: string | null }> {
  if (root.runAdmittedWorkload === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  await root.runAdmittedWorkload(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id });
  return { status: row.status, error: row.error ?? null };
}

async function stored(root: ServerTestHarness): Promise<string> {
  return JSON.stringify(await tableContents(root));
}

async function moveAside(path: string): Promise<void> {
  await rename(path, `${path}-aside`);
}

/** Give a replacement tree the server's real manifest, so only a later control can tell it from the upload. */
async function carryManifest(staged: string, replacement: string): Promise<void> {
  await copyFile(join(`${staged}-aside`, STAGED_MANIFEST_FILE), join(replacement, STAGED_MANIFEST_FILE));
}

/** Call `act` once, right after the staged path resolves: the window a local actor races between the check and the read. */
function afterPathCheck(staged: string, act: () => Promise<void>): Disposable & { readonly fired: () => boolean } {
  const realpath = builtinFs.realpath;
  let fired = false;
  const restore = (): void => {
    Object.assign(builtinFs, { realpath });
    syncBuiltinESMExports();
  };
  const watched = async (...args: Parameters<typeof realpath>): Promise<unknown> => {
    const resolved = await realpath(...args);
    if (!fired && basename(resolved) === basename(staged)) {
      fired = true;
      restore();
      await act();
    }
    return resolved;
  };
  Object.assign(builtinFs, { realpath: watched });
  syncBuiltinESMExports();
  return { fired: () => fired, [Symbol.dispose]: restore };
}

/** Bytes the actor owns, outside the owner's staging namespace. */
function outsideOf(root: ServerTestHarness): string {
  return join(root.importStagingDir, "..", "outside-staging");
}

interface Swap {
  readonly name: string;
  /** What the control that owns this case raises. */
  readonly refusal: string;
  /** Change the staged tree at `staged`, the path the upload's token resolves to. */
  readonly swap: (root: ServerTestHarness, staged: string) => Promise<void>;
}

const PROFILE_SWAPS: readonly Swap[] = [
  {
    name: "the staged root swapped for a directory",
    refusal: PROFILE_LEAF_CHANGED,
    swap: async (root, staged) => {
      await moveAside(staged);
      await writeTree(join(staged, "profile"), profileTree(root, REPLACEMENT));
      await carryManifest(staged, staged);
    },
  },
  {
    name: "a plane swapped for a directory",
    refusal: PROFILE_LEAF_CHANGED,
    swap: async (_root, staged) => {
      await moveAside(join(staged, "profile", "chats"));
      await writeTree(join(staged, "profile", "chats"), { "Aria/first.jsonl": chatOf(`${REPLACEMENT}-solo`) });
    },
  },
  {
    name: "a chat directory swapped for a directory",
    refusal: PROFILE_LEAF_CHANGED,
    swap: async (_root, staged) => {
      await moveAside(join(staged, "profile", "chats", "Aria"));
      await writeTree(join(staged, "profile", "chats", "Aria"), { "first.jsonl": chatOf(`${REPLACEMENT}-solo`) });
    },
  },
  {
    name: "a leaf replaced by a new file",
    refusal: PROFILE_LEAF_CHANGED,
    swap: async (_root, staged) => {
      const leaf = join(staged, "profile", CHAT_LEAF);
      await rm(leaf);
      await writeFile(leaf, chatOf(`${REPLACEMENT}-solo`));
    },
  },
  {
    name: "a leaf rewritten in place",
    refusal: PROFILE_LEAF_CHANGED,
    swap: async (_root, staged) => {
      await writeFile(join(staged, "profile", CHAT_LEAF), chatOf(`${REPLACEMENT}-solo`));
    },
  },
  {
    name: "a leaf replaced by a directory",
    refusal: PROFILE_LEAF_CHANGED,
    swap: async (_root, staged) => {
      const leaf = join(staged, "profile", CHAT_LEAF);
      await rm(leaf);
      await writeTree(leaf, { nested: chatOf(`${REPLACEMENT}-solo`) });
    },
  },
  {
    name: "a leaf removed, which must not read as a profile without it",
    refusal: PROFILE_LEAF_CHANGED,
    swap: async (_root, staged) => {
      await rm(join(staged, "profile", ST_SETTINGS_FILE));
    },
  },
  {
    name: "a plane swapped to a link",
    refusal: PROFILE_LEAF_CHANGED,
    swap: async (root, staged) => {
      await writeTree(outsideOf(root), { "Aria/first.jsonl": chatOf(`${REPLACEMENT}-solo`) });
      await moveAside(join(staged, "profile", "chats"));
      await symlink(outsideOf(root), join(staged, "profile", "chats"), DIRECTORY_LINK);
    },
  },
  {
    name: "the staged root swapped to a link",
    refusal: PATH_ESCAPED,
    swap: async (root, staged) => {
      await writeTree(join(outsideOf(root), "profile"), profileTree(root, REPLACEMENT));
      await moveAside(staged);
      await carryManifest(staged, outsideOf(root));
      await symlink(outsideOf(root), staged, DIRECTORY_LINK);
    },
  },
  {
    // The resolve anchors above the owner's folder, so a link there moves only one end of its comparison.
    name: "the owner's staging folder swapped to a link",
    refusal: PATH_ESCAPED,
    swap: async (root, staged) => {
      const replacement = join(outsideOf(root), basename(staged));
      await writeTree(join(replacement, "profile"), profileTree(root, REPLACEMENT));
      await copyFile(join(staged, STAGED_MANIFEST_FILE), join(replacement, STAGED_MANIFEST_FILE));
      await moveAside(dirname(staged));
      await symlink(outsideOf(root), dirname(staged), DIRECTORY_LINK);
    },
  },
  {
    name: "the manifest rewritten to vouch for a replacement",
    refusal: MANIFEST_CHANGED,
    swap: async (_root, staged) => {
      await writeFile(join(staged, "profile", CHAT_LEAF), chatOf(`${REPLACEMENT}-solo`));
      await writeFile(join(staged, STAGED_MANIFEST_FILE), "[]");
    },
  },
];

test("an unchanged staged profile imports every plane the server wrote", SLOW, async () => {
  await using root = await harness();
  const id = await admit(root, profileTree(root, ORIGINAL));

  await finish(root, id);

  const rows = await stored(root);
  expect(rows).toContain(`${ORIGINAL}-solo`);
  expect(rows).toContain(`${ORIGINAL}-group`);
  expect(await stagedEntries(root)).toEqual([]);
});

test.for(PROFILE_SWAPS)("$name fails the run and imports nothing", SLOW, async ({ refusal, swap }) => {
  await using root = await harness();
  const id = await admit(root, profileTree(root, ORIGINAL));
  await swap(root, await stagedTree(root));

  expect(await run(root, id)).toMatchObject({ status: "failed", error: expect.stringContaining(refusal) });

  const rows = await stored(root);
  expect(rows).not.toContain(REPLACEMENT);
  expect(rows).not.toContain(`${ORIGINAL}-solo`);
});

const BUNDLE_SWAPS: readonly Swap[] = [
  {
    name: "the staged root swapped for a directory",
    refusal: BUNDLE_LEAF_CHANGED,
    swap: async (root, staged) => {
      await moveAside(staged);
      await writeTree(staged, bundleTree(root, REPLACEMENT));
      await carryManifest(staged, staged);
    },
  },
  {
    name: "a plane swapped for a directory",
    refusal: BUNDLE_LEAF_CHANGED,
    swap: async (root, staged) => {
      await moveAside(join(staged, CARD_PLANE));
      await writeTree(staged, { [`${PORTABLE_DIRECTORIES.character}aria.png`]: cardPng(root, REPLACEMENT) });
    },
  },
  {
    name: "a leaf rewritten in place",
    refusal: BUNDLE_LEAF_CHANGED,
    swap: async (root, staged) => {
      await writeFile(join(staged, CARD_PLANE, "aria.png"), cardPng(root, REPLACEMENT));
    },
  },
  {
    name: "a plane swapped to a link",
    refusal: BUNDLE_LEAF_CHANGED,
    swap: async (root, staged) => {
      await writeTree(outsideOf(root), { "aria.png": cardPng(root, REPLACEMENT) });
      await moveAside(join(staged, CARD_PLANE));
      await symlink(outsideOf(root), join(staged, CARD_PLANE), DIRECTORY_LINK);
    },
  },
  {
    name: "the staged root swapped to a link",
    refusal: PATH_ESCAPED,
    swap: async (root, staged) => {
      await writeTree(outsideOf(root), bundleTree(root, REPLACEMENT));
      await moveAside(staged);
      await carryManifest(staged, outsideOf(root));
      await symlink(outsideOf(root), staged, DIRECTORY_LINK);
    },
  },
  {
    name: "the owner's staging folder swapped to a link",
    refusal: PATH_ESCAPED,
    swap: async (root, staged) => {
      const replacement = join(outsideOf(root), basename(staged));
      await writeTree(replacement, bundleTree(root, REPLACEMENT));
      await copyFile(join(staged, STAGED_MANIFEST_FILE), join(replacement, STAGED_MANIFEST_FILE));
      await moveAside(dirname(staged));
      await symlink(outsideOf(root), dirname(staged), DIRECTORY_LINK);
    },
  },
];

test("an unchanged staged bundle folder imports what the server wrote", SLOW, async () => {
  await using root = await harness();
  const id = await admit(root, bundleTree(root, ORIGINAL));

  expect(await run(root, id)).toMatchObject({ status: "succeeded" });

  expect(await stored(root)).toContain(ORIGINAL);
});

test.for(BUNDLE_SWAPS)("in a bundle folder, $name fails the run and imports none of the replacement", SLOW, async ({ refusal, swap }) => {
  await using root = await harness();
  const id = await admit(root, bundleTree(root, ORIGINAL));
  await swap(root, await stagedTree(root));

  expect(await run(root, id)).toMatchObject({ status: "failed", error: expect.stringContaining(refusal) });

  expect(await stored(root)).not.toContain(REPLACEMENT);
});

test.for<{ name: string; tree: (root: ServerTestHarness, text: string) => Files; replacement: string; refusal: string }>([
  { name: "a profile", tree: profileTree, replacement: "profile", refusal: PROFILE_LEAF_CHANGED },
  { name: "a bundle folder", tree: bundleTree, replacement: "", refusal: BUNDLE_LEAF_CHANGED },
])("$name swapped to a link after the path check, carrying the real manifest, fails at the first leaf", SLOW, async ({ tree, replacement, refusal }) => {
  await using root = await harness();
  const id = await admit(root, tree(root, ORIGINAL));
  const staged = await stagedTree(root);
  const outside = outsideOf(root);
  await writeTree(join(outside, replacement), tree(root, REPLACEMENT));
  await writeFile(join(outside, STAGED_MANIFEST_FILE), await readFile(join(staged, STAGED_MANIFEST_FILE)));
  using race = afterPathCheck(staged, async () => {
    await moveAside(staged);
    await symlink(outside, staged, DIRECTORY_LINK);
  });

  expect(await run(root, id)).toMatchObject({ status: "failed", error: expect.stringContaining(refusal) });

  expect(race.fired()).toBe(true);
  expect(await stored(root)).not.toContain(REPLACEMENT);
});

/** A real library export holding one card. */
async function archiveOf(description: string): Promise<Uint8Array> {
  await using source = await signedInBox();
  const principal = await source.principalFor(source.ownerId);
  await source.services.character.create({ principal, input: createCharacterSchema.parse({ handle: "aria-source", name: "Aria Source", description }) });
  return await exportLibrary(source, ["character"]);
}

async function uploadArchive(root: ServerTestHarness, bytes: Uint8Array): Promise<WorkloadId> {
  const response = await root.http.request(PORTABILITY_ROUTES.importBundle, { method: "POST", headers: CSRF_HEADERS, body: Uint8Array.from(bytes) });
  expect(response.status).toBe(202);
  return importStartedSchema.parse(await response.json()).workloadId;
}

let archives: Promise<readonly [Uint8Array, Uint8Array]> | undefined;

/** The two exports every zip case compares, built once: a box per export is the cost of each case otherwise. */
function originalAndReplacement(): Promise<readonly [Uint8Array, Uint8Array]> {
  archives ??= Promise.all([archiveOf(ORIGINAL), archiveOf(REPLACEMENT)]);
  return archives;
}

test("an unchanged staged zip imports what the server wrote", SLOW, async () => {
  const [original] = await originalAndReplacement();
  await using root = await signedInBox();

  expect(await restoreBundle(root, original)).toMatchObject({ status: "succeeded", failed: 0 });

  expect(await stored(root)).toContain(ORIGINAL);
});

test.for<{ name: string; refusal: (token: string) => string; swap: (root: ServerTestHarness, path: string, replacement: Uint8Array) => Promise<void> }>([
  { name: "rewritten in place", refusal: zipChanged, swap: (_root, path, replacement) => writeFile(path, replacement) },
  {
    name: "replaced by a new file",
    refusal: zipChanged,
    swap: async (_root, path, replacement) => {
      await moveAside(path);
      await writeFile(path, replacement);
    },
  },
  {
    name: "swapped to a link",
    refusal: () => PATH_ESCAPED,
    swap: async (root, path, replacement) => {
      await writeTree(outsideOf(root), { "bundle.zip": replacement });
      await moveAside(path);
      await symlink(join(outsideOf(root), "bundle.zip"), path);
    },
  },
  {
    name: "replaced by a directory",
    refusal: zipChanged,
    swap: async (_root, path) => {
      await moveAside(path);
      await mkdir(path);
    },
  },
])("a staged zip $name fails the run and imports none of the replacement", SLOW, async ({ refusal, swap }) => {
  const [original, replacement] = await originalAndReplacement();
  await using root = await signedInBox();
  const id = await uploadArchive(root, original);
  const staged = await stagedTree(root);
  await swap(root, staged, replacement);

  expect(await run(root, id)).toMatchObject({ status: "failed", error: expect.stringContaining(refusal(basename(staged))) });

  expect(await stored(root)).not.toContain(REPLACEMENT);
});

/** Lay a real profile out beneath ST_PROFILE_DIR. */
function operatorRoot(root: ServerTestHarness): string {
  const dir = root.env.ST_PROFILE_DIR;
  if (dir === undefined) {
    throw new Error("the harness composes no ST_PROFILE_DIR");
  }
  return dir;
}

async function runOperator(root: ServerTestHarness): Promise<{ readonly id: WorkloadId; readonly status: string; readonly error: string | null }> {
  const started = await root.services.workloads.start({
    input: { kind: "import-st", params: {} },
    caller: await root.principalFor(root.ownerId),
    mode: "singular",
    ownerId: root.ownerId,
  });
  return { id: started.id, ...(await run(root, started.id)) };
}

/** The report a finished import wrote for the operator. */
async function reportOf(root: ServerTestHarness, id: WorkloadId): Promise<string> {
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id });
  if (row.kind !== "import-st" || row.poison || row.result?.reportPath === undefined) {
    throw new Error("the import wrote no report");
  }
  return await readFile(row.result.reportPath, "utf8");
}

test("an operator's real characters folder and a linked one import the same card with no orphan placeholder", SLOW, async () => {
  await using real = await harness();
  await writeTree(join(operatorRoot(real), "default-user"), {
    [ST_SETTINGS_FILE]: settings({}),
    "characters/Aria.png": cardPng(real, "Aria"),
    "chats/Aria/first.jsonl": chatOf(`${ORIGINAL}-solo`),
  });
  expect(await runOperator(real)).toMatchObject({ status: "succeeded" });
  const control = await stored(real);
  expect(control).toContain("Aria keeps the light");
  expect(control).not.toContain("orphan import");

  await using linked = await harness();
  const profile = join(operatorRoot(linked), "default-user");
  const nas = join(operatorRoot(linked), "..", "nas-characters");
  await writeTree(profile, { [ST_SETTINGS_FILE]: settings({}), "chats/Aria/first.jsonl": chatOf(`${ORIGINAL}-solo`) });
  await writeTree(nas, { "Aria.png": cardPng(linked, "Aria") });
  await symlink(nas, join(profile, "characters"), DIRECTORY_LINK);

  expect(await runOperator(linked)).toMatchObject({ status: "succeeded" });

  const rows = await stored(linked);
  expect(rows).toContain("Aria keeps the light");
  expect(rows).toContain(`${ORIGINAL}-solo`);
  expect(rows).not.toContain("orphan import");
});

test("an operator's linked profile folder imports like a real one", SLOW, async () => {
  await using root = await harness();
  const elsewhere = join(operatorRoot(root), "..", "other-user-real");
  await writeTree(elsewhere, { [ST_SETTINGS_FILE]: settings({}), "characters/Aria.png": cardPng(root, "Aria") });
  await mkdir(operatorRoot(root), { recursive: true });
  await symlink(elsewhere, join(operatorRoot(root), "linked-user"), DIRECTORY_LINK);

  expect(await runOperator(root)).toMatchObject({ status: "succeeded" });

  expect(await stored(root)).toContain("Aria keeps the light");
});

test.for<{ name: string; link: string }>([
  { name: "a plane", link: "characters" },
  { name: "a chat directory", link: join("chats", "Aria") },
])("a dangling link at $name fails the operator's run and names it", SLOW, async ({ link }) => {
  await using root = await harness();
  const profile = join(operatorRoot(root), "default-user");
  await writeTree(profile, { [ST_SETTINGS_FILE]: settings({}), "worlds/kept.json": "{}" });
  await mkdir(dirname(join(profile, link)), { recursive: true });
  await symlink(join(root.importStagingDir, "..", "missing-host-path"), join(profile, link), DIRECTORY_LINK);

  const outcome = await runOperator(root);

  expect(outcome).toMatchObject({ status: "failed" });
  expect(outcome.error).toContain(link);
});

test("a stray dangling link beside the operator's profiles fails nothing, and the report names it", SLOW, async () => {
  await using root = await harness();
  await writeTree(join(operatorRoot(root), "default-user"), { [ST_SETTINGS_FILE]: settings({}), "characters/Aria.png": cardPng(root, "Aria") });
  await symlink(join(root.importStagingDir, "..", "missing-host-path"), join(operatorRoot(root), "stray"), DIRECTORY_LINK);

  const outcome = await runOperator(root);

  expect(outcome).toMatchObject({ status: "succeeded" });
  expect(await stored(root)).toContain("Aria keeps the light");
  expect(await reportOf(root, outcome.id)).toContain("stray");
});

test("a queued profile upload with no digest refuses, asks for a new upload, and frees the tree", SLOW, async () => {
  await using root = await harness();
  const id = await admit(root, profileTree(root, ORIGINAL));
  const stagedDir = (await readdir(root.stagedImportsOf(root.ownerId)))[0];
  await root.db.update(workloads).set({ params: { stagedDir } }).where(eq(workloads.id, id));

  expect(await run(root, id)).toEqual({ status: "failed", error: STAGED_UPLOAD_OUTDATED });

  expect(await stored(root)).not.toContain(ORIGINAL);
  expect(await stagedEntries(root)).toEqual([]);
});

test("a queued bundle upload with no digest refuses, asks for a new upload, and frees the upload", SLOW, async () => {
  await using root = await harness();
  const id = await admit(root, bundleTree(root, ORIGINAL));
  const token = (await readdir(root.stagedImportsOf(root.ownerId)))[0];
  await root.db
    .update(workloads)
    .set({ params: { token, source: "dir" } })
    .where(eq(workloads.id, id));

  expect(await run(root, id)).toEqual({ status: "failed", error: STAGED_UPLOAD_OUTDATED });

  expect(await stored(root)).not.toContain(ORIGINAL);
  expect(await stagedEntries(root)).toEqual([]);
});

test("the enqueue door refuses a staged handle that carries no digest, and admits one that does", SLOW, async () => {
  await using root = await harness();
  const caller = await root.principalFor(root.ownerId);
  const stagedDigest = "0".repeat(64);
  const start = (params: { readonly stagedDir: string; readonly stagedDigest?: string }): ReturnType<typeof root.services.workloads.start> =>
    root.services.workloads.start({ input: { kind: "import-st", params }, caller, mode: "singular", ownerId: root.ownerId });

  await expect(start({ stagedDir: "import-tree-handle" })).rejects.toMatchObject({ code: WORKLOAD_NOT_ADMISSIBLE });

  expect((await start({ stagedDir: "import-tree-handle", stagedDigest })).id).toBeTypeOf("string");
});

test.for([STAGED_MANIFEST_FILE, STAGED_MANIFEST_FILE.toUpperCase()])(
  "an upload that claims the manifest's name as %s is refused and stages nothing",
  SLOW,
  async (name) => {
    await using root = await harness();

    const response = await post(root, { [name]: "[]", ...bundleTree(root, ORIGINAL) }, []);

    expect(response.status).toBe(400);
    expect(await stagedEntries(root)).toEqual([]);
  },
);
