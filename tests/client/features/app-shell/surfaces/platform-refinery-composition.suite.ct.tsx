import { testId } from "@orb/client/lib";
import type { CreateCharacterInput } from "@orb/contracts/character";
import { createCharacterSchema } from "@orb/contracts/character";
import type { RefinableField } from "@orb/contracts/refinery";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { RefineryCompositionShellStory } from "./_refinery-composition-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
const STORY = "tests/client/features/app-shell/surfaces/_refinery-composition-stories/RefineryCompositionShellStory";
const CARD_NAME = "Lantern keeper";
const ORIGINAL_DESCRIPTION = "Keeps the observatory lantern lit for {{user}}.";
const ORIGINAL_GREETING = "Welcome to the observatory, {{user}}.";
const PINNED_TEXT = {
  description: ORIGINAL_DESCRIPTION,
  personality: "Careful, reserved, and quietly curious.",
  scenario: "The observatory waits through the northern winter.",
  exampleMessages: "{{char}}: The lantern is yours to carry.",
  systemPrompt: "Keep {{char}} in the observatory.",
  postHistoryInstructions: "Leave {{user}} free to choose the next step.",
  creatorNotes: "The keeper speaks softly when the lantern dims.",
} satisfies Record<Exclude<RefinableField, "greetings" | "depthPrompt">, string>;
const ORIGINAL_DEPTH_NOTE = "The keeper watches the northern sky.";
const LONG_DESCRIPTION = `${ORIGINAL_DESCRIPTION} ${"The lantern casts a warm circle across the charts while snow gathers against the observatory windows. ".repeat(16)}`;
const LONG_GREETING = `${ORIGINAL_GREETING} ${"Bring your charts to the lantern and tell me what the northern sky revealed on your journey. ".repeat(16)}`;
const SESSION_NAME = "North observatory revision";
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const REGIMES = [
  { name: "wide desktop", viewport: { width: 1440, height: 900 }, coarse: false, enlarged: false, narrowIdentity: false },
  { name: "narrow desktop enlarged", viewport: { width: 800, height: 900 }, coarse: false, enlarged: true, narrowIdentity: true },
  { name: "coarse portrait", viewport: { width: 390, height: 844 }, coarse: true, enlarged: false, narrowIdentity: true },
  { name: "coarse landscape", viewport: { width: 844, height: 390 }, coarse: true, enlarged: false, narrowIdentity: false },
] as const;

async function seedSession(
  caller: Caller,
  name: string | null,
  anchor: Pick<CreateCharacterInput, "description" | "greetings"> = { description: ORIGINAL_DESCRIPTION, greetings: [{ text: ORIGINAL_GREETING }] },
): Promise<Awaited<ReturnType<Caller["refinery"]["startSession"]>>> {
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  const card = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "refinery-composition",
      name: CARD_NAME,
      ...PINNED_TEXT,
      ...anchor,
      depthPrompt: { prompt: ORIGINAL_DEPTH_NOTE, depth: 4, role: "system" },
    }),
  });
  return await caller.refinery.startSession({ characterId: card.id, name });
}

