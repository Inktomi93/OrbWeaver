// Each shell modal is opened the way a keyboard user opens it in production, and focus lands on the element the modal gives its arrival:
// the dialog's body anchor, or the drawer on a phone, never the page body and never Close. A modal whose one task is a field lands on
// that field: the re-auth prompt on its password (its handle when none is prefilled), the imagine dialog on its prompt and the image
// edit dialog on its instruction. The re-auth prompt has no human opener, so the production event that raises it opens it: a read the
// server refuses as signed out. Everything past the browser is a real corpus root answering through its own caller.
// @subject packages/client/src/features/app-shell/components/modal-host.tsx
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MESSAGE_TOOLS_LABEL, testId, YOU_TAB_LABEL } from "@orb/client/lib";
import type { ModalSlotId } from "@orb/client/state";
import { MODAL_SLOT_IDS } from "@orb/client/state";
import { blobUrl } from "@orb/contracts/assets";
import { authConfigSchema } from "@orb/contracts/auth-config";
import { createCharacterSchema } from "@orb/contracts/character";
import type { CharacterHandle, ChatId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import {
  createShellAmbientReads,
  ROOM_PROCEDURES,
  routeAuthConfig,
  routeTrpc,
  SECTION_LABELS,
  SECTION_PROCEDURES,
  SHELL_MOUNT_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  captureCookieAuth,
  createCorpusHarness,
  createCorpusProviderExecution,
  makeAssetBytes,
  seedAsset,
} from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { REAUTH_MODAL_TITLE } from "#client/features/auth/lib/reauth-names.ts";
import { COMMAND_MODAL_TITLE } from "#client/features/chat/lib/command-palette-names.ts";
import { COMPOSER_IMAGINE_NAME } from "#client/features/chat/lib/composer-menu-names.ts";
import { DATABANK_ADD_DOCUMENT_TITLE, DATABANK_ADD_NAME } from "#client/features/databank/lib/databank-names.ts";
import {
  IMAGE_DETAIL_TITLE,
  IMAGE_EDIT_INSTRUCTION_NAME,
  IMAGE_EDIT_NAME,
  IMAGINE_DIALOG_TITLE,
  IMAGINE_PROMPT_NAME,
} from "#client/features/imagery/lib/imagine-names.ts";
import { ROSTER_ALL_NAME, ROSTER_SAVED_NAME } from "#client/features/roster-preset/lib/roster-names.ts";
import { dialogBodyAnchor, drawerPopup } from "../../../components/_dialog-landing.ts";
import type { AppShellRecoveringStory, AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import { PHONE, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const RECOVERING_STORY = `${SHELL_STORIES}/AppShellRecoveringStory`;
const DATABANK_READS = [...SECTION_PROCEDURES, "databank.bankHealth", "databank.listGlobal", "databank.listAttachments", "databank.get"] as const;
const ROOM_READS = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  ...ROOM_PROCEDURES,
  "plugin.list",
  "plugin.listSurfaces",
  "assets.resolveChatBlobRefs",
  "imagery.readProvenance",
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const MODALS_FILE = "tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx";
const LANDING_FILE = "tests/client/features/app-shell/surfaces/modal-keyboard-landing.ct.tsx";
const PLUGIN_LANDING_FILE = "tests/client/features/plugin/components/plugin-modal-keyboard-landing.ct.tsx";
/** The test file that opens each modal by its production opener and asserts where focus lands, so a new modal id fails `tsc` until it names one. */
const LANDING_PROVED_IN = {
  command: "tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx",
  newChat: MODALS_FILE,
  you: LANDING_FILE,
  addDocument: LANDING_FILE,
  reauth: LANDING_FILE,
  imagine: LANDING_FILE,
  imageDetail: LANDING_FILE,
  imageEdit: LANDING_FILE,
  pluginDialog: PLUGIN_LANDING_FILE,
  pluginCommandArgs: PLUGIN_LANDING_FILE,
  savedRosters: LANDING_FILE,
} as const satisfies Record<ModalSlotId, string>;

test("every shell modal names a landing test file that exists", async () => {
  const repoRoot = new URL("../../../../../", import.meta.url);
  for (const file of new Set(Object.values(LANDING_PROVED_IN))) {
    await access(fileURLToPath(new URL(file, repoRoot)));
  }
  expect(Object.keys(LANDING_PROVED_IN).sort()).toEqual([...MODAL_SLOT_IDS].sort());
});

function dialogNamed(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name, exact: true });
}

/** Presses a control with the keyboard alone: focus it, then Enter. */
async function pressByKeyboard(control: Locator): Promise<void> {
  await control.focus();
  await control.press("Enter");
}

test("Add on the Databank list opens Add a document with focus on its body", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, DATABANK_READS) });
  await seedShellState(page, { activeSection: "databank" });
  await mount<typeof AppShellStory>(STORY, {});

  await pressByKeyboard(page.getByRole("button", { name: DATABANK_ADD_NAME, exact: true }).first());

  await expect(dialogNamed(page, DATABANK_ADD_DOCUMENT_TITLE)).toBeVisible();
  await expect(dialogBodyAnchor(page)).toBeFocused();
});

