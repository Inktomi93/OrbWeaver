// The blob route's `?w=` variant over the real assets verbs, CAS and variant cache: a room member is served a
// co-participant's rostered avatar variant, and a non-member is refused it through the same gate as the original.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { BLOB_ROUTE } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { CharacterHandle, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AssetsService } from "@orb/server/domain/assets";
import { createAssetsService } from "@orb/server/domain/assets";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { Hono } from "hono";
import { describe, onTestFinished } from "vitest";
import type { PrincipalEnv } from "#server/entry/http/index.ts";
import { registerBlob } from "#server/entry/http/index.ts";
import type { AssetsHarness } from "../../domain/assets/_support.ts";
import { makeHarness, pngBytes, principal, seedCharacter, seedChatRow, seedParticipant, seedUser, setCharacterAvatar } from "../../domain/assets/_support.ts";

const PNG = "image/png";
const OK = 200;
const NOT_FOUND = 404;
// The bytes the harness's fake imageTransform returns.
const FAKE_WEBP = [0x57, 0x45, 0x42, 0x50, 0xaa, 0xbb];
// `?w=150&v=portrait` snaps to the 200px portrait rung; the cache file name folds kind, width and quality.
const PORTRAIT_QUERY = "w=150&v=portrait";
const PORTRAIT_CACHE_FILE = "portrait-w200-q80.webp";

interface Room {
  readonly svc: AssetsService;
  readonly charOwner: UserId;
  readonly member: UserId;
  readonly outsider: UserId;
  readonly avatarHash: string;
}

function appAs(h: AssetsHarness, svc: AssetsService, who: Principal): Hono<PrincipalEnv> {
  const app = new Hono<PrincipalEnv>();
  app.use("*", async (c, next) => {
    c.set("principal", who);
    c.set("sessionId", null);
    await next();
  });
  registerBlob(app, { assets: svc, cas: h.ctx.cas });
  return app;
}

async function get(h: AssetsHarness, svc: AssetsService, who: UserId, path: string): Promise<Response> {
  return await appAs(h, svc, await principal(databaseForOwner(h.ctx.db), who)).request(path);
}

function cacheDir(h: AssetsHarness, ownerId: UserId, hash: string): string {
  return join(h.variantDir, ownerId, hash.slice(0, 2), hash.slice(2, 4), hash);
}

// `charOwner` rosters a character whose avatar is a stored PNG into a room `member` sits in. `outsider` is a
// third account with no seat.
async function seedRoom(db: Db, h: AssetsHarness): Promise<Room> {
  const svc = createAssetsService(h.ctx);
  const charOwner = await seedUser(db, { handle: castId<Handle>("char_owner") });
  const member = await seedUser(db, { handle: castId<Handle>("member") });
  const outsider = await seedUser(db, { handle: castId<Handle>("outsider") });
  const avatar = await svc.store({ principal: await principal(db, charOwner), bytes: pngBytes(10, 20, 30), kind: "avatar", mime: PNG });
  const character = await seedCharacter(db, charOwner, { handle: castId<CharacterHandle>("hero") });
  await setCharacterAvatar(db, character, avatar.assetId);
  const chat = await seedChatRow(db, "chat_shared");
  await seedParticipant(db, chat, "human", { id: "cp_owner", userId: charOwner, role: "host" });
  await seedParticipant(db, chat, "human", { id: "cp_member", userId: member });
  await seedParticipant(db, chat, "character", { id: "cp_char", characterId: character });
  return { svc, charOwner, member, outsider, avatarHash: avatar.hash };
}

describe("GET /api/blob/:hash?w= in a shared room", () => {
  test("a seated member is served a co-participant's rostered avatar variant, cached in the owner's partition", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const room = await seedRoom(db, h);

    const res = await get(h, room.svc, room.member, `${BLOB_ROUTE}/${room.avatarHash}?${PORTRAIT_QUERY}`);

    expect(res.status).toBe(OK);
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(FAKE_WEBP);
    const cached = await readFile(join(cacheDir(h, room.charOwner, room.avatarHash), PORTRAIT_CACHE_FILE));
    expect(Array.from(cached)).toEqual(FAKE_WEBP);
    // The member's request never opens a variant partition of its own.
    expect(await readdir(h.variantDir)).not.toContain(room.member);
  });

  test("a non-participant is refused the same variant, even after a member warmed the owner's cache", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const room = await seedRoom(db, h);
    const path = `${BLOB_ROUTE}/${room.avatarHash}?${PORTRAIT_QUERY}`;
    await get(h, room.svc, room.member, path);
    const transformsBefore = h.imageTransform.mock.calls.length;

    const variant = await get(h, room.svc, room.outsider, path);
    const original = await get(h, room.svc, room.outsider, `${BLOB_ROUTE}/${room.avatarHash}`);

    expect(variant.status).toBe(NOT_FOUND);
    expect(original.status).toBe(NOT_FOUND);
    expect(h.imageTransform.mock.calls.length).toBe(transformsBefore);
  });

  test("a seated member is refused a variant of an unrelated user's asset", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const room = await seedRoom(db, h);
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const unrelated = await room.svc.store({ principal: await principal(db, stranger), bytes: pngBytes(40, 50, 60), kind: "avatar", mime: PNG });

    const res = await get(h, room.svc, room.member, `${BLOB_ROUTE}/${unrelated.hash}?${PORTRAIT_QUERY}`);

    expect(res.status).toBe(NOT_FOUND);
    expect(h.imageTransform).not.toHaveBeenCalled();
  });
});
