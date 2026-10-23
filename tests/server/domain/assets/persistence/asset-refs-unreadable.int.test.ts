import { userSettings } from "@orb/db";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { eq, sql } from "drizzle-orm";
import type { GcBox, StoredRef } from "../gc-box.ts";
import { ageOnly, openBox, openRoom, runScheduledGc, store, survival } from "../gc-box.ts";
import { plantCardBackground, plantRoomBackground, rewriteSettings, settingsRow } from "./foreign-references.ts";

const UNREADABLE_REFERENCES = {
  "a room background of a source kind this build does not know": async (box: GcBox, ref: StoredRef): Promise<string> => {
    const room = await openRoom(box, castId<CharacterHandle>("gc-unknown-room-kind"));
    await plantRoomBackground(box, room, { kind: "library", assetId: ref.assetId });
    return room;
  },
  "a room background that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> => {
    const room = await openRoom(box, castId<CharacterHandle>("gc-encoded-room-background"));
    await plantRoomBackground(box, room, JSON.stringify({ kind: "asset", assetId: ref.assetId }));
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
    await box.root.db
      .update(userSettings)
      .set({ config: sql`${`{"profile":{"avatarAssetId":"${ref.assetId}"`}` })
      .where(eq(userSettings.userId, box.root.ownerId));
    return box.root.ownerId;
  },
} as const;

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
