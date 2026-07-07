// CT: the DRAFT CONTEXT panel (J2/J3) — the draft-config-backed twin of `ChatContextPanel`. Unlike the
// committed panel it does NO server reads (no `getChat`/routeTrpc): the Overrides tab renders from the
// draft-config store and writes to it on edit. A draft is always hosted by its author, so every field is
// editable (the host copy + enabled textareas). The autosave→store seam itself is unit-tested
// (draft-config-store.test.ts `setDraftRoomOverrides`) + proven live (edit → send → the committed chat
// re-reads the persisted scenario); this CT locks the RENDER contract: the tab + the four editable fields.

import { expect, test } from "@playwright/experimental-ct-react";
import { DraftContextPanelStory } from "../_ct-stories";

test("a draft's CONTEXT panel renders the editable Overrides tab (host — autosaving)", async ({
  mount,
}) => {
  const component = await mount(<DraftContextPanelStory />);

  // The Overrides tab is present and active (no server read gated it).
  await expect(component.getByRole("tab", { name: "Overrides" })).toBeVisible();
  // Host copy — a draft is authored by (and only visible to) its creator, so it is always editable.
  await expect(component.getByText("Changes save automatically.")).toBeVisible();

  // The four host-allowlist override fields render, editable (not disabled — the draft is host).
  const labels = ["Main prompt", "Post-history instructions", "Scenario", "Author's note"];
  await Promise.all(
    labels.map(async (label) => {
      const field = component.getByRole("textbox", { name: label });
      await expect(field).toBeVisible();
      await expect(field).toBeEnabled();
    }),
  );
});

test("editing a draft override field is accepted (the autosaving textarea is live)", async ({
  mount,
}) => {
  const component = await mount(<DraftContextPanelStory />);

  const scenario = component.getByRole("textbox", { name: "Scenario" });
  await scenario.fill("A rooftop bar at midnight.");
  await expect(scenario).toHaveValue("A rooftop bar at midnight.");
});

test("a draft's Injections tab adds a LOCAL injection row (no network — the draft array grows)", async ({
  mount,
}) => {
  const component = await mount(<DraftContextPanelStory />);

  await component.getByRole("tab", { name: "Injections" }).click();
  await expect(component.getByText("No injections yet.")).toBeVisible();

  // Add → the draft-config array grows → a row appears (its Remove control), no server round-trip.
  await component.getByRole("button", { name: "Add injection" }).click();
  await expect(component.getByRole("button", { name: "Remove injection" })).toBeVisible();
  await expect(component.getByText("No injections yet.")).toHaveCount(0);
});
