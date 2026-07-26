// verbs/read/get-tracker-view — getTrackerView (rpg-design/05 §4.8, §6.2). Pins the turnless-game DEFAULT-STATE
// synthesis (no born snapshot — the orchestrator ruling), the roster ∪ sheets projection (missing row = default
// sheet; a non-roster sheet not projected), and the no-drift invariant (synthesized default == persisted-empty
// clone-forward).

import { RPG_PROFILE_D20 } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../../support/db";
import { expect, principal, rosterCharacter, rosterUser, seedLiteGame, seedUser, test } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("getTrackerView — the turnless-game default-state synthesis (no born snapshot)", () => {
  test("a game with NO snapshot rows renders the synthesized default: null ambient, empty planes, roster projected", async () => {
    await seedUser(db, "host");
    const roster = [rosterUser("host", "The Host"), rosterCharacter("gorak", "Gorak")];
    const { chatId, h } = await seedLiteGame(db, { roster });

    const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
    // No snapshot ⇒ synthesized default: null ambient, empty quests/cast/beats.
    expect(view.ambient).toBeNull();
    expect(view.quests).toEqual([]);
    expect(view.recentBeats).toEqual([]);
    // Roster ∪ sheets: both roster actors projected, each with the DEFAULT sheet (no rows written yet).
    expect(view.actors.map((a) => a.name).sort()).toEqual(["Gorak", "The Host"]);
    expect(view.actors.every((a) => a.volatile === null)).toBe(true);
    expect(view.actors.every((a) => a.sheet.className === "")).toBe(true);
  });

  test("a written sheet is projected onto its roster actor; a non-roster sheet is NOT projected", async () => {
    const hostId = await seedUser(db, "host");
    const roster = [rosterUser("host", "The Host")]; // only the host is in the roster
    const { chatId, h } = await seedLiteGame(db, { roster });
    // Re-seed the game with the d20 profile (seedLiteGame defaults to freeform) — patch a sheet referencing it.
    await h.service.updateConfig({ principal: principal("host"), chatId, patch: { statProfile: RPG_PROFILE_D20 } });
    await h.service.patchSheet({
      principal: principal("host"),
      chatId,
      actorRef: { kind: "user", userId: hostId },
      patch: { className: "Wizard", attributes: { str: 8 } },
    });

    const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
    expect(view.actors).toHaveLength(1); // only the roster actor is projected
    expect(view.actors[0]?.sheet.className).toBe("Wizard");
    expect(view.actors[0]?.sheet.attributes["str"]).toBe(8);
  });

  test("the no-drift invariant: snapshot-less view == after one empty hand-edit turn", async () => {
    await seedUser(db, "host");
    const roster = [rosterUser("host", "The Host"), rosterCharacter("gorak", "Gorak")];
    const { chatId, h } = await seedLiteGame(db, { roster });

    // Render the SYNTHESIZED default (no snapshot rows — the no-born-seed ruling).
    const synthesized = await h.service.getTrackerView({ principal: principal("host"), chatId });
    // An empty hand-edit turn PERSISTS the default via clone-forward (mints the first snapshot). The rendered
    // view must not drift from the synthesized one — the synthesis and the persisted-empty state are the same.
    await h.service.editSnapshot({ principal: principal("host"), chatId, patch: {} });
    const persisted = await h.service.getTrackerView({ principal: principal("host"), chatId });

    expect(persisted).toEqual(synthesized);
  });
});
