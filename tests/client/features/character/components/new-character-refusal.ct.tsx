// A name refusal the New-character dialog can no longer show is still said, by the toast.
import { CHARACTER_HANDLE_CONFLICT_OP_CODE } from "@orb/contracts/character";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHARACTER_DESCRIPTION_FIELD_NAME, CHARACTER_NAME_FIELD_NAME, CHARACTER_NEW_NAME } from "#client/features/character/lib/character-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const READ_PROCEDURES = [...SECTION_PROCEDURES, "tag.listTagFilterVocabulary"] as const;
const TAKEN = "Held name";
const settle = (): Promise<void> => new Promise<void>((done) => setTimeout(done, 400));

type Corpus = Parameters<typeof createShellAmbientReads>[0];
type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;

interface HeldRefusal {
  readonly requested: Promise<void>;
  readonly land: () => void;
}

/** A create the server refuses for a taken handle with its coded reason, answered only when the test lets it land. */
async function heldHandleRefusal(root: Harness, page: Page, corpus: Corpus): Promise<HeldRefusal> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  const hold = trpcHold<"character.create">();
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, READ_PROCEDURES),
    "character.create": (input) => (input.input.name === TAKEN ? hold : trpcError({ code: "BAD_REQUEST" })),
  });
  return { requested: hold.requested, land: (): void => hold.release(trpcError({ code: "CONFLICT", reason: CHARACTER_HANDLE_CONFLICT_OP_CODE })) };
}

async function submitTakenName(page: Page, held: HeldRefusal): Promise<void> {
  await page.getByRole("button", { name: CHARACTER_NEW_NAME, exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: CHARACTER_NAME_FIELD_NAME, exact: true }).fill(TAKEN);
  await dialog.getByRole("textbox", { name: CHARACTER_DESCRIPTION_FIELD_NAME, exact: true }).fill("A second card.");
  await dialog.getByRole("button", { name: /^Create$/u }).click();
  await held.requested;
}

test("a name refusal that lands after Cancel is still said, by the toast", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const held = await heldHandleRefusal(root, page, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await submitTakenName(page, held);

  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  held.land();
  await expect(page.getByRole("region", { name: "Alerts", exact: true }).getByRole("alert")).toHaveCount(1);
});

test("a name refusal that lands after the name was edited is still said, by the toast", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const held = await heldHandleRefusal(root, page, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await submitTakenName(page, held);

  await page.getByRole("dialog").getByRole("textbox", { name: CHARACTER_NAME_FIELD_NAME, exact: true }).fill(`${TAKEN} two`);
  await page.evaluate(settle);
  held.land();
  await expect(page.getByRole("region", { name: "Alerts", exact: true }).getByRole("alert")).toHaveCount(1);
});

test("a name refusal that lands while the dialog still shows it is said once, in the dialog", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const held = await heldHandleRefusal(root, page, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await submitTakenName(page, held);

  held.land();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Alerts", exact: true }).getByRole("alert")).toHaveCount(0);
});
