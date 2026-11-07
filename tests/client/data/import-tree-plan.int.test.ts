// @subject packages/client/src/data/import-tree-plan.ts
// @subject packages/client/src/data/import-tree-packer.ts
// @subject packages/client/src/data/import-tree-served.ts

import type { TreeImportCaps, TreeImportPlan } from "@orb/client/data";
import { importTree, planServedFolderImport, relativePathOf, skippedByReason } from "@orb/client/data";
import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { PersonaCollisionChoices, StProfileHandledEntry } from "@orb/contracts/import";
import {
  admitTreeBatch,
  importStartedSchema,
  ST_SECRETS_FILE,
  ST_SETTINGS_FILE,
  stProfileEntryDisposition,
  treeUploadFixedFramingBytes,
  treeUploadPartFramingBytes,
} from "@orb/contracts/import";
import type { PortableKind } from "@orb/contracts/portability";
import { PORTABLE_DIRECTORIES, PORTABLE_IMPORT_ORDER } from "@orb/contracts/portability";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { planTreeImport } from "#client/data/import-tree-plan.ts";
import { planServedTreeImport } from "#client/data/import-tree-served.ts";
import { PERSONA_COLLISION_CHOICES } from "#contracts/import/persona-collision.ts";

const ids = createSeededIds(FIXTURE_ID_CURSOR);

const WRAPPER = "backup";
const WORKLOAD_DEADLINE_MS = 60_000;
const UNIT = 400;
// Each upload holds two units, so the native tree below splits into one upload per plane group.
const SPLIT_CAPS: TreeImportCaps = { totalBytes: UNIT * 2, fileBytes: UNIT * 2, files: DEFAULT_UPLOAD_CAPS.importTreeFiles };

