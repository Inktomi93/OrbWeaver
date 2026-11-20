// @subject packages/client/src/features/chat/components/chat-summary-row.tsx
// @subject packages/ui/src/primitives/list-row/list-row.tsx
// A chats-list row's actions lie over the end of its text on a fine pointer, by design: the row's body and its actions both declare
// that one overlay. The design audit's obscured-target rule reads the declaration, so the stamp and the subtitle under a revealed
// star and kebab are counted as a declared overlay, not reported as a press landing on a button. Where the actions stay in the row
// (a touch pointer) nothing lies over anything and nothing is counted.
// The rows are the production Chats list of the real shell, over rooms a real server holds.

import type { ShellAmbientStory } from "@orb/testkit/browser";
import { readSurfaceDesignAudit, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHAT_LIST_NAME, chatRowActionsName } from "#client/features/chat/lib/chat-surface-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const OBSCURED_TARGET = "obscured-target";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

interface ListedRow {
  readonly row: Locator;
  readonly actions: Locator;
}

/** Mount the shell on the Chats section over the owner's rooms and name the first row and its actions button. */
async function mountChatsList(root: Root, corpus: CorpusPlayback, page: Page, mountShell: () => Promise<unknown>): Promise<ListedRow> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES]) });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "collapsed" } } });
  await mountShell();
  const row = page.getByRole("list", { name: CHAT_LIST_NAME, exact: true }).locator('[data-slot="list-row-root"]').first();
  await expect(row).toBeVisible();
  return { row, actions: row.getByRole("button", { name: chatRowActionsName("") }) };
}

/** What the design audit says about a control sitting over painted text: its findings, how many subjects it judged, and how many it
 *  accounts as a declared overlay. */
async function obscuredTargets(page: Page): Promise<{
  readonly findings: readonly string[];
  readonly judged: number;
  readonly declared: number;
}> {
  const { audit, samples } = await readSurfaceDesignAudit(page);
  const accounting = samples.relationalAccounting?.[OBSCURED_TARGET];
  return {
    findings: audit.findings.filter(({ rule }) => rule === OBSCURED_TARGET).map(({ selector, value }) => `${selector}: ${value}`),
    judged: accounting?.judged ?? 0,
    declared: accounting?.excluded["declaredOverlay"] ?? 0,
  };
}

const ARRIVALS = [
  { name: "hover", reach: async (row: Locator): Promise<void> => await row.hover() },
  { name: "focus", reach: async (row: Locator): Promise<void> => await row.getByRole("button").first().focus() },
] as const;

test.describe("a fine pointer", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const { name, reach } of ARRIVALS) {
    test(`a row's actions revealed by ${name} lie over its text and the design audit counts that as a declared overlay`, async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const { row, actions } = await mountChatsList(root, corpus, page, () => mount<typeof ShellAmbientStory>(STORY, {}));
      await reach(row);
      await expect(actions).toHaveCSS("opacity", "1");
      const audit = await obscuredTargets(page);
      expect(audit.findings).toEqual([]);
      expect(audit.declared, "the revealed actions must be counted over the row's text, or the silence proves nothing").toBeGreaterThan(0);
    });
  }
});

test.describe("a touch pointer on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a row's actions stay beside its text, so the design audit finds and counts nothing under them", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const { row, actions } = await mountChatsList(root, corpus, page, () => mount<typeof ShellAmbientStory>(STORY, {}));
    await expect(actions).toHaveCSS("opacity", "1");
    await expect(row.locator('[data-slot="list-row-meta"]')).toBeVisible();
    const audit = await obscuredTargets(page);
    expect(audit.findings).toEqual([]);
    expect(audit.judged, "the audit must have judged subjects on this surface").toBeGreaterThan(0);
    expect(audit.declared).toBe(0);
  });
});
