// @subject packages/client/src/data/import-tree-plan.ts
// @subject packages/client/src/data/import-tree-packer.ts
// @subject packages/client/src/data/import-tree-served.ts

import type { TreeImportCaps, TreeImportPlan } from "@orb/client/data";
import { importTree, planServedFolderImport, relativePathOf } from "@orb/client/data";
import { createCharacterSchema } from "@orb/contracts/character";
import type { PersonaCollisionChoices } from "@orb/contracts/import";
import { admitTreeBatch, importStartedSchema, treeUploadFixedFramingBytes, treeUploadPartFramingBytes } from "@orb/contracts/import";
import type { PortableKind } from "@orb/contracts/portability";
import { PORTABLE_DIRECTORIES, PORTABLE_IMPORT_ORDER } from "@orb/contracts/portability";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { planTreeImport } from "#client/data/import-tree-plan.ts";
import { planServedTreeImport } from "#client/data/import-tree-served.ts";
import { PERSONA_COLLISION_CHOICES } from "#contracts/import/persona-collision.ts";

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
  expect(plan.skipped.map((entry) => entry.path).toSorted()).toEqual(["README.txt", "notes/plan.txt"]);
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

/** The multipart body bytes each upload of `plan` sends through the production sender. */
async function sentBodyBytes(plan: TreeImportPlan, choices: PersonaCollisionChoices): Promise<number[]> {
  const bodies: number[] = [];
  const started = importStartedSchema.parse({ workloadId: mintTypeId(ID_PREFIX.workload) });
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
  expect(plan.skipped.map((entry) => entry.path)).toEqual([relativePathOf(whole).slice(WRAPPER.length + 1)]);
  expect(plan.files).toBe(1);
});

test("a served total the upload framing alone fills refuses the plan instead of sending one file per upload", async ({ harness }) => {
  const files = ["a", "b"].map((stem) => nativeFile(harness, "regex", stem, 1));
  const served: TreeImportCaps = { totalBytes: totalHolding([]), fileBytes: UNIT, files: DEFAULT_UPLOAD_CAPS.importTreeFiles };
  await expect(planServedTreeImport(files, served, [])).rejects.toThrow(Error);
});

/** A single-user root whose loopback requests act as its owner, so the client's own fetches reach it unauthenticated. */
const SINGLE_USER = {
  env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
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
