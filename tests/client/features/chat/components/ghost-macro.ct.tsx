import type { CharacterId, ChatId } from "@orb/kit/ids";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { StreamingReplyStory } from "./_ghost-macro-stories.tsx";

const STORY = "tests/client/features/chat/components/_ghost-macro-stories/StreamingReplyStory";
const STREAM_LABEL = "Stream a reply";
const REFUSE_LABEL = "Refuse another send";
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listMessages",
  "chat.listReactions",
  "chat.listMessageVariants",
  "chat.previewContextFit",
  "plugin.list",
  "plugin.listDisplayTransforms",
  "plugin.listSurfaces",
  "regex.listScripts",
  "regex.listRoomDisplayScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;

/** A room seating exactly one character, so the speaker and `{{char}}` are the same name. */
async function soloRoom(root: Harness): Promise<{ readonly chatId: ChatId; readonly characterId: CharacterId; readonly name: string }> {
  const owner = await root.internalCallerFor(root.ownerId);
  for (const room of (await owner.chat.listChats({ limit: 100 })).items) {
    const characters = (await owner.chat.getChat({ chatId: room.id })).participants.filter((p) => p.kind === "character");
    const [only] = characters;
    if (characters.length === 1 && only?.characterId !== null && only?.characterId !== undefined) {
      return { chatId: room.id, characterId: only.characterId, name: only.displayName };
    }
  }
  throw new Error("The corpus has no room seating exactly one character");
}

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
