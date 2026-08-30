// substrate/reachability — "may this user DIRECTLY drive this tool by name?" (D146-c). Pure. Pins: a plugin
// entry is drivable only by ITS OWN installer (not a room-mate who merely shares the chat), and a builtin is
// NEVER direct-drivable (the v1 narrowing the header states — first-party tools reach a turn through their
// own domain's teaching contribution, never this door).

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RegisteredTool } from "../../../../../packages/server/src/domain/tool-use/contract/results.ts";
import { isDirectDrivableBy } from "../../../../../packages/server/src/domain/tool-use/substrate/reachability.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ALICE: UserId = castId("user_alice");
const BOB: UserId = castId("user_bob");

function entry(over: Partial<RegisteredTool>): RegisteredTool {
  return {
    name: "x",
    description: "test",
    capability: null,
    source: "plugin",
    owner: null,
    parameters: {},
    argShape: {},
    run: (): Promise<never> => Promise.reject(new Error("not invoked by this test")),
    ...over,
  };
}

test("a plugin's own installer may direct-drive it", () => {
  expect(isDirectDrivableBy(entry({ source: "plugin", owner: ALICE }), ALICE)).toBe(true);
});

test("a room-mate who did NOT install the plugin may not — sharing a chat is not consent", () => {
  expect(isDirectDrivableBy(entry({ source: "plugin", owner: ALICE }), BOB)).toBe(false);
});

test("a builtin is NEVER direct-drivable, even by the caller whose id happens to be null-adjacent", () => {
  expect(isDirectDrivableBy(entry({ source: "builtin", owner: null }), ALICE)).toBe(false);
});
