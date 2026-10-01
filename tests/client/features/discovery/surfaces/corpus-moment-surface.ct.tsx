import { messageWindowTargetSchema } from "@orb/contracts/search";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { corpusDigestSource } from "../../../../support/node/corpus-source.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { makeMessageView } from "../../chat/fixtures.ts";
import { CorpusArtifactReaderStory } from "../_ct-stories.tsx";

const SOURCE_INPUT = corpusDigestSource({ chatId: mintTypeId(ID_PREFIX.chat), scopedCharacterId: mintTypeId(ID_PREFIX.character), tier: 2, blockIdx: 9 });
const TARGET = messageWindowTargetSchema.parse({ kind: "source", source: SOURCE_INPUT });
if (TARGET.kind !== "source") {
  throw new Error("expected source fixture");
}
const SOURCE = TARGET.source;
if (SOURCE.kind !== "digest") {
  throw new Error("expected digest fixture");
}
const SUMMARY =
  "The **complete selected memory** remains readable after its source is replaced.\n\nA second paragraph retains the detail the search preview crops.";
const DESTINATION = { kind: "digest" as const, rank: 4, hit: { source: SOURCE, text: SUMMARY, chatTitle: "Selected room", scopedCharacterName: "Witness" } };
const EMPTY_WINDOW = {
  outcome: "unavailable" as const,
  anchorMessageId: null,
  anchorSeq: null,
  endMessageId: null,
  endSeq: null,
  messages: [],
  identities: [],
  hasBefore: false,
  hasAfter: false,
};

for (const width of [360, 720]) {
  test(`a generated memory reads in Content with source provenance and an exact jump at ${width}px`, async ({ mount, page }) => {
    const startId = SOURCE.messageStartId;
    if (startId === null) {
      throw new Error("missing stable message fixture");
    }
    const characterId = mintTypeId(ID_PREFIX.character);
    const personaId = mintTypeId(ID_PREFIX.persona);
    const message = makeMessageView({ id: startId, chatId: SOURCE.chatId, seq: 1201, characterId, content: "Original member-visible dialogue." });
    const userMessage = makeMessageView({
      id: mintTypeId(ID_PREFIX.message),
      chatId: SOURCE.chatId,
      seq: 1202,
      role: "user",
      personaId,
      characterId: null,
      content: "A different speaker replies.",
    });
    await routeTrpc(page, {
      "chat.getMessageWindow": {
        ...EMPTY_WINDOW,
        outcome: "resolved",
        anchorMessageId: startId,
        anchorSeq: 1201,
        endMessageId: startId,
        endSeq: 1201,
        messages: [message, userMessage],
        identities: [
          { kind: "character", id: characterId, name: "Historical speaker", avatarHash: null },
          { kind: "persona", id: personaId, name: "Historical persona", description: "", avatarHash: null },
        ],
      },
      "discovery.similarChats": [],
      "discovery.swipeHotspots": [],
    });
    const component = await mount(<CorpusArtifactReaderStory destination={DESTINATION} width={width} />);
    await component.getByRole("button", { name: "Select evidence" }).click();
    await expect(component.getByRole("button", { name: "Back to Explore" })).toBeFocused();
    await expect(component.getByRole("heading", { name: "Generated memory summary" })).toBeVisible();
    await expect(component.getByText("complete selected memory", { exact: true })).toBeVisible();
    await expect(component.getByText("Original member-visible dialogue.")).toBeVisible();
    await expect(component.getByText("Historical speaker · Message 1201")).toBeVisible();
    await expect(component.getByText("Historical persona · Message 1202")).toBeVisible();
    await expect(component.getByText(`Source row: ${SOURCE.rowId}`)).toBeVisible();
    await expect(component.getByText("Original sequence range: 1201–1202")).toBeVisible();
    await component.getByRole("button", { name: "Open in chat at this moment" }).click();
    await expect(component.getByTestId("ct-nav-readout")).toContainText(`section:chats chat:${SOURCE.chatId} artifact:digest`);
    await component.getByRole("button", { name: "Back to Explore" }).click();
    await expect(component.getByTestId("ct-nav-readout")).toContainText("artifact:none");
  });
}

for (const outcome of ["deleted", "unavailable"] as const) {
  test(`${outcome} source keeps the complete summary and offers an honest room fallback`, async ({ mount, page }) => {
    await routeTrpc(page, { "chat.getMessageWindow": { ...EMPTY_WINDOW, outcome }, "discovery.similarChats": [], "discovery.swipeHotspots": [] });
    const component = await mount(<CorpusArtifactReaderStory destination={DESTINATION} />);
    await component.getByRole("button", { name: "Select evidence" }).click();
    await expect(component.getByText("complete selected memory", { exact: true })).toBeVisible();
    await expect(component.getByText("An exact transcript jump is unavailable.")).toBeVisible();
    await expect(component.getByRole("button", { name: "Open in chat at this moment" })).toHaveCount(0);
    await expect(component.getByRole("button", { name: "Open chat", exact: true })).toBeVisible();
  });
}

test("alternate takes preserve their exact stable message identity", async ({ mount, page }) => {
  const messageId = mintTypeId(ID_PREFIX.message);
  await routeTrpc(page, {
    "chat.getMessageWindow": EMPTY_WINDOW,
    "discovery.similarChats": [],
    "discovery.swipeHotspots": [{ messageId, seq: 3017, snippet: "The selected alternate take", variantCount: 4 }],
  });
  const component = await mount(<CorpusArtifactReaderStory destination={DESTINATION} />);
  await component.getByRole("button", { name: "Select evidence" }).click();
  await component.getByRole("button", { name: "The selected alternate take" }).click();
  await expect(component.getByTestId("ct-moment-readout")).toHaveText(`message:${messageId}`);
});

test("related room results disclose their bounded pool and open the selected room", async ({ mount, page }) => {
  const roomId = mintTypeId(ID_PREFIX.chat);
  await routeTrpc(page, {
    "chat.getMessageWindow": EMPTY_WINDOW,
    "discovery.swipeHotspots": [],
    "discovery.similarChats": [{ chatId: roomId, title: "Related remembered room", similarity: 0.8 }],
  });
  const component = await mount(<CorpusArtifactReaderStory destination={DESTINATION} />);
  await component.getByRole("button", { name: "Select evidence" }).click();
  await expect(component.getByText("A preview from a bounded pool of recent indexed room passages. Older rooms can be absent.")).toBeVisible();
  await component.getByRole("button", { name: "Related remembered room", exact: true }).click();
  await expect(component.getByTestId("ct-nav-readout")).toContainText(`section:chats chat:${roomId}`);
});
