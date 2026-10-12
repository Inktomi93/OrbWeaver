// op: resolveRoomDisplayPolicy — D121-E: a room broadcasts its HOST's display scripts only when the host opted in,
// and a hostless room broadcasts nobody's. The roster read runs only while the option is on.

import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createResolveRoomDisplayPolicy } from "@orb/server/domain/chat";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { seedChat, seedParticipant, seedUser } from "../_support.ts";

describe("resolveRoomDisplayPolicy", () => {
  test("on names the present host, off names nobody, and a hostless room is on with no host", async () => {
    const db = await freshDb();
    const host = await seedUser(db, castId<Handle>("host"));
    const on = await seedChat(db, "on", { metadata: { hostDisplayScripts: true } });
    const off = await seedChat(db, "off", { metadata: { hostDisplayScripts: false } });
    const orphan = await seedChat(db, "orphan", { metadata: { hostDisplayScripts: true } });
    await seedParticipant(db, { chatId: on, key: "on", userId: host, role: "host" });
    await seedParticipant(db, { chatId: off, key: "off", userId: host, role: "host" });
    await seedParticipant(db, { chatId: orphan, key: "orphan", userId: host, role: "host", leftSeq: 7 });
    const resolve = createResolveRoomDisplayPolicy({ db });

    expect(await resolve(on)).toEqual({ enabled: true, hostUserId: host });
    expect(await resolve(off)).toEqual({ enabled: false, hostUserId: null });
    expect(await resolve(orphan)).toEqual({ enabled: true, hostUserId: null });
    expect(await resolve(castId<ChatId>("chat_missing"))).toEqual({ enabled: false, hostUserId: null });
  });
});
