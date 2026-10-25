// The shell's LIST and CONTEXT panes on the production section registry: each section's pane capability, the
// width regimes and the content-primacy crossover, the overlay sheets and their dismissals, the landmarks and the
// skip, focus around the panes, and the both-docked squeeze, all read off the rendered grid.
import { readFileSync } from "node:fs";
import { persistedOverrides, resolvedLength, seedShellState, shellTracks } from "@orb/testkit/browser/spec";
import { SECTION_LABELS } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { AppShellListDockStory, AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SECTION_PROCEDURES, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const WIDE = { width: 1280, height: 900 } as const;
const NARROW_DESKTOP = { width: 900, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
// A box laid out at a token can read a fraction under it once the panel track rounds.
const SUBPIXEL = 0.5;
// The desktop names the frame region a toggle hides; the phone names the screen a tap lands on.
const LIST_TOGGLE = /^(?:(?:Show|Hide) list panel|Show .+ (?:list|overview))$/u;
const CONTEXT_TOGGLE = /^(?:Show|Hide) details$/u;
const PRESETS_FILE = new URL("../../../../../tooling/src/floor/appearance/appearance-presets.json", import.meta.url);

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

function rail(page: Page): Locator {
  return page.locator(".shell-rail");
}

async function openSection(page: Page, label: string, id: string): Promise<void> {
  await rail(page).getByRole("button", { name: label, exact: true }).click();
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", id);
}

/** Constrain the prospective tracks shell.css owns, without touching a breakpoint, until the sentinel reports a deficit. */
async function forceConstrained(page: Page): Promise<void> {
  await page.locator(".shell-grid").evaluate((grid) => {
    grid.style.setProperty("--dimension-panel-floor", "35rem");
    grid.style.setProperty("--dimension-panel-context-step", "35rem");
  });
  await expect.poll(() => primacyDeficit(page)).toBeGreaterThan(0);
}

function primacyDeficit(page: Page): Promise<number> {
  return page.locator(".shell-content-primacy-sentinel").evaluate((element) => element.getBoundingClientRect().width);
}

/** The widest width that still renders a primacy deficit and the narrowest that does not, found on the rendered sentinel. */
async function primacyCrossover(page: Page): Promise<{ constrained: number; equality: number }> {
  const deficitAt = async (width: number): Promise<number> => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return primacyDeficit(page);
  };
  let [low, high] = [1025, 1800];
  expect(await deficitAt(low)).toBeGreaterThan(0);
  expect(await deficitAt(high)).toBe(0);
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if ((await deficitAt(middle)) > 0) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return { constrained: low, equality: high };
}

/** A curated appearance profile, written as the viewer's own appearance on a fresh corpus root. */
async function rootWithProfile(name: string): Promise<Root> {
  const presets = JSON.parse(readFileSync(PRESETS_FILE, "utf8")) as { presets: Record<string, { appearance: Record<string, unknown> }> };
  const profile = presets.presets[name];
  if (profile === undefined) {
    throw new Error(`no appearance profile ${name}`);
  }
  const profiled = await createCorpusHarness();
  const caller = await profiled.internalCallerFor(profiled.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: profile.appearance });
  return profiled;
}

/** The band's inset shadow stops read by geometry: the ember edge sits at the top (a positive block offset), the separator at the bottom. */
function insetEdges(boxShadow: string): { ember: boolean; rule: boolean } {
  const stops: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of boxShadow) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }
    if (char === "," && depth === 0) {
      stops.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  stops.push(current.trim());
  const painted = stops.filter((stop) => stop.includes("inset") && !/rgba\([^)]*,\s*0\)/u.test(stop));
  const offset = (stop: string): number => Number.parseFloat((stop.match(/-?[\d.]+px/gu) ?? [])[1] ?? "0");
  return { ember: painted.some((stop) => offset(stop) > 0), rule: painted.some((stop) => offset(stop) < 0) };
}

