// verbs/read/list-turn-tool-calls — the recorded-turn window (TOOLCALLS-INVISIBLE, arm A). `.int`: the
// authority is a real membership resolve through the real FK chain, which is the only thing between a
// stranger and another room's game.
//
// THE GATE THAT MATTERS HERE IS THE ONE THAT IS *NOT* HOST-ONLY. Every sibling host-gated read on this domain
// (`getConfigView`, `revealHidden`) exists to keep something from a member; this one deliberately does not —
// a tool call is the mechanical record of a turn everyone at the table watched. So the cross-tenant belt
// carries the whole load, and these pin both halves: a MEMBER sees it, a STRANGER gets leak-free NOT_FOUND.

import type { Db } from "@orb/db";
import type { Handle, RpgTurnToolCallsId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { recordTurnToolCalls } from "../../../../../../packages/server/src/domain/rpg/persistence/turn-tool-calls.ts";
import { freshDb } from "../../../../../support/db.ts";
import { addVariant, expect, FROZEN_AT, principal, seedLiteGame, seedMessage, test } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const HOST = principal(castId<Handle>("host"));
const STRANGER = principal(castId<Handle>("stranger"));

/** One more reroll than the verb's default window has ROW slots (50) — the fixture size that makes the
 *  eviction pin below discriminate. Deliberately a literal rather than an import of the verb's private
 *  default: the pin must red if that default is quietly raised to hide the class instead of fixing it. */
const REROLLS_PAST_THE_ROW_WINDOW = 51;

describe("listTurnToolCalls", () => {
  test("a MEMBER reads the room's recorded turns, keyed to the producing variant", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    await recordTurnToolCalls(db, {
      id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_a"),
      gameId,
      messageId,
      variantId,
      calls: [{ name: "update_scene", args: '{"location":"the ford"}', verdict: "applied", issues: [] }],
      createdAt: FROZEN_AT,
    });

    const rows = await h.service.listTurnToolCalls({ principal: HOST, chatId });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.variantId).toBe(variantId);
    expect(rows[0]?.messageId).toBe(messageId);
    expect(rows[0]?.calls[0]?.name).toBe("update_scene");
  });

  test("a STRANGER is refused — leak-free, indistinguishable from a chat with no game", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await expect(h.service.listTurnToolCalls({ principal: STRANGER, chatId })).rejects.toThrow();
  });

  test("a game with no recorded turns answers EMPTY, never an error", async () => {
    const { chatId, h } = await seedLiteGame(db);
    expect(await h.service.listTurnToolCalls({ principal: HOST, chatId })).toEqual([]);
  });

  // THE EVICTION PIN (dogfood-class-sweep 2026-08-14, `turn-tool-calls.ts:45-52`). The window used to be the
  // newest 50 ROWS, and rows are one-per-VARIANT: a single reroll-heavy slot could fill the entire budget
  // with dead swipes nobody can look at, and an OLDER SELECTED turn still on the reader's screen silently
  // lost its disclosure. This asks through the verb's DEFAULT window — no param — so it reds against the
  // pre-fix source rather than failing to compile against a renamed one.
  test("a reroll-heavy slot cannot evict an older SELECTED turn's record from the default window", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    // The old turn the reader is still looking at: one slot, one variant, one record, the OLDEST timestamp.
    const old = await seedMessage(db, chatId, 1, { role: "assistant" });
    await recordTurnToolCalls(db, {
      id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_old"),
      gameId,
      messageId: old.messageId,
      variantId: old.variantId,
      calls: [{ name: "update_scene", args: '{"location":"the ford"}', verdict: "applied", issues: [] }],
      createdAt: FROZEN_AT,
    });

    // ONE newer slot, rerolled past the default 50-turn window's worth of ROWS. Every one of these is a
    // sibling of a single message — collectively unviewable except for whichever is selected.
    const rerolled = await seedMessage(db, chatId, 2, { role: "assistant" });
    await Promise.all(
      Array.from({ length: REROLLS_PAST_THE_ROW_WINDOW }, async (_unused, i) => {
        const variantId = await addVariant(db, rerolled.messageId, i + 1, `swipe ${i}`);
        await recordTurnToolCalls(db, {
          id: castId<RpgTurnToolCallsId>(`rpg_turn_tool_calls_reroll_${i}`),
          gameId,
          messageId: rerolled.messageId,
          variantId,
          calls: [{ name: "update_party", args: "{}", verdict: "applied", issues: [] }],
          // Strictly NEWER than the old turn's record, so a row-denominated window fills with these first.
          createdAt: FROZEN_AT + 10 + i,
        });
      }),
    );

    const rows = await h.service.listTurnToolCalls({ principal: HOST, chatId });
    expect(rows.map((r) => r.variantId)).toContain(old.variantId);
  });
});

