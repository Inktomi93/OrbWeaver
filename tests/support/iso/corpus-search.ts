// Settled search captures bind every room-derived result to its native host viewer; private rows stay Node-owned.
import { chatDetailSchema } from "@orb/contracts/chat";
import { viewerViewSchema } from "@orb/contracts/identity";
import {
  fieldSearchResultSchema,
  searchSpaceStatusSchema,
  searchSuggestionSchema,
  similarArtHitSchema,
  unifiedSearchResultSchema,
} from "@orb/contracts/search";
import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { CorpusRead } from "./corpus-read.ts";

const SEARCH_QUERY = "orbital ledger";
const SEARCH_LIMIT = 20;
const SEARCH_FIELDS_QUERY = "orbital";
const SEARCH_SUGGEST_QUERY = "orbit";
const SEARCH_SUGGEST_LIMIT = 10;
const searchIdsSchema = z.strictObject({
  chatId: typeIdSchema(ID_PREFIX.chat),
  povId: typeIdSchema(ID_PREFIX.character),
  imageSeedId: typeIdSchema(ID_PREFIX.character),
});

interface SearchReadCaptures {
  readonly viewer: CorpusRead<"sessions.me">;
  readonly entities: CorpusRead<"search.search">;
  readonly characters: CorpusRead<"search.search">;
  readonly discover: CorpusRead<"search.search">;
  readonly digests: CorpusRead<"search.search">;
  readonly corpus: CorpusRead<"search.search">;
  readonly documents: CorpusRead<"search.search">;
  readonly segments: CorpusRead<"search.search">;
  readonly imagesRaw: CorpusRead<"search.search">;
  readonly imagesCaptioned: CorpusRead<"search.search">;
  readonly fields: CorpusRead<"search.fields">;
  readonly suggest: CorpusRead<"search.suggest">;
  readonly similarRaw: CorpusRead<"search.similarArt">;
  readonly similarCaptioned: CorpusRead<"search.similarArt">;
  readonly status: CorpusRead<"search.spaceStatus">;
}

/** The finite settled requests; neither the parser nor a responder accepts an uncaptured variation. */
export function corpusSearchInput(ids: z.output<typeof searchIdsSchema>): {
  readonly [Key in keyof SearchReadCaptures]: SearchReadCaptures[Key]["input"];
} {
  const base = { query: SEARCH_QUERY, topN: SEARCH_LIMIT, rerank: false } as const;
  const scope = { kind: "owner" } as const;
  return {
    viewer: undefined,
    entities: { ...base, over: "entities", scope },
    characters: { ...base, over: "characters", scope },
    discover: { ...base, over: "discover", scope },
    digests: { ...base, over: "digests", scope },
    corpus: { ...base, over: "corpus", scope },
    documents: { ...base, over: "documents", scope },
    segments: { ...base, over: "segments", scope: { kind: "chat", chatId: ids.chatId, scopedCharacterId: ids.povId } },
    imagesRaw: { ...base, over: "images", scope, lens: "image-raw" },
    imagesCaptioned: { ...base, over: "images", scope, lens: "image-captioned" },
    fields: { query: SEARCH_FIELDS_QUERY, topN: SEARCH_LIMIT },
    suggest: { query: SEARCH_SUGGEST_QUERY, limit: SEARCH_SUGGEST_LIMIT },
    similarRaw: { characterId: ids.imageSeedId, topN: SEARCH_LIMIT, lens: "image-raw" },
    similarCaptioned: { characterId: ids.imageSeedId, topN: SEARCH_LIMIT, lens: "image-captioned" },
    status: undefined,
  } as const;
}

const searchReadsSchema = z.strictObject({
  viewer: viewerViewSchema,
  entities: unifiedSearchResultSchema,
  characters: unifiedSearchResultSchema,
  discover: unifiedSearchResultSchema,
  digests: unifiedSearchResultSchema,
  corpus: unifiedSearchResultSchema,
  documents: unifiedSearchResultSchema,
  segments: unifiedSearchResultSchema,
  imagesRaw: unifiedSearchResultSchema,
  imagesCaptioned: unifiedSearchResultSchema,
  fields: fieldSearchResultSchema,
  suggest: searchSuggestionSchema.array(),
  similarRaw: similarArtHitSchema.array(),
  similarCaptioned: similarArtHitSchema.array(),
  status: searchSpaceStatusSchema,
});

