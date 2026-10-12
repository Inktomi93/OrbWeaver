// op: resolveUserPublics — a human's display surface in a room. The persona arm is OWNER-SCOPED: a persona id the
// user does not own lends nothing, so a seat can never borrow someone else's name or face. The profile avatar is the
// last fallback, and a failed settings read leaves it absent rather than failing the roster.

import type { UserSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { personas } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService, createResolveUserPublics } from "@orb/server/domain/persona";
import { selectHandleById } from "@orb/server/domain/sessions";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

const PROFILE_AVATAR = "asset_profile";

function settingsWithAvatar(avatarAssetId: string | null): (userId: UserId) => Promise<UserSettings> {
  return () => Promise.resolve({ ...DEFAULT_USER_SETTINGS, profile: { ...DEFAULT_USER_SETTINGS.profile, avatarAssetId } });
}

describe("resolveUserPublics", () => {
  test("an OWNED persona supplies the name and avatar; a FOREIGN persona id lends nothing", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const alice = await seedUser(db, { handle: castId<Handle>("alice") });
    const bob = await seedUser(db, { handle: castId<Handle>("bob") });
    const face = await seedAsset(db, { ownerId: alice, id: "asset_face" });
    const zara = await svc.create({ principal: principal(alice), input: { name: "Zara", description: "a cartographer" } });
    await db.update(personas).set({ avatarAssetId: face }).where(eq(personas.id, zara.id));
    const resolve = createResolveUserPublics(
      { db },
      { loadUserHandle: (id) => selectHandleById(db, id), loadUserSettings: settingsWithAvatar(PROFILE_AVATAR) },
    );

    expect(await resolve(alice, zara.id)).toEqual({ displayName: "Zara", handle: "alice", avatarAssetId: face });
    // Bob names Alice's persona: he gets his own handle and his own profile avatar, never Zara.
    expect(await resolve(bob, zara.id)).toEqual({ displayName: "bob", handle: "bob", avatarAssetId: PROFILE_AVATAR });
  });

  test("no persona falls back to the handle and the profile avatar; a failed settings read leaves the avatar absent", async () => {
    const db = await freshDb();
    const carol = await seedUser(db, { handle: castId<Handle>("carol") });
    const withProfile = createResolveUserPublics(
      { db },
      { loadUserHandle: (id) => selectHandleById(db, id), loadUserSettings: settingsWithAvatar(PROFILE_AVATAR) },
    );
    const failing = createResolveUserPublics(
      { db },
      { loadUserHandle: (id) => selectHandleById(db, id), loadUserSettings: () => Promise.reject(new Error("settings unavailable")) },
    );

    expect(await withProfile(carol, null)).toEqual({ displayName: "carol", handle: "carol", avatarAssetId: PROFILE_AVATAR });
    expect(await failing(carol, null)).toEqual({ displayName: "carol", handle: "carol", avatarAssetId: null });
    expect(await withProfile(castId<UserId>("user_gone"), null)).toEqual({ displayName: null, handle: null, avatarAssetId: PROFILE_AVATAR });
  });
});