function pickedFile(path: string, bytes: string | Uint8Array<ArrayBuffer> = "native fixture"): File {
  const file = new File([bytes], path.split("/").at(-1) ?? path);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

function nativeFile(harness: ServerTestHarness, kind: PortableKind, stem: string, size: number): File {
  const entity = harness.app.portability.find((row) => row.kind === kind);
  if (entity === undefined) {
    throw new Error(`the production registry omitted ${kind}`);
  }
  return pickedFile(`${WRAPPER}/${entity.dir}${stem}${entity.ext}`, "x".repeat(size));
}

/** One upload per lone-sniff shape in dependency order: assets, a native-only plane, characters, themes, chats. */
function splitNativeTree(harness: ServerTestHarness): File[] {
  return [
    nativeFile(harness, "assets", "blob", UNIT * 2),
    nativeFile(harness, "character", "aria", UNIT),
    nativeFile(harness, "chat", "aria", UNIT),
    nativeFile(harness, "regex", "tidy", UNIT * 2),
    nativeFile(harness, "theme", "night", UNIT * 2),
  ];
}

function uploadedPaths(batches: readonly (readonly File[])[]): string[][] {
  return batches.map((batch) => batch.map((file) => relativePathOf(file).slice(WRAPPER.length + 1)));
}

test("a native backup retains every actual portability plane beside characters and chats", async ({ harness }) => {
  const files = harness.app.portability.map((entity) => pickedFile(`${WRAPPER}/${entity.dir}fixture${entity.ext}`));
  const plan = await planTreeImport(files, {
    totalBytes: DEFAULT_UPLOAD_CAPS.importTreeTotal,
    fileBytes: DEFAULT_UPLOAD_CAPS.importTreeFile,
    files: DEFAULT_UPLOAD_CAPS.importTreeFiles,
  });
  expect(plan.skipped).toEqual([]);
  expect(plan.files).toBe(files.length);
  expect(new Set(plan.batches.flat())).toEqual(new Set(files));
  expect(plan.layout).toBeNull();
});

test("a split native backup declares its layout so every upload is admitted as native", async ({ harness }) => {
  const files = splitNativeTree(harness);
  const plan = await planTreeImport(files, SPLIT_CAPS);
  const batches = uploadedPaths(plan.batches);
  expect(batches.map((paths) => [...new Set(paths.map((path) => path.split("/")[0]))])).toEqual([["assets"], ["regex"], ["characters"], ["themes"], ["chats"]]);
  // Alone, four of these uploads would be refused or routed to the SillyTavern importer.
  expect(batches.map((paths) => admitTreeBatch(paths, null).kind)).toEqual(["reject", "orb", "st", "reject", "st"]);
  expect(plan.layout).toBe("orb");
  for (const paths of batches) {
    expect(admitTreeBatch(paths, plan.layout)).toEqual({ kind: "orb", stagePrefix: "" });
  }
  expect(plan.skipped).toEqual([]);
  expect(new Set(plan.batches.flat())).toEqual(new Set(files));
});

test("a split native backup skips entries outside native directories instead of refusing their uploads", async ({ harness }) => {
  const outside = [pickedFile(`${WRAPPER}/README.txt`), pickedFile(`${WRAPPER}/notes/plan.txt`)];
  const files = [...splitNativeTree(harness), ...outside];
  const plan = await planTreeImport(files, SPLIT_CAPS);
  expect(plan.layout).toBe("orb");
  expect(plan.skipped).toHaveLength(outside.length);
  expect(plan.batches.flat().some((file) => outside.includes(file))).toBe(false);
  for (const paths of uploadedPaths(plan.batches)) {
    expect(admitTreeBatch(paths, plan.layout).kind).toBe("orb");
  }
});

test("a native backup that fits one upload keeps its undeclared whole-folder behavior", async ({ harness }) => {
  const outside = [pickedFile(`${WRAPPER}/README.txt`), pickedFile(`${WRAPPER}/notes/plan.txt`)];
  const files = [...splitNativeTree(harness), ...outside];
  const plan = await planTreeImport(files, { ...SPLIT_CAPS, totalBytes: UNIT * 20 });
  expect(plan.layout).toBeNull();
  expect(plan.skipped).toEqual([]);
  expect(plan.batches).toHaveLength(1);
  expect(new Set(plan.batches.flat())).toEqual(new Set(files));
});

test("a split native backup sends its planes in import dependency order, whatever order they were picked in", async ({ harness }) => {
  const dependentsFirst = PORTABLE_IMPORT_ORDER.toReversed().map((kind) => nativeFile(harness, kind, `${kind}-fixture`, UNIT));
  const plan = await planTreeImport(dependentsFirst, { ...SPLIT_CAPS, files: 1 });
  const dirOrder = PORTABLE_IMPORT_ORDER.map((kind) => PORTABLE_DIRECTORIES[kind].slice(0, -1));
  expect(uploadedPaths(plan.batches).map((paths) => paths.map((path) => path.split("/")[0]))).toEqual(dirOrder.map((dir) => [dir]));
});

const PROFILE_DIR = "default-user";
const PROFILE = `data/${PROFILE_DIR}`;
const CHARACTERS = "characters" satisfies StProfileHandledEntry;
const CHATS = "chats" satisfies StProfileHandledEntry;
const WORLDS = "worlds" satisfies StProfileHandledEntry;
const AVATARS = "User Avatars" satisfies StProfileHandledEntry;
const GROUPS = "groups" satisfies StProfileHandledEntry;
const GROUP_CHATS = "group chats" satisfies StProfileHandledEntry;
const FOREIGN_PLANE = "vectors";

const profileFile = (path: string, bytes: string | Uint8Array<ArrayBuffer> = "x"): File => pickedFile(`${PROFILE}/${path}`, bytes);
const pathsOf = (batch: readonly File[]): string[] => batch.map((file) => relativePathOf(file).slice(PROFILE.length + 1));

test("a split SillyTavern profile repeats settings, persona avatars and world books in every upload and keeps each card with its chats", async () => {
  const files = [
    profileFile(ST_SETTINGS_FILE, "{}"),
    profileFile(`${AVATARS}/bob.png`),
    profileFile(`${WORLDS}/Harbor.json`, "{}"),
    profileFile(`${CHARACTERS}/Aria.png`, "x".repeat(UNIT)),
    profileFile(`${CHARACTERS}/Bram.png`, "x".repeat(UNIT)),
    profileFile(`${CHATS}/Aria/one.jsonl`, "x".repeat(UNIT / 2)),
    profileFile(`${CHATS}/Bram/two.jsonl`, "x".repeat(UNIT / 2)),
  ];
  const whole = await planTreeImport(files, { ...SPLIT_CAPS, totalBytes: UNIT * 20 });
  expect(whole.batches).toHaveLength(1);

  const split = await planTreeImport(files, { ...SPLIT_CAPS, totalBytes: UNIT * 2 + files.slice(0, 3).reduce((sum, file) => sum + file.size, 0) });
  const batches = split.batches.map(pathsOf);
  expect(batches.length).toBeGreaterThan(1);
  for (const batch of batches) {
    expect(batch).toEqual(expect.arrayContaining([ST_SETTINGS_FILE, `${AVATARS}/bob.png`, `${WORLDS}/Harbor.json`]));
  }
  for (const [card, chat] of [
    [`${CHARACTERS}/Aria.png`, `${CHATS}/Aria/one.jsonl`],
    [`${CHARACTERS}/Bram.png`, `${CHATS}/Bram/two.jsonl`],
  ] as const) {
    expect(batches.find((batch) => batch.includes(chat))).toContain(card);
  }
  expect(new Set(batches.flat()).size).toBe(split.files);
});

test("a split profile seats a group with its member cards and transcript, and sends a chat folder with no card beside the base files", async () => {
  const files = [
    profileFile(ST_SETTINGS_FILE, "{}"),
    profileFile(`${CHARACTERS}/Aria.png`, "x".repeat(UNIT)),
    profileFile(`${CHARACTERS}/Bram.png`, "x".repeat(UNIT)),
    profileFile(`${CHARACTERS}/Cora.png`, "x".repeat(UNIT)),
    profileFile(`${GROUPS}/g1.json`, JSON.stringify({ members: ["Aria.png", "Bram.png"], chats: ["party"] })),
    profileFile(`${GROUP_CHATS}/party.jsonl`, "x".repeat(UNIT / 2)),
    profileFile(`${CHATS}/Nobody/orphan.jsonl`, "x".repeat(UNIT / 2)),
  ];
  const plan = await planTreeImport(files, { ...SPLIT_CAPS, totalBytes: UNIT * 4 });
  const batches = plan.batches.map(pathsOf);
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.find((batch) => batch.includes(`${GROUPS}/g1.json`))).toEqual(
    expect.arrayContaining([`${CHARACTERS}/Aria.png`, `${CHARACTERS}/Bram.png`, `${GROUP_CHATS}/party.jsonl`]),
  );
  expect(batches.flat()).toContain(`${CHATS}/Nobody/orphan.jsonl`);
  expect(plan.skipped).toEqual([]);
});

