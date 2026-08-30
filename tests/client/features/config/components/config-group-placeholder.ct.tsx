// CT: ConfigGroupPlaceholder (#696) — the honest "not built yet" body for a config group whose sections
// haven't landed. It lost its last PRODUCTION subject at C5 (cb8026bfc turned the final
// `{ placeholder: true }` group — automation — into a real surface), so the host's placeholder branch
// (config-content-surface.tsx `GroupBody`) renders for nobody today. The mechanism is deliberate scaffolded
// intent (the `body: { placeholder: true }` arm of the §3.1 union and the render branch guard it), so
// rather than delete future intent it earns a live subject: `ConfigHostStory placeholder` mounts the REAL
// host over a group registry where ONE group (connections) carries a placeholder body — production groups
// untouched (`ctPlaceholderConfigGroups`).
//
// This drives the PRODUCTION path: the host resolves the deferred group, hits the placeholder branch,
// and mounts the teaching copy — the group's own label + distinct description + the "Not built yet" chip
// ([[empty-states-are-load-bearing]] — a status, never a generic sparkle, and never a dead-end CTA).
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ConfigHostStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_placeholder", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
// A plain user — the placeholder group (connections) is un-gated, so this only feeds the LIST's
// admin-gating projection; the deep link lands straight on the placeholder group, so no real group mounts.
const VIEWER_ROUTE: Readonly<Record<string, unknown>> = {
  "sessions.me": { userId: SETTINGS_VIEW.userId, handle: "ct_placeholder", globalRole: "user" },
  "settings.getUserSettings": () => SETTINGS_VIEW,
  // The LIST paints every shelf, so the four collection bands read their rosters for the counts — fed empty
  // (the honest fresh-library arm) rather than left to routeTrpc's inert null.
  "tag.listTagsWithUsage": [],
  "regex.listScripts": [],
  "worldInfo.listBooksWithUsage": [],
  "rosterPreset.list": [],
};

test("a deferred category renders the teaching placeholder: its distinct copy + the 'Not built yet' chip", async ({ mount, page }) => {
  await routeTrpc(page, VIEWER_ROUTE);
  const component = await mount(<ConfigHostStory placeholder={true} target="connections" />);

  // The deep link landed on the placeholder group — the CONTENT region is labelled by its own group label.
  const region = component.getByRole("region", { name: "Connections settings" });
  await expect(region).toBeVisible();

  // The placeholder body's tell: it says "not built yet" IN WORDS (the chip), so a deferred pane can never be
  // mistaken for a real pane whose controls FAILED to render.
  await expect(region.getByText("Not built yet")).toBeVisible();
  // …with the category's OWN distinct copy (its ConfigGroupDefinition description), never a generic sparkle.
  await expect(region.getByText("Provider credentials and the per-role model connections.")).toBeVisible();
  // …titled by the group's own label (scoped to the region — the LIST band carries the same word).
  await expect(region.getByText("Connections", { exact: true })).toBeVisible();
});