test.describe("pane capability per section", () => {
  test.use({ viewport: WIDE });

  test("Presets docks both panes, Chats offers both toggles, Plugin pages only its list, and Home no pane chrome at all", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const list = page.locator(LIST);
    const context = page.locator(CONTEXT);
    // Home declares no pane: no toggle, an empty context body, and the declaration published on both.
    await expect(page.getByRole("button", { name: LIST_TOGGLE })).toHaveCount(0);
    await expect(page.getByRole("button", { name: CONTEXT_TOGGLE })).toHaveCount(0);
    await expect(list).toHaveAttribute("data-panel-available", "false");
    await expect(context).toHaveAttribute("data-panel-available", "false");
    await expect(context.locator(".shell-panel-body")).toBeEmpty();

    await openSection(page, "Plugin pages", "extensions");
    await expect(page.getByRole("button", { name: LIST_TOGGLE })).toBeVisible();
    await expect(page.getByRole("button", { name: CONTEXT_TOGGLE })).toHaveCount(0);
    await expect(list).toHaveAttribute("data-panel-available", "true");
    await expect(context).toHaveAttribute("data-panel-available", "false");

    await openSection(page, "Chats", "chats");
    await expect(page.getByRole("button", { name: LIST_TOGGLE })).toBeVisible();
    await expect(page.getByRole("button", { name: CONTEXT_TOGGLE })).toBeVisible();
    await expect(list).toHaveAttribute("data-panel-available", "true");
    await expect(context).toHaveAttribute("data-panel-available", "true");

    await openSection(page, "Presets", "presets");
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
  });
});

