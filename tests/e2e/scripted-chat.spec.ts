// Composed smoke: browser sends, external provider streams, native SSE settles and canon survives reload.
// Only synthetic prompts leave the app; the held endpoint is not a provider-quality certification.
import { isPlainObject } from "@orb/kit/guards";
import type { CharacterHandle, ChatId } from "@orb/kit/ids";
import { castId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { budget } from "@orb/tooling/floor/host/load-budget";
import type { Page } from "@playwright/test";
import { configureCustomProvider, ownerActor } from "./support/actors.ts";
import { charactersRailButton, renameOpenChat, typeAndSend, waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import type { FixtureProvider, FixtureTurn } from "./support/fixture-provider.ts";
import { startFixtureProvider } from "./support/fixture-provider.ts";
import type { CanonMessage } from "./support/trpc.ts";
import { batchResultData, listCanon, mintFreshCharacter, removeCharacter } from "./support/trpc.ts";

const CHARACTER = "Smoke Wire Character";
const GREETING = "A known greeting from the smoke-owned character.";
// A case loads the app four times (page fixture, open, reload) and types two scripted turns: 52 to 66 s per case on a quiet
// box, against the 60 s default test budget. Twice the measurement.
const SCRIPTED_CHAT_CASE_BASE_MS = 120_000;
const TITLE = "Smoke wire conversation";
const FIRST = { userMessage: "SMOKE_FIRST: explain the synthetic lantern.", prefix: "The synthetic lantern ", suffix: "glows amber." };
const SECOND = { userMessage: "SMOKE_SECOND: describe its synthetic switch.", prefix: "Its synthetic switch ", suffix: "is brass." };
const STOP = { userMessage: "SMOKE_STOP: hold this synthetic response.", prefix: "This partial answer stays.", suffix: " THIS MUST NEVER LAND." };

async function openOwnedCharacter(page: Page): Promise<ChatId> {
  await page.goto("/");
  await waitForAppReady(page);
  await charactersRailButton(page).click();
  await page.getByRole("textbox", { name: "Search characters", exact: true }).fill(CHARACTER);
  const cta = page.getByRole("button", { name: `Chat with ${CHARACTER}`, exact: true });
  const row = page.locator('[data-slot="list-row-root"]').filter({ has: cta });
  await expect(row).toBeVisible();
  await row.hover();
  const started = page.waitForResponse((candidate) => candidate.url().includes("/api/trpc/chat.startChat"));
  await cta.click();
  const response = await started;
  expect(response.ok()).toBe(true);
  // The click's response is a raw wire observation; read the one field this flow needs and parse its id.
  const startResult = batchResultData(await response.json());
  const data = startResult?.data;
  const chat = isPlainObject(data) ? data["chat"] : undefined;
  const rawId = isPlainObject(chat) ? chat["id"] : undefined;
  if (rawId === undefined) {
    throw new Error("chat.startChat returned no chat id");
  }
  const id = typeIdSchema(ID_PREFIX.chat).parse(rawId);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  return id;
}

async function assertHeldPrefix(page: Page, fixture: FixtureProvider, index: number, turn: FixtureTurn): Promise<void> {
  await expect.poll(() => fixture.requests.length).toBe(index + 1);
  const request = fixture.requests[index];
  expect(request?.body).toContain(turn.userMessage);
  expect(request?.finished).toBe(false);
  expect(request?.closed).toBe(false);
  await expect(page.locator('[data-slot="ghost-message-row"]')).toContainText(turn.prefix);
  await expect(page.locator('[data-slot="ghost-message-row"]')).not.toContainText(turn.suffix);
  await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible();
}

async function assertProviderSocketClosed(fixture: FixtureProvider, index: number): Promise<void> {
  await expect
    .poll(() => ({
      socketClosed: fixture.requests[index]?.socketClosed,
      responseClosed: fixture.requests[index]?.closed,
      finished: fixture.requests[index]?.finished,
    }))
    .toEqual({ socketClosed: true, responseClosed: true, finished: false });
}

async function assertIdle(page: Page, timeout = 5000): Promise<void> {
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeVisible({ timeout });
  await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0, { timeout });
  await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled({ timeout });
  await expect(page.locator('[data-slot="ghost-message-row"]')).toHaveCount(0, { timeout });
}

async function readRenderedCanon(page: Page, count: number): Promise<(readonly [string | null, string | null, readonly string[]])[]> {
  const rows = page.getByRole("log", { name: "Conversation messages", exact: true }).locator('[data-slot="message-list-row"]');
  const active = rows.and(page.locator('[tabindex="0"]'));
  await active.focus();
  await active.press("Home");
  const rendered: (readonly [string | null, string | null, readonly string[]])[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = rows.and(page.locator(`[aria-posinset="${String(index + 1)}"]`));
    await expect(row).toBeFocused();
    await expect(row).toHaveAttribute("aria-setsize", String(count));
    await expect(row).toBeInViewport();
    const message = row.locator('[data-slot="message-row"]');
    const paragraphs = message.getByRole("paragraph");
    await paragraphs.scrollIntoViewIfNeeded();
    rendered.push([await message.getAttribute("data-message-id"), await message.getAttribute("data-role"), await paragraphs.allTextContents()]);
    if (index + 1 < count) {
      await row.press("ArrowDown");
    }
  }
  return rendered;
}

function assertRenderedCanon(rendered: Awaited<ReturnType<typeof readRenderedCanon>>, messages: readonly CanonMessage[]): void {
  expect(rendered).toEqual(messages.map((message) => [message.id, message.role, [message.content]]));
}

function scriptedChatTitle(stopped: boolean): string {
  return stopped
    ? "Stop closes the held provider socket and retains the user row without an unfinished assistant"
    : "first send streams incrementally, second send works, and exact canon survives reload";
}

for (const stopped of [false, true]) {
  test(`${scriptedChatTitle(stopped)}`, { tag: "@smoke" }, async ({ page, baseURL }) => {
    test.setTimeout(budget(SCRIPTED_CHAT_CASE_BASE_MS));
    const host = ownerActor(baseURL ?? "");
    let restoreProvider: (() => Promise<void>) | undefined;
    const fixture = await startFixtureProvider(0, stopped ? [STOP] : [FIRST, SECOND]);
    const characterId = await mintFreshCharacter(castId<CharacterHandle>("e2e-smoke-wire"), CHARACTER, GREETING);
    try {
      restoreProvider = await configureCustomProvider(host, fixture.baseUrl, stopped ? "fixture-stop" : "fixture-conversation");
      const chatId = await openOwnedCharacter(page);
      const greeting = await listCanon(chatId);
      expect(greeting.map((message) => ({ role: message.role, content: message.content, characterId: message.characterId }))).toEqual([
        { role: "assistant", content: GREETING, characterId },
      ]);
      const turns = stopped ? [STOP] : [FIRST, SECOND];
      for (const [index, turn] of turns.entries()) {
        await typeAndSend(page.getByRole("textbox", { name: "Message" }), turn.userMessage);
        await assertHeldPrefix(page, fixture, index, turn);
        await expect(assertIdle(page, 100)).rejects.toThrow();
        if (stopped) {
          await page.getByRole("button", { name: "Stop generating", exact: true }).click();
          // Peer closure must happen before teardown destroys any fixture socket.
          await assertProviderSocketClosed(fixture, index);
        } else {
          fixture.release(index);
        }
        await expect.poll(() => fixture.requests[index]?.closed).toBe(true);
        expect(fixture.requests[index]?.finished).toBe(!stopped);
        await assertIdle(page);
        await expect
          .poll(async () => (await listCanon(chatId)).map((message) => ({ role: message.role, content: message.content })))
          .toEqual([
            { role: "assistant", content: GREETING },
            ...turns
              .slice(0, index + 1)
              .flatMap((item) => [
                { role: "user", content: item.userMessage },
                ...(stopped ? [] : [{ role: "assistant", content: item.prefix + item.suffix }]),
              ]),
          ]);
      }
      const before = await listCanon(chatId);
      expect(new Set(before.map((message) => message.id)).size).toBe(before.length);
      expect(before.map((message) => message.seq)).toEqual(before.map((message) => message.seq).toSorted((a, b) => a - b));
      expect(before.filter((message) => message.role === "assistant").every((message) => message.characterId === characterId)).toBe(true);
      const rendered = await readRenderedCanon(page, before.length);
      assertRenderedCanon(rendered, before);
      // Controlled wrong identities/content/order must fail the same rendered oracle that reload uses.
      const first = before[0];
      if (first === undefined) {
        throw new Error("owned transcript has no greeting");
      }
      expect(() => assertRenderedCanon(rendered, [{ ...first, id: before[1]?.id ?? first.id }, ...before.slice(1)])).toThrow();
      expect(() => assertRenderedCanon(rendered, [{ ...first, content: "Wrong synthetic content" }, ...before.slice(1)])).toThrow();
      expect(() => assertRenderedCanon(rendered, [...before].reverse())).toThrow();
      await renameOpenChat(page, TITLE);
      await page.reload();
      await waitForAppReady(page);
      await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
      await assertIdle(page);
      expect(await listCanon(chatId)).toEqual(before);
      assertRenderedCanon(await readRenderedCanon(page, before.length), before);
    } finally {
      await fixture.close();
      await removeCharacter(characterId);
      await restoreProvider?.();
    }
  });
}
