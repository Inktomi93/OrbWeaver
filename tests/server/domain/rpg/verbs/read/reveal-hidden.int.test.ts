// verbs/read/reveal-hidden — revealHidden (parity-plus §3.6). The HOST-gated reveal eye + standing-lie
// inventory, derived from the STORED assistant bodies (no new table). Pins THE TRUST BOUNDARY: a member gets a
// leak-free NOT_FOUND (never the truth), the host reads the parsed hidden content, and M4 `hiddenContentReveal`
// off withholds the eye even from the host (the wire/member-strip are unaffected — proven elsewhere).

import type { Db } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { findGameByChat, updateGame } from "../../../../../../packages/server/src/domain/rpg/persistence/games";
import { freshDb } from "../../../../../support/db";
import { expect, liteConfig, principal, seedLiteGame, seedMessage, seedUser, test } from "../../_support";

const LIE = '<lie character="Mari" type="motive" truth="she wants the crown" reason="ambition" />';

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("revealHidden — the host-reveal trust boundary", () => {
  test("the HOST reads the parsed hidden content + the standing-lie inventory from the stored bodies", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await seedMessage(db, chatId, 1, { role: "assistant", content: `Mari smiles warmly. ${LIE}` });
    const reveal = await h.service.revealHidden({ principal: principal(castId<Handle>("host")), chatId });
    expect(reveal.messages).toHaveLength(1);
    expect(reveal.messages[0]?.spans[0]?.tag).toBe("lie");
    expect(reveal.messages[0]?.spans[0]?.fields.find((f) => f.key === "truth")?.value).toBe("she wants the crown");
    // The standing-lie inventory groups it by character.
    expect(reveal.standingLies).toHaveLength(1);
    expect(reveal.standingLies[0]?.character).toBe("Mari");
    expect(reveal.standingLies[0]?.lies[0]?.truth).toBe("she wants the crown");
  });

  test("a MEMBER is refused — the truth is a GM-plane secret (never served to a non-host)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await seedMessage(db, chatId, 1, { role: "assistant", content: `Mari smiles. ${LIE}` });
    // Register a present member (not host) — resolveHost refuses them.
    await seedUser(db, castId<Handle>("member"));
    h.fakes.membership.set("user_member", "member");
    await expect(h.service.revealHidden({ principal: principal(castId<Handle>("member")), chatId })).rejects.toBeInstanceOf(DomainForbiddenError);
  });

  test("M4: with hiddenContentReveal OFF the host gets an EMPTY reveal (pure-hidden posture)", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    await seedMessage(db, chatId, 1, { role: "assistant", content: `Mari smiles. ${LIE}` });
    const base = liteConfig();
    await updateGame(db, gameId, { config: { ...base, features: { ...base.features, hiddenContentReveal: false } } });
    const reveal = await h.service.revealHidden({ principal: principal(castId<Handle>("host")), chatId });
    expect(reveal).toEqual({ messages: [], standingLies: [] });
    // Sanity: the game row's toggle is actually off (the withhold is config-driven, not an empty transcript).
    const game = await findGameByChat(db, chatId);
    expect(game?.config.features.hiddenContentReveal).toBe(false);
  });

  test("a game with no hidden content reveals nothing (a clean host-plane read, not an error)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await seedMessage(db, chatId, 1, { role: "assistant", content: "Mari smiles warmly and says nothing untrue." });
    expect(await h.service.revealHidden({ principal: principal(castId<Handle>("host")), chatId })).toEqual({ messages: [], standingLies: [] });
  });
});
