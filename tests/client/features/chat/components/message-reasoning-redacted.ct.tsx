// @subject packages/client/src/features/chat/components/message-row-parts.tsx
// A reply whose provider redacted its reasoning says so in the transcript, where an ordinary reply shows its reasoning
// block. Both replies come from real turns over the Anthropic Messages wire; only the provider's reply is scripted.

import { builtinProvider, modelIdSchema } from "@orb/contracts/inference";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import {
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  createChatRoot,
  createCorpusProviderExecution,
  SECRET_BOX_TEST_KEY,
} from "@orb/testkit/node/composed";
import { messageEnd, messageStart, redactedThinkingBlock, textBlock, thinkingBlock } from "@orb/testkit/node/helpers";
import type { RoomTranscriptStory } from "./_message-reasoning-and-move-stories.tsx";

const STORY = "tests/client/features/chat/components/_message-reasoning-and-move-stories/RoomTranscriptStory";
const MODEL = modelIdSchema.parse("claude-opus-5");
const THOUGHT = "The keeper weighs the lamp.";
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "character.get",
  "chat.listMessages",
  "chat.listReactions",
  "chat.listMessageVariants",
  "chat.previewContextFit",
  "plugin.list",
  "plugin.listDisplayTransforms",
  "plugin.listSurfaces",
  "regex.listScripts",
  "regex.listDisplayScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;

test("a redacted reply names the redaction and an ordinary reply keeps its reasoning block", async ({ mount, page }) => {
  const endpoint = builtinProvider("anthropic")?.baseUrl;
  if (endpoint === undefined) {
    throw new Error("Anthropic provider has no endpoint");
  }
  let redactNext = true;
  const provider = createCorpusProviderExecution({
    baseUrl: endpoint,
    modelIds: [MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    images: [],
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    anthropicMessages: () => [
      messageStart(MODEL),
      ...(redactNext ? redactedThinkingBlock(0, "REDACTED-PAYLOAD") : thinkingBlock(0, THOUGHT, "sig-1")),
      ...textBlock(1, "The lamp is lit."),
      ...messageEnd({ stopReason: "end_turn" }),
    ],
  });
  await using h = await createChatRoot({
    memoryEnabled: false,
    server: { secretBoxKey: SECRET_BOX_TEST_KEY, networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) } },
    providerFetch: provider.execute,
  });
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "anthropic", key: "controlled-corpus-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "anthropic",
    credentialId: credential.id,
    baseUrl: null,
    model: MODEL,
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const redacted = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { effort: "low" } });
  redactNext = false;
  const ordinary = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { effort: "low" } });
  const redactedId = redacted.messages.at(-1)?.id;
  const ordinaryId = ordinary.messages.at(-1)?.id;
  if (redactedId === undefined || ordinaryId === undefined) {
    throw new Error("A scripted turn committed no reply");
  }
  await routeAuthConfig(page, await (await h.root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(h.caller, PROCEDURES));
  await mount<typeof RoomTranscriptStory>(STORY, {
    chatId: h.chatId,
    width: 960,
    height: 900,
    appearance: appearanceSettingsSchema.parse({}),
    startTurnLabel: "Start a turn",
  });

  const redactedRow = page.locator(`[data-message-id="${redactedId}"]`);
  const ordinaryRow = page.locator(`[data-message-id="${ordinaryId}"]`);
  await expect(redactedRow.locator('[data-slot="message-reasoning-redacted"]')).toBeVisible();
  await expect(redactedRow.locator('[data-slot="message-reasoning"]')).toHaveCount(0);
  // The control: the ordinary reply is loaded and shows its own reasoning block, with no redaction note.
  await expect(ordinaryRow.locator('[data-slot="message-reasoning"]')).toBeVisible();
  await expect(ordinaryRow.locator('[data-slot="message-reasoning-redacted"]')).toHaveCount(0);
});