async function expectIdentity(masthead: Locator, title: string, deferred: boolean): Promise<void> {
  // The outline and the painted identity are separate obligations when the shell owns the title.
  await expect(masthead.getByRole("heading", { level: 2, name: CARD_NAME, exact: true })).toHaveCount(1);
  const facts = await masthead.evaluate((node, name) => {
    const range = document.createRange();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const painted: number[] = [];
    while (walker.nextNode()) {
      if (walker.currentNode.textContent !== name) {
        continue;
      }
      range.selectNodeContents(walker.currentNode);
      const boxes = Array.from(range.getClientRects());
      const parent = walker.currentNode.parentElement;
      if (parent !== null && !parent.classList.contains("sr-only")) {
        painted.push(...boxes.filter((box) => box.width > 1 && box.height > 1).map((box) => box.width));
      }
    }
    return painted;
  }, CARD_NAME);
  await test.info().attach("masthead-card-identity-paint", { body: JSON.stringify({ title, deferred, facts }), contentType: "application/json" });
  expect(facts.length).toBe(deferred ? 0 : 1);
  await expect(masthead.getByRole("group", { name: "Session state", exact: true })).toBeVisible();
  await expect(masthead.getByRole("button", { name: `Open card ${CARD_NAME} in the Characters section`, exact: true })).toBeVisible();
  await expect(masthead.getByRole("button", { name: "Edit scope", exact: true })).toBeVisible();
  await expect(masthead.getByRole("group", { name: "Scope", exact: true })).toBeVisible();
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    for (const named of [false, true]) {
      test(`${named ? "named" : "unnamed"} session gives card identity to its actual shell budget`, async ({ corpus, page, mount }) => {
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        const name = named ? SESSION_NAME : null;
        const session = await seedSession(caller, name);
        if (regime.enlarged) {
          await caller.settings.updateUserSettingsSection({ section: "appearance", patch: ENLARGED_APPEARANCE_SETTINGS });
        }
        await routeTrpc(page, {
          ...createShellAmbientReads(corpus),
          ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "refinery.getSession", "refinery.listRuns", "refinery.preflight"]),
        });
        await seedShellState(page, {
          activeSection: "refinery",
          panelOverrides: { refinery: { list: "collapsed", context: "collapsed" } },
        });
        await mount<typeof RefineryCompositionShellStory>(STORY, { sessionId: session.id });
        const masthead = page.getByTestId(testId("refineryMasthead"));
        await expect(masthead).toBeVisible();
        const narrowTitle = page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title');
        await expect(narrowTitle).toHaveText(name ?? CARD_NAME);
        const expectBudget = regime.narrowIdentity ? expectNarrow : expectWide;
        await expectBudget(narrowTitle);
        await expectIdentity(masthead, name ?? CARD_NAME, !named && regime.narrowIdentity);
        await page.screenshot({ path: test.info().outputPath(`${named ? "named" : "unnamed"}-session.png`) });
      });
    }

    test("empty Runs returns keyboard focus to the existing Score owner without running it", async ({ corpus, page, mount }) => {
      await page.setViewportSize({ width: regime.viewport.width, height: 390 });
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const session = await seedSession(caller, null);
      await caller.refinery.updateSession({
        sessionId: session.id,
        patch: {
          guidance: [
            "Preserve the observatory setting.",
            "Keep the lantern keeper's reserve.",
            "Retain the greeting's invitation.",
            "Use concrete sensory details.",
            "Leave the reader's choices open.",
            "Keep the original voice throughout.",
          ].join("\n"),
        },
      });
      if (regime.enlarged) {
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: ENLARGED_APPEARANCE_SETTINGS });
      }
      let runRequests = 0;
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus),
        ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "refinery.getSession", "refinery.listRuns", "refinery.preflight"]),
        ...serveCorpusProcedures(caller, ["refinery.runStage"], () => {
          runRequests += 1;
          return trpcError({ code: "BAD_REQUEST", message: "Navigating to Score must not run a model" });
        }),
      });
      await seedShellState(page, { activeSection: "refinery", panelOverrides: { refinery: { list: "collapsed", context: "collapsed" } } });
      await mount<typeof RefineryCompositionShellStory>(STORY, { sessionId: session.id });
      const masthead = page.getByTestId(testId("refineryMasthead"));
      await expect(masthead).toBeVisible();
      const owner = page.locator('[data-lane-run="score"]').getByRole("button", { name: "Run score", exact: true });
      await expect(owner).toBeEnabled();
      const scrolled = await owner.evaluate((node) => {
        let port = node.parentElement;
        while (port !== null && !(getComputedStyle(port).overflowY === "auto" && port.scrollHeight > port.clientHeight)) {
          port = port.parentElement;
        }
        if (port === null) {
          throw new Error("The workbench has no scrollable content owner");
        }
        port.scrollTop = port.scrollHeight;
        return { top: port.scrollTop, maximum: port.scrollHeight - port.clientHeight, height: port.clientHeight };
      });
      await test.info().attach("workbench-away-from-score", { body: JSON.stringify(scrolled), contentType: "application/json" });
      expect(scrolled.top).toBeGreaterThan(0);
      expect(scrolled.top).toBe(scrolled.maximum);
      await expect(owner).not.toBeInViewport();
      await page.getByRole("button", { name: "Show details", exact: true }).click();
      const context = page.locator(CONTEXT);
      await expect(context.getByRole("tab", { name: "Runs", exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(context.getByText("No runs yet", { exact: true })).toBeVisible();
      const go = context.getByRole("button", { name: "Go to Score", exact: true });
      await expect(go).toBeVisible();
      await go.focus();
      await page.keyboard.press("Enter");
      await expect(owner).toBeFocused();
      await expect(owner).toBeInViewport({ ratio: 1 });
      await expect(page.locator("main.shell-content")).not.toHaveAttribute("inert", "");
      expect(runRequests).toBe(0);
      expect(await caller.refinery.listRuns({ sessionId: session.id })).toEqual([]);
      await expect(owner).toBeEnabled();
    });

    test("Setup views the pinned original without substituting or writing the changed live card", async ({ corpus, page, mount }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const session = await seedSession(caller, null, { description: LONG_DESCRIPTION, greetings: [{ text: LONG_GREETING }] });
      const before = await caller.refinery.getSession({ sessionId: session.id });
      const liveDescription = "The live card now keeps a different lantern.";
      await caller.character.update({ characterId: session.characterId, input: { description: liveDescription, greetings: [{ text: "A live greeting." }] } });
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus),
        ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "refinery.getSession", "refinery.listRuns", "refinery.preflight", "refinery.listSchemas"]),
      });
      await seedShellState(page, { activeSection: "refinery", panelOverrides: { refinery: { list: "collapsed", context: "collapsed" } } });
      await mount<typeof RefineryCompositionShellStory>(STORY, { sessionId: session.id });
      await expect(page.getByTestId(testId("refineryMasthead"))).toBeVisible();
      await page.getByRole("button", { name: "Show details", exact: true }).click();
      const context = page.locator(CONTEXT);
      await context.getByRole("tab", { name: "Setup", exact: true }).click();
      const view = context.getByRole("button", { name: "View Original card", exact: true });
      await expect(view).toBeVisible();
      await view.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Original card — pinned at session start", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading", { name: CARD_NAME, exact: true })).toBeVisible();
      for (const text of Object.values({ ...PINNED_TEXT, description: LONG_DESCRIPTION })) {
        const paragraph = dialog.getByText(text, { exact: true });
        await expect(paragraph).toBeVisible();
        await expectOriginalMeasure(paragraph, regime.name === "wide desktop");
      }
      const greeting = dialog.getByText(LONG_GREETING, { exact: true });
      await expect(greeting).toBeVisible();
      await expectOriginalMeasure(greeting);
      const depthNote = dialog.getByText(ORIGINAL_DEPTH_NOTE, { exact: true });
      await expect(depthNote).toBeVisible();
      await expectOriginalMeasure(depthNote);
      await expectOriginalMeasure(
        dialog.getByText("Read-only authored fields pinned when this session started. Macros are shown as written.", { exact: true }),
      );
      for (const paragraph of [dialog.getByText(LONG_DESCRIPTION, { exact: true }), greeting]) {
        const lines = await paragraph.evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getClientRects().length;
        });
        expect(lines).toBeGreaterThan(1);
      }
      await expect(dialog.getByText("Depth 4 · system", { exact: true })).toBeVisible();
      await expect(dialog.getByText(liveDescription, { exact: true })).toHaveCount(0);
      await expect(dialog.getByRole("textbox")).toHaveCount(0);
      const close = dialog.getByRole("button", { name: "Close", exact: true });
      await expect(close).toBeEnabled();
      await close.click();
      await expect(dialog).toBeHidden();
      await expect(view).toBeFocused();
      await expect(context.getByText("Pinned at session start · 1 greeting", { exact: true })).toBeVisible();
      expect((await caller.refinery.getSession({ sessionId: session.id })).originalCard).toEqual(before.originalCard);
      expect((await caller.character.get({ characterId: session.characterId })).description).toBe(liveDescription);
      expect(await caller.refinery.listRuns({ sessionId: session.id })).toEqual([]);
    });
  });
}

