// Corpus characters, native chat actions and durable identity; only physical provider bytes are scripted.
import { blobUrl } from "@orb/contracts/assets";
import type { CorpusWire } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";
import { configureCustomProvider, ownerActor } from "./support/actors.ts";
import { openChatByTitle, openChatOptions, typeAndSend, waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { startFixtureProvider } from "./support/fixture-provider.ts";
import { SELECTED_CORPUS_FIXTURE } from "./support/modes.ts";

const TITLE = "Corpus conversation actions";
const PROMPT = "Describe the synthetic lantern for the corpus smoke.";
const FIRST = { userMessage: PROMPT, prefix: "The synthetic lantern ", suffix: "is amber." };
const SWIPE = { userMessage: PROMPT, prefix: "Another synthetic lantern ", suffix: "is blue." };
const SWITCHED = { userMessage: "Record this synthetic line under my switched persona.", prefix: "The switched traveller ", suffix: "preserves this line." };
const EDITED = "The edited synthetic lantern is green.";

function corpus(): CorpusWire {
  if (SELECTED_CORPUS_FIXTURE === undefined) {
    throw new Error("Corpus conversation requires the committed fixture");
  }
  return SELECTED_CORPUS_FIXTURE.wire;
}

async function jumpTo(page: Page, name: string): Promise<void> {
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Jump to…", exact: true });
  await palette.getByRole("combobox", { name: "Command palette", exact: true }).fill(name);
  await palette.getByRole("option", { name, exact: true }).click();
  await expect(palette).toBeHidden();
}

async function openPersonas(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    // Home preserves the active room; Back to Chats would instead clear its persona context.
    await jumpTo(page, "Home");
    await page.getByRole("button", { name: "You", exact: true }).click();
  } else {
    await page.getByRole("button", { name: /^(?:Playing as .+|Account & personas)$/u }).click();
  }
  await expect(page.getByText(`In ${TITLE}`, { exact: true })).toBeVisible();
}

