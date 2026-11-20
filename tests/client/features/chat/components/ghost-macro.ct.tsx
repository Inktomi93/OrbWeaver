import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { StreamingReplyStory } from "./_ghost-macro-stories.tsx";
import { GHOST_ROOM_PROCEDURES as PROCEDURES, soloRoom } from "./ghost-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_ghost-macro-stories/StreamingReplyStory";
const STREAM_LABEL = "Stream a reply";
const REFUSE_LABEL = "Refuse another send";
const RESTART_LABEL = "Restart, then stream the next turn";

test("a streaming reply resolves {{char}} to the speaker's name, as the settled row does", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, characterId, name } = await soloRoom(root);
  const owner = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(owner, PROCEDURES));
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, { chatId, speakerCharacterId: characterId, streamedText: "{{char}} nods slowly.", streamLabel: STREAM_LABEL });

  await page.getByRole("button", { name: STREAM_LABEL, exact: true }).click();
  const ghost = page.locator('[data-slot="ghost-message-row"]');
  await expect(ghost.locator('[data-slot="ghost-stream-body"]')).toContainText(`${name} nods slowly.`);
  await expect(ghost).not.toContainText("{{char}}");
});

test("a send refused during a turn leaves that turn's ghost on screen", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, characterId, name } = await soloRoom(root);
  const owner = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(owner, PROCEDURES));
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, {
    chatId,
    speakerCharacterId: characterId,
    streamedText: "{{char}} holds the floor.",
    streamLabel: STREAM_LABEL,
  });

  await page.getByRole("button", { name: STREAM_LABEL, exact: true }).click();
  const body = page.locator('[data-slot="ghost-message-row"] [data-slot="ghost-stream-body"]');
  await expect(body).toContainText(`${name} holds the floor.`);
  await page.getByRole("button", { name: REFUSE_LABEL, exact: true }).click();
  await expect(body).toContainText(`${name} holds the floor.`);
});

test("a reconnect to a process that lost the turn lets the next turn's ghost through", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, characterId } = await soloRoom(root);
  const owner = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(owner, PROCEDURES));
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, {
    chatId,
    speakerCharacterId: characterId,
    streamedText: "The turn the crash took.",
    streamLabel: STREAM_LABEL,
    nextText: "The turn after it.",
  });

  await page.getByRole("button", { name: STREAM_LABEL, exact: true }).click();
  const body = page.locator('[data-slot="ghost-message-row"] [data-slot="ghost-stream-body"]');
  await expect(body).toContainText("The turn the crash took.");
  await page.getByRole("button", { name: RESTART_LABEL, exact: true }).click();
  await expect(body).toContainText("The turn after it.");
  await expect(body).not.toContainText("The turn the crash took.");
});

// Pacing off: every streamed character is on screen the moment it lands, so a held-back tail cannot be
// mistaken for a reveal that has not reached it yet.
const TORN_CASES = [
  { kind: "text", first: "Well met, {{ch", rest: "ar}} and friend." },
  { kind: "reasoning", first: "I should greet {{ch", rest: "ar}} warmly." },
] as const;

for (const { kind, first, rest } of TORN_CASES) {
  test(`a macro torn across two ${kind} chunks never shows as literal text, and resolves when its braces arrive`, async ({ mount, page, corpusMedia }) => {
    await using root = await createCorpusHarness();
    const { chatId, characterId, name } = await soloRoom(root);
    const owner = await root.internalCallerFor(root.ownerId);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
    await routeTrpc(page, serveCorpusProcedures(owner, PROCEDURES));
    await corpusMedia();
    await mount<typeof StreamingReplyStory>(STORY, {
      chatId,
      speakerCharacterId: characterId,
      streamedText: first,
      streamLabel: STREAM_LABEL,
      nextText: rest,
      nextLabel: "Stream the rest",
      kind,
    });

    await page.getByRole("button", { name: STREAM_LABEL, exact: true }).click();
    const ghost = page.locator('[data-slot="ghost-message-row"]');
    const lead = first.slice(0, first.indexOf("{{"));
    await expect(ghost).toContainText(lead.trim());
    await expect(ghost).not.toContainText("{{");

    await page.getByRole("button", { name: "Stream the rest", exact: true }).click();
    await expect(ghost).toContainText(`${lead}${name}${rest.slice(rest.indexOf("}}") + 2)}`);
  });
}
