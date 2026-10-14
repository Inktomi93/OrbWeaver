// Portable corpus data contains owner-validated wire captures only, never Node row or credential material.
import { authConfigSchema } from "@orb/contracts/auth-config";
import { listCharactersResultSchema } from "@orb/contracts/character";
import { chatDetailSchema, chatListPageSchema } from "@orb/contracts/chat";
import { bankHealthViewSchema, documentDetailViewSchema, listDocumentsResultSchema } from "@orb/contracts/databank";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import { authMeSchema, viewerViewSchema } from "@orb/contracts/identity";
import { listInboxResultSchema } from "@orb/contracts/notifications";
import { personaDetailSchema } from "@orb/contracts/persona";
import { themeViewSchema, userSettingsViewSchema } from "@orb/contracts/settings";
import { tagSuggestionViewSchema } from "@orb/contracts/tag";
import { stableStringify } from "@orb/kit/stable-stringify";
import { z } from "zod";
import type { TrpcInput, TrpcProcedurePath, TrpcWireOutput } from "../node/route-trpc.ts";

/** A production route capture; inputs retain their presence and their canonical procedure type. */
export interface CorpusRead<P extends TrpcProcedurePath> {
  readonly input: TrpcInput<P>;
  readonly output: TrpcWireOutput<P>;
}

const corpusAuthSchema = z.strictObject({
  anonymousConfig: authConfigSchema,
  anonymousMe: authMeSchema,
  signedInConfig: authConfigSchema,
  signedInMe: authMeSchema,
});

/** The finite corpus requests, not a replacement for the production routers' input parsers. */
export const corpusReadInput = {
  absent: (): undefined => undefined,
  documentList: (): TrpcInput<"databank.list"> => ({}),
  persona: ({ id }: Pick<z.output<typeof personaDetailSchema>, "id">): TrpcInput<"persona.get"> => ({ personaId: id }),
  chat: ({ id }: Pick<z.output<typeof chatDetailSchema>, "id">): TrpcInput<"chat.getChat"> => ({ chatId: id }),
  document: ({ id }: Pick<z.output<typeof documentDetailViewSchema>, "id">): TrpcInput<"databank.get"> => ({ id, includeText: true }),
};

const publishedCorpusSchema = z.strictObject({
  auth: corpusAuthSchema,
  health: healthResponseSchema,
  reads: z.strictObject({
    "sessions.me": viewerViewSchema.array(),
    "settings.getUserSettings": userSettingsViewSchema.array(),
    "settings.listThemes": themeViewSchema.array().array(),
    "character.list": listCharactersResultSchema.array(),
    "character.count": z.int().nonnegative().array(),
    "persona.list": personaDetailSchema.array().array(),
    "persona.get": personaDetailSchema.array(),
    "chat.listChats": chatListPageSchema.array(),
    "chat.countChats": z.int().nonnegative().array(),
    "chat.getChat": chatDetailSchema.array(),
    "databank.get": documentDetailViewSchema.array(),
    "databank.list": listDocumentsResultSchema.array(),
    "databank.bankHealth": bankHealthViewSchema.array(),
    "notifications.list": listInboxResultSchema.array(),
    "tag.listPendingSuggestions": tagSuggestionViewSchema.array().array(),
    "worldInfo.countBooks": z.int().nonnegative().array(),
    "regex.countScripts": z.int().nonnegative().array(),
    "rosterPreset.count": z.int().nonnegative().array(),
  }),
});

export interface CorpusReads {
  readonly "sessions.me": readonly CorpusRead<"sessions.me">[];
  readonly "settings.getUserSettings": readonly CorpusRead<"settings.getUserSettings">[];
  readonly "settings.listThemes": readonly CorpusRead<"settings.listThemes">[];
  readonly "character.list": readonly CorpusRead<"character.list">[];
  readonly "character.count": readonly CorpusRead<"character.count">[];
  readonly "persona.list": readonly CorpusRead<"persona.list">[];
  readonly "persona.get": readonly CorpusRead<"persona.get">[];
  readonly "chat.listChats": readonly CorpusRead<"chat.listChats">[];
  readonly "chat.countChats": readonly CorpusRead<"chat.countChats">[];
  readonly "chat.getChat": readonly CorpusRead<"chat.getChat">[];
  readonly "databank.get": readonly CorpusRead<"databank.get">[];
  readonly "databank.list": readonly CorpusRead<"databank.list">[];
  readonly "databank.bankHealth": readonly CorpusRead<"databank.bankHealth">[];
  readonly "notifications.list": readonly CorpusRead<"notifications.list">[];
  readonly "tag.listPendingSuggestions": readonly CorpusRead<"tag.listPendingSuggestions">[];
  readonly "worldInfo.countBooks": readonly CorpusRead<"worldInfo.countBooks">[];
  readonly "regex.countScripts": readonly CorpusRead<"regex.countScripts">[];
  readonly "rosterPreset.count": readonly CorpusRead<"rosterPreset.count">[];
}

/** Serializable input produced by the Node publisher, not an intake for arbitrary procedure requests. */
export interface CorpusWireInput {
  readonly auth: z.input<typeof corpusAuthSchema>;
  readonly health: z.input<typeof healthResponseSchema>;
  readonly reads: CorpusReads;
}

export interface CorpusWire {
  readonly auth: z.output<typeof corpusAuthSchema>;
  readonly health: z.output<typeof healthResponseSchema>;
  readonly reads: CorpusReads;
}

