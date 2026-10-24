// The shell's mount reads, taken from the owner's finished graph with the requests the client sends.
import type { CorpusShellAmbient } from "../iso/corpus.ts";
import { shellAmbientInput } from "../iso/corpus-shell.ts";
import type { ServerTestHarness } from "./server.ts";

/** Capture the reaper last: it is a mutation, so every read above it sees the graph untouched. */
export async function captureCorpusShellAmbient(root: ServerTestHarness): Promise<CorpusShellAmbient> {
  const caller = await root.internalCallerFor(root.ownerId);
  const inputs = {
    recentChats: shellAmbientInput.recentChats(),
    quickPicks: shellAmbientInput.quickPicks(),
    rosterPreview: shellAmbientInput.rosterPreview(),
    recentDocuments: shellAmbientInput.recentDocuments(),
    inbox: shellAmbientInput.inbox(),
  };
  const recentChats = { input: inputs.recentChats, output: await caller.chat.listChats(inputs.recentChats) };
  const recentRooms = await Promise.all(
    recentChats.output.items.map(async (chat) => {
      const input = shellAmbientInput.room(chat);
      return { input, output: await caller.chat.getChat(input) };
    }),
  );
  return {
    viewerUserId: root.ownerId,
    reads: {
      recentChats,
      quickPicks: { input: inputs.quickPicks, output: await caller.character.list(inputs.quickPicks) },
      rosterPreview: { input: inputs.rosterPreview, output: await caller.rosterPreset.list(inputs.rosterPreview) },
      recentDocuments: { input: inputs.recentDocuments, output: await caller.databank.list(inputs.recentDocuments) },
      inbox: { input: inputs.inbox, output: await caller.notifications.list(inputs.inbox) },
      reaped: { input: undefined, output: await caller.chat.reapTemporaryChats() },
    },
    recentRooms,
  };
}
