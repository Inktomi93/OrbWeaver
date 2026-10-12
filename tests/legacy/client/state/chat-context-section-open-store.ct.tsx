// chat-context-section-open store CT (#830) — the per-device DISCLOSURE memory for the "This chat" tab's
// sections.
//
// The property this pins, and the reason the stored shape is a sparse Record rather than the sibling
// `config-group-open` store's list of open ids: the sections here do NOT share one default. The two member
// write surfaces (Field overrides, Injections) open themselves; the data-driven racks, the host band and
// every grafted section start closed. So "absent from the map" has to mean "that section's own default",
// and an explicit answer has to win in BOTH directions — including closing a section that defaults open,
// which a list of open ids cannot express at all.

import { expect, test } from "@playwright/experimental-ct-react";
import { ChatContextSectionOpenProbe } from "./_ct-stories.tsx";

test("an untouched section answers with ITS OWN default, and the defaults differ per section", async ({ mount }) => {
  const probe = await mount(<ChatContextSectionOpenProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset chat context sections" }).click();

  await expect(state).toHaveText("injections=true documents=false");
});

test("an explicit answer beats the default in BOTH directions, one section at a time", async ({ mount }) => {
  const probe = await mount(<ChatContextSectionOpenProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset chat context sections" }).click();

  // Opening a default-CLOSED rack leaves its default-OPEN neighbour alone.
  await probe.getByRole("button", { name: "open documents section" }).click();
  await expect(state).toHaveText("injections=true documents=true");

  // …and closing a default-OPEN section is a real, remembered answer, not a no-op that falls back to the
  // default (the arm a list-of-open-ids shape is structurally incapable of storing).
  await probe.getByRole("button", { name: "close injections section" }).click();
  await expect(state).toHaveText("injections=false documents=true");

  // The reset seam clears every answer, so a sibling test never inherits this posture.
  await probe.getByRole("button", { name: "reset chat context sections" }).click();
  await expect(state).toHaveText("injections=true documents=false");
});
