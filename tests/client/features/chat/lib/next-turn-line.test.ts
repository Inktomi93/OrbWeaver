// Unit: the composer's next-turn line (features/chat/lib/next-turn-line). A turn runs on the room host's
// chat role, so the host's own resolution names it, a member is pointed at the host, and the room's
// `no-connection` verdict is the unset state for both.

import { MODEL_ROLES_PATH } from "@orb/client/lib";
import type { UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { modelDisplayName } from "@orb/kit/model-name";
import type { NextTurnInputs } from "../../../../../packages/client/src/features/chat/lib/next-turn-line.ts";
import { nextTurnLine, nextTurnReadsChatRole, nextTurnStatesRefusal } from "../../../../../packages/client/src/features/chat/lib/next-turn-line.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";

const MINE = castId<UserConnectionId>("user_connection_unitnext0001");
const MODEL = testModelId("anthropic/claude-sonnet-5");
const BASE: NextTurnInputs = {
  viewerIsHost: true,
  chatFailed: false,
  availabilityCause: null,
  availabilityFailed: false,
  resolved: { connectionId: MINE, providerId: testProviderId("anthropic"), model: MODEL },
  resolveFailed: false,
  connections: { rows: [{ id: MINE, label: "Work key", providerLabel: "Anthropic" }], failed: false },
};
const FAILED = { state: "failed", text: "Next reply: the connection couldn't be checked.", door: undefined };

test("a host names their resolved connection and model", () => {
  expect(nextTurnLine(BASE)).toEqual({ state: "named", text: `Next reply: Work key · ${modelDisplayName(MODEL)}`, door: undefined });
});

test("a host whose connection list has not loaded names the provider instead of nothing", () => {
  expect(nextTurnLine({ ...BASE, connections: { rows: undefined, failed: false } }).text).toBe(`Next reply: Anthropic · ${modelDisplayName(MODEL)}`);
});

test("the room's no-connection verdict is the unset state; the host gets the Model roles door, a member does not", () => {
  expect(nextTurnLine({ ...BASE, availabilityCause: "no-connection", resolved: undefined })).toEqual({
    state: "unset",
    text: "Next reply: no chat connection is set.",
    door: { lead: `Choose one under ${MODEL_ROLES_PATH.trail} →`, label: MODEL_ROLES_PATH.leaf },
  });
  expect(nextTurnLine({ ...BASE, viewerIsHost: false, availabilityCause: "no-connection" })).toEqual({
    state: "unset",
    text: "Next reply: the host has no chat connection set.",
    door: undefined,
  });
});

test("an unknown viewer in a no-connection room reads a neutral unset line with no door: it may be a member", () => {
  for (const chatFailed of [true, false]) {
    expect(nextTurnLine({ ...BASE, viewerIsHost: undefined, chatFailed, availabilityCause: "no-connection" })).toEqual({
      state: "unset",
      text: "Next reply: this chat has no chat connection set.",
      door: undefined,
    });
  }
});

test("the line states the no-connection refusal and no other cause", () => {
  expect(nextTurnStatesRefusal("no-connection")).toBe(true);
  for (const cause of ["endpoint-unreachable", "runtime-missing", "unavailable", null, undefined] as const) {
    expect(nextTurnStatesRefusal(cause)).toBe(false);
  }
});

test("the chat-role read waits for the verdict and never fires into a no-connection room or for a member", () => {
  expect(nextTurnReadsChatRole(true, null, false)).toBe(true);
  expect(nextTurnReadsChatRole(true, "endpoint-unreachable", false)).toBe(true);
  expect(nextTurnReadsChatRole(true, undefined, true)).toBe(true);
  expect(nextTurnReadsChatRole(true, undefined, false)).toBe(false);
  expect(nextTurnReadsChatRole(true, "no-connection", false)).toBe(false);
  expect(nextTurnReadsChatRole(false, null, false)).toBe(false);
  expect(nextTurnReadsChatRole(undefined, null, false)).toBe(false);
});

test("a member is pointed at the host's connection, whatever the member's own resolution says", () => {
  expect(nextTurnLine({ ...BASE, viewerIsHost: false })).toEqual({ state: "named", text: "Next reply: the host's chat connection.", door: undefined });
});

test("a host whose chat-role read failed is told the check failed", () => {
  expect(nextTurnLine({ ...BASE, resolved: undefined, resolveFailed: true })).toEqual(FAILED);
});

test("a failed room read leaves the viewer unknown and reads the same failure sentence", () => {
  expect(nextTurnLine({ ...BASE, viewerIsHost: undefined, chatFailed: true })).toEqual(FAILED);
});

test("a member's line needs no connection read, so a failed verdict still names the host's connection", () => {
  expect(nextTurnLine({ ...BASE, viewerIsHost: false, availabilityCause: undefined, availabilityFailed: true }).text).toBe(
    "Next reply: the host's chat connection.",
  );
});

test("an unknown viewer, or a host whose read has not settled, is still checking", () => {
  expect(nextTurnLine({ ...BASE, viewerIsHost: undefined }).state).toBe("checking");
  expect(nextTurnLine({ ...BASE, resolved: undefined }).text).toBe("Next reply: checking the connection…");
});
