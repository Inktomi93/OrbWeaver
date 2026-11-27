// @subject packages/client/src/features/chat/components/message-metadata-row.tsx
// A reply the provider answered under a rate-limit warning says so in the transcript's metadata row, and a reply under
// no pressure shows no note. Both replies come from real turns over the Anthropic Messages wire; only the provider's
// reply and its response headers are scripted.

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
import { anthropicTextReply } from "@orb/testkit/node/helpers";
import type { RoomTranscriptStory } from "./_message-reasoning-and-move-stories.tsx";

const STORY = "tests/client/features/chat/components/_message-reasoning-and-move-stories/RoomTranscriptStory";
const MODEL = modelIdSchema.parse("claude-opus-5");
const REQUESTS_LIMIT = 100;
const RESET_AT = "2026-06-01T12:00:00.000Z";
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

test("a warned reply names the provider's rate limit and a relaxed reply carries no note", async ({ mount, page }) => {
  const endpoint = builtinProvider("anthropic")?.baseUrl;
  if (endpoint === undefined) {
    throw new Error("Anthropic provider has no endpoint");
  }
  let remaining = 5;
  const provider = createCorpusProviderExecution({
    baseUrl: endpoint,
    modelIds: [MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    images: [],
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    anthropicMessages: () => anthropicTextReply(MODEL, "The lamp is lit."),
  });
  await using h = await createChatRoot({
    memoryEnabled: false,
    server: { secretBoxKey: SECRET_BOX_TEST_KEY, networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) } },
    providerFetch: async (input, init) => {
      const reply = await provider.execute(new Request(input, init));
      const headers = new Headers(reply.headers);
      headers.set("anthropic-ratelimit-requests-limit", String(REQUESTS_LIMIT));
      headers.set("anthropic-ratelimit-requests-remaining", String(remaining));
      headers.set("anthropic-ratelimit-requests-reset", RESET_AT);
      return new Response(reply.body, { status: reply.status, headers });
    },
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
  const warned = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { effort: "low" } });
  remaining = REQUESTS_LIMIT;
  const relaxed = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { effort: "low" } });
  const warnedId = warned.messages.at(-1)?.id;
  const relaxedId = relaxed.messages.at(-1)?.id;
  if (warnedId === undefined || relaxedId === undefined) {
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

  const warnedRow = page.locator(`[data-message-id="${warnedId}"]`);
  const relaxedRow = page.locator(`[data-message-id="${relaxedId}"]`);
  await expect(warnedRow.locator('[data-slot="message-metadata-rate-limit"]')).toBeVisible();
  // The control: the relaxed reply is loaded beside it and carries no rate-limit note.
  await expect(relaxedRow).toBeVisible();
  await expect(relaxedRow.locator('[data-slot="message-metadata-rate-limit"]')).toHaveCount(0);
});