function roomsOfSearch(output: CorpusRead<"search.search">["output"]): readonly string[] {
  switch (output.over) {
    case "discover":
      return [...output.hits.flatMap((hit) => hit.segments), ...output.standaloneSegments].flatMap((segment) => [segment.chatId, segment.source.chatId]);
    case "digests":
      return output.hits.flatMap((hit) => [hit.blockKey.chatId, hit.source.chatId]);
    case "segments":
      return output.hits.map((hit) => hit.blockKey.chatId);
    case "corpus":
      return output.hits.flatMap((hit) => [hit.source.chatId, ...hit.blockKeys.map((key) => key.chatId)]);
    case "entities":
    case "characters":
    case "images":
    case "documents":
      return [];
    default: {
      const exhaustive: never = output;
      throw new Error(`Unrepresented corpus search output: ${String(exhaustive)}`);
    }
  }
}

/** Every room referenced by a native search output requires its own viewer-bearing authority witness. */
export function corpusSearchRoomIds(outputs: readonly CorpusRead<"search.search">["output"][]): readonly string[] {
  return [...new Set(outputs.flatMap(roomsOfSearch))].sort();
}

export const corpusSearchSchema = z
  .strictObject({ viewerUserId: brandedId<UserId>(), ids: searchIdsSchema, rooms: chatDetailSchema.array(), reads: searchReadsSchema })
  .refine(({ viewerUserId, ids, rooms, reads }) => {
    const requests = corpusSearchInput(ids);
    const searches = [
      reads.entities,
      reads.characters,
      reads.discover,
      reads.digests,
      reads.corpus,
      reads.documents,
      reads.segments,
      reads.imagesRaw,
      reads.imagesCaptioned,
    ];
    const expected = [
      requests.entities,
      requests.characters,
      requests.discover,
      requests.digests,
      requests.corpus,
      requests.documents,
      requests.segments,
      requests.imagesRaw,
      requests.imagesCaptioned,
    ];
    const requiredRooms = new Set([ids.chatId, ...corpusSearchRoomIds(searches)]);
    return (
      reads.viewer.userId === viewerUserId &&
      rooms.length === requiredRooms.size &&
      new Set(rooms.map((room) => room.id)).size === requiredRooms.size &&
      rooms.every((room) => requiredRooms.has(room.id) && room.viewerUserId === viewerUserId && room.viewerIsHost) &&
      rooms.some((room) => room.id === ids.chatId && room.viewerOwnedCharacterIds.includes(ids.povId)) &&
      searches.every((output, index) => output.over === expected[index]?.over && output.coverage.requestLimit === SEARCH_LIMIT && !output.coverage.reranked) &&
      reads.segments.over === "segments" &&
      reads.segments.hits.length > 0 &&
      reads.segments.hits.every((hit) => hit.blockKey.chatId === ids.chatId && hit.blockKey.scopedCharacterId === ids.povId)
    );
  }, "Corpus search viewer or retrieval cohort mismatch");

export interface CorpusSearchLibrary extends Omit<z.output<typeof corpusSearchSchema>, "reads" | "rooms"> {
  readonly rooms: readonly CorpusRead<"chat.getChat">[];
  readonly reads: SearchReadCaptures;
}

/** Validate the actual native outputs without rebuilding the captured requests. */
export function publishCorpusSearch(section: CorpusSearchLibrary): z.output<typeof corpusSearchSchema> {
  return corpusSearchSchema.parse({
    viewerUserId: section.viewerUserId,
    ids: section.ids,
    rooms: section.rooms.map((room) => room.output),
    reads: Object.fromEntries(Object.entries(section.reads).map(([name, read]) => [name, read.output])),
  });
}

/** Hydration restores only this finite cohort's exact requests. */
export function hydrateCorpusSearch(section: z.output<typeof corpusSearchSchema>): CorpusSearchLibrary {
  const inputs = corpusSearchInput(section.ids);
  const { reads } = section;
  return {
    viewerUserId: section.viewerUserId,
    ids: section.ids,
    rooms: section.rooms.map((output) => ({ input: { chatId: output.id }, output })),
    reads: {
      viewer: { input: inputs.viewer, output: reads.viewer },
      entities: { input: inputs.entities, output: reads.entities },
      characters: { input: inputs.characters, output: reads.characters },
      discover: { input: inputs.discover, output: reads.discover },
      digests: { input: inputs.digests, output: reads.digests },
      corpus: { input: inputs.corpus, output: reads.corpus },
      documents: { input: inputs.documents, output: reads.documents },
      segments: { input: inputs.segments, output: reads.segments },
      imagesRaw: { input: inputs.imagesRaw, output: reads.imagesRaw },
      imagesCaptioned: { input: inputs.imagesCaptioned, output: reads.imagesCaptioned },
      fields: { input: inputs.fields, output: reads.fields },
      suggest: { input: inputs.suggest, output: reads.suggest },
      similarRaw: { input: inputs.similarRaw, output: reads.similarRaw },
      similarCaptioned: { input: inputs.similarCaptioned, output: reads.similarCaptioned },
      status: { input: inputs.status, output: reads.status },
    },
  };
}
