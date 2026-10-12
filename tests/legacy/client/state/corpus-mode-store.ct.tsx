import { expect, test } from "@playwright/experimental-ct-react";
import { CorpusModeProbe, CorpusSelectionProbe } from "./_ct-stories.tsx";

test("writes and retired-section healing publish the same mode to hook and imperative subscribers", async ({ mount }) => {
  const probe = await mount(<CorpusModeProbe />);
  await expect(probe.locator("output")).toHaveText("mode=explore snapshot=explore");
  await probe.getByRole("button", { name: "write Labels mode" }).click();
  await expect(probe.locator("output")).toHaveText("mode=labels snapshot=labels");
  await probe.getByRole("button", { name: "heal Analytics" }).click();
  await expect(probe.locator("output")).toHaveText("mode=insights snapshot=insights");
  await probe.getByRole("button", { name: "heal live Corpus" }).click();
  await expect(probe.locator("output")).toHaveText("mode=insights snapshot=insights");
});

test("each mode declares its phone landing, and none fakes a selection to reach it", async ({ mount }) => {
  const probe = await mount(<CorpusSelectionProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("mode=explore");
  await expect(state).toContainText("open=false landing=list");

  await probe.getByRole("button", { name: "mode insights" }).click();
  await expect(state).toContainText("mode=insights");
  await expect(state).toContainText("open=false landing=content");
  await expect(state).toContainText("insights=none");

  await probe.getByRole("button", { name: "mode labels" }).click();
  await expect(state).toContainText("mode=labels");
  await expect(state).toContainText("open=false landing=list");
  await expect(state).toContainText("label=none");
});

test("a persisted Analytics section heals to Corpus Insights", async ({ mount, page }) => {
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      "orb:shell",
      JSON.stringify({ state: { activeSection: "analytics", panelOverrides: { analytics: { list: "docked" } } }, version: 2 }),
    );
  });
  await page.reload();

  const probe = await mount(<CorpusSelectionProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("section=corpus mode=insights");
  await expect(state).toContainText("landing=content");
});

test("a persisted live section leaves the Corpus mode at Explore", async ({ mount, page }) => {
  await page.addInitScript(() => {
    globalThis.localStorage.setItem("orb:shell", JSON.stringify({ state: { activeSection: "corpus", panelOverrides: {} }, version: 2 }));
  });
  await page.reload();

  const probe = await mount(<CorpusSelectionProbe />);
  await expect(probe.locator("output")).toContainText("section=corpus mode=explore");
});