test.describe("explicitly named equal to the card", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("preserves the card heading because the session is named, not because the strings differ", async ({ corpus, page, mount }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const session = await seedSession(caller, CARD_NAME);
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "refinery.getSession", "refinery.listRuns", "refinery.preflight"]),
    });
    await seedShellState(page, { activeSection: "refinery", panelOverrides: { refinery: { list: "collapsed", context: "collapsed" } } });
    await mount<typeof RefineryCompositionShellStory>(STORY, { sessionId: session.id });
    const masthead = page.getByTestId(testId("refineryMasthead"));
    await expect(masthead).toBeVisible();
    await expect(page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title')).toHaveText(CARD_NAME);
    await expectIdentity(masthead, CARD_NAME, false);
  });
});

async function expectNarrow(title: Locator): Promise<void> {
  await expect(title).toBeVisible();
}
async function expectWide(title: Locator): Promise<void> {
  await expect(title).toBeHidden();
}

async function expectOriginalMeasure(paragraph: Locator, widerHost = false): Promise<void> {
  const measure = await resolvedLength(paragraph.page(), "var(--reading-measure-prose)", paragraph);
  const facts = await paragraph.evaluate((node) => {
    const parent = node.parentElement;
    if (parent === null) {
      throw new Error("The original-card paragraph has no layout owner");
    }
    const style = getComputedStyle(parent);
    return {
      width: node.getBoundingClientRect().width,
      available: parent.clientWidth - Number.parseFloat(style.paddingInlineStart) - Number.parseFloat(style.paddingInlineEnd),
    };
  });
  await test.info().attach("original-paragraph-measure", { body: JSON.stringify({ ...facts, measure }), contentType: "application/json" });
  expect(measure).toBeGreaterThan(0);
  expect(facts.available).toBeGreaterThan(widerHost ? measure : 0);
  expect(facts.width).toBeLessThanOrEqual(Math.min(measure, facts.available) + 1);
  expect(facts.width).toBeGreaterThanOrEqual(Math.min(measure, facts.available) - 1);
}
