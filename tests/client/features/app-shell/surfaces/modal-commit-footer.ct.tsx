// A registry modal that commits declares its submit on its definition, and ModalHost draws the footer from it: one footer,
// Cancel then the submit, in the dialog and in the drawer presentation. The submit's disabled and busy states are the
// body's, Cancel closes, and no body draws a footer of its own. The modals are the production Add document and imagine.
// @subject packages/client/src/features/app-shell/components/modal-host.tsx
import type { ModalDefinition } from "@orb/client/state";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { createShellAmbientReads, holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import {
  DATABANK_ADD_NAME,
  DATABANK_ADD_NAME_FIELD_NAME,
  DATABANK_ADD_TEXT_FIELD_NAME,
  DATABANK_CHOOSE_FILE_NAME,
  DATABANK_PASTE_TEXT_NAME,
} from "#client/features/databank/lib/databank-names.ts";
import { IMAGINE_GENERATE_NAME, IMAGINE_PROMPT_NAME } from "#client/features/imagery/lib/imagine-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { AppShellModalAsDrawerStory, AppShellModalStory } from "./_app-shell-stories.tsx";
import type { ImagineInShellAsDrawerStory, ImagineInShellStory } from "./_imagine-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const IMAGINE_STORIES = "tests/client/features/app-shell/surfaces/_imagine-shell-stories";
const FOOTER = '[data-slot="dialog-footer"]';
// Past Home: the Chats section, the reads both modal bodies make, and the shell's theme reads.
const SHELL_READS = [
  "sessions.me",
  "chat.listChats",
  "chat.countChats",
  "chat.getChat",
  "character.list",
  "rosterPreset.list",
  "databank.listGlobal",
  "worldInfo.listBooks",
  "settings.getUserSettings",
  "settings.listThemes",
  "settings.getTheme",
  "notifications.markAllRead",
  "plugin.list",
  "plugin.listSurfaces",
] as const;

type Presentation = NonNullable<ModalDefinition["presentation"]>;

const PRESENTATIONS: Record<Presentation, { readonly shell: string; readonly imagine: string; readonly popup: string }> = {
  dialog: { shell: `${SHELL_STORIES}/AppShellModalStory`, imagine: `${IMAGINE_STORIES}/ImagineInShellStory`, popup: '[data-slot="dialog-popup"]' },
  drawer: {
    shell: `${SHELL_STORIES}/AppShellModalAsDrawerStory`,
    imagine: `${IMAGINE_STORIES}/ImagineInShellAsDrawerStory`,
    popup: '[data-slot="drawer-popup"]',
  },
};

/** The popup's one footer holds exactly Cancel and then the submit. */
async function expectCommitFooter(page: Page, popup: string, submit: string): Promise<Locator> {
  const footers = page.locator(popup).locator(FOOTER);
  await expect(footers).toHaveCount(1);
  await expect(footers.getByRole("button")).toHaveText([DIALOG_VERBS.cancel, submit]);
  return footers.getByRole("button", { name: submit, exact: true });
}

for (const [presentation, stories] of Object.entries(PRESENTATIONS)) {
  test(`Add document's ${presentation} draws Cancel and the active arm's submit, with the arm's disabled and busy states`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const create = holdServed();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, SHELL_READS),
      // A landed document opens in the Databank, which reads the new row and the refreshed list.
      ...serveCorpusProcedures(caller, ["databank.get", "databank.list"]),
      ...serveCorpusProcedures(caller, ["databank.createFromText"], () => create),
    });
    await mount<typeof AppShellModalStory | typeof AppShellModalAsDrawerStory>(stories.shell, { modalId: "addDocument" });

    // The upload arm's commit is the pick, so its submit opens the picker.
    await expect(await expectCommitFooter(page, stories.popup, DATABANK_CHOOSE_FILE_NAME)).toBeEnabled();

    await page.getByRole("button", { name: DATABANK_PASTE_TEXT_NAME, exact: true }).click();
    const add = await expectCommitFooter(page, stories.popup, DATABANK_ADD_NAME);
    await expect(add).toBeDisabled();
    await page.getByRole("textbox", { name: DATABANK_ADD_NAME_FIELD_NAME, exact: true }).fill("House Valeroth");
    const text = page.getByRole("textbox", { name: DATABANK_ADD_TEXT_FIELD_NAME, exact: true });
    await text.fill("The bloodlines of the house.");
    await expect(add).toBeEnabled();
    // The arm's last field tabs to the footer in reading order, and Enter in a field submits the host's form.
    await page.keyboard.press("Tab");
    await expect(page.locator(stories.popup).locator(FOOTER).getByRole("button", { name: DIALOG_VERBS.cancel, exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(add).toBeFocused();
    await page.getByRole("textbox", { name: DATABANK_ADD_NAME_FIELD_NAME, exact: true }).press("Enter");
    await create.requested;
    await expect(add).toHaveAttribute("aria-busy", "true");
    await expect(add).toBeDisabled();
    create.release();
    await expect(page.locator(stories.popup)).toHaveCount(0);
  });

  test(`imagine's ${presentation} draws Cancel and Generate, Generate waits for a prompt, and Cancel closes`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const chatId = typeIdSchema(ID_PREFIX.chat).parse(corpus.reads["chat.listChats"][0]?.output.items[0]?.id);
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SHELL_READS);
    await mount<typeof ImagineInShellStory | typeof ImagineInShellAsDrawerStory>(stories.imagine, { seed: { chatId, mode: "free", prompt: "" } });

    const generate = await expectCommitFooter(page, stories.popup, IMAGINE_GENERATE_NAME);
    await expect(generate).toBeDisabled();
    await page.getByRole("textbox", { name: IMAGINE_PROMPT_NAME, exact: true }).fill("A lantern over a harbour");
    await expect(generate).toBeEnabled();
    await page.locator(stories.popup).locator(FOOTER).getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
    await expect(page.locator(stories.popup)).toHaveCount(0);
  });
}
