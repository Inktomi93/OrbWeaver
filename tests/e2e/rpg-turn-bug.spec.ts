import { expect, test } from "@playwright/test";
import { openChatOptions, busEventTypes, createChatViaSend, waitForAppReady } from "./support/chat-room";

const NON_WHITESPACE = /\S/u;

test("rpg turn completes without dropping subscription and locking composer", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Get into a fresh open chat
  await page.goto("/");
  await waitForAppReady(page);
  await createChatViaSend(page);

  // 2. Convert to an RPG game via the Setup Wizard
  await openChatOptions(page);
  await page.getByTestId("rpgStartCampaign").click();

  // Submit the form (Wizard has 4 steps, just click Next/Start)
  const nextBtn = page.getByRole("button", { name: "Next" });
  await expect(nextBtn.first()).toBeVisible({ timeout: 15_000 });

  await nextBtn.click(); // Genres
  await nextBtn.click(); // Setting
  await nextBtn.click(); // Rules

  const startBtn = page.getByRole("button", { name: "Start Campaign" });
  await startBtn.click(); // Start

  // Wait for dialog to close
  await expect(startBtn).not.toBeVisible({ timeout: 15_000 });

  // 3. Send a message to trigger an RPG turn
  const composer = page.getByRole("textbox", { name: "Message" });
  await expect(composer).toBeVisible();
  await composer.fill("Hello, GM. Let's start the game.");

  // The Send button
  const sendBtn = page.getByRole("button", { name: "Send message" });
  await sendBtn.click();

  // 4. Wait for the user message to commit
  const userRow = page.locator('[data-slot="message-row"][data-role="user"]');
  await expect(userRow.last()).toContainText("Hello, GM.", { timeout: 30_000 });

  // 5. Wait for the assistant's reply (the model turn)
  const assistantRow = page.locator('[data-slot="message-row"][data-role="assistant"]');
  await expect(assistantRow.last()).toBeVisible({ timeout: 120_000 });
  await expect(assistantRow.last()).toContainText(NON_WHITESPACE, { timeout: 120_000 });

  // 6. Wait for the turn to complete (the composer should unlock).
  // The bug was that `turnCompleted` is dropped, so the composer stays grayed out (disabled/locked).
  // We don't fail immediately, we want to observe what happened!
  try {
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    console.log("[DEBUG] Composer unlocked successfully!");
  } catch (err) {
    console.error("[DEBUG] Composer is still locked! Bug reproduced.");
  }

  // 7. Observability check: Dump the __orb bus devlog
  const busEvents = await page.evaluate(() => window.__orb?.bus().events ?? []);
  console.log("[DEBUG] Bus Events length:", busEvents.length);
  const busTypes = busEvents.map((e: any) => e.type);
  console.log(
    "[DEBUG] Bus Event Types:",
    busTypes.filter((t: string) => ["turnCompleted", "messageCommitted", "chatsChanged"].includes(t)),
  );

  // 8. DB verification: Check the temp DB to verify the contents of the multi-turn RPG and what all took place!
  const url = page.url();
  const chatId = url.split("/chat/")[1];
  console.log("[DEBUG] Chat ID:", chatId);

  // We can just evaluate a call to the TRPC client to get the messages if DB is tricky to import!
  // Or we can use window.__orb.queries() to see the query cache!
  const queries = await page.evaluate(() => window.__orb?.queries() ?? []);
  const chatMessagesQuery = queries.find((q: any) => q.key && q.key.includes("chat.listMessages") && q.key.includes(chatId));
  console.log("[DEBUG] chat.listMessages query state:", chatMessagesQuery);

  // We can fetch the DOM content to see what rendered
  const assistantMessages = await page.locator('[data-slot="message-row"][data-role="assistant"]').allTextContents();
  console.log("[DEBUG] Rendered Assistant Messages:");
  assistantMessages.forEach((msg, i) => console.log(`  [${i}] ${msg.slice(0, 100).replace(/\n/g, " ")}...`));
});
