// Unreadable asset references: stored shapes no current writer produces, planted straight into the JSON column.
// @subject packages/server/src/domain/assets/persistence/asset-refs.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { plantForeignCardBackground, plantForeignRoomBackground, plantForeignSettingsBytes, plantForeignSettingsValue } from "@orb/testkit/node/composed";
import type { GcBox, StoredRef } from "../gc-box.ts";
import { ageOnly, openBox, openRoom, runScheduledGc, store, survival } from "../gc-box.ts";

/** Stored shapes no current writer produces — a newer build's row, a hand edit, or corruption — written
 *  straight into the JSON column, because the refusal path is exactly what a production writer cannot reach.
 *  Each plant answers the primary key of the row it broke: the refusal must name it for the owner to repair. */
const UNREADABLE_REFERENCES = {
  "a room background of a source kind this build does not know": async (box: GcBox, ref: StoredRef): Promise<string> => {
    const room = await openRoom(box, castId<CharacterHandle>("gc-unknown-room-kind"));
    await plantForeignRoomBackground(box.root, room, { kind: "library", assetId: ref.assetId });
    return room;
  },
  "a room background that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> => {
    const room = await openRoom(box, castId<CharacterHandle>("gc-encoded-room-background"));
    await plantForeignRoomBackground(box.root, room, JSON.stringify({ kind: "asset", assetId: ref.assetId }));
    return room;
  },
  "a card background of a source kind this build does not know": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await plantCardBackground(box, castId<CharacterHandle>("gc-unknown-card-kind"), { kind: "library", assetId: ref.assetId }),
  "a card background override that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await plantCardBackground(box, castId<CharacterHandle>("gc-encoded-card-background"), JSON.stringify({ kind: "asset", assetId: ref.assetId })),
  "a background-library entry whose assetId is not a string": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.appearance.backgroundLibrary", [{ entryId: "gc-entry", assetId: { id: ref.assetId } }]),
  "a background-library entry that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.appearance.backgroundLibrary", [ref.assetId]),
  "a background pick that is not a string": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.appearance.backgroundAssetId", { id: ref.assetId }),
  "an appearance section that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.appearance", JSON.stringify({ backgroundAssetId: ref.assetId })),
  "a profile avatar that is not a string": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.profile.avatarAssetId", [ref.assetId]),
  "a profile section that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.profile", JSON.stringify({ avatarAssetId: ref.assetId })),
  "a settings blob that is not JSON at all": async (box: GcBox, ref: StoredRef): Promise<string> => {
    await settingsRow(box);
    await plantForeignSettingsBytes(box.root, box.root.ownerId, `{"profile":{"avatarAssetId":"${ref.assetId}"`);
    return box.root.ownerId;
  },
} as const;

async function plantCardBackground(box: GcBox, handle: CharacterHandle, value: unknown): Promise<string> {
  const card = await box.root.services.character.create({
    principal: box.principal,
    input: createCharacterSchema.parse({ handle, name: "Unreadable", description: "" }),
  });
  await plantForeignCardBackground(box.root, card.id, value);
  return card.id;
}

/** The owner's settings row, written once through the real section verb so the foreign value has a row to land in. */
async function settingsRow(box: GcBox): Promise<void> {
  await box.root.services.settings.updateUserSettingsSection({ principal: box.principal, input: { section: "profile", patch: { flankCollapsed: true } } });
}

async function rewriteSettings(box: GcBox, path: string, value: unknown): Promise<string> {
  await settingsRow(box);
  await plantForeignSettingsValue(box.root, box.root.ownerId, path, value);
  return box.root.ownerId;
}

test.each(Object.entries(UNREADABLE_REFERENCES))("%s refuses the whole sweep, names the row and deletes nothing", async (_shape, plant) => {
  const box = await openBox();
  const named = await store(box, "background");
  const orphan = await store(box, "attachment");
  const brokenRow = await plant(box, named);
  await ageOnly(box, named, orphan);

  const run = await runScheduledGc(box);

  expect(run.status).toBe("failed");
  expect(run.error).toContain(brokenRow);
  expect(await survival(box, { named, orphan })).toEqual({ named: true, orphan: true });
});
