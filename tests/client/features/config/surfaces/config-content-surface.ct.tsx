import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ConfigAnchorStory } from "./_anchor-stories.tsx";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("a registered delayed body still receives its canonical anchor and lands visibly", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.listThemes"]),
    ...serveCorpusProcedures(caller, ["settings.getUserSettings"], () => hold),
  });
  await mount<typeof ConfigAnchorStory>("tests/client/features/config/surfaces/_anchor-stories/ConfigAnchorStory", {});
  await hold.requested;
  const jump = page.getByRole("button", { name: "Jump to avatars", exact: true });
  const target = await jump.getAttribute("data-anchor");
  if (target === null) {
    throw new Error("The real contribution has no resolved anchor");
  }
  await jump.click();
  await expect(page.locator(`[id="${target}"]`)).toHaveCount(0);
  hold.release();
  const anchor = page.locator(`[id="${target}"]`);
  await expect(anchor).toBeVisible();
  await expect(anchor).toHaveCSS("box-shadow", /inset/u);
  await expect(anchor).toBeInViewport();
});

test("a superseded delayed anchor cannot flash or scroll after its read arrives", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.listThemes"]),
    ...serveCorpusProcedures(caller, ["settings.getUserSettings"], () => hold),
  });
  await mount<typeof ConfigAnchorStory>("tests/client/features/config/surfaces/_anchor-stories/ConfigAnchorStory", {});
  await hold.requested;
  const jump = page.getByRole("button", { name: "Jump to avatars", exact: true });
  const target = await jump.getAttribute("data-anchor");
  if (target === null) {
    throw new Error("The real contribution has no resolved anchor");
  }
  await jump.click();
  const looks = page.getByRole("button", { name: "Jump to looks", exact: true });
  const looksId = await looks.getAttribute("data-anchor");
  if (looksId === null) {
    throw new Error("The real Looks contribution has no resolved anchor");
  }
  await looks.click();
  await expect(page.locator(`[id="${looksId}"]`)).toHaveCSS("box-shadow", /inset/u);
  const pane = page.locator('[data-slot="config-content"]');
  const settledTop = await pane.evaluate((element) => element.scrollTop);
  hold.release();
  const anchor = page.locator(`[id="${target}"]`);
  await expect(anchor).toBeAttached();
  await anchor.evaluate((element) =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))).then(() => {
      if (getComputedStyle(element).boxShadow !== "none") {
        throw new Error("Superseded target flashed after its owner cancelled");
      }
    }),
  );
  expect(await pane.evaluate((element) => element.scrollTop)).toBe(settledTop);
  await expect(looks).toBeFocused();
});

test("the group's Advanced fold keeps its open state when the content leaves and returns", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), ["sessions.me", "settings.getUserSettings", "settings.listThemes"]));
  await mount<typeof ConfigAnchorStory>("tests/client/features/config/surfaces/_anchor-stories/ConfigAnchorStory", {});
  const fold = page.getByRole("button", { name: /Customize this look/u });
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Unmount content", exact: true }).click();
  await expect(page.locator('[data-slot="config-content"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Remount content", exact: true }).click();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
});

test("unmount disconnects a pending anchor observer from its retired browser element", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.listThemes"]),
    ...serveCorpusProcedures(caller, ["settings.getUserSettings"], () => hold),
  });
  await mount<typeof ConfigAnchorStory>("tests/client/features/config/surfaces/_anchor-stories/ConfigAnchorStory", {});
  await hold.requested;
  const jump = page.getByRole("button", { name: "Jump to avatars", exact: true });
  const target = await jump.getAttribute("data-anchor");
  if (target === null) {
    throw new Error("The real contribution has no resolved anchor");
  }
  await jump.click();
  const retired = await page.locator('[data-slot="config-content"]').elementHandle();
  await page.getByRole("button", { name: "Unmount content", exact: true }).click();
  await expect(page.locator('[data-slot="config-content"]')).toHaveCount(0);
  const flashed = await retired.evaluate(async (container, id) => {
    const late = document.createElement("section");
    late.id = id;
    container.append(late);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    // The retired container is out of the document, so it has no computed style: read the flash hook itself.
    return late.hasAttribute("data-settings-flash");
  }, target);
  expect(flashed).toBe(false);
});