// #1690 — THE MEMBER-VISIBILITY HALF (the #1528 class, on the read that claimed it could not have one). This
// verb's header used to say the record is "CONTENT-SAFE by construction … never prose". `args` is the RAW
// JSON the model sent and the state tools write prose, so an extractor that quoted a `<lie …/>` into a scene
// field put the GM's truth in a member's payload; a dropped call's `issues` line carries the model-sent value
// too, and THAT is the half the panel paints. Every principal is named: `host` holds the host seat, `member`
// is a plain present member.
const HIDDEN = '<lie character="Mara" truth="she is the informant"/>';
const TRUTH = "she is the informant";
const MEMBER = principal(castId<Handle>("member"));

describe("listTurnToolCalls — hidden spans are the HOST's plane, not the member's", () => {
  test("a member reads the args PARSED and stripped; the host reads the raw bytes verbatim", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    h.fakes.membership.set("user_member", "member");
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const args = JSON.stringify({ location: `The docks ${HIDDEN}`, npcs: [{ mood: `wary ${HIDDEN}` }] });
    await recordTurnToolCalls(db, {
      id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_lie"),
      gameId,
      messageId,
      variantId,
      calls: [{ name: "update_scene", args, verdict: "applied", issues: [] }],
      createdAt: FROZEN_AT,
    });

    const memberRows = await h.service.listTurnToolCalls({ principal: MEMBER, chatId });
    const hostRows = await h.service.listTurnToolCalls({ principal: HOST, chatId });

    // The truth BYTES never reach the member on any plane of the payload, at any depth.
    expect(JSON.stringify(memberRows)).not.toContain(TRUTH);
    expect(JSON.parse(memberRows[0]?.calls[0]?.args ?? "")).toEqual({ location: "The docks ", npcs: [{ mood: "wary " }] });
    expect(memberRows[0]?.calls[0]?.withheld).toBeNull();
    // The host reads canon verbatim — a member PROJECTION, not a redaction.
    expect(hostRows[0]?.calls[0]?.args).toBe(args);
  });

  test("a dropped call's issue line loses only the model-SENT value for a member — the path/message half stays", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    h.fakes.membership.set("user_member", "member");
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const issue = `weather.type: Invalid option — sent ${JSON.stringify(`storm ${HIDDEN}`)}`;
    await recordTurnToolCalls(db, {
      id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_issue"),
      gameId,
      messageId,
      variantId,
      calls: [{ name: "update_scene", args: "{}", verdict: "dropped", issues: [issue] }],
      createdAt: FROZEN_AT,
    });

    const memberRows = await h.service.listTurnToolCalls({ principal: MEMBER, chatId });
    const hostRows = await h.service.listTurnToolCalls({ principal: HOST, chatId });

    expect(JSON.stringify(memberRows)).not.toContain(TRUTH);
    // The actionable half — WHICH field the vocabulary refused — is what the disclosure exists for.
    expect(memberRows[0]?.calls[0]?.issues[0]).toContain("weather.type: Invalid option");
    expect(hostRows[0]?.calls[0]?.issues[0]).toBe(issue);
  });

  test("args that do not parse are WITHHELD from a member with a typed reason, and served whole to the host", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    h.fakes.membership.set("user_member", "member");
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    // A mid-emission garble whose bytes carry half a lie — the shape a blanket strip would have passed through.
    const args = `{"location":"The docks <lie truth="${TRUTH}`;
    await recordTurnToolCalls(db, {
      id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_garble"),
      gameId,
      messageId,
      variantId,
      calls: [{ name: "update_scene", args, verdict: "dropped", issues: ["arguments: not valid JSON"] }],
      createdAt: FROZEN_AT,
    });

    const memberRows = await h.service.listTurnToolCalls({ principal: MEMBER, chatId });
    const hostRows = await h.service.listTurnToolCalls({ principal: HOST, chatId });

    expect(JSON.stringify(memberRows)).not.toContain(TRUTH);
    expect(memberRows[0]?.calls[0]?.withheld).toBe("unparseable");
    expect(memberRows[0]?.calls[0]?.args).toBe("");
    // The member still learns the call happened and that it did not land.
    expect(memberRows[0]?.calls[0]?.name).toBe("update_scene");
    expect(memberRows[0]?.calls[0]?.verdict).toBe("dropped");
    expect(hostRows[0]?.calls[0]?.args).toBe(args);
    expect(hostRows[0]?.calls[0]?.withheld).toBeNull();
  });
});
