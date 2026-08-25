// CT: SettingsPanePlaceholder (#696) — the honest "not built yet" body for a settings category whose real
// surface hasn't landed. It lost its last PRODUCTION subject at C5 (cb8026bfc turned the final
// `{ placeholder: true }` pane — automation — into a real surface), so the shell's placeholder branch
// (settings-shell-surface.tsx:418) renders for nobody today. The mechanism is deliberate scaffolded intent
// (the `body: { placeholder: true }` arm of the §5.3 union, the render branch, and the
// `settings-pane-completeness` gate all guard it), so rather than delete future intent it earns a live
// subject: SettingsShellPlaceholderStory mounts the REAL shell under a pane registry where ONE category
// (connections) carries a placeholder body — production panes untouched (CtPlaceholderPaneRegistry).
//
// This drives the PRODUCTION path: the shell resolves the deferred category, hits the placeholder branch,
// and mounts the teaching copy — the pane's own label + distinct description + the "Not built yet" chip
// ([[empty-states-are-load-bearing]] — a status, never a generic sparkle, and never a dead-end CTA).
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { SettingsShellPlaceholderStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_placeholder", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
// A plain user — the placeholder category (connections) is un-gated, so this only feeds the nav's
// admin-gating projection; the deep link lands straight on the placeholder pane, so no real pane mounts.
const VIEWER_ROUTE: Readonly<Record<string, unknown>> = {
  "sessions.me": { userId: SETTINGS_VIEW.userId, handle: "ct_placeholder", globalRole: "user" },
  "settings.getUserSettings": () => SETTINGS_VIEW,
};

test("a deferred category renders the teaching placeholder: its distinct copy + the 'Not built yet' chip", async ({ mount, page }) => {
  await routeTrpc(page, VIEWER_ROUTE);
  const component = await mount(<SettingsShellPlaceholderStory />);

  // The deep link landed on the placeholder category — the pane region is labelled by its own pane label.
  const region = component.getByRole("region", { name: "Connections settings" });
  await expect(region).toBeVisible();

  // The placeholder body's tell: it says "not built yet" IN WORDS (the chip), so a deferred pane can never be
  // mistaken for a real pane whose controls FAILED to render.
  await expect(region.getByText("Not built yet")).toBeVisible();
  // …with the category's OWN distinct copy (its SettingsPaneDefinition description), never a generic sparkle.
  await expect(region.getByText("Provider credentials and the per-role model connections.")).toBeVisible();
  // …titled by the pane's own label (scoped to the region — the nav row carries the same word).
  await expect(region.getByText("Connections", { exact: true })).toBeVisible();
});
