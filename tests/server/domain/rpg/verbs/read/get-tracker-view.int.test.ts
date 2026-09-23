// verbs/read/get-tracker-view — getTrackerView (docs/plans/rpg/design.md). Pins the turnless-game DEFAULT-STATE
// synthesis (no born snapshot — the orchestrator ruling), the participants ∪ sheets projection (missing row = default
// sheet; a non-participant sheet not projected), and the no-drift invariant (synthesized default == persisted-empty
// clone-forward).

import { RPG_PROFILE_D20 } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, participantCharacter, participantUser, principal, seedLiteGame, seedUser, test } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("getTrackerView — the turnless-game default-state synthesis (no born snapshot)", () => {
  test("a game with NO snapshot rows renders the synthesized default: null ambient, empty planes, participants projected", async () => {
    await seedUser(db, castId<Handle>("host"));
    const participants = [participantUser(castId<Handle>("host"), "The Host"), participantCharacter("gorak", "Gorak")];
    const { chatId, h } = await seedLiteGame(db, { participants });

    const view = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });
    // No snapshot ⇒ synthesized default: null ambient, empty quests/cast/beats.
    expect(view.ambient).toBeNull();
    expect(view.quests).toEqual([]);
    expect(view.recentBeats).toEqual([]);
    // Participants ∪ sheets: both participant actors projected, each with the DEFAULT sheet (no rows written yet).
    expect(view.actors.map((a) => a.name).sort()).toEqual(["Gorak", "The Host"]);
    expect(view.actors.every((a) => a.volatile === null)).toBe(true);
    expect(view.actors.every((a) => a.sheet.className === "")).toBe(true);
  });

  test("a written sheet is projected onto its participant actor; a non-participant sheet is NOT projected", async () => {
    const hostId = await seedUser(db, castId<Handle>("host"));
    const participants = [participantUser(castId<Handle>("host"), "The Host")]; // only the host is a participant
    const { chatId, h } = await seedLiteGame(db, { participants });
    // Re-seed the game with the d20 profile (seedLiteGame defaults to freeform) — patch a sheet referencing it.
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { statProfile: RPG_PROFILE_D20 } });
    await h.service.patchSheet({
      principal: principal(castId<Handle>("host")),
      chatId,
      actorRef: { kind: "user", userId: hostId },
      patch: { className: "Wizard", attributes: { str: 8 } },
    });

    const view = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });
    expect(view.actors).toHaveLength(1); // only the participant actor is projected
    expect(view.actors[0]?.sheet.className).toBe("Wizard");
    expect(view.actors[0]?.sheet.attributes["str"]).toBe(8);
  });

  test("the no-drift invariant: snapshot-less view == after one empty hand-edit turn", async () => {
    await seedUser(db, castId<Handle>("host"));
    const participants = [participantUser(castId<Handle>("host"), "The Host"), participantCharacter("gorak", "Gorak")];
    const { chatId, h } = await seedLiteGame(db, { participants });

    // Render the SYNTHESIZED default (no snapshot rows — the no-born-seed ruling).
    const synthesized = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });
    // An empty hand-edit turn PERSISTS the default via clone-forward (mints the first snapshot). The rendered
    // view must not drift from the synthesized one — the synthesis and the persisted-empty state are the same.
    await h.service.editSnapshot({ principal: principal(castId<Handle>("host")), chatId, patch: {} });
    const persisted = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });

    expect(persisted).toEqual(synthesized);
  });
});

// #1528 — THE MEMBER-VISIBILITY HALF of the hidden-content boundary (the SOURCE side of #1398). A `<lie>` the
// host authored, or that an extractor quoted out of the model's prose into a state field, is GM-plane by the
// same §3.6 rule that strips it from a member's message payload and serves it only through the host-only
// reveal eye. Every principal is named: `host` holds the room's host seat, `member` is a plain present member.
const HIDDEN = '<lie character="Mara" truth="she is the informant"/>';
const TRUTH = "she is the informant";

describe("getTrackerView — hidden spans are the HOST's plane, not the member's", () => {
  test("a member reads the snapshot's free text STRIPPED; the host reads it whole", async () => {
    await seedUser(db, castId<Handle>("host"));
    await seedUser(db, castId<Handle>("member"));
    const { chatId, h } = await seedLiteGame(db);
    h.fakes.membership.set("user_member", "member");
    await h.service.editSnapshot({
      principal: principal(castId<Handle>("host")),
      chatId,
      patch: { location: `The docks ${HIDDEN}` },
    });
    await h.service.upsertQuest({
      principal: principal(castId<Handle>("host")),
      chatId,
      name: `Find the key ${HIDDEN}`,
      status: "active",
      description: `It is in the vault ${HIDDEN}`,
    });

    const memberView = await h.service.getTrackerView({ principal: principal(castId<Handle>("member")), chatId });
    const hostView = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });

    // The member never receives the truth BYTES on any free-text plane, at any depth.
    expect(JSON.stringify(memberView)).not.toContain(TRUTH);
    expect(memberView.ambient?.location).toBe("The docks ");
    expect(memberView.quests[0]?.name).toBe("Find the key ");
    expect(memberView.quests[0]?.description).toBe("It is in the vault ");
    // The host reads canon verbatim (the reveal-eye plane) — the strip is a member PROJECTION, not a redaction.
    expect(hostView.ambient?.location).toBe(`The docks ${HIDDEN}`);
    expect(hostView.quests[0]?.description).toBe(`It is in the vault ${HIDDEN}`);
  });

  test("an actor's volatile prose is stripped for a member too (the recursive walk, not a field list)", async () => {
    const hostId = await seedUser(db, castId<Handle>("host"));
    await seedUser(db, castId<Handle>("member"));
    const { chatId, h } = await seedLiteGame(db, { participants: [participantUser(castId<Handle>("host"), "The Host")] });
    h.fakes.membership.set("user_member", "member");
    await h.service.patchActor({
      principal: principal(castId<Handle>("host")),
      chatId,
      targetRef: { kind: "user", userId: hostId },
      ops: [{ op: "addItem", item: { name: `Bone key ${HIDDEN}`, description: `taken from ${HIDDEN}` } }],
    });

    const memberView = await h.service.getTrackerView({ principal: principal(castId<Handle>("member")), chatId });
    const hostView = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });

    expect(JSON.stringify(memberView)).not.toContain(TRUTH);
    expect(JSON.stringify(hostView)).toContain(TRUTH);
  });
});
