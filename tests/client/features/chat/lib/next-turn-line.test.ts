// Unit: the composer's next-turn line (features/chat/lib/next-turn-line). A turn runs on the room host's
// chat role, so the host's own resolution names it, a member is pointed at the host, and the room's
// `no-connection` verdict is the unset state for both.

import type { UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { modelDisplayName } from "@orb/kit/model-name";
import type { NextTurnInputs } from "../../../../../packages/client/src/features/chat/lib/next-turn-line.ts";
import { nextTurnLine } from "../../../../../packages/client/src/features/chat/lib/next-turn-line.ts";
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

test("a host names their resolved connection and model", () => {
  expect(nextTurnLine(BASE)).toEqual({ text: `Next reply: Work key · ${modelDisplayName(MODEL)}`, unset: false, failed: false });
});

test("a host whose connection list has not loaded names the provider instead of nothing", () => {
  expect(nextTurnLine({ ...BASE, connections: { rows: undefined, failed: false } }).text).toBe(`Next reply: Anthropic · ${modelDisplayName(MODEL)}`);
});

test("the room's no-connection verdict is the unset state, worded for host and member", () => {
  const host = nextTurnLine({ ...BASE, availabilityCause: "no-connection", resolved: undefined, resolveFailed: true });
  expect(host.unset).toBe(true);
  expect(host.text).toContain("Settings → Connections → Model roles");
  expect(nextTurnLine({ ...BASE, viewerIsHost: false, availabilityCause: "no-connection" })).toEqual({
    text: "Next reply: the host has no chat connection set.",
    unset: true,
    failed: false,
  });
});

test("a member is pointed at the host's connection, whatever the member's own resolution says", () => {
  expect(nextTurnLine({ ...BASE, viewerIsHost: false })).toEqual({ text: "Next reply: the host's chat connection.", unset: false, failed: false });
});

test("a failed resolve names no cause until the room's verdict has settled", () => {
  const failed = { ...BASE, resolved: undefined, resolveFailed: true };
  expect(nextTurnLine({ ...failed, availabilityCause: undefined }).text).toBe("Next reply: checking the connection…");
  expect(nextTurnLine({ ...failed, availabilityCause: null }).text).toBe("Next reply: the chat connection couldn't be read.");
});

test("a host whose resolve and verdict reads both failed is told the read failed, never left checking", () => {
  expect(nextTurnLine({ ...BASE, resolved: undefined, resolveFailed: true, availabilityCause: undefined, availabilityFailed: true })).toEqual({
    text: "Next reply: the chat connection couldn't be read.",
    unset: false,
    failed: true,
  });
});

test("a failed room read leaves the viewer unknown and says the check failed", () => {
  expect(nextTurnLine({ ...BASE, viewerIsHost: undefined, chatFailed: true })).toEqual({
    text: "Next reply: this chat's connection couldn't be checked.",
    unset: false,
    failed: true,
  });
});

test("a member's line needs no connection read, so a failed verdict still names the host's connection", () => {
  expect(nextTurnLine({ ...BASE, viewerIsHost: false, availabilityCause: undefined, availabilityFailed: true }).text).toBe(
    "Next reply: the host's chat connection.",
  );
});

test("an unknown viewer is still checking, never a guess", () => {
  expect(nextTurnLine({ ...BASE, viewerIsHost: undefined }).text).toBe("Next reply: checking the connection…");
});
