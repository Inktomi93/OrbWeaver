// Bounded ingress smoke: real multipart import, an embedded book, deduplication and reload.
import type { CardImportResult } from "@orb/contracts/import";
import { cardImportResultSchema } from "@orb/contracts/import";
import type { Page } from "@playwright/test";
import { ownerActor } from "./support/actors.ts";
import { charactersRailButton, waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import type { TrpcClientOutput } from "./support/trpc.ts";

const NAME = "Smoke Imported Archivist";
const DESCRIPTION = "A synthetic archivist carrying a tiny smoke lorebook.";
const GREETING = "The synthetic archive is open.";
const BOOK_CONTENT = "The synthetic lantern burns amber in the archive.";
const CARD = `{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"${NAME}","description":"${DESCRIPTION}","first_mes":"${GREETING}","character_book":{"name":"Smoke Archive","entries":[{"keys":["lantern"],"content":"${BOOK_CONTENT}","comment":"Synthetic lantern","constant":true,"insertion_order":10}]}}}`;
const FILE_LABEL = "Drop a SillyTavern character card (PNG or JSON), or click to browse";

async function openCharactersList(page: Page): Promise<void> {
  await charactersRailButton(page).click();
  const search = page.getByRole("textbox", { name: "Search characters", exact: true });
  const back = page.getByRole("button", { name: "Back to Characters", exact: true });
  await expect(search.or(back).first()).toBeVisible();
  if (await back.isVisible()) {
    await back.click();
  }
  await expect(search).toBeVisible();
}

async function importCard(page: Page): Promise<CardImportResult> {
  await openCharactersList(page);
  await page.getByRole("button", { name: "Import a character card", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import a character card", exact: true });
  await expect(dialog).toBeVisible();
  const uploaded = page.waitForResponse((candidate) => candidate.request().method() === "POST" && new URL(candidate.url()).pathname === "/api/import");
  await dialog.getByLabel(FILE_LABEL, { exact: true }).setInputFiles({ name: "smoke-archivist.json", mimeType: "application/json", buffer: Buffer.from(CARD) });
  const response = await uploaded;
  expect(response.ok()).toBe(true);
  const result = cardImportResultSchema.parse(await response.json());
  expect(result.failed).toEqual([]);
  expect(result.imported).toHaveLength(1);
  await expect(dialog).toHaveCount(0);
  return result;
}

test("importing a card preserves its fields and primary book, re-import deduplicates, and its room opens after reload", { tag: "@smoke" }, async ({
  page,
  baseURL,
}) => {
  const host = ownerActor(baseURL ?? "");
  const prior = await host.trpc.character.list.query({ search: NAME });
  for (const character of prior.items.filter((item) => item.name === NAME)) {
    await host.trpc.character.remove.mutate({ characterId: character.id });
  }
  await page.goto("/");
  await waitForAppReady(page);
  const first = await importCard(page);
  const imported = first.imported[0];
  expect(imported?.created).toBe(true);
  if (imported === undefined) {
    throw new Error("card import returned no character");
  }
  let books: TrpcClientOutput<"worldInfo.listForCharacter"> = [];
  try {
    const fields = await host.trpc.character.get.query({ characterId: imported.characterId });
    expect({ name: fields.name, description: fields.description, greetings: fields.greetings.map((greeting) => greeting.text) }).toEqual({
      name: NAME,
      description: DESCRIPTION,
      greetings: [GREETING],
    });
    books = await host.trpc.worldInfo.listForCharacter.query({ characterId: imported.characterId });
    expect(books.map((book) => book.role)).toEqual(["primary"]);
    const [primary] = books;
    expect(primary).toBeDefined();
    const entries = primary === undefined ? [] : await host.trpc.worldInfo.listEntries.query({ bookId: primary.id });
    expect(entries.map((entry) => entry.content)).toEqual([BOOK_CONTENT]);
    const again = await importCard(page);
    expect(again.imported).toMatchObject([{ characterId: imported.characterId, created: false, importHash: imported.importHash }]);
    const listed = await host.trpc.character.list.query({ search: NAME });
    expect(listed.items.filter((item) => item.name === NAME).map((item) => item.id)).toEqual([imported.characterId]);
    expect(await host.trpc.worldInfo.listForCharacter.query({ characterId: imported.characterId })).toEqual(books);
    await page.reload();
    await waitForAppReady(page);
    await openCharactersList(page);
    await page.getByRole("textbox", { name: "Search characters", exact: true }).fill(NAME);
    const cta = page.getByRole("button", { name: `Chat with ${NAME}`, exact: true });
    const row = page.locator('[data-slot="list-row-root"]').filter({ has: cta });
    await expect(row).toBeVisible();
    await row.hover();
    await cta.click();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    await expect(page.locator('[data-slot="message-row"]').getByRole("paragraph")).toHaveText(GREETING);
  } finally {
    await host.trpc.character.remove.mutate({ characterId: imported.characterId });
    for (const book of books) {
      await host.trpc.worldInfo.removeBook.mutate({ bookId: book.id });
    }
  }
});
