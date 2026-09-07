// useSettingsViewerView CT — the ONE derivation home of the `SettingsViewerView` projection every settings
// `when` predicate consumes (SET-SEAMS §5): pane gating, section gating, and the search index all run the
// same predicate off this one cached `sessions.me` read instead of re-spelling the role test per surface.
//
// Load-bearing: it is NON-suspense. An unresolved (or failing) viewer reads as NON-admin — gating must
// never block a pane from painting, and the shell re-applies a deep link once visibility grows.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../support/node/route-trpc.ts";
import { SettingsViewerViewStory } from "./_ct-stories.tsx";

test("owner and admin both project isAdmin=true", async ({ mount, page }) => {
  await routeTrpc(page, { "sessions.me": { userId: "u_owner", handle: "owner", globalRole: "owner" } });
  // The story's providers render no DOM, so the `<output>` IS the mounted root — assert on the page.
  await mount(<SettingsViewerViewStory />);
  await expect(page.locator("output")).toHaveText("isAdmin=true");
});

test("a plain user projects isAdmin=false", async ({ mount, page }) => {
  await routeTrpc(page, { "sessions.me": { userId: "u_plain", handle: "plain", globalRole: "user" } });
  await mount(<SettingsViewerViewStory />);
  await expect(page.locator("output")).toHaveText("isAdmin=false");
});

test("a FAILED viewer read degrades closed (non-admin) instead of suspending or throwing", async ({ mount, page }) => {
  await routeTrpc(page, { "sessions.me": () => trpcError({ code: "UNAUTHORIZED" }) });
  await mount(<SettingsViewerViewStory />);
  await expect(page.locator("output")).toHaveText("isAdmin=false");
});
