// CT: the preset MESSAGE HANDLING section's FLOOR NOTE — the owner-reported defect (#201) and its two arms.
//
// The note ("This model enforces at least X — stricter always wins") is DERIVED from
// `capability.turns.roleHandlingFloor`, and it was rendered for ANY declared floor. Every non-anthropic arm
// carried the fail-closed `strict`, so the local vLLM model announced a constraint its wire does not impose
// (its openai-compat template renders each message as its own block whatever the adjacency, D143). The fix is
// the derivation, not a special case: a floor equal to the vocabulary's least-strict member constrains
// nothing, so it says nothing.
//
// Asserted through what the USER sees — the note's text and the clamp badge — never the component's props.

import { expect, test } from "@playwright/experimental-ct-react";
import {
  MessageHandlingNoFloorStory,
  MessageHandlingPendingCapabilityStory,
  MessageHandlingSlottedFloorStory,
  MessageHandlingStrictFloorStory,
  MessageHandlingStrictFloorUnsetStory,
} from "./_message-handling-stories.tsx";

const NOTE = /This model enforces at least/;
const CLAMP_BADGE = /Applies as/;

test("a model with a REAL floor still announces it, and names the floor", async ({ mount }) => {
  const component = await mount(<MessageHandlingStrictFloorUnsetStory />);
  await expect(component.getByText(NOTE)).toBeVisible();
  await expect(component.getByText("This model enforces at least Strict — stricter always wins.")).toBeVisible();
});

test("a below-floor pick on that model still wears the clamp badge", async ({ mount }) => {
  const component = await mount(<MessageHandlingStrictFloorStory />);
  await expect(component.getByText(NOTE)).toBeVisible();
  await expect(component.getByText("Applies as Strict")).toBeVisible();
});

test("a FLOORLESS model says nothing about a floor — no note, no clamp badge (#201)", async ({ mount }) => {
  const component = await mount(<MessageHandlingNoFloorStory />);
  // The control itself is still there: what disappears is the false claim about it, not the affordance.
  await expect(component.getByRole("combobox", { name: "Adjacent-role merging" })).toBeVisible();
  await expect(component.getByText(NOTE)).toHaveCount(0);
  await expect(component.getByText(CLAMP_BADGE)).toHaveCount(0);
});

// `slotted` is a model-only rung: the note names it, and the knob offers only the user levels above it.
test("a slotted-floor model names its floor and offers only Semi-strict and Strict", async ({ mount, page }) => {
  const component = await mount(<MessageHandlingSlottedFloorStory />);
  await expect(component.getByText("This model enforces at least Slotted — stricter always wins.")).toBeVisible();
  await component.getByRole("combobox", { name: "Adjacent-role merging" }).click();
  const options = page.getByRole("option");
  await expect(options).toHaveText([/Model default/, /Semi-strict/, /^Strict/]);
});

test("a pending capability read makes no floor claim either", async ({ mount }) => {
  const component = await mount(<MessageHandlingPendingCapabilityStory />);
  await expect(component.getByRole("combobox", { name: "Adjacent-role merging" })).toBeVisible();
  await expect(component.getByText(NOTE)).toHaveCount(0);
});
