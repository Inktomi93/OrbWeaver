// rail-slots pairing test — the behavioral companion to the `registry-pairing` gate (UI-Gates §11.5).
// Asserts the rail's MODAL triggers and the MODAL_SLOTS bodies can never silently drift: every
// rail/avatar/topbar modal trigger has a body, and every body has a reachable trigger (no orphan "panel
// won't open"). Section coverage is now `section-registry-completeness` (tsc totality + the gate);
// mobile-tab curation membership is app-shell.ct.tsx's mobile bottom-bar test (the rail SECTIONS derive
// from the section registry, not a parallel RAIL_SECTIONS map).

import { MODAL_SLOT_IDS } from "@orb/client/state";
import { describe } from "vitest";
import { MODAL_SLOTS } from "../../../../../packages/client/src/features/app-shell/lib/modal-slots";
import {
  ACCOUNT_ACTION,
  COMMAND_ACTION,
  NEW_CHAT_ACTION,
  RAIL_ACTIONS,
  YOU_ACTION,
} from "../../../../../packages/client/src/features/app-shell/lib/rail-slots";
import { expect, test } from "../../../../support/fixtures";

const TRIGGER_IDS = [
  ...RAIL_ACTIONS.map((a) => a.id),
  ACCOUNT_ACTION.id,
  COMMAND_ACTION.id,
  NEW_CHAT_ACTION.id,
  YOU_ACTION.id,
];

describe("rail-slots ↔ modal-slots pairing", () => {
  test("every modal trigger (rail action / avatar / command / new-chat / you) has a MODAL_SLOTS body", () => {
    for (const id of TRIGGER_IDS) {
      expect(MODAL_SLOTS[id]).toBeDefined();
      expect(typeof MODAL_SLOTS[id].title).toBe("string");
      expect(typeof MODAL_SLOTS[id].render).toBe("function");
    }
  });

  test("every MODAL_SLOTS body has a reachable trigger (no orphan modal)", () => {
    // NEW_CHAT_ACTION and YOU_ACTION paint no desktop rail button (the reachable-set trap), so they MUST
    // be in TRIGGER_IDS or their bodies read as orphans.
    const reachable = new Set<string>(TRIGGER_IDS);
    for (const id of MODAL_SLOT_IDS) {
      expect(reachable.has(id)).toBe(true);
    }
  });
});
