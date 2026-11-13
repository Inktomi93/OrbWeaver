// A folder the planner splits into several uploads previews each upload alone, and the merge of those previews says
// what the uploads together write: equal content that the split sends to different uploads is written once, so the
// merged preview counts it once.
// @subject packages/client/src/data/import-tree-plan.ts
// @subject packages/client/src/data/import-tree.ts
// @subject packages/contracts/src/import/preview.ts
// @subject packages/server/src/domain/import/substrate/preview.ts
// @subject packages/server/src/domain/import/loader/profile-ownership.ts

import type { TreeImportCaps, TreeImportPlan } from "@orb/client/data";
import { importTree, relativePathOf } from "@orb/client/data";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { ImportPreview, ImportPreviewKind } from "@orb/contracts/import";
import { mergeImportPreviews } from "@orb/contracts/import";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import type { WorkloadId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { planTreeImport } from "#client/data/import-tree-plan.ts";

const ROOT = "data";
const ALICE = "alice";
const BOB = "bob";
const PROFILES = [ALICE, BOB] as const;

function capsOf(files: number): TreeImportCaps {
  return { totalBytes: DEFAULT_UPLOAD_CAPS.importTreeTotal, fileBytes: DEFAULT_UPLOAD_CAPS.importTreeFile, files };
}

// A SillyTavern chat-completion preset: the text is all that differs between two of them.
const PRESET = JSON.stringify({
  prompts: [{ identifier: "main", name: "Main", content: "You are the same in both profiles.", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
});
const SETTINGS = JSON.stringify({ ["power_user"]: { personas: {} } });
const CARD = '{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Aria","description":"Aria keeps the light.","first_mes":"The lamp is lit."}}';

function chatOf(text: string): string {
  return [
    '{"user_name":"Bob","character_name":"Aria","create_date":"2025-07-18@12h00m00s"}',
    JSON.stringify({ ["is_user"]: false, mes: text, ["send_date"]: "2025-07-18@12h00m01s" }),
  ].join("\n");
}

function pickedFile(path: string, bytes: string | Uint8Array<ArrayBuffer>): File {
  const file = new File([bytes], path.split("/").at(-1) ?? path);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

/** The files two profiles of one picked folder share byte for byte, as SillyTavern leaves them when it copies its
 *  default content into each user directory. */
function sharedBytes(root: ServerTestHarness): { readonly background: Uint8Array<ArrayBuffer>; readonly card: Uint8Array<ArrayBuffer> } {
  const png = (): Uint8Array<ArrayBuffer> => new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  return { background: png(), card: new Uint8Array(writeCardChunk(png(), CARD)) };
}

/** What a run adds for a kind: the entries the preview lists, less the ones it reuses. */
function willWrite(preview: ImportPreview, kind: ImportPreviewKind): number {
  const { total, items } = preview.kinds[kind];
  return total - items.filter((item) => item.inLibrary === true || item.repeat === true).length;
}

async function previewOf(root: ServerTestHarness, id: WorkloadId): Promise<ImportPreview> {
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id });
  if (row.kind !== "import-st" || row.poison || row.result?.preview === undefined) {
    throw new Error("the dry run has no preview");
  }
  return row.result.preview;
}

async function runUpload(root: ServerTestHarness, id: WorkloadId): Promise<void> {
  if (root.runAdmittedWorkload === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  await root.runAdmittedWorkload(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
}

interface Library {
  readonly presets: number;
  readonly backgrounds: number;
  readonly characters: number;
  readonly chats: number;
}

async function libraryHolds(root: ServerTestHarness): Promise<Library> {
  const caller = await root.internalCallerFor(root.ownerId);
  const settings = await root.services.settings.getUserSettings({ principal: await root.principalFor(root.ownerId) });
  return {
    presets: (await caller.preset.list()).length,
    backgrounds: settings.config.appearance.backgroundLibrary.length,
    characters: (await caller.character.list({})).items.length,
    chats: (await caller.chat.listChats({})).items.length,
  };
}

/** A root whose owner holds nothing yet, with the default content seeder off. */
async function freshRoot(): Promise<ServerTestHarness> {
  return await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner", ["SEED_CONTENT"]: "off" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
}

/** Previews every upload of the plan the way the client does, merges them, then runs every upload for real. */
async function previewMergeAndRun(
  root: ServerTestHarness,
  plan: TreeImportPlan,
): Promise<{ readonly previews: readonly ImportPreview[]; readonly merged: ImportPreview; readonly before: Library; readonly after: Library }> {
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => root.http.request(input, init));
  try {
    const previews: ImportPreview[] = [];
    for (const batch of plan.batches) {
      const { workloadId } = await importTree(batch, {}, plan.layout, { dryRun: true });
      await runUpload(root, workloadId);
      previews.push(await previewOf(root, workloadId));
    }
    const before = await libraryHolds(root);
    for (const batch of plan.batches) {
      await runUpload(root, (await importTree(batch, {}, plan.layout)).workloadId);
    }
    return { previews, merged: mergeImportPreviews(previews), before, after: await libraryHolds(root) };
  } finally {
    vi.unstubAllGlobals();
  }
}

const profileOf = (file: File): string => relativePathOf(file).split("/")[1] ?? "";
const isSettings = (file: File): boolean => relativePathOf(file).endsWith("settings.json");

test("equal presets and backgrounds the planner sends in different uploads are written once and counted once in the merged preview", async () => {
  await using root = await freshRoot();
  const { background } = sharedBytes(root);
  const files = PROFILES.flatMap((profile) => [
    pickedFile(`${ROOT}/${profile}/settings.json`, SETTINGS),
    pickedFile(`${ROOT}/${profile}/OpenAI Settings/Plain.json`, PRESET),
    pickedFile(`${ROOT}/${profile}/backgrounds/Plain.png`, background),
  ]);
  // Each upload carries both settings files, so two more files make an upload: one profile's preset and background.
  const plan = await planTreeImport(files, capsOf(4));
  // The control: the planner really puts alice's preset and background in one upload and bob's in the other.
  expect(plan.batches.map((batch) => batch.filter((file) => !isSettings(file)).map(profileOf))).toEqual([
    [ALICE, ALICE],
    [BOB, BOB],
  ]);

  const { previews, merged, before, after } = await previewMergeAndRun(root, plan);

  for (const kind of ["presets", "backgrounds"] as const) {
    // Each upload alone calls its own copy new: the defect the merge has to undo.
    expect(
      previews.map((preview) => willWrite(preview, kind)),
      kind,
    ).toEqual([1, 1]);
    expect(after[kind] - before[kind], kind).toBe(1);
    expect(willWrite(merged, kind), kind).toBe(1);
  }
});

test("equal cards, transcripts, orphan directories and groups the planner sends in different uploads are counted once in the merged preview", async () => {
  await using root = await freshRoot();
  const { card } = sharedBytes(root);
  const files = PROFILES.flatMap((profile) => {
    // Different file names for the same card, so the planner packs each profile's card and chats as its own bundle.
    const stem = profile === ALICE ? "A" : "B";
    return [
      pickedFile(`${ROOT}/${profile}/settings.json`, SETTINGS),
      // The two presets are base files that fill an upload up to the first profile's orphan transcript, which the
      // planner appends after every other base file, so the two orphan directories fall on either side of the split.
      pickedFile(`${ROOT}/${profile}/OpenAI Settings/Plain.json`, PRESET),
      pickedFile(`${ROOT}/${profile}/chats/Wanderer/orphan.jsonl`, chatOf("The orphan line.")),
      pickedFile(`${ROOT}/${profile}/characters/${stem}.png`, card),
      pickedFile(`${ROOT}/${profile}/chats/${stem}/solo.jsonl`, chatOf("The solo line.")),
      pickedFile(`${ROOT}/${profile}/groups/crew.json`, JSON.stringify({ name: "Crew", members: [`${stem}.png`], chats: [`room-${stem}`] })),
      pickedFile(`${ROOT}/${profile}/group chats/room-${stem}.jsonl`, chatOf("The room line.")),
    ];
  });
  // Both settings files ride every upload; three more files make an upload.
  const plan = await planTreeImport(files, capsOf(5));
  expect(plan.skipped).toEqual([]);
  // The control: each orphan directory, card bundle and group sits in an upload without its twin.
  const holding = (path: string): number[] => plan.batches.flatMap((batch, i) => (batch.some((file) => relativePathOf(file).endsWith(path)) ? [i] : []));
  for (const twins of [
    ["alice/chats/Wanderer/orphan.jsonl", "bob/chats/Wanderer/orphan.jsonl"],
    ["alice/groups/crew.json", "bob/groups/crew.json"],
  ]) {
    const [first, second] = twins.map(holding);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first).not.toEqual(second);
  }
  expect(holding("alice/chats/A/solo.jsonl")).not.toEqual(holding("bob/chats/B/solo.jsonl"));

  const { previews, merged, before, after } = await previewMergeAndRun(root, plan);

  // One card, one placeholder, three transcripts and one preset landed, whatever the uploads alone called new.
  expect(after.characters - before.characters).toBe(willWrite(merged, "characters") + willWrite(merged, "orphans"));
  expect(after.chats - before.chats).toBe(willWrite(merged, "chats"));
  expect(after.presets - before.presets).toBe(willWrite(merged, "presets"));
  expect([after.characters - before.characters, after.chats - before.chats, after.presets - before.presets]).toEqual([2, 3, 1]);
  for (const kind of ["characters", "chats", "orphans", "groups"] as const satisfies readonly ImportPreviewKind[]) {
    const alone = previews.reduce((sum, preview) => sum + willWrite(preview, kind), 0);
    expect(alone, kind).toBeGreaterThan(willWrite(merged, kind));
  }
  expect(willWrite(merged, "groups")).toBe(1);
});