test.each([
  ["members only", { members: ["Aria.png", "Bram.png"], name: "Duo" }, [`${CHARACTERS}/Aria.png`, `${CHARACTERS}/Bram.png`]],
  ["chats only", { chats: ["party"] }, [`${GROUP_CHATS}/party.jsonl`]],
])("a split profile still seats a group definition with %s", async (_label, definition, seated) => {
  const files = [
    profileFile(ST_SETTINGS_FILE, "{}"),
    profileFile(`${CHARACTERS}/Aria.png`, "x".repeat(UNIT)),
    profileFile(`${CHARACTERS}/Bram.png`, "x".repeat(UNIT)),
    profileFile(`${CHARACTERS}/Cora.png`, "x".repeat(UNIT)),
    profileFile(`${GROUPS}/g1.json`, JSON.stringify(definition)),
    profileFile(`${GROUP_CHATS}/party.jsonl`, "x".repeat(UNIT / 2)),
    profileFile(`${CHATS}/Nobody/orphan.jsonl`, "x".repeat(UNIT / 2)),
  ];
  const plan = await planTreeImport(files, { ...SPLIT_CAPS, totalBytes: UNIT * 4 });
  const batches = plan.batches.map(pathsOf);
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.find((batch) => batch.includes(`${GROUPS}/g1.json`))).toEqual(expect.arrayContaining(seated));
});

