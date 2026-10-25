// The command palette through the production shell: its click and chord doors, the shortcut's own filter and
// lifetime, focus return, and the result viewport's geometry while filtering.
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellModalStory, AppShellStory } from "./_app-shell-stories.tsx";
import { dispatchCommandKey, JUMP_CHIP, PHONE, SHELL_STORIES } from "./app-shell-ct.tsx";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const MODAL_STORY = `${SHELL_STORIES}/AppShellModalStory`;
const PALETTE = { name: "Jump to…", exact: true } as const;

// The palette's recents, the New chat picker, the You sheet and the Plugin pages section read past Home's captures.
const SERVED = [
  "sessions.me",
  "chat.listChats",
  "character.list",
  "rosterPreset.list",
  "notifications.markAllRead",
  "plugin.list",
  "plugin.listSurfaces",
] as const;

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, { ...createShellAmbientReads(corpus), ...serveCorpusProcedures(caller, SERVED) });
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("the Jump chip and both chords open the palette on its search, and Escape returns focus to the chip", async ({ mount, page }) => {
  await mount<typeof AppShellStory>(STORY, {});
  const chip = page.getByRole("button", { name: JUMP_CHIP });
  const palette = page.getByRole("dialog", PALETTE);

  await chip.click();
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  await expect(chip).toBeFocused();

  for (const chord of ["Meta+KeyK", "Control+KeyK"] as const) {
    await page.keyboard.press(chord);
    await expect(palette.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
    await expect(chip).toBeFocused();
  }
});

test("the shortcut cancels only an exact, non-repeating chord and leaves every text-entry target alone", async ({ mount, page }) => {
  await mount<typeof AppShellStory>(STORY, {});
  await expect(page.getByRole("button", { name: JUMP_CHIP })).toBeVisible();
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML =
      '<input data-kind="input"><textarea data-kind="textarea"></textarea><select data-kind="select"><option>one</option></select><div contenteditable="true" data-kind="editable"><span data-kind="editable-child">edit</span></div>';
    document.body.append(host);
  });
  const kinds = ["input", "textarea", "select", "editable", "editable-child"] as const;
  const fromEntry = await Promise.all(kinds.map((kind) => dispatchCommandKey(page, { metaKey: true }, `[data-kind="${kind}"]`)));
  expect(fromEntry).toEqual(kinds.map(() => false));

  const inexact = [
    { key: "j", metaKey: true },
    { metaKey: true, shiftKey: true },
    { altKey: true, ctrlKey: true },
    { ctrlKey: true, metaKey: true },
    { metaKey: true, repeat: true },
    {},
  ];
  expect(await Promise.all(inexact.map((init) => dispatchCommandKey(page, init)))).toEqual(inexact.map(() => false));
  await expect(page.getByRole("dialog", PALETTE)).toHaveCount(0);

  // The positive control: the exact chord from the document is cancelled and opens the palette.
  expect(await dispatchCommandKey(page, { ctrlKey: true })).toBe(true);
  await expect(page.getByRole("dialog", PALETTE)).toBeVisible();
});

test("rapid chords share one pending frame, the listener never duplicates, and unmount releases both", async ({ mount, page }) => {
  await page.addInitScript(() => {
    const active = new Set<EventListenerOrEventListenerObject>();
    const probe = { active, adds: 0, removes: 0 };
    Reflect.set(globalThis, "__commandListenerProbe", probe);
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void => {
      // The shortcut listens in the capture phase; bubbling keydown listeners belong to other surfaces.
      const capture = options === true || (typeof options === "object" && options.capture === true);
      if (type === "keydown" && capture && !active.has(listener)) {
        active.add(listener);
        probe.adds += 1;
      }
      add(type, listener, options);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void => {
      if (type === "keydown" && active.delete(listener)) {
        probe.removes += 1;
      }
      remove(type, listener, options);
    }) as typeof document.removeEventListener;
  });
  const component = await mount<typeof AppShellStory>(STORY, {});
  await expect(page.getByRole("button", { name: JUMP_CHIP })).toBeVisible();
  const listeners = (): Promise<{ active: number; adds: number; removes: number }> =>
    page.evaluate(() => {
      const probe = Reflect.get(globalThis, "__commandListenerProbe") as { active: Set<unknown>; adds: number; removes: number };
      return { active: probe.active.size, adds: probe.adds, removes: probe.removes };
    });
  const baseline = await listeners();

  // A rerender that re-runs the shortcut's effect replaces its listener rather than stacking a second one.
  await page.getByRole("button", { name: JUMP_CHIP }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", PALETTE)).toHaveCount(0);
  expect((await listeners()).active).toBe(baseline.active);

  await page.evaluate(() => {
    const callbacks = new Map<number, FrameRequestCallback>();
    const probe = { callbacks, canceled: 0, nextId: 1, requested: 0 };
    Reflect.set(globalThis, "__commandFrameProbe", probe);
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = probe.nextId;
      probe.nextId += 1;
      probe.requested += 1;
      callbacks.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id: number): void => {
      if (callbacks.delete(id)) {
        probe.canceled += 1;
      }
    };
  });
  const frames = (): Promise<{ canceled: number; pending: number; requested: number }> =>
    page.evaluate(() => {
      const probe = Reflect.get(globalThis, "__commandFrameProbe") as { callbacks: Map<number, unknown>; canceled: number; requested: number };
      return { canceled: probe.canceled, pending: probe.callbacks.size, requested: probe.requested };
    });
  expect(await dispatchCommandKey(page, { metaKey: true })).toBe(true);
  expect(await dispatchCommandKey(page, { ctrlKey: true })).toBe(true);
  expect(await frames()).toEqual({ canceled: 0, pending: 1, requested: 1 });

  const mounted = await listeners();
  await component.unmount();
  expect(await frames()).toEqual({ canceled: 1, pending: 0, requested: 1 });
  const released = await listeners();
  expect(released.removes - mounted.removes).toBe(mounted.active - released.active);
  expect(await dispatchCommandKey(page, { metaKey: true })).toBe(false);
});

