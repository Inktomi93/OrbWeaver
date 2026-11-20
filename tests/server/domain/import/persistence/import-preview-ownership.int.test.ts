// The import preview names what the owner already has for every kind the loader recognizes. A library that
// imported one folder owns each of its items and none of a second folder's; an item is held by its content, never
// its name, and a transcript only under the character that holds it.
// @subject packages/server/src/domain/import/loader/profile-ownership.ts
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/substrate/preview.ts

import type { ImportPreviewKind } from "@orb/contracts/import";
import { IMPORT_PREVIEW_KINDS, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  admit,
  bothKindFolders,
  cardJson,
  cardPng,
  cardPngUnderOtherArt,
  chatOf,
  dryRun,
  finish,
  finishRun,
  harness,
  importThroughDialog,
  inProfile,
  namesakeFolder,
  settings,
} from "./_st-tree-door.ts";

// Every kind whose ownership comes from an owner domain's read. Characters keep the one lookup every door uses.
const OWNED_KINDS = IMPORT_PREVIEW_KINDS.filter((kind): kind is Exclude<ImportPreviewKind, "characters"> => kind !== "characters");
// A namesake persona is not here: the run merges it into the held persona by default, so the preview flags it
// (`import-preview-persona-collisions.int.test.ts`). The other kinds land beside the held item.
const NAMESAKE_KINDS = ["worlds", "presets", "themes", "backgrounds"] as const satisfies readonly ImportPreviewKind[];

forEachNonEmpty(OWNED_KINDS, "owned preview kinds", (kind) => {
  test(`a dry run flags the ${kind} the library already holds and not the ones it lacks`, async () => {
    await using root = await harness();
    const { held, both, names } = bothKindFolders(root);
    await finish(root, await admit(root, held));

    const preview = await dryRun(root, both);

    const items = preview.kinds[kind].items;
    expect(items.filter((item) => item.inLibrary === true).map((item) => item.name)).toEqual(names.held[kind]);
    expect(items.filter((item) => item.inLibrary !== true).map((item) => item.name)).toEqual(names.fresh[kind]);
  });
});

test.for(NAMESAKE_KINDS)("a %s item that shares a held item's name but not its content is not flagged", async (kind) => {
  await using root = await harness();
  const { held, names } = bothKindFolders(root);
  await finish(root, await admit(root, held));
  // The control: the held folder's own item reads as held, so the namesake's verdict is the content's.
  const control = await dryRun(root, held);
  expect(control.kinds[kind].items.filter((item) => item.inLibrary === true).map((item) => item.name)).toEqual(names.held[kind]);

  const preview = await dryRun(root, namesakeFolder(root));

  expect(preview.kinds[kind].items.map((item) => item.name)).toEqual(names.held[kind]);
  expect(preview.kinds[kind].items.filter((item) => item.inLibrary === true)).toEqual([]);
});

test("a transcript the owner holds under one character is not flagged under another character", async () => {
  await using root = await harness();
  const aria = cardPng(root, "Aria");
  const bram = cardPng(root, "Bram");
  const shared = chatOf("A line both folders carry.");
  await finish(
    root,
    await admit(root, { [ST_SETTINGS_FILE]: settings({}), "characters/Aria.png": aria, "characters/Bram.png": bram, "chats/Aria/shared.jsonl": shared }),
  );

  const preview = await dryRun(root, {
    [ST_SETTINGS_FILE]: settings({}),
    "characters/Aria.png": aria,
    "characters/Bram.png": bram,
    "chats/Aria/shared.jsonl": shared,
    "chats/Bram/shared.jsonl": shared,
  });

  const flagged = (held: boolean): string[] => preview.kinds.chats.items.filter((item) => (item.inLibrary === true) === held).map((item) => item.name);
  expect(flagged(true)).toEqual(["Aria: shared"]);
  expect(flagged(false)).toEqual(["Bram: shared"]);
});

test("two profiles that share a path keep their own verdicts", async () => {
  await using root = await harness();
  const aria = cardPng(root, "Aria");
  const alice = { [ST_SETTINGS_FILE]: settings({}), "characters/Aria.png": aria, "chats/Aria/shared.jsonl": chatOf("Alice's line.") };
  const bob = { [ST_SETTINGS_FILE]: settings({}), "characters/Aria.png": aria, "chats/Aria/shared.jsonl": chatOf("Bob's line.") };
  await finish(root, await admit(root, inProfile("alice", alice)));

  // Both profiles carry `chats/Aria/shared.jsonl`; only alice's transcript is the one the library holds.
  const preview = await dryRun(root, { ...inProfile("alice", alice), ...inProfile("bob", bob) });

  expect(preview.kinds.chats.total).toBe(2);
  expect(preview.kinds.chats.items.filter((item) => item.inLibrary === true)).toHaveLength(1);
});