test("the plan never sends a secrets.json at any depth, and reports foreign planes with the contract's reasons", async () => {
  const foreign = stProfileEntryDisposition(FOREIGN_PLANE, true);
  const secrets = stProfileEntryDisposition(ST_SECRETS_FILE, false);
  if (foreign.handled || secrets.handled) {
    throw new Error("the contract handles a plane this case reads as reported");
  }
  const nestedSecrets = `${CHATS}/Aria/${ST_SECRETS_FILE}`;
  const upperSecrets = ST_SECRETS_FILE.toUpperCase();
  const files = [
    profileFile(ST_SETTINGS_FILE, "{}"),
    profileFile(ST_SECRETS_FILE, "{}"),
    profileFile(nestedSecrets, "{}"),
    profileFile(upperSecrets, "{}"),
    profileFile(`${CHARACTERS}/Aria.png`),
    profileFile(`${FOREIGN_PLANE}/index.bin`),
  ];
  const plan = await planTreeImport(files, SPLIT_CAPS);
  expect(plan.skipped).toHaveLength(4);
  expect(pathsOf(plan.batches.flat())).toEqual([ST_SETTINGS_FILE, `${CHARACTERS}/Aria.png`]);
  // A skip carries no path, so each candidate is planned alone to pin its own reason to it.
  for (const [path, reason] of [
    [ST_SECRETS_FILE, secrets.reason],
    [nestedSecrets, secrets.reason],
    [upperSecrets, secrets.reason],
    [`${FOREIGN_PLANE}/index.bin`, foreign.reason],
  ] as const) {
    const alone = await planTreeImport([profileFile(ST_SETTINGS_FILE, "{}"), profileFile(`${CHARACTERS}/Aria.png`), profileFile(path, "{}")], SPLIT_CAPS);
    expect(skippedByReason(alone.skipped)).toEqual([{ reason, files: 1 }]);
    expect(pathsOf(alone.batches.flat())).not.toContain(path);
  }
});

test("a multi-profile root keeps every profile's settings in every upload", async () => {
  const files = [
    pickedFile("data/alice/settings.json", "{}"),
    pickedFile("data/alice/characters/A.png", "x".repeat(UNIT)),
    pickedFile("data/bob/settings.json", "{}"),
    pickedFile("data/bob/characters/B.png", "x".repeat(UNIT)),
  ];
  const plan = await planTreeImport(files, { ...SPLIT_CAPS, totalBytes: UNIT + 8 });
  expect(plan.skipped).toEqual([]);
  expect(plan.batches).toHaveLength(2);
  for (const batch of plan.batches) {
    const paths = batch.map(relativePathOf);
    expect(paths).toEqual(expect.arrayContaining([`data/alice/${ST_SETTINGS_FILE}`, `data/bob/${ST_SETTINGS_FILE}`]));
  }
});

/** The multipart body bytes each upload of `plan` sends through the production sender. */
async function sentBodyBytes(plan: TreeImportPlan, choices: PersonaCollisionChoices): Promise<number[]> {
  const bodies: number[] = [];
  const started = importStartedSchema.parse({ workloadId: ids.typeId(ID_PREFIX.workload) });
  vi.stubGlobal("fetch", async (_input: string, init?: RequestInit) => {
    bodies.push((await new Response(init?.body).arrayBuffer()).byteLength);
    return Response.json(started, { status: 202 });
  });
  try {
    for (const batch of plan.batches) {
      await importTree(batch, choices, plan.layout);
    }
  } finally {
    vi.unstubAllGlobals();
  }
  return bodies;
}

