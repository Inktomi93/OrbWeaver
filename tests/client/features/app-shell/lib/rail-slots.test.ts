// rail-slots pairing test — the behavioral stand-in for the still-parked `check:registry-pairing`
// gate (UI-Gates §11.5). Asserts the RAIL registry and the MODAL_SLOTS bodies can never silently
// drift: every SectionId appears exactly once in the rail nav; every rail/avatar/topbar modal trigger
// has a MODAL_SLOTS body; and every MODAL_SLOTS body has a reachable trigger (no orphan "panel won't
// open"). The type layer already forces most of this (Record<ModalSlotId>, SectionId-typed ids); this
// pins the RUNTIME coverage the types can't (an entry MISSING from the array is not a tsc error).

import { MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { describe } from "vitest";
import { MODAL_SLOTS } from "../../../../../packages/client/src/features/app-shell/lib/modal-slots";
import {
  ACCOUNT_ACTION,
  COMMAND_ACTION,
  NEW_CHAT_ACTION,
  RAIL_ACTIONS,
  RAIL_SECTIONS,
  RAIL_SLOTS,
} from "../../../../../packages/client/src/features/app-shell/lib/rail-slots";
import { expect, test } from "../../../../support/fixtures";

describe("rail-slots ↔ modal-slots pairing", () => {
  test("every SectionId appears exactly once in the rail nav", () => {
    const railSectionIds = RAIL_SECTIONS.map((s) => s.id).sort();
    expect(railSectionIds).toEqual([...SECTION_IDS].sort());
  });

  test("every modal trigger (rail action / avatar / command / new-chat) has a MODAL_SLOTS body", () => {
    const triggerIds = [
      ...RAIL_ACTIONS.map((a) => a.id),
      ACCOUNT_ACTION.id,
      COMMAND_ACTION.id,
      NEW_CHAT_ACTION.id,
    ];
    for (const id of triggerIds) {
      expect(MODAL_SLOTS[id]).toBeDefined();
      expect(typeof MODAL_SLOTS[id].title).toBe("string");
      expect(typeof MODAL_SLOTS[id].render).toBe("function");
    }
  });

  test("every MODAL_SLOTS body has a reachable trigger (no orphan modal)", () => {
    // The reachable set = rail-footer actions + avatar + the topbar ⌘K + the CONTENT-level new-chat
    // trigger. NEW_CHAT_ACTION is NOT in RAIL_SLOTS (it paints no rail button — the J2 reachable-set
    // trap), so it MUST be listed here or `newChat`'s body reads as an orphan.
    const reachable = new Set<string>([
      ...RAIL_ACTIONS.map((a) => a.id),
      ACCOUNT_ACTION.id,
      COMMAND_ACTION.id,
      NEW_CHAT_ACTION.id,
    ]);
    for (const id of MODAL_SLOT_IDS) {
      expect(reachable.has(id)).toBe(true);
    }
  });

  test("RAIL_SLOTS carries the nav sections + the footer actions + the avatar", () => {
    const modalIds = RAIL_SLOTS.filter((s) => s.kind === "modal").map((s) => s.id);
    // Rail-borne modal triggers = theme + settings + account (⌘K lives in the topbar, not the rail).
    expect(modalIds.sort()).toEqual(["account", "settings", "theme"]);
    expect(RAIL_SLOTS.filter((s) => s.kind === "section")).toHaveLength(SECTION_IDS.length);
  });
});