test("All rosters on Home opens the saved rosters with focus on its body", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "rosterPreset.count", "rosterPreset.list"]),
  });
  await mount<typeof AppShellStory>(STORY, {});

  await pressByKeyboard(page.getByRole("button", { name: ROSTER_ALL_NAME, exact: true }));

  await expect(dialogNamed(page, ROSTER_SAVED_NAME)).toBeVisible();
  await expect(dialogBodyAnchor(page)).toBeFocused();
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test("the You tab opens the You sheet with focus on the sheet", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "notifications.markAllRead", "plugin.list", "plugin.listSurfaces"]),
    });
    await mount<typeof AppShellStory>(STORY, {});

    await pressByKeyboard(page.locator(".shell-rail").getByRole("button", { name: YOU_TAB_LABEL, exact: true }));

    await expect(dialogNamed(page, YOU_TAB_LABEL)).toBeVisible();
    await expect(drawerPopup(page)).toBeFocused();
    // The sheet takes focus as a whole, so it announces arrival without the browser's own ring around the whole sheet.
    expect(await drawerPopup(page).evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("none");
  });

  test("a You sheet row that opens another modal replaces the sheet, and focus lands in the new modal", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "notifications.markAllRead", "plugin.list", "plugin.listSurfaces"]),
    });
    await mount<typeof AppShellStory>(STORY, {});
    await pressByKeyboard(page.locator(".shell-rail").getByRole("button", { name: YOU_TAB_LABEL, exact: true }));
    await expect(drawerPopup(page)).toBeFocused();

    await pressByKeyboard(dialogNamed(page, YOU_TAB_LABEL).getByRole("button", { name: COMMAND_MODAL_TITLE, exact: true }));

    const replacement = dialogNamed(page, COMMAND_MODAL_TITLE);
    await expect(replacement).toBeVisible();
    await expect(dialogNamed(page, YOU_TAB_LABEL)).toHaveCount(0);
    // The palette places its own arrival on its search; the host's anchor is the floor when a body places none.
    await expect(replacement.locator(":focus")).toHaveCount(1);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });
});

const REAUTH_ARRIVALS = [
  { name: "its password when the handle is prefilled", discreet: false, field: "loginPassword" },
  { name: "its handle when discreet login leaves none prefilled", discreet: true, field: "loginHandle" },
] as const;

