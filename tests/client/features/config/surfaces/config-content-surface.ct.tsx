import { createCorpusReadResponder } from "@orb/testkit/iso/corpus-read-responder.ts";
import { expect, test } from "@orb/testkit/node/ct-corpus.ts";
import { routeTrpc, trpcHold } from "@orb/testkit/node/route-trpc.ts";
import { ConfigAnchorStory } from "./_anchor-stories.tsx";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("a registered delayed body still receives its canonical anchor and lands visibly", async ({ corpus, mount, page }) => {
  const settings = createCorpusReadResponder("settings.getUserSettings", corpus.reads["settings.getUserSettings"]);
  const hold = trpcHold<"settings.getUserSettings">();
  await routeTrpc(page, {
    "sessions.me": createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"]),
    "settings.getUserSettings": () => hold,
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpus.reads["settings.listThemes"]),
  });
  await mount(<ConfigAnchorStory />);
  await hold.requested;
  const jump = page.getByRole("button", { name: "Jump to avatars", exact: true });
  const target = await jump.getAttribute("data-anchor");
  if (target === null) {
    throw new Error("The real contribution has no resolved anchor");
  }
  await jump.click();
  await expect(page.locator(`[id="${target}"]`)).toHaveCount(0);
  hold.release(settings(undefined));
  const anchor = page.locator(`[id="${target}"]`);
  await expect(anchor).toBeVisible();
  await expect(anchor).toHaveClass(/settings-flash-anchor--lit/u);
  await expect(anchor).toBeInViewport();
});

test("a superseded delayed anchor cannot flash or scroll after its read arrives", async ({ corpus, mount, page }) => {
  const settings = createCorpusReadResponder("settings.getUserSettings", corpus.reads["settings.getUserSettings"]);
  const hold = trpcHold<"settings.getUserSettings">();
  await routeTrpc(page, {
    "sessions.me": createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"]),
    "settings.getUserSettings": () => hold,
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpus.reads["settings.listThemes"]),
  });
  await mount(<ConfigAnchorStory />);
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
  await expect(page.locator(`[id="${looksId}"]`)).toHaveClass(/settings-flash-anchor--lit/u);
  const pane = page.locator('[data-slot="config-content"]');
  const settledTop = await pane.evaluate((element) => element.scrollTop);
  hold.release(settings(undefined));
  const anchor = page.locator(`[id="${target}"]`);
  await expect(anchor).toBeAttached();
  await anchor.evaluate((element) =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))).then(() => {
      if (element.classList.contains("settings-flash-anchor--lit")) {
        throw new Error("Superseded target flashed after its owner cancelled");
      }
    }),
  );
  expect(await pane.evaluate((element) => element.scrollTop)).toBe(settledTop);
  await expect(looks).toBeFocused();
});

test("unmount disconnects a pending anchor observer from its retired browser element", async ({ corpus, mount, page }) => {
  const hold = trpcHold<"settings.getUserSettings">();
  await routeTrpc(page, {
    "sessions.me": createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"]),
    "settings.getUserSettings": () => hold,
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpus.reads["settings.listThemes"]),
  });
  await mount(<ConfigAnchorStory />);
  await hold.requested;
  const jump = page.getByRole("button", { name: "Jump to avatars", exact: true });
  const target = await jump.getAttribute("data-anchor");
  if (target === null) {
    throw new Error("The real contribution has no resolved anchor");
  }
  await jump.click();
  const retired = await page.locator('[data-slot="config-content"]').elementHandle();
  if (retired === null) {
    throw new Error("The production scroller did not mount");
  }
  await page.getByRole("button", { name: "Unmount content", exact: true }).click();
  await expect(page.locator('[data-slot="config-content"]')).toHaveCount(0);
  const flashed = await retired.evaluate(async (container, id) => {
    const late = document.createElement("section");
    late.id = id;
    container.append(late);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return late.classList.contains("settings-flash-anchor--lit");
  }, target);
  expect(flashed).toBe(false);
});
