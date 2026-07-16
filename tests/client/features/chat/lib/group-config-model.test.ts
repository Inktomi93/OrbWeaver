// The group-config wire↔flat mapping (lib/group-config-model.ts — the PURE half, node-lane-testable). The
// load-bearing invariant: `groupCharacterId` is a server-minted synthetic-group-character id the form
// NEVER edits (no control) — the flat projection carries it OPAQUELY so the whole-object DU rebuild
// (`fromGroupConfigForm`) RE-ATTACHES it rather than clobbering synced truth. Both `GroupConfig` arms
// declare it; the passthrough honors that. The no-id case must stay byte-identical to a room that never
// minted one.

import type { GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { fromGroupConfigForm, toGroupConfigForm } from "../../../../../packages/client/src/features/chat/lib/group-config-model";
import { expect, test } from "../../../../support/fixtures";

const GROUP_CHAR_ID = castId<CharacterId>("character_grpsynth00000000000");

test("a minted groupCharacterId survives a round-trip edit (per-speaker arm)", () => {
  const config: GroupConfig = { ...DEFAULT_GROUP_CONFIG, groupCharacterId: GROUP_CHAR_ID };

  // toForm → the user tweaks an editable field → fromForm.
  const edited = { ...toGroupConfigForm(config), speakerTags: !config.speakerTags };
  const rebuilt = fromGroupConfigForm(edited);

  // The edit landed AND the opaque id is present + identical (never clobbered by the whole-object write).
  expect(rebuilt.speakerTags).toBe(!config.speakerTags);
  expect(rebuilt.groupCharacterId).toBe(GROUP_CHAR_ID);
  // The per-speaker arm still carries cardScope (the DU shape is preserved).
  expect(rebuilt.output).toBe("per-speaker");
});

test("a minted groupCharacterId survives on the narrator arm (both arms declare it)", () => {
  const config: GroupConfig = {
    output: "narrator",
    policy: "natural",
    speakerTags: true,
    groupNudge: true,
    autoMode: false,
    autoModeMaxTurns: 6,
    autoModeDelayMs: 1500,
    allowSelfResponses: false,
    memberCardVisibility: "sheet",
    groupCharacterId: GROUP_CHAR_ID,
  };

  const rebuilt = fromGroupConfigForm({ ...toGroupConfigForm(config), groupNudge: false });

  expect(rebuilt.groupCharacterId).toBe(GROUP_CHAR_ID);
  expect(rebuilt.output).toBe("narrator");
  // The narrator arm is `.strict()` — the whole-object rebuild carries NO cardScope.
  expect("cardScope" in rebuilt).toBe(false);
});

test("the no-id case is byte-identical to today (no groupCharacterId key round-trips in)", () => {
  const rebuilt = fromGroupConfigForm(toGroupConfigForm(DEFAULT_GROUP_CONFIG));

  expect(rebuilt).toEqual(DEFAULT_GROUP_CONFIG);
  expect("groupCharacterId" in rebuilt).toBe(false);
});
