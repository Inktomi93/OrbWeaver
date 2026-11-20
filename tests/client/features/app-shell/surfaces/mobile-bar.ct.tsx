// The rail on a phone is the mobile bar: tab labels ride the label step and fit the narrowest bar, the current
// section always holds exactly one visible tab, Home is one affordance at every width, and the You tab speaks the
// count of what its sheet hosts and is the one pressed tab while that sheet is open.

import { YOU_TAB_LABEL } from "@orb/client/lib";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const NARROWEST = { width: 320, height: 800 } as const;
const PHONE = { width: 430, height: 900 } as const;
const DESKTOP = { width: 1280, height: 800 } as const;
const BAR_BUTTONS = ".shell-rail-button, .shell-rail-brand-button";
const WAITING_ROWS = 2;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeRoom(page, corpus, await root.internalCallerFor(root.ownerId));
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

const rail = (page: Page): Locator => page.locator(".shell-rail");

/** The names of the tabs a thumb can reach, in bar order: a hidden sibling measures 0 wide. */
const reachableTabs = (bar: Locator): Promise<string[]> =>
  bar
    .locator(BAR_BUTTONS)
    .evaluateAll((elements) => elements.filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.getAttribute("aria-label") ?? ""));

/** Of those, the ones claiming to be the page. */
const currentTabs = (bar: Locator): Promise<string[]> =>
  bar
    .locator('[aria-current="page"]')
    .evaluateAll((elements) => elements.filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.getAttribute("aria-label") ?? ""));

for (const viewport of [DESKTOP, PHONE]) {
  test.describe(`at ${String(viewport.width)} wide`, () => {
    test.use({ viewport, hasTouch: viewport.width === PHONE.width });

    test("Home is exactly one affordance in the rail", async ({ mount, page }) => {
      await mount<typeof AppShellStory>(STORY, {});
      const brand = rail(page).locator(".shell-rail-brand-button");
      await expect(brand).toHaveCount(1);
      const name = (await brand.getAttribute("aria-label")) ?? "";
      expect(name).not.toBe("");
      await expect(rail(page).getByRole("button", { name, exact: true })).toHaveCount(1);
    });
  });
}

test.describe("the mobile bar", () => {
  test.use({ viewport: NARROWEST, hasTouch: true });

  test("a tab label rides the label step of the type ramp, not the micro one, and no label outgrows its tab at the narrowest phone", async ({
    mount,
    page,
  }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const labels = rail(page).locator(".shell-rail-button-label");
    await expect(labels.first()).toBeVisible();
    const steps = { label: TOKENS["text.label"].cssVar, micro: TOKENS["text.micro"].cssVar };
    await expect
      .poll(() =>
        labels.first().evaluate((el, { label, micro }) => {
          const probe = el.ownerDocument.createElement("div");
          el.ownerDocument.body.append(probe);
          const stepPx = (token: string): number => {
            probe.style.fontSize = `var(${token})`;
            return Number.parseFloat(globalThis.getComputedStyle(probe).fontSize);
          };
          const resolved = Number.parseFloat(globalThis.getComputedStyle(el).fontSize);
          const verdict = { onLabelStep: resolved === stepPx(label), aboveMicroStep: resolved > stepPx(micro) };
          probe.remove();
          return verdict;
        }, steps),
      )
      .toEqual({ onLabelStep: true, aboveMicroStep: true });

    // The offender list, polled to empty: a label wider than its tab or taller than one line breaks the bar.
    await expect
      .poll(() =>
        labels.evaluateAll((elements) =>
          elements
            .filter((el) => {
              const buttonRect = el.closest(".shell-rail-button")?.getBoundingClientRect();
              const labelRect = el.getBoundingClientRect();
              const spills = buttonRect === undefined || labelRect.width > buttonRect.width + 0.5;
              const wraps = labelRect.height > Number.parseFloat(globalThis.getComputedStyle(el).fontSize) * 1.6;
              return spills || wraps;
            })
            .map((el) => el.textContent),
        ),
      )
      .toEqual([]);
  });
});

test.describe("the current section on the mobile bar", () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test("a section behind the You tab takes a slot and is the one visible current tab, the tab it displaced reachable in the sheet", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "corpus" });
    await mount<typeof AppShellStory>(STORY, {});
    const bar = rail(page);
    await expect.poll(() => currentTabs(bar)).toEqual([SECTION_LABELS.corpus]);
    const standing = await reachableTabs(bar);
    expect(standing).toContain(SECTION_LABELS.corpus);

    // Standing in a section that already has a tab swaps nothing: it is that tab, and still the only current one.
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    await expect.poll(() => currentTabs(bar)).toEqual([SECTION_LABELS.chats]);
    const home = await reachableTabs(bar);
    expect(home).not.toContain(SECTION_LABELS.corpus);
    expect(home).toHaveLength(standing.length);
  });
});