test.describe("on a wide desktop", () => {
  test.use({ viewport: WIDE });

  test.beforeEach(async ({ page }) => {
    await seedShellState(page, { activeSection: "chats" });
  });

  test("the list toggle collapses the pane off its rail edge, out of the accessibility tree", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const list = page.locator(LIST);
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    expect((await list.boundingBox())?.width ?? 0).toBeGreaterThan(0);
    const railRight = await rail(page).evaluate((element) => element.getBoundingClientRect().right);
    await page.getByRole("button", { name: "Hide list panel", exact: true }).click();
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    await expect.poll(() => list.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(railRight + 1);
    await expect(list).toHaveAttribute("aria-hidden", "true");
  });

  test("opening the collapsed context pane commits its chrome first and mounts its body in a later task", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const context = page.locator(CONTEXT);
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(context.locator(".shell-panel-body")).toBeEmpty();
    // One observer callback is one task's mutations, so the callback index is the task identity.
    await page.evaluate((selector) => {
      const records: { tick: number; mode: boolean; body: boolean }[] = [];
      Reflect.set(globalThis, "__panelTasks", records);
      const aside = document.querySelector(selector);
      const body = aside?.querySelector(".shell-panel-body") ?? null;
      if (aside === null || body === null) {
        return;
      }
      let tick = 0;
      new MutationObserver((mutations) => {
        tick += 1;
        const mode = mutations.some((m) => m.type === "attributes" && m.attributeName === "data-panel-mode");
        const grew = mutations.some((m) => m.type === "childList" && m.target === body && m.addedNodes.length > 0);
        if (mode || grew) {
          records.push({ tick, mode, body: grew });
        }
      }).observe(aside, { attributes: true, attributeFilter: ["data-panel-mode"], childList: true, subtree: true });
    }, CONTEXT);
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(context.locator(".shell-panel-body")).not.toBeEmpty();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const tasks = Reflect.get(globalThis, "__panelTasks") as { tick: number; mode: boolean; body: boolean }[];
          const modeTick = tasks.find((task) => task.mode)?.tick;
          const bodyTick = tasks.find((task) => task.body)?.tick;
          if (modeTick === undefined || bodyTick === undefined) {
            return `probe-blind:${String(modeTick)}/${String(bodyTick)}`;
          }
          return bodyTick > modeTick ? "deferred" : "same-task";
        }),
      )
      .toBe("deferred");
  });

  test("a collapsed context body mounts only when opened, opens as a sheet when constrained, and follows the section", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const context = page.locator(CONTEXT);
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(context.locator(".shell-panel-body")).toBeEmpty();
    await forceConstrained(page);
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    // At CONTENT's floor the first click already yields the transient sheet, never a dock that then vanishes.
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await expect(context.locator(".shell-panel-body")).not.toBeEmpty();
    const chatsBody = await context.locator(".shell-panel-body").innerHTML();
    await page.getByRole("button", { name: "Hide details", exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await openSection(page, "Presets", "presets");
    await expect(context.locator(".shell-panel-body")).not.toBeEmpty();
    expect(await context.locator(".shell-panel-body").innerHTML()).not.toBe(chatsBody);
  });

  test("the rail's Settings door routes the section and opens no dialog; no theme switch is left on the rail", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.getByRole("button", { name: "Switch theme" })).toHaveCount(0);
    const settings = rail(page).getByRole("button", { name: SECTION_LABELS.settings, exact: true });
    await settings.click();
    await expect(settings).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "config");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the shell has one main, one primary navigation, and every complementary landmark has its own name", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
    const names = await page.getByRole("complementary", { includeHidden: true }).evaluateAll((elements) =>
      elements.map((element) => {
        const labelledBy = element.getAttribute("aria-labelledby");
        const label = labelledBy === null ? null : document.getElementById(labelledBy)?.textContent.trim();
        return label ?? element.getAttribute("aria-label") ?? "";
      }),
    );
    expect(names.length).toBeGreaterThan(1);
    expect(names.every((name) => name.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  test("the LIST landmark is named by its own band, and follows the band when the section changes", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const list = page.locator(LIST);
    const band = list.locator('[data-slot="list-pane-title"]');
    await expect(band).toBeVisible();
    await expect(list).toHaveAttribute("aria-labelledby", (await band.getAttribute("id")) ?? "");
    await expect(list).toHaveAccessibleName(/^Chats\b/u);
    await openSection(page, "Presets", "presets");
    await expect(band).toContainText("Presets");
    await expect(list).toHaveAccessibleName(/^Presets\b/u);
  });

  test("the skip link is the grid's first tab stop, a real target once revealed, and lands focus on the main column", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const skip = page.getByRole("button", { name: "Skip to content", exact: true });
    await expect
      .poll(() =>
        page.locator(".shell-grid").evaluate((grid) => {
          const candidates = [...grid.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')];
          return candidates.find((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0)?.textContent ?? "";
        }),
      )
      .toBe("Skip to content");
    await expect.poll(() => skip.evaluate((element) => getComputedStyle(element).clipPath)).toBe("inset(50%)");
    const rest = await skip.boundingBox();
    // A real Tab first: the reveal is `:focus-visible`, which a programmatic focus on a fresh page does not match.
    await page.keyboard.press("Tab");
    await skip.focus();
    await expect.poll(() => skip.evaluate((element) => getComputedStyle(element).clipPath)).toBe("none");
    const revealed = await skip.boundingBox();
    expect(revealed?.width ?? 0).toBeGreaterThan(rest?.width ?? 0);
    // The pointer's touch floor on both axes, and the box comes from the Button's padding, not a height patch.
    const floor = await resolvedLength(page, "var(--size-touch-target)");
    expect(revealed?.height ?? 0).toBeGreaterThanOrEqual(floor);
    expect(revealed?.width ?? 0).toBeGreaterThanOrEqual(floor);
    await expect.poll(() => skip.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingInlineStart))).toBeGreaterThan(0);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("keyboard rail navigation never pulls focus into the main column; it lands in the arriving section's list", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    const chats = rail(page).getByRole("button", { name: SECTION_LABELS.chats, exact: true });
    await chats.focus();
    await chats.press("Enter");
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "chats");
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    // The shell's arrival rescue only acts on a focus that fell to the page body; the section's list surface
    // parks keyboard arrival on its own root, which sits in the LIST pane ahead of <main>.
    await expect(page.getByRole("main")).not.toBeFocused();
    await expect.poll(() => page.locator(LIST).evaluate((pane) => pane.contains(document.activeElement))).toBe(true);
  });

  test("a section change that drops focus to the page body restores it to the main column", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "chats");
    // A programmatic swap with nothing focused is the genuine focus-loss shape the rescue exists for.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await rail(page)
      .getByRole("button", { name: SECTION_LABELS.presets, exact: true })
      .evaluate((node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("at 1280 the Characters band keeps its full title and both create doors at the touch-free control floor, with one pane docked and with both", async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "docked" } } });
    await mount<typeof AppShellStory>(STORY, {});
    const band = page.locator(`${LIST} .shell-panel-header`);
    const floor = await resolvedLength(page, "var(--size-control-sm)");
    const read = (): Promise<{ readonly width: number; readonly clipped: boolean; readonly doors: number[] }> =>
      band.evaluate((header) => {
        const title = header.querySelector('[data-slot="list-pane-title"]');
        const doors = [...header.querySelectorAll("button")].filter(
          (button) =>
            button.checkVisibility() && /^(?:New|New character|Import a character card)$/u.test(button.getAttribute("aria-label") ?? button.textContent.trim()),
        );
        return {
          width: Math.round(header.closest(".shell-panel")?.getBoundingClientRect().width ?? 0),
          clipped: title === null || title.scrollWidth > title.clientWidth,
          doors: doors.map((button) => Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height)),
        };
      });
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    // The band's New is a word or a glyph by its own container width; exactly one of the pair is in the tree.
    await expect(band.getByRole("button", { name: /^New(?: character)?$/u })).toHaveCount(1);
    await expect(band.getByRole("button", { name: "Import a character card", exact: true })).toHaveCount(1);
    await expect(band.locator('[data-slot="list-pane-title"]')).toContainText(/\d/u);
    const squeezed = await read();
    await page.getByRole("button", { name: "Hide details", exact: true }).click();
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "collapsed");
    await expect.poll(async () => (await read()).width).toBeGreaterThan(squeezed.width);
    const single = await read();
    expect(
      [squeezed, single].map(({ clipped, doors }) => ({ clipped, doors: doors.length, short: doors.filter((side) => side < floor - SUBPIXEL).length })),
    ).toStrictEqual([
      { clipped: false, doors: 2, short: 0 },
      { clipped: false, doors: 2, short: 0 },
    ]);
  });

  test("both docked at 1360 the content track reaches its reading floor and each pane keeps its own floor", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    const [railTrack = 0, list = 0, content = 0, context = 0] = await shellTracks(page);
    expect(railTrack + list + content + context).toBeCloseTo(1360, 0);
    expect(content).toBeGreaterThanOrEqual((await resolvedLength(page, "var(--dimension-content-reading-floor)")) - 1);
    expect(list).toBeGreaterThanOrEqual(await resolvedLength(page, "var(--dimension-panel-floor)"));
    expect(list).toBeLessThan(await resolvedLength(page, "var(--panel-w)"));
    expect(context).toBeGreaterThanOrEqual(await resolvedLength(page, "var(--dimension-panel-context-step)"));
    expect(context).toBeLessThan(await resolvedLength(page, "var(--panel-context-w)"));
  });

  test("where the floor already fits the tracks are the plain clamps, and one docked pane never pays the squeeze", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    const [, wideList = 0, wideContent = 0, wideContext = 0] = await shellTracks(page);
    expect(wideList).toBeCloseTo(await resolvedLength(page, "var(--panel-w)"), 0);
    expect(wideContext).toBeCloseTo(await resolvedLength(page, "var(--panel-context-w)"), 0);
    expect(wideContent).toBeGreaterThan(await resolvedLength(page, "var(--dimension-content-reading-floor)"));

    await page.setViewportSize({ width: 1360, height: 900 });
    await page.getByRole("button", { name: "Hide details", exact: true }).click();
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "collapsed");
    const [, list = 0, , context = 0] = await shellTracks(page);
    expect(list).toBeCloseTo(await resolvedLength(page, "var(--panel-w)"), 0);
    expect(context).toBe(0);
  });

  test("the grid's first committed template already carries the docked list track", async ({ mount, page }) => {
    await page.addInitScript(() => {
      const capture: { cols: string; list: string | null }[] = [];
      Reflect.set(globalThis, "__bootGrid", capture);
      const observer = new MutationObserver(() => {
        const grid = document.querySelector(".shell-grid");
        if (grid !== null && capture.length === 0) {
          capture.push({ cols: getComputedStyle(grid).gridTemplateColumns, list: grid.getAttribute("data-list-mode") });
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    await mount<typeof AppShellStory>(STORY, {});
    const list = page.locator(LIST);
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    const boot = await page.evaluate(() => (Reflect.get(globalThis, "__bootGrid") as { cols: string; list: string | null }[])[0]);
    expect(boot?.list).toBe("docked");
    const bootList = Number.parseFloat((boot?.cols ?? "").split(" ")[1] ?? "0");
    expect(bootList).toBeGreaterThan(0);
    await expect.poll(async () => Math.abs(bootList - ((await list.boundingBox())?.width ?? 0))).toBeLessThan(1);
  });
});

test.describe("across the width regimes", () => {
  test.beforeEach(async ({ page }) => {
    await seedShellState(page, { activeSection: "chats" });
  });

  test("a docked-default list docks wide, closes into the narrow regime and stays a closed sheet on a phone, never writing its override", async ({
    mount,
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await mount<typeof AppShellStory>(STORY, {});
    const list = page.locator(LIST);
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect.poll(() => persistedOverrides(page)).not.toBeNull();
    const before = await persistedOverrides(page);
    await page.setViewportSize(NARROW_DESKTOP);
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.locator(".shell-scrim")).toHaveAttribute("data-visible", "false");
    expect(await persistedOverrides(page)).toEqual(before);
    await page.setViewportSize(WIDE);
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    expect(await persistedOverrides(page)).toEqual(before);
  });

  test("the context regime follows the rendered geometry, re-reads on font load, and releases its observer on unmount", async ({ mount, page }) => {
    await page.addInitScript(() => {
      const counts = { observe: 0, disconnect: 0 };
      Reflect.set(globalThis, "__primacyObserver", counts);
      const watched = new WeakSet<ResizeObserver>();
      const observe = ResizeObserver.prototype.observe;
      const disconnect = ResizeObserver.prototype.disconnect;
      ResizeObserver.prototype.observe = function observeProbe(target: Element, options?: ResizeObserverOptions): void {
        if (target.classList.contains("shell-content-primacy-sentinel")) {
          watched.add(this);
          counts.observe += 1;
        }
        observe.call(this, target, options);
      };
      ResizeObserver.prototype.disconnect = function disconnectProbe(): void {
        if (watched.has(this)) {
          counts.disconnect += 1;
        }
        disconnect.call(this);
      };
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await seedShellState(page, { activeSection: "presets" });
    const component = await mount<typeof AppShellStory>(STORY, {});
    const context = page.locator(CONTEXT);
    const counts = (): Promise<{ observe: number; disconnect: number }> =>
      page.evaluate(() => Reflect.get(globalThis, "__primacyObserver") as { observe: number; disconnect: number });
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    await forceConstrained(page);
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await page.locator(".shell-grid").evaluate((grid) => {
      grid.style.removeProperty("--dimension-panel-floor");
      grid.style.removeProperty("--dimension-panel-context-step");
    });
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "150%";
    });
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    expect((await counts()).observe).toBe(1);
    await component.unmount();
    expect((await counts()).disconnect).toBe(1);
  });

  for (const profile of ["defaults", "reading"] as const) {
    test(`with the ${profile} appearance, a docked-default context is a sheet below the crossover and docks above it, keeping content primacy`, async ({
      corpus,
      mount,
      page,
    }) => {
      await using profiled = await rootWithProfile(profile);
      await routeShell(page, corpus, await profiled.internalCallerFor(profiled.ownerId), SECTION_PROCEDURES);
      await page.setViewportSize({ width: 1400, height: 900 });
      await seedShellState(page, { activeSection: "presets" });
      await mount<typeof AppShellStory>(STORY, {});
      await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "presets");
      const crossover = await primacyCrossover(page);
      const list = page.locator(LIST);
      const context = page.locator(CONTEXT);
      await page.setViewportSize({ width: crossover.constrained, height: 900 });
      await expect(list).toHaveAttribute("data-panel-mode", "docked");
      await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
      await page.getByRole("button", { name: "Show details", exact: true }).click();
      await expect(context).toHaveAttribute("data-panel-mode", "overlay");
      await page.keyboard.press("Escape");
      await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
      await page.setViewportSize({ width: crossover.equality, height: 900 });
      await expect(context).toHaveAttribute("data-panel-mode", "docked");
      const [, listTrack = 0, content = 0, contextTrack = 0] = await shellTracks(page);
      expect(content + 0.5).toBeGreaterThanOrEqual((listTrack + contextTrack) / 2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }

  test("a context-default-collapsed section meets the crossover with a sheet below it and a real dock above it", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await mount<typeof AppShellStory>(STORY, {});
    const crossover = await primacyCrossover(page);
    const context = page.locator(CONTEXT);
    const toggle = page.getByRole("button", { name: CONTEXT_TOGGLE });
    await page.setViewportSize({ width: crossover.constrained, height: 900 });
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await toggle.click();
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await page.keyboard.press("Escape");
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await page.setViewportSize({ width: crossover.equality, height: 900 });
    // Nothing auto-docks for this shape: the closed pane stays closed, and now the toggle earns a dock.
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await toggle.click();
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    const [, list = 0, content = 0, contextTrack = 0] = await shellTracks(page);
    expect(content + 0.5).toBeGreaterThanOrEqual((list + contextTrack) / 2);
  });

  test("Reading's crossover is the rendered geometry's: every width either side docks or sheets the pane by its deficit", async ({ corpus, mount, page }) => {
    await using profiled = await rootWithProfile("reading");
    await routeShell(page, corpus, await profiled.internalCallerFor(profiled.ownerId), SECTION_PROCEDURES);
    await page.setViewportSize(WIDE);
    await seedShellState(page, { activeSection: "presets" });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "presets");
    const context = page.locator(CONTEXT);
    const crossover = await primacyCrossover(page);
    const mismatches: string[] = [];
    for (let width = crossover.constrained - 12; width <= crossover.equality + 12; width += 1) {
      await page.setViewportSize({ width, height: 900 });
      const expected = (await primacyDeficit(page)) > 0 ? "collapsed" : "docked";
      await expect(context).toHaveAttribute("data-panel-mode", expected);
      const [, list = 0, content = 0, contextTrack = 0] = await shellTracks(page);
      if (expected === "docked" && content + 0.5 < (list + contextTrack) / 2) {
        mismatches.push(`${String(width)}: content ${String(content)} under primacy`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("the narrow-desktop list toggle opens a scrimmed sheet below the topbar and closes it, never writing the override", async ({ mount, page }) => {
    await page.setViewportSize(NARROW_DESKTOP);
    await mount<typeof AppShellStory>(STORY, {});
    const list = page.locator(LIST);
    const scrim = page.locator(".shell-scrim");
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    await expect.poll(() => persistedOverrides(page)).not.toBeNull();
    const before = await persistedOverrides(page);
    await page.getByRole("button", { name: "Show list panel", exact: true }).click();
    await expect(list).toHaveAttribute("data-panel-mode", "overlay");
    await expect(scrim).toHaveAttribute("data-visible", "true");
    // The topbar toggle is still reachable over the open sheet.
    await page.getByRole("button", { name: "Hide list panel", exact: true }).click();
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(scrim).toHaveAttribute("data-visible", "false");
    // A collapsed-default pane opens on the first click too, not after a dead one.
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "overlay");
    await page.getByRole("button", { name: "Hide details", exact: true }).click();
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "collapsed");
    expect(await persistedOverrides(page)).toEqual(before);
  });

  test("the scrim closes either sheet like its toggle does and hands focus back to that toggle", async ({ mount, page }) => {
    await page.setViewportSize(NARROW_DESKTOP);
    await mount<typeof AppShellStory>(STORY, {});
    await page.getByRole("button", { name: "Show list panel", exact: true }).click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "overlay");
    await page.locator(".shell-scrim").click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.getByRole("button", { name: "Show list panel", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "overlay");
    await page.locator(".shell-scrim").click();
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.getByRole("button", { name: "Show details", exact: true })).toBeFocused();
  });

  test("Escape closes the list sheet and the context sheet, from the toggle or from inside the sheet, writing no override", async ({ mount, page }) => {
    await page.setViewportSize(NARROW_DESKTOP);
    await mount<typeof AppShellStory>(STORY, {});
    await expect.poll(() => persistedOverrides(page)).not.toBeNull();
    const before = await persistedOverrides(page);
    await page.getByRole("button", { name: "Show list panel", exact: true }).click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "overlay");
    await page.keyboard.press("Escape");
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "collapsed");
    const context = page.locator(CONTEXT);
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await page.keyboard.press("Escape");
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await context
      .getByRole("button", { name: /^Close /u })
      .first()
      .focus();
    await page.keyboard.press("Escape");
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    expect(await persistedOverrides(page)).toEqual(before);
  });

  test("the scrim is never a Tab stop while a sheet is up", async ({ mount, page }) => {
    await page.setViewportSize(NARROW_DESKTOP);
    await mount<typeof AppShellStory>(STORY, {});
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    const scrim = page.locator(".shell-scrim");
    await expect(scrim).toHaveAttribute("data-visible", "true");
    // The positive control: the walk does reach the sheet, so the scrim had every chance to be a stop.
    let reachedSheet = false;
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press("Tab");
      await expect(scrim).not.toBeFocused();
      reachedSheet ||= await page.locator(CONTEXT).evaluate((element) => element.contains(document.activeElement));
    }
    expect(reachedSheet).toBe(true);
  });

  test("a sheet floating at the narrow desktop wears the float elevation and inerts the content; docked it does neither", async ({ mount, page }) => {
    await page.setViewportSize(NARROW_DESKTOP);
    await mount<typeof AppShellStory>(STORY, {});
    const list = page.locator(LIST);
    const content = page.locator(".shell-content");
    await page.getByRole("button", { name: "Show list panel", exact: true }).click();
    await expect(list).toHaveAttribute("data-panel-mode", "overlay");
    await expect.poll(() => list.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
    await expect(content).toHaveAttribute("inert", "");
    await page.getByRole("button", { name: "Hide list panel", exact: true }).click();
    await expect(content).not.toHaveAttribute("inert", "");
    await page.setViewportSize(WIDE);
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect.poll(() => list.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
  });

  test("the context band's ember edge binds a docked pane to the content and drops when the pane floats, keeping its separator", async ({ mount, page }) => {
    await page.setViewportSize(WIDE);
    await mount<typeof AppShellStory>(STORY, {});
    const context = page.locator(CONTEXT);
    const band = context.locator(".shell-panel-header");
    const edges = async (): Promise<{ ember: boolean; rule: boolean }> => insetEdges(await band.evaluate((element) => getComputedStyle(element).boxShadow));
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    await expect.poll(async () => (await edges()).ember).toBe(true);
    await page.setViewportSize(NARROW_DESKTOP);
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await expect.poll(async () => (await edges()).ember).toBe(false);
    expect((await edges()).rule).toBe(true);
  });

  test("a keyboard-opened context sheet takes focus without a ring, and its own close returns focus to the toggle", async ({ mount, page }) => {
    await page.setViewportSize(NARROW_DESKTOP);
    await mount<typeof AppShellStory>(STORY, {});
    const context = page.locator(CONTEXT);
    const toggle = page.getByRole("button", { name: "Show details", exact: true });
    await toggle.focus();
    await toggle.press("Enter");
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await expect(context).toBeFocused();
    await expect.poll(() => context.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect(context).toHaveCSS("outline-style", "none");
    await context.getByRole("button", { name: "Close Chats details", exact: true }).press("Enter");
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.getByRole("button", { name: "Show details", exact: true })).toBeFocused();
  });

  test("closing a docked context pane from its own close returns focus to the toggle, never the page body", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount<typeof AppShellStory>(STORY, {});
    const context = page.locator(CONTEXT);
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    await context.getByRole("button", { name: "Close Chats details", exact: true }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.getByRole("button", { name: "Show details", exact: true })).toBeFocused();
  });
});

test.describe("the context carry across a list flip", () => {
  test.beforeEach(async ({ page }) => {
    await seedShellState(page, { activeSection: "chats" });
  });

  test("constrained, an open context sheet rides a list hide and show instead of vanishing or reopening", async ({ mount, page }) => {
    await page.setViewportSize(WIDE);
    await mount<typeof AppShellStory>(STORY, {});
    const list = page.locator(LIST);
    const context = page.locator(CONTEXT);
    const listToggle = page.getByRole("button", { name: LIST_TOGGLE });
    await forceConstrained(page);
    await page.getByRole("button", { name: CONTEXT_TOGGLE }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await expect(page.locator(".shell-scrim")).toHaveAttribute("data-visible", "true");
    await listToggle.click();
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    // The freed width docks the pane the user opened; it does not vanish.
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    await listToggle.click();
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
  });

  test("constrained, a context sheet the user closed stays closed across the same list hide and show", async ({ mount, page }) => {
    await page.setViewportSize(WIDE);
    await mount<typeof AppShellStory>(STORY, {});
    const list = page.locator(LIST);
    const context = page.locator(CONTEXT);
    const listToggle = page.getByRole("button", { name: LIST_TOGGLE });
    const contextToggle = page.getByRole("button", { name: CONTEXT_TOGGLE });
    await forceConstrained(page);
    await contextToggle.click();
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await contextToggle.click();
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await listToggle.click();
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await listToggle.click();
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
  });

  test("unconstrained the same clicks stay a plain wide dock, and a list docked from outside the shell carries the context too", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1800, height: 900 });
    await mount<typeof AppShellListDockStory>(`${SHELL_STORIES}/AppShellListDockStory`, {});
    const list = page.locator(LIST);
    const context = page.locator(CONTEXT);
    const listToggle = page.getByRole("button", { name: LIST_TOGGLE });
    await expect.poll(() => primacyDeficit(page)).toBe(0);
    await page.getByRole("button", { name: CONTEXT_TOGGLE }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    await listToggle.click();
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    await listToggle.click();
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    await expect(page.locator(".shell-scrim")).toHaveAttribute("data-visible", "false");

    // Constrained, with the list collapsed the open pane is a wide dock; docking the list from outside flips it to a sheet.
    await page.setViewportSize(WIDE);
    await forceConstrained(page);
    await listToggle.click();
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(context).toHaveAttribute("data-panel-mode", "docked");
    await page.getByRole("button", { name: "Dock the list from outside", exact: true }).click();
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE });

  test("Escape closes the full-screen context sheet and leaves the content as inert as the screen beneath made it", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    const context = page.locator(CONTEXT);
    const content = page.locator(".shell-content");
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    // On a phone the Chats roster is the screen, so the content column is already inert behind it.
    const inertBefore = await content.getAttribute("inert");
    await page.getByRole("button", { name: CONTEXT_TOGGLE }).click();
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await expect(content).toHaveAttribute("inert", "");
    await page.keyboard.press("Escape");
    await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
    await expect.poll(() => content.getAttribute("inert")).toBe(inertBefore);
  });
});
