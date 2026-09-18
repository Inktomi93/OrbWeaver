// CT: Settings → Connections → Host Claude, the THREE deployment states (2026-09-18).
//
// The agent-sdk backend became OPTIONAL — registered only when a Claude subscription credential is present,
// or when the operator sets `CLAUDE_BACKEND=on`. So "Test Claude auth" now has three honest answers, and the
// two that ran NO probe must not be dressed as a failed one: telling an owner their subscription was
// rejected when nothing was ever asked is a product lie, and asking is exactly what forks the bundled
// runtime this whole change exists to stop forking on a box with no credential.
//
// Drives the PRODUCTION component over the real data layer with `connection.testClaudeAuth` stubbed at the
// network. What is asserted is what the owner SEES: the badge word and whether the actionable how-to is on
// screen — a state that renders no route out is the wall this change is meant to remove.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { HostClaudeSectionStory } from "../_ct-stories.tsx";

const TEST_BUTTON = "Test Claude auth";
const STATUS = '[role="status"]';

const VERIFIED = {
  state: "ready",
  verify: {
    source: "max-pro-sub",
    ok: true,
    apiKeySource: "none",
    model: "claude-haiku-4-5-20251001",
    reply: "ok",
    costUsd: 0.0001,
    account: { subscriptionType: "max" },
  },
};

test("a reachable subscription reports the plan and offers no setup instructions", async ({ mount, page }) => {
  await routeTrpc(page, { "connection.testClaudeAuth": () => VERIFIED });
  const component = await mount(<HostClaudeSectionStory />);

  await component.getByRole("button", { name: TEST_BUTTON }).click();

  const status = component.locator(STATUS);
  await expect(status).toContainText("Reachable");
  await expect(status).toContainText("max");
  // A healthy box must not be told how to set up what already works.
  await expect(status).not.toContainText("setup-token");
});

test("`not-set-up` says so and carries the exact route out (token, login, and the macOS escape hatch)", async ({ mount, page }) => {
  await routeTrpc(page, { "connection.testClaudeAuth": () => ({ state: "not-set-up" }) });
  const component = await mount(<HostClaudeSectionStory />);

  await component.getByRole("button", { name: TEST_BUTTON }).click();

  const status = component.locator(STATUS);
  // NOT "Unreachable": nothing was reached FOR, because nothing was asked.
  await expect(status).toContainText("Not set up");
  await expect(status).not.toContainText("Unreachable");
  // The three ways forward, because a signed-in macOS box reads as "not detected" server-side.
  await expect(status).toContainText("claude setup-token");
  await expect(status).toContainText("claude login");
  await expect(status).toContainText("CLAUDE_BACKEND=on");
});

test("`off` names the knob that turned it off rather than implying a broken login", async ({ mount, page }) => {
  await routeTrpc(page, { "connection.testClaudeAuth": () => ({ state: "off" }) });
  const component = await mount(<HostClaudeSectionStory />);

  await component.getByRole("button", { name: TEST_BUTTON }).click();

  const status = component.locator(STATUS);
  await expect(status).toContainText("CLAUDE_BACKEND=off");
  await expect(status).not.toContainText("Unreachable");
});

// POSITIVE CONTROL for the failure arm — the probe CAN still come back red, and that must read differently
// from "not set up". Without this a component that rendered "Not set up" for everything would pass above.
test("a probe that RAN and failed still reads Unreachable, with no setup instructions", async ({ mount, page }) => {
  await routeTrpc(page, {
    "connection.testClaudeAuth": () => ({ ...VERIFIED, verify: { ...VERIFIED.verify, ok: false, account: undefined } }),
  });
  const component = await mount(<HostClaudeSectionStory />);

  await component.getByRole("button", { name: TEST_BUTTON }).click();

  const status = component.locator(STATUS);
  await expect(status).toContainText("Unreachable");
  await expect(status).not.toContainText("Not set up");
  await expect(status).not.toContainText("setup-token");
});
