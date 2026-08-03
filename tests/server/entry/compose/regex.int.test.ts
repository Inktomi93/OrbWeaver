// entry/compose/regex — the REVERSE-roster ROOM filter (`resolveVisibleRooms`, REGROSTER). Rooms carry no
// `ownerId` (D18), so "which of these rooms may this caller see" is chat's membership data and is answered
// HERE, at the seam, exactly like the sibling `resolveRoomDisplayPolicy`. The domain verb's own suite stubs
// this op; this is the arm that runs the REAL join, end to end through `buildRegex().regex.listScriptUsage`.
//
// THE LOAD-BEARING PROPERTIES:
//   • PRESENT membership only — a room the caller has LEFT keeps its `chat_regex_scripts` row, and naming it
//     would tell an ex-member that a room they can no longer open still runs their script;
//   • a room the caller was NEVER in is likewise absent (the attachment row alone grants nothing);
//   • the NAME is the authored title trimmed, else the untitled fallback — a room renamed to whitespace
//     must not paint a blank roster row.

import { chatRegexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { buildRegex } from "../../../../packages/server/src/entry/compose/regex.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../domain/chat/_support.ts";
import { principal, seedScript, seedUser } from "../../domain/regex/_support.ts";

const NOW = 1_700_000_000_000;

describe("compose/regex — resolveVisibleRooms (the reverse roster's room filter)", () => {
  test("names only the rooms the caller is PRESENT in, titled, and drops left/never-joined rooms", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "strip ooc" });

    const present = await seedChat(db, "present", { title: "The Long Dark" });
    const untitled = await seedChat(db, "untitled", { title: "   " });
    const left = await seedChat(db, "left", { title: "Old campaign" });
    const never = await seedChat(db, "never", { title: "Someone else's room" });
    await seedParticipant(db, { chatId: present, key: "p", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: untitled, key: "u", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: left, key: "l", userId: owner, role: "host", leftSeq: 12 });

    await db.insert(chatRegexScripts).values(
      [present, untitled, left, never].map((chatId) => ({
        chatId,
        regexScriptId: scriptId,
        position: 0,
      })),
    );

    const { regex } = buildRegex({ db, now: (): number => NOW, audit: (): Promise<void> => Promise.resolve() });
    const usage = await regex.listScriptUsage({ principal: principal(owner), scriptId });

    // Name order: "The Long Dark" then "Untitled chat" — the fallback sorts as the string it PAINTS, not as
    // the null it came from.
    expect(usage.rooms).toEqual([
      { id: present, name: "The Long Dark" },
      { id: untitled, name: "Untitled chat" },
    ]);
  });
});