test("a chord that leaves nothing focused as the palette mounts still returns focus to the Jump chip", async ({ mount, page }) => {
  await mount<typeof AppShellStory>(STORY, {});
  const chip = page.getByRole("button", { name: JUMP_CHIP });
  await expect(chip).toBeVisible();
  // The chip steals its own focus away the one time it receives it, the interleaving Chromium's focus restoration makes.
  await page.locator('[data-modal-trigger="command"]').evaluate((element: HTMLElement) => {
    element.dataset["ctStealFocus"] = "armed";
    element.addEventListener("focus", () => {
      if (element.dataset["ctStealFocus"] === "armed") {
        element.blur();
      }
    });
  });
  await page.keyboard.press("Meta+KeyK");
  const palette = page.getByRole("dialog", PALETTE);
  await expect(palette.getByRole("combobox")).toBeFocused();
  await page.locator('[data-modal-trigger="command"]').evaluate((element: HTMLElement) => {
    element.dataset["ctStealFocus"] = "disarmed";
  });
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  await expect(chip).toBeFocused();
});

test("an open New chat dialog owns the overlay, so the chord does nothing and its focus stays put", async ({ mount, page }) => {
  await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await close.focus();
  expect(await dispatchCommandKey(page, { metaKey: true })).toBe(false);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.getByRole("dialog", PALETTE)).toHaveCount(0);
  await expect(close).toBeFocused();
});

test("filtering keeps the dialog, its search and its result viewport where they were, and centres the empty state", async ({ mount, page }) => {
  await mount<typeof AppShellStory>(STORY, {});
  await page.getByRole("button", { name: JUMP_CHIP }).click();
  const palette = page.getByRole("dialog", PALETTE);
  const search = palette.getByRole("combobox");
  const results = palette.getByRole("listbox");
  await expect(search).toBeFocused();
  // The compact result viewport is the `--height-scroll-sm` step the palette declares, resolved by the page's own sheet.
  const compactPx = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.blockSize = "var(--height-scroll-sm)";
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
  const before = { dialog: await palette.boundingBox(), search: await search.boundingBox(), results: await results.boundingBox() };
  expect(before.results?.height).toBeCloseTo(compactPx, 0);

  await search.fill("refinery");
  await expect(palette.getByRole("option", { name: "Refinery", exact: true })).toBeVisible();
  const after = { dialog: await palette.boundingBox(), search: await search.boundingBox(), results: await results.boundingBox() };
  expect(after.dialog?.y).toBeCloseTo(before.dialog?.y ?? Number.NaN, 1);
  expect(after.search?.y).toBeCloseTo(before.search?.y ?? Number.NaN, 1);
  expect(after.results?.height).toBeCloseTo(compactPx, 0);

  await search.fill("qxzqxzqxzqxz");
  const empty = palette.getByText("No matches.", { exact: true });
  await expect(empty).toBeVisible();
  const [emptyBox, listBox] = [await empty.boundingBox(), await results.boundingBox()];
  expect((emptyBox?.y ?? 0) + (emptyBox?.height ?? 0) / 2).toBeCloseTo((listBox?.y ?? 0) + (listBox?.height ?? 0) / 2, 0);
});

test("the palette's focused combobox exposes its roving selection, opened from the phone's You sheet", async ({ mount, page }) => {
  await page.setViewportSize(PHONE);
  await mount<typeof AppShellStory>(STORY, {});
  await page.getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("button", { name: "Jump to…", exact: true }).click();
  const palette = page.getByRole("dialog", PALETTE);
  const search = palette.getByRole("combobox");
  await search.fill("refinery");
  await expect(palette.getByRole("option", { name: "Refinery", exact: true })).toBeVisible();
  await search.press("ArrowDown");
  const selected = palette.getByRole("option", { selected: true });
  await expect(selected).toBeVisible();
  await expect(search).toHaveAttribute("aria-activedescendant", (await selected.getAttribute("id")) ?? "");
});

test("a section change that lands while the palette is open leaves focus in the palette's search", async ({ mount, page }) => {
  await mount<typeof AppShellStory>(STORY, {});
  await page.getByRole("button", { name: JUMP_CHIP }).click();
  const palette = page.getByRole("dialog", PALETTE);
  const search = palette.getByRole("combobox");
  await expect(search).toBeFocused();
  // Programmatic navigation runs while the palette owns the inert boundary behind it.
  const pages = page.locator('.shell-rail button[aria-label="Plugin pages"]');
  await pages.evaluate((node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(pages).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(search).toBeFocused();
  await expect(palette).toBeVisible();
});
