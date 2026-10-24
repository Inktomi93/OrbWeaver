// The reads the app shell issues on mount carry the page sizes its Home tiles ask for, so each capture keeps that exact request.
import { HOME_QUICK_PICKS_LIMIT, listCharactersResultSchema } from "@orb/contracts/character";
import { chatDetailSchema, chatListPageSchema, HOME_RECENT_CHATS_LIMIT, reapResultSchema } from "@orb/contracts/chat";
import { HOME_RECENT_DOCUMENTS_LIMIT, listDocumentsResultSchema } from "@orb/contracts/databank";
import { listInboxResultSchema } from "@orb/contracts/notifications";
import { HOME_ROSTER_PREVIEW_LIMIT, rosterPresetSummarySchema } from "@orb/contracts/roster-preset";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import type { CorpusRead } from "./corpus-read.ts";

export const shellAmbientSchema = z
  .strictObject({
    viewerUserId: brandedId("UserId"),
    reads: z.strictObject({
      recentChats: chatListPageSchema,
      quickPicks: listCharactersResultSchema,
      rosterPreview: rosterPresetSummarySchema.array(),
      recentDocuments: listDocumentsResultSchema,
      inbox: listInboxResultSchema,
      reaped: reapResultSchema,
    }),
    // Home warms the roster of the one room it resumes; which row that is belongs to the client, so every row of the page is captured.
    recentRooms: chatDetailSchema.array(),
  })
  .refine(
    ({ reads, recentRooms }) => recentRooms.map(({ id }) => id).join() === reads.recentChats.items.map(({ id }) => id).join(),
    "Corpus shell rooms do not match the recents page",
  );

export interface CorpusShellAmbient extends Omit<z.output<typeof shellAmbientSchema>, "reads" | "recentRooms"> {
  readonly reads: {
    readonly recentChats: CorpusRead<"chat.listChats">;
    readonly quickPicks: CorpusRead<"character.list">;
    readonly rosterPreview: CorpusRead<"rosterPreset.list">;
    readonly recentDocuments: CorpusRead<"databank.list">;
    readonly inbox: CorpusRead<"notifications.list">;
    readonly reaped: CorpusRead<"chat.reapTemporaryChats">;
  };
  readonly recentRooms: readonly CorpusRead<"chat.getChat">[];
}

/** The exact requests the shell sends; the page sizes are the contract constants the client reads. */
export const shellAmbientInput = {
  recentChats: (): CorpusRead<"chat.listChats">["input"] => ({ limit: HOME_RECENT_CHATS_LIMIT }),
  quickPicks: (): CorpusRead<"character.list">["input"] => ({ limit: HOME_QUICK_PICKS_LIMIT }),
  rosterPreview: (): CorpusRead<"rosterPreset.list">["input"] => ({ limit: HOME_ROSTER_PREVIEW_LIMIT }),
  recentDocuments: (): CorpusRead<"databank.list">["input"] => ({ limit: HOME_RECENT_DOCUMENTS_LIMIT }),
  inbox: (): CorpusRead<"notifications.list">["input"] => ({}),
  room: ({ id }: Pick<z.output<typeof chatDetailSchema>, "id">): CorpusRead<"chat.getChat">["input"] => ({ chatId: id }),
};

/** Publish canonical outputs without replacing the original captured requests. */
export function publishShellAmbient(section: CorpusShellAmbient): z.output<typeof shellAmbientSchema> {
  return shellAmbientSchema.parse({
    viewerUserId: section.viewerUserId,
    reads: Object.fromEntries(Object.entries(section.reads).map(([name, read]) => [name, read.output])),
    recentRooms: section.recentRooms.map((room) => room.output),
  });
}

/** Reconstruct only the finite shell requests; changed requests refuse in the corpus serializer. */
export function hydrateShellAmbient(section: z.output<typeof shellAmbientSchema>): CorpusShellAmbient {
  const { reads } = section;
  return {
    viewerUserId: section.viewerUserId,
    reads: {
      recentChats: { input: shellAmbientInput.recentChats(), output: reads.recentChats },
      quickPicks: { input: shellAmbientInput.quickPicks(), output: reads.quickPicks },
      rosterPreview: { input: shellAmbientInput.rosterPreview(), output: reads.rosterPreview },
      recentDocuments: { input: shellAmbientInput.recentDocuments(), output: reads.recentDocuments },
      inbox: { input: shellAmbientInput.inbox(), output: reads.inbox },
      reaped: { input: undefined, output: reads.reaped },
    },
    recentRooms: section.recentRooms.map((output) => ({ input: shellAmbientInput.room(output), output })),
  };
}