test("a group the run refuses is a skip, not a new room, and the preview counts what the run counts", async () => {
  await using root = await harness();
  const { fresh } = bothKindFolders(root);
  const roomless = { name: "Roomless", members: ["Bram.png"], chats: [] };
  const memberless = { name: "Memberless", members: ["Ghost.png"], chats: ["ghost-room"] };
  const files = {
    ...fresh,
    "groups/roomless.json": JSON.stringify(roomless),
    "groups/memberless.json": JSON.stringify(memberless),
    "group chats/ghost-room.jsonl": chatOf("Nobody to seat."),
  };

  const preview = await dryRun(root, files);
  const imported = await finishRun(root, await admit(root, files));

  // The control: the folder's valid group is the one room, and its transcript is the only group transcript.
  expect(preview.kinds.groups.items.map((item) => item.name)).toEqual(["Fresh Group"]);
  expect(preview.skipped.items.map((item) => item.source.path)).toEqual(expect.arrayContaining(["groups/roomless.json", "groups/memberless.json"]));
  expect(imported.found).toMatchObject({ groups: preview.kinds.groups.total, chats: preview.kinds.chats.total });
  expect(preview.kinds.chats.items.map((item) => item.name)).not.toContain("Memberless: ghost-room");
});

const ARTS = ["owned", "other"] as const;
type Art = (typeof ARTS)[number];
const VERDICTS = ["library", "repeat", "write"] as const;
type Verdict = (typeof VERDICTS)[number];

/** Two same-text PNGs of an owned Aria, in the folder's name order, and what the preview must say of each. An owned
 *  row that has no art takes the first text match's art once and is then keyed by that art; one that already has art
 *  is left alone, so a card under other art lands beside it. */
const ART_CASES: readonly {
  readonly name: string;
  readonly ownedHasArt: boolean;
  readonly cards: readonly [Art, Art];
  readonly verdicts: readonly [Verdict, Verdict];
}[] = [
  { name: "the same art twice", ownedHasArt: false, cards: ["owned", "owned"], verdicts: ["library", "repeat"] },
  { name: "one art, then other art", ownedHasArt: false, cards: ["owned", "other"], verdicts: ["library", "write"] },
  { name: "other art, then the first art", ownedHasArt: false, cards: ["other", "owned"], verdicts: ["library", "write"] },
  { name: "an owned row that already has art", ownedHasArt: true, cards: ["owned", "other"], verdicts: ["library", "write"] },
];

test.for(ART_CASES)("same-text PNGs of an owned card, $name: the preview says what the run writes", async ({ ownedHasArt, cards, verdicts }) => {
  await using root = await harness();
  await importThroughDialog(root, "aria.json", cardJson("Aria"));
  if (ownedHasArt) {
    await importThroughDialog(root, "aria.png", cardPng(root, "Aria"));
  }
  const png = (art: Art): Uint8Array => (art === "owned" ? cardPng(root, "Aria") : cardPngUnderOtherArt(root, "Aria"));
  const files = {
    [ST_SETTINGS_FILE]: settings({}),
    // The collector reads a folder's cards in name order.
    "characters/first.png": png(cards[0]),
    "characters/second.png": png(cards[1]),
  };
  const ariaCount = async (): Promise<number> =>
    (await (await root.internalCallerFor(root.ownerId)).character.list({})).items.filter((item) => item.name === "Aria").length;
  // The control: the dialog left exactly one owned Aria for the folder to meet.
  expect(await ariaCount()).toBe(1);

  const preview = await dryRun(root, files);
  await finish(root, await admit(root, files));

  const verdictOf = (item: (typeof preview.kinds.characters.items)[number]): Verdict => {
    if (item.inLibrary === true) {
      return "library";
    }
    return item.repeat === true ? "repeat" : "write";
  };
  expect(preview.kinds.characters.items.map((item) => [item.source.path, verdictOf(item)])).toEqual([
    ["first.png", verdicts[0]],
    ["second.png", verdicts[1]],
  ]);
  expect(await ariaCount()).toBe(1 + preview.kinds.characters.counts.writes);
});
