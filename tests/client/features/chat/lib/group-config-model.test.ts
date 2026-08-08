// The group-config wire↔flat mapping (lib/group-config-model.ts — the PURE half, node-lane-testable). The
// load-bearing invariant: `fromGroupConfigForm` rebuilds the WHOLE discriminated-union arm from the flat
// projection, and BOTH arms are `z.strictObject` — so the round-trip must land every editable knob and NO
// stray key (a narrator rebuild carrying `cardScope`, or any leftover passthrough field, is refused by the
// write boundary, not silently stripped).
//
// The retired `groupCharacterId` passthrough (deleted 2026-08-08, the D107 dead-switch class — no writer, no
// reader, and it rode the portability bundle carrying a foreign CharacterId) is pinned NEGATIVELY here: the
// projection must not re-introduce an opaque field the form cannot edit.

import type { GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, groupConfigSchema } from "@orb/contracts/chat";
import { fromGroupConfigForm, toGroupConfigForm } from "../../../../../packages/client/src/features/chat/lib/group-config-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NARRATOR: GroupConfig = {
  output: "narrator",
  policy: "natural",
  speakerTags: true,
  groupNudge: true,
  autoMode: false,
  autoModeMaxTurns: 6,
  autoModeDelayMs: 1500,
  allowSelfResponses: false,
  memberCardVisibility: "sheet",
};

test("a per-speaker edit round-trips every knob and stays on its arm", () => {
  const edited = { ...toGroupConfigForm(DEFAULT_GROUP_CONFIG), speakerTags: !DEFAULT_GROUP_CONFIG.speakerTags };
  const rebuilt = fromGroupConfigForm(edited);

  expect(rebuilt.speakerTags).toBe(!DEFAULT_GROUP_CONFIG.speakerTags);
  expect(rebuilt.output).toBe("per-speaker");
  expect(rebuilt).toEqual({ ...DEFAULT_GROUP_CONFIG, speakerTags: !DEFAULT_GROUP_CONFIG.speakerTags });
});

test("a narrator edit round-trips and the rebuild carries NO cardScope (the arm is strict)", () => {
  const rebuilt = fromGroupConfigForm({ ...toGroupConfigForm(NARRATOR), groupNudge: false });

  expect(rebuilt.output).toBe("narrator");
  expect(rebuilt).toEqual({ ...NARRATOR, groupNudge: false });
  expect("cardScope" in rebuilt).toBe(false);
});

test("the rebuild of BOTH arms passes the strict write boundary (no stray passthrough key)", () => {
  for (const config of [DEFAULT_GROUP_CONFIG, NARRATOR]) {
    const rebuilt = fromGroupConfigForm(toGroupConfigForm(config));
    expect(groupConfigSchema.safeParse(rebuilt).success).toBe(true);
    expect(rebuilt).toEqual(config);
    expect("groupCharacterId" in rebuilt).toBe(false);
  }
});