function hydrateReads<P extends TrpcProcedurePath>(
  records: readonly CorpusRead<P>[],
  outputSchema: z.ZodType<NoInfer<TrpcWireOutput<P>>>,
): readonly CorpusRead<P>[] {
  return records.map((record) => ({ input: record.input, output: outputSchema.parse(record.output) }));
}

/** Validate published captures through their real owners while preserving each exact captured input. */
export function hydrateCorpusWire(input: CorpusWireInput): CorpusWire {
  return {
    auth: corpusAuthSchema.parse(input.auth),
    health: healthResponseSchema.parse(input.health),
    reads: {
      "sessions.me": hydrateReads(input.reads["sessions.me"], viewerViewSchema),
      "settings.getUserSettings": hydrateReads(input.reads["settings.getUserSettings"], userSettingsViewSchema),
      "settings.listThemes": hydrateReads(input.reads["settings.listThemes"], themeViewSchema.array()),
      "character.list": hydrateReads(input.reads["character.list"], listCharactersResultSchema),
      "character.count": hydrateReads(input.reads["character.count"], z.int().nonnegative()),
      "persona.list": hydrateReads(input.reads["persona.list"], personaDetailSchema.array()),
      "persona.get": hydrateReads(input.reads["persona.get"], personaDetailSchema),
      "chat.listChats": hydrateReads(input.reads["chat.listChats"], chatListPageSchema),
      "chat.countChats": hydrateReads(input.reads["chat.countChats"], z.int().nonnegative()),
      "chat.getChat": hydrateReads(input.reads["chat.getChat"], chatDetailSchema),
      "databank.get": hydrateReads(input.reads["databank.get"], documentDetailViewSchema),
      "databank.list": hydrateReads(input.reads["databank.list"], listDocumentsResultSchema),
      "databank.bankHealth": hydrateReads(input.reads["databank.bankHealth"], bankHealthViewSchema),
      "notifications.list": hydrateReads(input.reads["notifications.list"], listInboxResultSchema),
      "tag.listPendingSuggestions": hydrateReads(input.reads["tag.listPendingSuggestions"], tagSuggestionViewSchema.array()),
      "worldInfo.countBooks": hydrateReads(input.reads["worldInfo.countBooks"], z.int().nonnegative()),
      "regex.countScripts": hydrateReads(input.reads["regex.countScripts"], z.int().nonnegative()),
      "rosterPreset.count": hydrateReads(input.reads["rosterPreset.count"], z.int().nonnegative()),
    },
  };
}

function inputless<T>(output: T): { readonly input: undefined; readonly output: T } {
  return { input: corpusReadInput.absent(), output };
}

function hydratePublication(published: z.output<typeof publishedCorpusSchema>): CorpusWire {
  const { reads } = published;
  return {
    auth: published.auth,
    health: published.health,
    reads: {
      "sessions.me": reads["sessions.me"].map(inputless),
      "settings.getUserSettings": reads["settings.getUserSettings"].map(inputless),
      "settings.listThemes": reads["settings.listThemes"].map(inputless),
      "character.list": reads["character.list"].map(inputless),
      "character.count": reads["character.count"].map(inputless),
      "persona.list": reads["persona.list"].map(inputless),
      "persona.get": reads["persona.get"].map((output) => ({ input: corpusReadInput.persona(output), output })),
      "chat.listChats": reads["chat.listChats"].map(inputless),
      "chat.countChats": reads["chat.countChats"].map(inputless),
      "chat.getChat": reads["chat.getChat"].map((output) => ({ input: corpusReadInput.chat(output), output })),
      "databank.get": reads["databank.get"].map((output) => ({ input: corpusReadInput.document(output), output })),
      "databank.list": reads["databank.list"].map((output) => ({ input: corpusReadInput.documentList(), output })),
      "databank.bankHealth": reads["databank.bankHealth"].map(inputless),
      "notifications.list": reads["notifications.list"].map(inputless),
      "tag.listPendingSuggestions": reads["tag.listPendingSuggestions"].map(inputless),
      "worldInfo.countBooks": reads["worldInfo.countBooks"].map(inputless),
      "regex.countScripts": reads["regex.countScripts"].map(inputless),
      "rosterPreset.count": reads["rosterPreset.count"].map(inputless),
    },
  };
}

function capturedInputs(reads: CorpusReads): string {
  return stableStringify(
    Object.fromEntries(
      Object.entries<readonly CorpusRead<keyof CorpusReads>[]>({ ...reads }).map(([path, records]) => [
        path,
        records.map(({ input }) => (input === undefined ? { present: false } : { present: true, value: input })),
      ]),
    ),
  );
}

/** Refuse publication when a finite recipe would select a different request than the actual capture. */
export function serializeCorpusWire(wire: CorpusWire): string {
  const published = publishedCorpusSchema.parse({
    auth: wire.auth,
    health: wire.health,
    reads: Object.fromEntries(
      Object.entries<readonly CorpusRead<keyof CorpusReads>[]>({ ...wire.reads }).map(([path, records]) => [path, records.map(({ output }) => output)]),
    ),
  });
  if (capturedInputs(wire.reads) !== capturedInputs(hydratePublication(published).reads)) {
    throw new Error("Corpus request does not match its publication recipe");
  }
  return JSON.stringify(published);
}

/** Disk/browser intake validates the strict corpus envelope and each output through its canonical owner. */
export function parseCorpusWire(serialized: string): CorpusWire {
  return hydratePublication(publishedCorpusSchema.parse(JSON.parse(serialized)));
}
