// CT: the Roster tab controls (roster-panel.tsx, task #29). Drives the production path over the stubbed
// network (routeTrpc) — `chat.getChat` supplies the roster; each control fires its real
// `use-roster-mutations` mutation. Proves: a row per character, the mute toggle dispatches
// `setParticipantDisabled` (toggled), the talkativeness slider commits `setParticipantTalkativeness`,
// and force-turn dispatches `forceCharacterTurn` — INCLUDING for a MUTED member (the #29 decision: mute
// is passive arbitration exclusion, force-turn is an explicit host override, so the Zap stays enabled).
//
// This body assumes the host (the surface host-gates the tab); the roster stub is a partial `ChatDetail`.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { RosterPanelStory } from "../_ct-stories";

function character(key: string, name: string, over: Record<string, unknown> = {}): unknown {
  return {
    id: `chat_participant_${key}`,
    kind: "character",
    userId: null,
    characterId: `character_${key}`,
    role: "member",
    displayName: name,
    disabled: false,
    talkativeness: 0.5,
    ...over,
  };
}

function roster(...members: unknown[]): unknown {
  return { participants: members };
}

test("renders one control row per character", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
  });
  const component = await mount(<RosterPanelStory />);

  await expect(component.locator('[data-slot="roster-row"]')).toHaveCount(2);
  await expect(component.getByRole("button", { name: "Mute Aria" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Make Bryn speak next" })).toBeVisible();
});

test("the mute toggle dispatches setParticipantDisabled with the flipped value", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria")),
    "chat.setParticipantDisabled": () => ({
      ...(character("aria", "Aria") as object),
      disabled: true,
    }),
  });
  const component = await mount(<RosterPanelStory />);

  await component.getByRole("button", { name: "Mute Aria" }).click();

  await expect.poll(() => trpc.count("chat.setParticipantDisabled")).toBe(1);
  expect(trpc.lastInput("chat.setParticipantDisabled")).toMatchObject({
    characterId: "character_aria",
    disabled: true,
  });
});

test("the talkativeness slider commits setParticipantTalkativeness", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria")),
    "chat.setParticipantTalkativeness": () => character("aria", "Aria", { talkativeness: 0.55 }),
  });
  const component = await mount(<RosterPanelStory />);

  // Keyboard-drive the thumb (Base UI commits on keyup): +1 step from 0.5 → 0.55.
  const thumb = component.getByRole("slider", { name: "Talkativeness: Aria" });
  await thumb.focus();
  await thumb.press("ArrowRight");

  await expect.poll(() => trpc.count("chat.setParticipantTalkativeness")).toBeGreaterThanOrEqual(1);
  const input = trpc.lastInput("chat.setParticipantTalkativeness") as { talkativeness?: number };
  expect(typeof input.talkativeness).toBe("number");
  expect(input.talkativeness ?? 0).toBeGreaterThan(0.5);
});

test("force-turn dispatches forceCharacterTurn — and stays enabled for a MUTED member (#29)", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => roster(character("bryn", "Bryn", { disabled: true })),
    "chat.forceCharacterTurn": () => ({ messages: [], aborted: false }),
  });
  const component = await mount(<RosterPanelStory />);

  const force = component.getByRole("button", { name: "Make Bryn speak next" });
  // The #29 decision: a muted member is still summonable — the button is NOT disabled by the mute state.
  await expect(force).toBeEnabled();
  await force.click();

  await expect.poll(() => trpc.count("chat.forceCharacterTurn")).toBe(1);
  expect(trpc.lastInput("chat.forceCharacterTurn")).toMatchObject({
    characterId: "character_bryn",
  });
});
