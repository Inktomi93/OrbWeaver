// @subject tests/support/iso/chat-metadata.ts

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { makeGroupConfig, makeRoomOverrides } from "@orb/testkit/iso/chat-metadata.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("caller edits cannot change the production defaults or a later room's configuration", () => {
  const first = makeGroupConfig();
  first.autoMode = !DEFAULT_GROUP_CONFIG.autoMode;
  expect(makeGroupConfig().autoMode).toBe(DEFAULT_GROUP_CONFIG.autoMode);
  const overrides = makeRoomOverrides();
  overrides.scenario = "Caller scenario";
  expect(makeRoomOverrides()).not.toHaveProperty("scenario");
});

test("narrator construction keeps owner normalization and refuses the per-speaker-only plane", () => {
  const narrator = makeGroupConfig({ output: "narrator", policy: "smart" });
  expect(narrator.policy).toBe("natural");
  expect(narrator).not.toHaveProperty("cardScope");
  const incompatible = { output: "narrator", cardScope: "scoped" } as const;
  expect(() => makeGroupConfig(incompatible)).toThrow("cardScope");
});
