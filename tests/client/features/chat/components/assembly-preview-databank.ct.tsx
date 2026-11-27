// @subject packages/client/src/features/chat/components/databank-passage-detail.tsx
// The host's Preview diagnostics name each document passage the next turn retrieved and the span it covers in the
// document's text. The trace comes from a real previewAssembly read in a corpus room with a freshly ingested document.

import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { CHAT_PREVIEW_DIAGNOSTICS_LABEL } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AssemblyPreviewTabStory } from "./_assembly-preview-stories.tsx";

const STORY = "tests/client/features/chat/components/_assembly-preview-stories/AssemblyPreviewTabStory";
const DOCUMENT = { name: "Lighthouse log", text: "The lighthouse keeper logged a storm at dusk." } as const;

test("the diagnostics name the document a retrieved passage came from and the span it covers", async ({ mount, page }) => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createCorpusHarness(undefined, { startJobs: false, providerFetch: physical.execute });
  const caller = await root.internalCallerFor(root.ownerId);
  const owner = await root.principalFor(root.ownerId);
  const [room] = (await caller.chat.listChats({})).items;
  if (room === undefined) {
    throw new Error("The committed corpus must hold a room the owner hosts");
  }
  const created = await root.services.databank.createFromText({
    signal: new AbortController().signal,
    principal: owner,
    name: DOCUMENT.name,
    text: DOCUMENT.text,
  });
  await root.services.databank.attachToChat({ principal: owner, chatId: room.id, documentId: created.document.id });
  const ingested = await root.app.databankIngest.ingestDocument({ documentId: created.document.id, signal: new AbortController().signal });
  expect(ingested.failed).toEqual([]);
  const { trace } = await caller.chat.previewAssembly({ chatId: room.id, timeZone: "UTC" });
  const [passage] = trace.databankPassages ?? [];
  if (passage === undefined) {
    throw new Error("The room's preview must retrieve the attached document's passage");
  }
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "chat.getChat",
      "chat.listMessages",
      "chat.previewAssembly",
      "chat.getShapeTrace",
      "plugin.listMacros",
    ]),
  );
  await mount<typeof AssemblyPreviewTabStory>(STORY, { chatId: room.id });

  await page.getByRole("button", { name: CHAT_PREVIEW_DIAGNOSTICS_LABEL, exact: true }).click();
  const row = page.locator('[data-slot="databank-passage"]');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-document-id", created.document.id);
  await expect(row).toHaveAttribute("data-char-start", String(passage.charStart));
  await expect(row).toHaveAttribute("data-char-end", String(passage.charEnd));
  await expect(row).toContainText(DOCUMENT.name);
});