test("every upload of a folder near the served total fits that total as a whole multipart body", async ({ harness }) => {
  // Files whose bytes alone fill the total exactly: the multipart framing is what would carry an upload over it.
  const served: TreeImportCaps = { totalBytes: UNIT * 4, fileBytes: UNIT, files: DEFAULT_UPLOAD_CAPS.importTreeFiles };
  const files = ["one", "two", "three", "four", "five", "six", "seven", "eight"].map((stem) => nativeFile(harness, "regex", stem, UNIT));
  const collisionKey = "a persona name the review folded";
  const longestChoice = PERSONA_COLLISION_CHOICES.reduce((longest, choice) => (choice.length > longest.length ? choice : longest));
  for (const [keys, choices] of [
    [[], {}],
    [[collisionKey], { [collisionKey]: longestChoice }],
  ] as const) {
    const plan = await planServedTreeImport(files, served, keys);
    expect(new Set(plan.batches.flat())).toEqual(new Set(files));
    for (const bytes of await sentBodyBytes(plan, choices)) {
      expect(bytes).toBeLessThanOrEqual(served.totalBytes);
    }
  }
});

/** The served total that holds exactly `files`, framing bound included, in one upload answering `collisionKeys`. */
function totalHolding(files: readonly File[], collisionKeys: readonly string[] = []): number {
  return files.reduce(
    (sum, file) => sum + file.size + treeUploadPartFramingBytes({ path: relativePathOf(file), type: file.type }),
    treeUploadFixedFramingBytes(collisionKeys),
  );
}

test("the framing reserve scales with each upload, not with every file of the folder", async ({ harness }) => {
  const files = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"].map((stem) => nativeFile(harness, "regex", stem, UNIT));
  const served: TreeImportCaps = { totalBytes: totalHolding(files.slice(0, 4)), fileBytes: UNIT, files: DEFAULT_UPLOAD_CAPS.importTreeFiles };
  const plan = await planServedTreeImport(files, served, []);
  expect(plan.batches.map((batch) => batch.length)).toEqual([4, 4]);
  for (const bytes of await sentBodyBytes(plan, {})) {
    expect(bytes).toBeLessThanOrEqual(served.totalBytes);
  }
});

test("a file no framed upload can carry is skipped with its reason instead of sent alone", async ({ harness }) => {
  const small = nativeFile(harness, "regex", "small", UNIT);
  const whole = nativeFile(harness, "regex", "whole", UNIT * 2);
  // The per-file cap admits the large file, but no upload body that holds it fits the total.
  const served: TreeImportCaps = { totalBytes: totalHolding([small]), fileBytes: UNIT * 2, files: DEFAULT_UPLOAD_CAPS.importTreeFiles };
  const plan = await planServedTreeImport([small, whole], served, []);
  expect(plan.batches).toEqual([[small]]);
  const [skip, ...rest] = skippedByReason(plan.skipped);
  expect(rest).toEqual([]);
  expect(skip?.files).toBe(1);
  // The per-file cap is a different refusal: the same file under a smaller per-file cap names its own reason.
  const overFileCap = await planServedTreeImport([small, whole], { ...served, fileBytes: UNIT }, []);
  const [fileCapSkip] = skippedByReason(overFileCap.skipped);
  expect(fileCapSkip?.reason).not.toBe("");
  expect(skip?.reason).not.toBe("");
  expect(skip?.reason).not.toBe(fileCapSkip?.reason);
  expect(plan.batches.flat()).not.toContain(whole);
  expect(plan.files).toBe(1);
});

test("a served total the upload framing alone fills refuses the plan instead of sending one file per upload", async ({ harness }) => {
  const files = ["a", "b"].map((stem) => nativeFile(harness, "regex", stem, 1));
  const served: TreeImportCaps = { totalBytes: totalHolding([]), fileBytes: UNIT, files: DEFAULT_UPLOAD_CAPS.importTreeFiles };
  await expect(planServedTreeImport(files, served, [])).rejects.toThrow("leaves no room for any file");
});

/** A single-user root whose loopback requests act as its owner, so the client's own fetches reach it unauthenticated. */
const SINGLE_USER = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;