for (const { name, discreet, field } of REAUTH_ARRIVALS) {
  test(`a session the server refuses as signed out opens the re-auth prompt with focus on ${name}`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    const signedOut = await (await root.http.request("/api/auth/me")).text();
    const served = authConfigSchema.parse(JSON.parse(await (await root.http.request("/api/auth/config")).text()));
    const config = JSON.stringify(discreet ? { ...served, discreetLogin: true, defaultHandle: null } : served);
    let expired = false;
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
      ...serveCorpusProcedures(caller, ["chat.listChats"], () => (expired ? trpcError({ code: "UNAUTHORIZED" }) : undefined)),
    });
    await routeAuthConfig(page, config);
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({ contentType: "application/json", body: signedOut });
    });
    await mount<typeof AppShellRecoveringStory>(RECOVERING_STORY, {});
    await expect(page.locator(".shell-rail")).toBeVisible();

    // The Chats read is the production event: the refusal enters the recovery ladder, which finds the session dead and raises the prompt.
    expired = true;
    await pressByKeyboard(page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS.chats, exact: true }));

    await expect(dialogNamed(page, REAUTH_MODAL_TITLE)).toBeVisible();
    await expect(page.getByTestId(testId(field))).toBeFocused();
  });
}

/** A room of its own whose one message carries a picture, with the picture's bytes answered by the root's own blob route. */
async function openPictureRoom(page: Page, root: Root, show: (chatId: ChatId) => Promise<unknown>): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: castId<CharacterHandle>("landing-witness"), name: "Landing witness", description: "Keeps the ledger." }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  const { stored } = await seedAsset(root, { principal, kind: "attachment", mime: "image/png", bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)) });
  await caller.chat.commitMessage({ chatId: room.chat.id, content: "The ledger, pictured.", attachmentAssetIds: [stored.assetId], timeZone: "UTC" });
  const auth = await captureCookieAuth(root, principal, "landing-witness-password");
  await page.route(`**${blobUrl(stored.hash)}*`, async (route) => {
    const response = await root.http.request(blobUrl(stored.hash), { headers: { cookie: auth.cookie, forwarded: "" } });
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
  await routeTrpc(page, serveCorpusProcedures(caller, ROOM_READS));
  await show(room.chat.id);
}

/** A corpus root whose embedding model answers, so a message committed to its room can be retrieved against. */
function pictureRoot(): Promise<Root> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  return createCorpusHarness(undefined, { providerFetch: provider.execute, startJobs: false });
}

test("Imagine in the composer's tools menu opens the imagine dialog with focus on its prompt", async ({ mount, page }) => {
  await using root = await pictureRoot();
  await openPictureRoom(page, root, (chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }));

  await pressByKeyboard(page.getByRole("button", { name: MESSAGE_TOOLS_LABEL, exact: true }).first());
  await pressByKeyboard(page.getByRole("menuitem", { name: COMPOSER_IMAGINE_NAME, exact: true }));

  await expect(dialogNamed(page, IMAGINE_DIALOG_TITLE)).toBeVisible();
  await expect(dialogNamed(page, IMAGINE_DIALOG_TITLE).getByRole("textbox", { name: IMAGINE_PROMPT_NAME, exact: true })).toBeFocused();
});

test("a picture in a message opens the image detail with focus on its body, and its Edit door lands focus on the edit instruction", async ({ mount, page }) => {
  await using root = await pictureRoot();
  await openPictureRoom(page, root, (chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }));

  const picture = page.locator('[data-slot="message-media-zoom"]');
  await expect(picture).toHaveCount(1);
  await pressByKeyboard(picture);
  await expect(dialogNamed(page, IMAGE_DETAIL_TITLE)).toBeVisible();
  await expect(dialogBodyAnchor(page)).toBeFocused();

  await pressByKeyboard(dialogNamed(page, IMAGE_DETAIL_TITLE).getByRole("button", { name: IMAGE_EDIT_NAME, exact: true }));
  await expect(dialogNamed(page, IMAGE_EDIT_NAME)).toBeVisible();
  await expect(dialogNamed(page, IMAGE_EDIT_NAME).getByRole("textbox", { name: IMAGE_EDIT_INSTRUCTION_NAME, exact: true })).toBeFocused();
});