test.describe("the You tab", () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test("speaks how many inbox rows are waiting, and nothing when none are", async ({ corpus, mount, page }) => {
    const caller = await root.internalCallerFor(root.ownerId);
    const inbox = await caller.notifications.list({});
    const rows = inbox.items.slice(0, WAITING_ROWS);
    expect(rows).toHaveLength(WAITING_ROWS);
    const viewer = await caller.sessions.me();
    const you = rail(page).getByRole("button", { name: YOU_TAB_LABEL, exact: true });
    // What the tab says about itself: the text of every node its description names; an id with no node says nothing.
    const description = (): Promise<string> =>
      you.evaluate((el) =>
        (el.getAttribute("aria-describedby") ?? "")
          .split(" ")
          .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim(),
      );
    /** The shell with an inbox of exactly `items`, mounted once its list has been read. */
    const mountWith = async (items: typeof rows): Promise<void> => {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, viewer.userId),
        ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES]),
        // Honors the page size the client asks for, as the server does.
        "notifications.list": (input) => ({ ...inbox, items: items.slice(0, input?.limit ?? items.length) }),
      });
      const read = page.waitForResponse((response) => response.url().includes("notifications.list"));
      await mount<typeof AppShellStory>(STORY, {});
      await read;
      await expect(you).toBeVisible();
    };

    await mountWith(rows.map((row) => ({ ...row, readAt: row.readAt ?? 1, actionable: false })));
    await expect.poll(description).toBe("");

    await mountWith(rows.map((row) => ({ ...row, readAt: null, actionable: false })));
    await expect.poll(description).toContain(String(WAITING_ROWS));
  });

  test("with its sheet open it is the one pressed tab while the section stays the page, and every close path gives the section its paint back", async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    const bar = rail(page);
    // The open sheet is modal, so it hides the bar from the accessibility tree; the tabs stay painted under its scrim.
    const tab = (name: string): Locator => bar.getByRole("button", { name, exact: true, includeHidden: true });
    const you = tab(YOU_TAB_LABEL);
    const chats = tab(SECTION_LABELS.chats);
    // A tab that is neither the page nor a door left open: the rest paint every unpressed tab wears.
    const resting = tab(SECTION_LABELS.characters);
    const sheet = page.getByRole("dialog");
    await expect(chats).toHaveAttribute("aria-current", "page");
    await expect(you).toHaveAttribute("aria-haspopup", "dialog");
    await expect(you).toHaveAttribute("aria-expanded", "false");
    const pressed = await paint(chats);
    const rest = await paint(resting);
    expect(pressed).not.toEqual(rest);
    // More than colour marks the pressed tab: a shape the resting tab does not draw.
    expect(rest.markHeight).toBeNull();
    expect(pressed.markHeight).toBeGreaterThan(0);

    /** The section's paint and the door's state once the sheet has gone, however it went. */
    const expectClosed = async (): Promise<void> => {
      await expect(sheet).toBeHidden();
      await expect(you).toHaveAttribute("aria-expanded", "false");
      await expect(you).not.toHaveAttribute("data-modal-open");
      await expect.poll(() => paint(chats)).toEqual(pressed);
      await expect.poll(() => paint(you)).toEqual(rest);
    };
    const open = async (): Promise<void> => {
      await you.tap();
      await expect(sheet).toBeVisible();
      await expect(you).toHaveAttribute("aria-expanded", "true");
      await expect(you).toHaveAttribute("data-modal-open");
      await expect(you).not.toHaveAttribute("aria-current");
      await expect(chats).toHaveAttribute("aria-current", "page");
      await expect.poll(() => paint(you)).toEqual(pressed);
      await expect.poll(() => paint(chats)).toEqual(rest);
    };

    // A second tap where the You tab sits lands on the sheet's scrim, which closes it.
    await open();
    const door = await you.boundingBox();
    if (door === null) {
      throw new Error("The You tab has no box");
    }
    await page.touchscreen.tap(door.x + door.width / 2, door.y + door.height / 2);
    await expectClosed();

    await open();
    await page.keyboard.press("Escape");
    await expectClosed();

    // A row that navigates closes the sheet too, and the section it opens takes the pressed paint.
    await open();
    await sheet.getByRole("button", { name: SECTION_LABELS.corpus, exact: true }).tap();
    await expect(sheet).toBeHidden();
    const corpus = tab(SECTION_LABELS.corpus);
    await expect(corpus).toHaveAttribute("aria-current", "page");
    await expect.poll(() => paint(corpus)).toEqual(pressed);
    await expect.poll(() => paint(you)).toEqual(rest);
  });
});

interface TabPaint {
  readonly background: string;
  readonly ink: string;
  /** The tab's shape mark, as tall as it paints; `null` when it draws none. */
  readonly markHeight: number | null;
}

/** The two colours and the mark a tab paints, as the browser resolved them. */
function paint(tab: Locator): Promise<TabPaint> {
  return tab.evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const mark = globalThis.getComputedStyle(el, "::before");
    return { background: style.backgroundColor, ink: style.color, markHeight: mark.content === "none" ? null : Number.parseFloat(mark.blockSize) };
  });
}
