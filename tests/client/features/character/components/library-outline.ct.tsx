import { createCharacterSchema } from "@orb/contracts/character";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, createFirstBootHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const STATES = [
  { kind: "empty", heading: "No characters yet" },
  { kind: "fresh", heading: "Meet your characters" },
  { kind: "resume", heading: "Pick up where you left off" },
] as const;
const REGIMES = [
  { name: "desktop", viewport: { width: 1440, height: 1000 }, coarse: false },
  { name: "phone", viewport: { width: 390, height: 844 }, coarse: true },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });

    for (const state of STATES) {
      test(`${state.kind} library exposes its main heading and nested shelves without changing their typography`, async ({ page, corpus, mount }, testInfo) => {
        await using root = state.kind === "resume" ? await createCorpusHarness(undefined, { startJobs: false }) : await createFirstBootHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        if (state.kind === "fresh") {
          await caller.character.create({
            input: createCharacterSchema.parse({
              handle: "library-outline-archivist",
              name: "The observatory archivist",
              description: "A newly created character without a conversation or a favorite mark.",
            }),
          });
        }
        await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
        await routeTrpc(page, {
          ...serveCorpusProcedures(caller, [
            ...SECTION_PROCEDURES,
            "tag.listTagFilterVocabulary",
            "persona.list",
            "rosterPreset.count",
            "databank.bankHealth",
            "notifications.list",
            "plugin.listCommands",
            "automation.listRulePresets",
            "chat.getChat",
            "chat.reapTemporaryChats",
          ]),
        });
        await seedShellState(page, {
          activeSection: "characters",
          panelOverrides: { characters: { list: regime.coarse ? "collapsed" : "docked", context: "collapsed" } },
        });
        await mount<typeof ShellAmbientStory>(STORY, {});
        if (regime.coarse) {
          await page.getByRole("button", { name: "Show Characters overview", exact: true }).click();
        }
        const content = page.getByRole("main", { name: "Characters content", exact: true });
        await expect(content.getByRole("heading", { name: state.heading, exact: true })).toBeVisible();
        const mainHeading = content.getByRole("heading", { name: state.heading, level: 1, exact: true });
        await expect(mainHeading).toBeVisible();
        await expect(content.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(mainHeading).toHaveCSS("font-size", `${await resolvedLength(page, `var(${TOKENS["text.title"].cssVar})`)}px`);
        await expect(content.getByRole("heading", { name: "Recently chatted", level: 2, exact: true })).toHaveCount(Number(state.kind === "resume"));
        const shelfHeadings = content.getByRole("heading", { level: 2 });
        for (const shelf of await shelfHeadings.all()) {
          await expect(shelf).toHaveCSS("font-size", `${await resolvedLength(page, `var(${TOKENS["text.micro"].cssVar})`)}px`);
          await expect(shelf).toHaveCSS("text-transform", "uppercase");
        }
        await expect(content.getByRole("heading", { level: 3 })).toHaveCount(0);
        const screenshot = testInfo.outputPath("library-outline.png");
        await page.screenshot({ path: screenshot });
        await testInfo.attach("library-outline", { path: screenshot, contentType: "image/png" });
      });
    }
  });
}
