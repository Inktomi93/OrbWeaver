// @subject packages/client/src/components/context-tab-body.tsx
// @subject packages/client/src/features/app-shell/components/context-bracket.tsx
// Every CONTEXT tab a room or a character registers lays its body in the one CONTEXT column, with one scroll owner. Opening each tab in turn,
// the open panel scrolls on the block axis in at most one box and on the inline axis in none, so no body nests a second scroller under the
// bracket's or pushes a row sideways out of the pane.

import { seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { AppShellCharacterStory, AppShellRoomStory } from "./_app-shell-stories.tsx";
import { namedGroupRoom, routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const CONTEXT = '.shell-panel[data-panel-side="context"]';
// The reads the room's and the character's CONTEXT tabs make once each is open, beyond what the open room reads.
const CONTEXT_READS = [
  "worldInfo.listForCharacter",
  "character.listSnapshots",
  "automation.listRules",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "chat.listEffectiveRegex",
  "chat.listForks",
  "chat.memoryView",
  "chat.previewAssembly",
  "chat.getShapeTrace",
] as const;
const SERVED = [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...CONTEXT_READS] as const;
// A control that scrolls its own window (a grid, a listbox, a text field) is that control's scroller, not a second scroller of the body.
const CONTROL_ROLES = ["grid", "listbox", "tree", "treegrid", "textbox", "log"] as const;

interface Scrollers {
  readonly block: readonly string[];
  readonly inline: readonly string[];
}

// The boxes in the open panel that scroll now, on each axis: an overflow that clips and content past the box. A box that could scroll but
// whose content fits moves nothing, so it is no second owner.
function scrollersIn(panel: Locator): Promise<Scrollers> {
  return panel.evaluate(
    (root, controls) => {
      const describe = (el: Element): string => `${el.tagName.toLowerCase()}[${el.getAttribute("data-slot") ?? el.getAttribute("data-testid") ?? ""}]`;
      const scrolls = (value: string): boolean => value === "auto" || value === "scroll";
      const boxes = [root, ...root.querySelectorAll("*")].filter((el) => !controls.includes(el.getAttribute("role") ?? ""));
      return {
        block: boxes.filter((el) => scrolls(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1).map(describe),
        inline: boxes.filter((el) => scrolls(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1).map(describe),
      };
    },
    [...CONTROL_ROLES],
  );
}

/** Opens every tab of the pane's strip in turn and checks the panel it names; returns how many tabs it opened. */
async function everyTabScrollsInOneBox(page: Page): Promise<number> {
  const pane = page.locator(CONTEXT);
  const strip = pane.getByRole("tablist").first();
  const tabs = strip.getByRole("tab");
  await expect(tabs.first()).toBeVisible();
  const count = await tabs.count();
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    const label = (await tab.textContent())?.trim() ?? String(index);
    await tab.dispatchEvent("click");
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const id = await tab.getAttribute("id");
    if (id === null) {
      throw new Error(`The ${label} tab carries no id for its panel to name it by`);
    }
    const panel = pane.locator(`[role="region"][aria-labelledby="${id}"]`);
    await expect(panel).toBeVisible();
    await expect(panel.locator("[aria-busy='true']")).toHaveCount(0);
    const found = await scrollersIn(panel);
    expect(found.block.length, `${label} scrolls in ${found.block.join(", ")}`).toBeLessThanOrEqual(1);
    expect(found.inline, `${label} scrolls sideways`).toEqual([]);
  }
  return count;
}

test.use({ viewport: { width: 1600, height: 600 } });

test("every tab a room registers scrolls in one box and never sideways", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const room = namedGroupRoom((await caller.chat.listChats({ limit: 100 })).items);
  await routeShell(page, corpus, caller, SERVED);
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "docked" } } });
  await mount<typeof AppShellRoomStory>(`${SHELL_STORIES}/AppShellRoomStory`, { chatId: room.id });
  expect(await everyTabScrollsInOneBox(page)).toBeGreaterThan(1);
});

test("every tab a character registers scrolls in one box and never sideways", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [character] = (await caller.character.list({})).items;
  if (character === undefined) {
    throw new Error("The corpus has no character");
  }
  await routeShell(page, corpus, caller, SERVED);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "collapsed", context: "docked" } } });
  await mount<typeof AppShellCharacterStory>(`${SHELL_STORIES}/AppShellCharacterStory`, { characterId: character.id });
  expect(await everyTabScrollsInOneBox(page)).toBeGreaterThan(1);
});
