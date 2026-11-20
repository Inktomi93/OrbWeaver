// A preview lists a capped number of entries per kind, but its counts cover every entry: a folder of more presets than
// the list shows previews them all as writes into an empty library and none once the library holds them, and the run
// writes what the counts say.
// @subject packages/server/src/domain/import/substrate/preview.ts
// @subject packages/contracts/src/import/preview.ts

import { IMPORT_PREVIEW_LIST_MAX, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import type { Files } from "./_st-tree-door.ts";
import { admit, dryRun, finishRun, harness, presetOf, settings } from "./_st-tree-door.ts";

const PAST_THE_CAP = IMPORT_PREVIEW_LIST_MAX + 1;

/** One more preset than a preview lists, each holding the text `contentOf(i)` gives. */
function presetsPastTheCap(contentOf: (i: number) => string): Files {
  const presets = Array.from({ length: PAST_THE_CAP }, (_, i): [string, string] => [`OpenAI Settings/Preset ${String(i)}.json`, presetOf(contentOf(i))]);
  return { [ST_SETTINGS_FILE]: settings({}), ...Object.fromEntries(presets) };
}

async function presetCount(root: ServerTestHarness): Promise<number> {
  return (await (await root.internalCallerFor(root.ownerId)).preset.list()).length;
}

test("presets past the list cap are writes into an empty library and owned once it holds them, as the run counts them", { tags: ["slow"] }, async () => {
  await using root = await harness();
  const files = presetsPastTheCap((i) => `You are number ${String(i)}.`);
  const empty = await presetCount(root);

  const fresh = (await dryRun(root, files)).kinds.presets;
  await finishRun(root, await admit(root, files));
  const held = await presetCount(root);
  const owned = (await dryRun(root, files)).kinds.presets;
  await finishRun(root, await admit(root, files));

  // The control: the lists really stop short of the folder, so a count read off one would call the rest writes.
  expect(fresh.items).toHaveLength(IMPORT_PREVIEW_LIST_MAX);
  expect(owned.items).toHaveLength(IMPORT_PREVIEW_LIST_MAX);
  expect(fresh.total).toBe(PAST_THE_CAP);
  expect(fresh.counts).toEqual({ inLibrary: 0, repeat: 0, writes: PAST_THE_CAP, withoutArt: 0, uncompared: 0 });
  expect(held - empty).toBe(fresh.counts.writes);
  expect(owned.counts).toEqual({ inLibrary: PAST_THE_CAP, repeat: 0, writes: 0, withoutArt: 0, uncompared: 0 });
  expect(await presetCount(root)).toBe(held);
});

test("equal presets past the list cap are repeats of one another, as the run counts them", { tags: ["slow"] }, async () => {
  await using root = await harness();
  const files = presetsPastTheCap(() => "You are the same preset.");
  const before = await presetCount(root);

  const { counts } = (await dryRun(root, files)).kinds.presets;
  await finishRun(root, await admit(root, files));

  expect(counts).toEqual({ inLibrary: 0, repeat: IMPORT_PREVIEW_LIST_MAX, writes: 1, withoutArt: 0, uncompared: 0 });
  expect((await presetCount(root)) - before).toBe(counts.writes);
});