test("a corpus character supports swipe selection, edit save/cancel, persona switching and card pinning", { tag: "@smoke" }, async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(SELECTED_CORPUS_FIXTURE === undefined, "Requires the committed corpus");
  test.setTimeout(120_000);
  const host = ownerActor(baseURL ?? "");
  const character = corpus().libraryRelations?.ids.characterId;
  if (character === undefined) {
    throw new Error("Corpus has no library character");
  }
  const started = await host.trpc.chat.startChat.mutate({ characterIds: [character] });
  const chatId = started.chat.id;
  const initial = await host.trpc.chat.getChat.query({ chatId });
  const persona = corpus().reads["persona.list"][0]?.output.find(({ id }) => id !== initial.viewerActivePersonaId);
  if (persona === undefined) {
    throw new Error("Corpus has no alternate persona");
  }
  const fixture = await startFixtureProvider(0, [FIRST, SWIPE, SWITCHED]);
  let restore: (() => Promise<void>) | undefined;
  try {
    restore = await configureCustomProvider(host, fixture.baseUrl, "fixture-corpus-actions");
    await host.trpc.chat.updateTitle.mutate({ chatId, title: TITLE });
    await openChatByTitle(page, TITLE);
    const sent = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("chat.send"));
    await typeAndSend(page.getByRole("textbox", { name: "Message", exact: true }), PROMPT);
    await expect(page.locator('[data-slot="ghost-message-row"]')).toContainText(FIRST.prefix);
    fixture.release(0);
    const sentResponse = await sent;
    expect(sentResponse.ok(), await sentResponse.text()).toBe(true);
    const assistant = page.locator('[data-slot="message-row"][data-role="assistant"]').last();
    await expect(assistant).toContainText(FIRST.prefix + FIRST.suffix);
    const id = await assistant.getAttribute("data-message-id");
    await assistant.getByRole("button", { name: "Regenerate a variant", exact: true }).click();
    await expect(page.locator('[data-slot="ghost-message-row"]')).toContainText(SWIPE.prefix);
    fixture.release(1);
    await expect(assistant).toContainText(SWIPE.prefix + SWIPE.suffix);
    await expect(assistant).toHaveAttribute("data-message-id", id ?? "");
    await assistant.getByRole("button", { name: "Previous variant", exact: true }).click();
    await expect(assistant).toContainText(FIRST.prefix + FIRST.suffix);
    await assistant.getByRole("button", { name: "Next variant", exact: true }).click();
    await expect(assistant).toContainText(SWIPE.prefix + SWIPE.suffix);
    await assistant.hover();
    await assistant.getByRole("button", { name: "Edit message", exact: true }).click();
    await assistant.getByRole("textbox", { name: "Edit message", exact: true }).fill("This cancelled edit must not land.");
    await assistant.getByRole("button", { name: "Cancel edit", exact: true }).click();
    await expect(assistant).toContainText(SWIPE.prefix + SWIPE.suffix);
    await assistant.getByRole("button", { name: "Edit message", exact: true }).click();
    await assistant.getByRole("textbox", { name: "Edit message", exact: true }).fill(EDITED);
    await assistant.getByRole("button", { name: "Save edit", exact: true }).click();
    await expect(assistant).toContainText(EDITED);

    await openPersonas(page, isMobile);
    await page.getByRole("button", { name: `Switch to ${persona.name}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `${persona.name} — current persona`, exact: true })).toBeVisible();
    if (isMobile) {
      await page.getByRole("button", { name: `Actions for ${persona.name}`, exact: true }).click();
      await page.getByRole("menuitem", { name: "Pin card here", exact: true }).click();
    } else {
      await page.getByRole("button", { name: `Pin the card to ${persona.name}`, exact: true }).click();
    }
    const pin = page.getByRole("button", { name: `Card is pinned to ${persona.name} — press to unpin`, exact: true });
    await expect(pin).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => {
        const chat = await host.trpc.chat.getChat.query({ chatId });
        return [chat.viewerActivePersonaId, chat.anchorPersonaId];
      })
      .toEqual([persona.id, persona.id]);
    await page.keyboard.press("Escape");
    if (isMobile) {
      await jumpTo(page, TITLE);
    }
    await typeAndSend(page.getByRole("textbox", { name: "Message", exact: true }), SWITCHED.userMessage);
    await expect(page.locator('[data-slot="ghost-message-row"]')).toContainText(SWITCHED.prefix);
    fixture.release(2);
    await expect(assistant).toContainText(SWITCHED.prefix + SWITCHED.suffix);
    const user = (await host.trpc.chat.listMessages.query({ chatId, limit: 30 })).messages.find(
      (message) => message.role === "user" && message.content === SWITCHED.userMessage,
    );
    expect(user?.personaId).toBe(persona.id);
    await expect(page.locator(`[data-message-id="${user?.id}"]`)).toContainText(SWITCHED.userMessage);
    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator(`[data-message-id="${id}"]`)).toContainText(EDITED);
    await expect(page.locator(`[data-message-id="${user?.id}"]`)).toContainText(SWITCHED.userMessage);
    await openPersonas(page, isMobile);
    await expect(page.getByRole("button", { name: `${persona.name} — current persona`, exact: true })).toBeVisible();
    await expect(pin).toHaveAttribute("aria-pressed", "true");
    await pin.click();
    await expect.poll(async () => (await host.trpc.chat.getChat.query({ chatId })).anchorPersonaId).toBeNull();
  } finally {
    await fixture.close();
    await restore?.();
    await host.trpc.chat.delete.mutate({ chatId });
  }
});

test("the corpus character gallery opens native image bytes", { tag: "@smoke" }, async ({ page, baseURL }) => {
  test.skip(SELECTED_CORPUS_FIXTURE === undefined, "Requires the committed corpus");
  const host = ownerActor(baseURL ?? "");
  const characterId = corpus().libraryRelations?.ids.characterId;
  if (characterId === undefined) {
    throw new Error("Corpus has no gallery character");
  }
  const character = await host.trpc.character.get.query({ characterId });
  const images = await host.trpc.assets.listGallery.query({ subjectCharacterId: characterId, limit: 50 });
  expect(images.length).toBeGreaterThan(0);
  const room = await host.trpc.chat.startChat.mutate({ characterIds: [characterId] });
  try {
    await host.trpc.chat.updateTitle.mutate({ chatId: room.chat.id, title: "Corpus gallery room" });
    await openChatByTitle(page, "Corpus gallery room");
    await openChatOptions(page);
    await page.getByRole("menuitem", { name: `${character.name}'s gallery`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `${character.name}'s gallery`, exact: true });
    await expect(dialog).toBeVisible();
    const image = dialog.locator("img").first();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    const src = await image.getAttribute("src");
    expect(images.some((item) => new URL(src ?? "", baseURL).pathname === blobUrl(item.hash))).toBeTruthy();
  } finally {
    await host.trpc.chat.delete.mutate({ chatId: room.chat.id });
  }
});
