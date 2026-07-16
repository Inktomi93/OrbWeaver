// CT: the DRAFT context tabs (draft-context-tabs.tsx) — the draft-config-backed twin of the committed
// tabs, rendered through the chats section's real SectionContextHost. Unlike the committed panel it does
// NO server reads (no `getChat`/routeTrpc): the Overrides tab renders from the draft-config store and
// writes to it on edit. A draft is always hosted by its author, so every field is editable (the host copy
// + enabled textareas). The autosave→store seam itself is unit-tested (draft-config-store.test.ts
// `setDraftRoomOverrides`) + proven live; this CT locks the RENDER contract: the tab + the editable fields.
//
// A SEPARATE suite below seeds a ≥2-cast draft: the Members/Group `when` predicates (both gate at
// cast≥2, M3.3) are otherwise unverified — the solo-cast tests above never cross that floor.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { makeCharacterDetail, makeCharacterSummary } from "../../character/fixtures";
import { DraftContextPanelStory } from "../_ct-stories";

test("a draft's CONTEXT panel renders the editable Overrides tab (host — autosaving)", async ({ mount }) => {
  const component = await mount(<DraftContextPanelStory />);

  // The Overrides tab is present and active (no server read gated it).
  await expect(component.getByRole("tab", { name: "Overrides" })).toBeVisible();
  // Host copy — a draft is authored by (and only visible to) its creator, so it is always editable. The
  // per-field guidance collapsed to ONE intro line (N4); it ends with the autosave affordance.
  await expect(component.getByText("Empty fields inherit from the character or preset. Saved automatically.")).toBeVisible();

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

test("editing a draft override field is accepted (the autosaving textarea is live)", async ({ mount }) => {
  const component = await mount(<DraftContextPanelStory />);

  const scenario = component.getByRole("textbox", { name: "Scenario" });
  await scenario.fill("A rooftop bar at midnight.");
  await expect(scenario).toHaveValue("A rooftop bar at midnight.");
});

test("a draft's Injections tab adds a LOCAL injection row (no network — the draft array grows)", async ({ mount }) => {
  const component = await mount(<DraftContextPanelStory />);

  await component.getByRole("tab", { name: "Injections" }).click();
  await expect(component.getByText("No injections yet.")).toBeVisible();

  // Add → the draft-config array grows → a row appears (its Remove control), no server round-trip.
  await component.getByRole("button", { name: "Add injection" }).click();
  await expect(component.getByRole("button", { name: "Remove injection" })).toBeVisible();
  await expect(component.getByText("No injections yet.")).toHaveCount(0);
});

// ── ≥2-cast draft (Members/Group `when` predicates + the add-member popover slot) ───────────────────

const ARIA_ID = castId<CharacterId>("char_ct_aria");
const BOLT_ID = castId<CharacterId>("char_ct_bolt");
const ARIA_SUMMARY = makeCharacterSummary({ id: ARIA_ID, name: "Aria" });
const BOLT_SUMMARY = makeCharacterSummary({ id: BOLT_ID, name: "Bolt" });
const ARIA_DETAIL = makeCharacterDetail({ id: ARIA_ID, handle: ARIA_ID, name: "Aria" });
const BOLT_DETAIL = makeCharacterDetail({ id: BOLT_ID, handle: BOLT_ID, name: "Bolt" });

test("a draft with ≥2 cast shows Members + Group (hidden at cast<2) and the add-member popover", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": { items: [ARIA_SUMMARY, BOLT_SUMMARY], nextCursor: null },
    "character.get": (input: unknown): unknown => ((input as { readonly characterId: string }).characterId === ARIA_ID ? ARIA_DETAIL : BOLT_DETAIL),
  });

  const component = await mount(<DraftContextPanelStory characterIds={[ARIA_ID, BOLT_ID]} />);

  // Members declared first ⇒ the default active tab (the Members-default, §6b) — both gate at cast≥2.
  await expect(component.getByRole("tab", { name: "Members" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Group" })).toBeVisible();
  await expect(component.getByText("Aria")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();

  // The persistent add-member trigger rides the strip-trail `actions` slot (§6b `actions` binding),
  // present alongside the tabs, not inside any one panel.
  await expect(component.getByRole("button", { name: "Add a character" })).toBeVisible();
});
