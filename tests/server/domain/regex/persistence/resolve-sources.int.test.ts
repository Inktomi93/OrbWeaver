// persistence/resolve-sources — the chat-turn seam (D121-E). This is the op that REPLACED the three
// embed-by-value carriers: one call dereferences the four scope junctions under the turn's frozen
// `runAsUserId` and hands chat the four ordered slices.
//
// THE PROPERTY THAT COSTS THE MOST IF IT BREAKS: the CAST slice is ROSTER-ordered. The union feeds
// `executeRegexScripts`, which applies its list in order, so a multi-character room's precedence IS the
// roster's. The implementation reads every seated character in ONE `inArray` and regroups — a bare
// `inArray` without the regroup would silently hand back table order, which no assertion on membership
// alone would ever catch.

import { createRegexService } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { createResolveRegexSources } from "../../../../../packages/server/src/domain/regex/persistence/resolve-sources.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { allowChat, makeHarness, principal, seedCharacter, seedChat, seedPreset, seedScript, seedUser } from "../_support.ts";

describe("resolveRegexSources", () => {
  test("dereferences all FOUR scopes into their own slices", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { requireChatHost: allowChat });
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);
    const presetId = await seedPreset(db, owner);
    const chatId = await seedChat(db);

    const g = await seedScript(db, { ownerId: owner, id: "regex_script_g", name: "global" });
    const p = await seedScript(db, { ownerId: owner, id: "regex_script_p", name: "preset" });
    const c = await seedScript(db, { ownerId: owner, id: "regex_script_c", name: "cast" });
    const r = await seedScript(db, { ownerId: owner, id: "regex_script_r", name: "room" });
    await svc.attachGlobal({ principal: principal(owner), scriptId: g });
    await svc.attachToPreset({ principal: principal(owner), presetId, scriptId: p });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: c });
    await svc.attachToChat({ principal: principal(owner), chatId, scriptId: r });

    const sources = await createResolveRegexSources({ db })({ ownerId: owner, presetId, characterIds: [characterId], chatId });

    expect(sources.hostGlobal.map((s) => s.name)).toEqual(["global"]);
    expect(sources.preset.map((s) => s.name)).toEqual(["preset"]);
    expect(sources.cast.map((s) => s.name)).toEqual(["cast"]);
    expect(sources.chat.map((s) => s.name)).toEqual(["room"]);
  });

  test("the CAST slice follows ROSTER order, not table order", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const chatId = await seedChat(db);
    // Seed/attach in one order …
    const aria = await seedCharacter(db, owner, "aria");
    const brin = await seedCharacter(db, owner, "brin");
    const forAria = await seedScript(db, { ownerId: owner, id: "regex_script_aria", name: "aria-script" });
    const forBrin = await seedScript(db, { ownerId: owner, id: "regex_script_brin", name: "brin-script" });
    await svc.attachToCharacter({ principal: principal(owner), characterId: aria, scriptId: forAria });
    await svc.attachToCharacter({ principal: principal(owner), characterId: brin, scriptId: forBrin });

    const resolve = createResolveRegexSources({ db });
    // … then ask in BOTH roster orders. The answer must follow the ARGUMENT, not the insert order.
    const ariaFirst = await resolve({ ownerId: owner, presetId: null, characterIds: [aria, brin], chatId });
    const brinFirst = await resolve({ ownerId: owner, presetId: null, characterIds: [brin, aria], chatId });

    expect(ariaFirst.cast.map((s) => s.name)).toEqual(["aria-script", "brin-script"]);
    expect(brinFirst.cast.map((s) => s.name)).toEqual(["brin-script", "aria-script"]);
  });

  test("a null presetId resolves an EMPTY preset slice without a read", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const chatId = await seedChat(db);

    const sources = await createResolveRegexSources({ db })({ ownerId: owner, presetId: null, characterIds: [], chatId });
    expect(sources).toEqual({ hostGlobal: [], preset: [], cast: [], chat: [] });
  });

  test("resolves under the FROZEN owner — a stranger's identical attachments never leak in", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const chatId = await seedChat(db);
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });
    await svc.attachGlobal({ principal: principal(stranger), scriptId: theirs });

    // The op takes an ownerId, never a principal — D19: the turn passes the frozen host, and a member has
    // no parameter on this surface at all.
    const sources = await createResolveRegexSources({ db })({ ownerId: owner, presetId: null, characterIds: [], chatId });
    expect(sources.hostGlobal).toEqual([]);
  });

  test("the CHAT slice is NOT owner-filtered — a member's turn assembles the host's room set", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { requireChatHost: allowChat });
    const svc = createRegexService(h.ctx);
    const host = await seedUser(db, { handle: "host" });
    const member = await seedUser(db, { handle: "member" });
    const chatId = await seedChat(db);
    const roomScript = await seedScript(db, { ownerId: host, name: "room quirk" });
    await svc.attachToChat({ principal: principal(host), chatId, scriptId: roomScript });

    // Resolved under the MEMBER as owner: global/preset/cast come back empty (not theirs), but the room's
    // set still resolves — it is room-public prompt content, membership is the caller's gate upstream.
    const sources = await createResolveRegexSources({ db })({ ownerId: member, presetId: null, characterIds: [], chatId });
    expect(sources.hostGlobal).toEqual([]);
    expect(sources.chat.map((s) => s.name)).toEqual(["room quirk"]);
  });
});