test("a folder whose persona collides with an owned one is replanned so every upload carries its answer", async () => {
  await using root = await createServerHarness(SINGLE_USER);
  await root.services.persona.create({ principal: await root.principalFor(root.ownerId), input: { name: "Wanderer", description: "The owned wanderer." } });
  const settings = {
    ["power_user"]: { personas: { "wanderer.png": "Wanderer" }, ["persona_descriptions"]: { "wanderer.png": { description: "The folder's wanderer." } } },
  };
  const settingsFile = pickedFile(`${WRAPPER}/settings.json`, JSON.stringify(settings));
  const cards = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((stem) => pickedFile(`${WRAPPER}/characters/${stem}.png`, "x".repeat(UNIT)));
  const files = [settingsFile, ...cards];
  // Four cards beside the shared settings fill an upload exactly until a collision answer joins every upload.
  const served: TreeImportCaps = {
    totalBytes: totalHolding([settingsFile, ...cards.slice(0, 4)]),
    fileBytes: UNIT,
    files: DEFAULT_UPLOAD_CAPS.importTreeFiles,
  };
  const cardsPerUpload = (plan: TreeImportPlan): number[] => plan.batches.map((batch) => batch.filter((file) => cards.includes(file)).length);
  expect(cardsPerUpload(await planServedTreeImport(files, served, []))).toEqual([4, 4]);

  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => root.http.request(input, init));
  let preflight: Awaited<ReturnType<typeof planServedFolderImport>>;
  try {
    preflight = await planServedFolderImport(files, served);
  } finally {
    vi.unstubAllGlobals();
  }

  expect(preflight.collisions).toHaveLength(1);
  expect(cardsPerUpload(preflight.plan)).toEqual([3, 3, 2]);
  const choices = Object.fromEntries(preflight.collisions.map((c) => [c.key, PERSONA_COLLISION_CHOICES[0]]));
  for (const bytes of await sentBodyBytes(preflight.plan, choices)) {
    expect(bytes).toBeLessThanOrEqual(served.totalBytes);
  }
});

test("a restore whose chat is picked before its character still links the chat once every upload has run", async () => {
  await using exporter = await createServerHarness(SINGLE_USER);
  const author = await exporter.internalCallerFor(exporter.ownerId);
  const card = await author.character.create({
    input: createCharacterSchema.parse({ handle: "split-aria", name: "Split Aria", description: "Split restore witness" }),
  });
  await author.chat.startChat({ characterIds: [card.id] });
  const picked: File[] = [];
  for (const entity of exporter.app.portability) {
    for await (const file of entity.exportAll(exporter.ownerId)) {
      picked.push(pickedFile(`${WRAPPER}/${entity.dir}${file.filename}`, new Uint8Array(file.bytes)));
    }
  }
  const isChat = (file: File): boolean => relativePathOf(file).startsWith(`${WRAPPER}/${PORTABLE_DIRECTORIES.chat}`);
  const dependentsFirst = [...picked.filter(isChat), ...picked.filter((file) => !isChat(file))];
  expect(dependentsFirst.filter(isChat)).toHaveLength(1);
  // One file per upload, so the chat and its character can only meet across two separate import workloads.
  const plan = await planTreeImport(dependentsFirst, {
    totalBytes: DEFAULT_UPLOAD_CAPS.importTreeTotal,
    fileBytes: DEFAULT_UPLOAD_CAPS.importTreeFile,
    files: 1,
  });
  expect(plan.batches.length).toBeGreaterThan(1);

  await using restorer = await createServerHarness(SINGLE_USER);
  const runAdmittedWorkload = restorer.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the harness did not expose manual workload execution");
  }
  const principal = await restorer.principalFor(restorer.ownerId);
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => restorer.http.request(input, init));
  let failed = 0;
  try {
    for (const batch of plan.batches) {
      const { workloadId } = await importTree(batch, {}, plan.layout);
      await runAdmittedWorkload(workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
      const workload = await restorer.services.workloads.get({ id: workloadId, caller: principal });
      if (workload.kind !== "import-bundle" || workload.poison || workload.result === null) {
        throw new Error("a declared native upload has no canonical bundle result");
      }
      failed += workload.result.failed;
    }
  } finally {
    vi.unstubAllGlobals();
  }
  expect(failed).toBe(0);
  const restored = await restorer.internalCallerFor(restorer.ownerId);
  expect((await restored.chat.listChats({})).items).toHaveLength(1);
});
