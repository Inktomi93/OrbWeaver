import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { STREAM_MUTATION_ROUTES } from "../../../data/bus/fixtures.ts";
import { BackupSettingsStory } from "../_ct-stories.tsx";

test("image generation history is an actual backup choice and its opt-out preserves media", async ({ mount, page }) => {
  await routeTrpc(page, { "sessions.me": { userId: "user_ct_imagery_backup", handle: "imagery-backup", globalRole: "user" }, ...STREAM_MUTATION_ROUTES });
  const state: { exportUrl: string | null } = { exportUrl: null };
  await page.route("**/api/export/library**", async (route) => {
    state.exportUrl = route.request().url();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="backup.zip"' },
      body: "PK",
    });
  });
  await mount(<BackupSettingsStory />);
  const history = page.getByRole("checkbox", { name: "Image generation history", exact: true });
  await expect(history).toBeChecked();
  await expect(history).toHaveAttribute("data-tone", "quiet");
  await history.click();
  await expect(history).not.toBeChecked();
  await page.getByTestId("backup-export-button").click();
  await expect.poll(() => state.exportUrl).toBeTruthy();
  const selected = new URL(state.exportUrl ?? "").searchParams.get("kinds")?.split(",") ?? [];
  expect(selected).not.toContain("imagery");
  expect(selected).toContain("assets");
});
