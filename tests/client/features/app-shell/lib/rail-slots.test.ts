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
  MOBILE_PRIMARY_SECTIONS,
  NEW_CHAT_ACTION,
  RAIL_ACTIONS,
  RAIL_SECTIONS,
  RAIL_SLOTS,
  YOU_ACTION,
} from "../../../../../packages/client/src/features/app-shell/lib/rail-slots";
import { expect, test } from "../../../../support/fixtures";

describe("rail-slots ↔ modal-slots pairing", () => {
  test("every SectionId appears exactly once in the rail nav", () => {
    const railSectionIds = RAIL_SECTIONS.map((s) => s.id).sort();
    expect(railSectionIds).toEqual([...SECTION_IDS].sort());
  });

  test("every modal trigger (rail action / avatar / command / new-chat / you) has a MODAL_SLOTS body", () => {
    const triggerIds = [
      ...RAIL_ACTIONS.map((a) => a.id),
      ACCOUNT_ACTION.id,
      COMMAND_ACTION.id,
      NEW_CHAT_ACTION.id,
      YOU_ACTION.id,
    ];
    for (const id of triggerIds) {
      expect(MODAL_SLOTS[id]).toBeDefined();
      expect(typeof MODAL_SLOTS[id].title).toBe("string");
      expect(typeof MODAL_SLOTS[id].render).toBe("function");
    }
  });

  test("every MODAL_SLOTS body has a reachable trigger (no orphan modal)", () => {
    // The reachable set = rail-footer actions + avatar + the topbar ⌘K + the CONTENT-level new-chat
    // trigger + the mobile "You" tab. NEW_CHAT_ACTION and YOU_ACTION are NOT in RAIL_SLOTS (they paint
    // no desktop rail button — the reachable-set trap), so they MUST be listed here or their bodies read
    // as orphans.
    const reachable = new Set<string>([
      ...RAIL_ACTIONS.map((a) => a.id),
      ACCOUNT_ACTION.id,
      COMMAND_ACTION.id,
      NEW_CHAT_ACTION.id,
      YOU_ACTION.id,
    ]);
    for (const id of MODAL_SLOT_IDS) {
      expect(reachable.has(id)).toBe(true);
    }
  });

  test("the mobile bottom bar is the `mobilePrimary` subset (Chats · Characters · Corpus), curated to 4 with You", () => {
    // The mobile bar is registry-DERIVED (no parallel list): the mobilePrimary sections + the You tab.
    // Guards the P3 curation — a new section defaults to overflow (reachable via You), never silently
    // onto the thumb bar, and the bar never balloons past 4.
    expect(MOBILE_PRIMARY_SECTIONS.map((s) => s.id)).toEqual(["chats", "characters", "corpus"]);
    for (const s of MOBILE_PRIMARY_SECTIONS) {
      expect(s.mobilePrimary).toBe(true);
    }
    // Every mobilePrimary section is a real rail section (derived from RAIL_SECTIONS, not re-declared).
    const railIds = new Set(RAIL_SECTIONS.map((s) => s.id));
    for (const s of MOBILE_PRIMARY_SECTIONS) {
      expect(railIds.has(s.id)).toBe(true);
    }
    // The bottom bar is exactly 4 targets: the 3 primaries + You.
    expect(MOBILE_PRIMARY_SECTIONS.length + 1).toBe(4);
  });

  test("RAIL_SLOTS carries the nav sections + the footer actions + the avatar", () => {
    const modalIds = RAIL_SLOTS.filter((s) => s.kind === "modal").map((s) => s.id);
    // Rail-borne modal triggers = theme + settings + account (⌘K lives in the topbar, not the rail).
    expect(modalIds.sort()).toEqual(["account", "settings", "theme"]);
    expect(RAIL_SLOTS.filter((s) => s.kind === "section")).toHaveLength(SECTION_IDS.length);
  });
});
