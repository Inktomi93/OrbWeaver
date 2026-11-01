// The rail on a phone is the mobile bar: tab labels ride the label step and fit the narrowest bar, the current
// section always holds exactly one visible tab, Home is one affordance at every width, and the You tab speaks the
// count of what its sheet hosts.
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
    const you = rail(page).getByRole("button", { name: "You", exact: true });
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
});
