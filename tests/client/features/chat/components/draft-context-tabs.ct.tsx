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

test("a draft's CONTEXT panel renders the editable This chat tab (host — autosaving)", async ({ mount }) => {
  const component = await mount(<DraftContextPanelStory />);

  // The "This chat" tab (was Overrides → Settings) is present and active (no server read gated it; Members
  // is hidden at solo-cast so it is the first visible tab). Field overrides is its first section.
  await expect(component.getByRole("tab", { name: "This chat" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  // Host copy — a draft is authored by (and only visible to) its creator, so it is always editable. The
  // per-field guidance collapsed to ONE intro line (N4); it ends with the autosave affordance.
  await expect(component.getByText("Empty fields inherit from the character or preset. Saved automatically.")).toBeVisible();

  // The three host-allowlist override fields are collapse-until-needed rows — expand each and confirm its
  // editor is present + editable (not disabled — the draft is host). There is no fourth (author's-note) row:
  // it was retired into the Injections section below (owner ruling 2026-08-01).
  const expectEditableField = async (label: string): Promise<void> => {
    await component.getByRole("button", { name: label }).click();
    const field = component.getByRole("textbox", { name: label });
    await expect(field).toBeVisible();
    await expect(field).toBeEnabled();
  };
  await expectEditableField("Main prompt");
  await expectEditableField("Post-history");
  await expectEditableField("Scenario");
  await expect(component.getByRole("button", { name: "Author's note" })).toHaveCount(0);
});

test("editing a draft override field is accepted (the autosaving textarea is live)", async ({ mount }) => {
  const component = await mount(<DraftContextPanelStory />);

  await component.getByRole("button", { name: "Scenario" }).click();
  const scenario = component.getByRole("textbox", { name: "Scenario" });
  await scenario.fill("A rooftop bar at midnight.");
  await expect(scenario).toHaveValue("A rooftop bar at midnight.");
});

test("a draft's Injections section adds a LOCAL injection row (no network — the draft array grows)", async ({ mount }) => {
  const component = await mount(<DraftContextPanelStory />);

  // Injections is a section inside the default "This chat" tab (no separate tab).
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

test("a draft with ≥2 cast shows Members + the This chat Group behavior section (hidden at cast<2) and the add-member popover", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": { items: [ARIA_SUMMARY, BOLT_SUMMARY], nextCursor: null },
    "character.get": (input: unknown): unknown => ((input as { readonly characterId: string }).characterId === ARIA_ID ? ARIA_DETAIL : BOLT_DETAIL),
  });

  const component = await mount(<DraftContextPanelStory characterIds={[ARIA_ID, BOLT_ID]} />);

  // Members declared first ⇒ the default active tab (the Members-default, §6b). The former Group tab is now
  // a SECTION inside the always-present "This chat" tab, gated at cast≥2 at the section level.
  await expect(component.getByRole("tab", { name: "Members" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "This chat" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Group" })).toHaveCount(0);
  await expect(component.getByText("Aria")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();

  // Open "This chat": both the Field overrides and the ≥2-cast Group behavior sections render as h3s.
  await component.getByRole("tab", { name: "This chat" }).click();
  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();

  // The persistent add-member trigger rides the strip-trail `actions` slot (§6b `actions` binding),
  // present alongside the tabs, not inside any one panel.
  await expect(component.getByRole("button", { name: "Add a character" })).toBeVisible();
});
