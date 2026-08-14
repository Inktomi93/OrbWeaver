import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

// Character CT fixtures — plain client read-model literals matching `CharacterSummary`'s wire shape
// (packages/server/src/domain/character/contract/views.ts). Kept as plain literals with STRING ids (not
// the branded `CharacterId`/`TagId` — those brands are compile-time only and `routeTrpc` fulfills raw
// JSON, so a plain string is the honest wire shape) — the same "fixtures are plain literals, not the
// support/factories DB-row builders" precedent `features/chat/fixtures.ts` documents.

const FROZEN_AT = 1_750_000_000_000;

export interface CharacterSummaryFixtureTag {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly color2: string | null;
  readonly source: string | null;
  readonly folderType: string;
  readonly sortOrder: number | null;
  readonly isHiddenOnCard: boolean;
}

/** The `character.list` row shape (CharacterSummary) — a plain fixture literal, see header. */
export interface CharacterSummaryFixture {
  readonly id: string;
  readonly handle: CharacterHandle;
  readonly name: string;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly forbidExternalMedia: boolean | null;
  readonly trustHtml: boolean | null;
  readonly themeOverride: Record<string, unknown> | null;
  readonly avatarAssetId: string | null;
  readonly avatarHash: string | null;
  readonly contentHash: string;
  readonly createdAt: number;
  readonly tokenSize: number;
  readonly tags: readonly CharacterSummaryFixtureTag[];
  readonly elevatorPitch: string | null;
  readonly lastChattedAt: number | null;
}

export function makeTagFixture(overrides: Partial<CharacterSummaryFixtureTag> = {}): CharacterSummaryFixtureTag {
  return {
    id: "tag_ct_1",
    name: "rpg",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: null,
    isHiddenOnCard: false,
    ...overrides,
  };
}

/** The `character.get` row shape (CharacterDetail = the full card + identity columns) — the editor read. A
 *  plain fixture literal (see header); `routeTrpc` fulfills it as raw JSON. */
export interface CharacterDetailFixture {
  readonly id: string;
  readonly handle: CharacterHandle;
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly greetings: readonly { readonly text: string; readonly groupOnly?: boolean }[];
  readonly exampleMessages: string | null;
  readonly systemPrompt: string | null;
  readonly postHistoryInstructions: string | null;
  readonly depthPrompt: {
    readonly prompt: string;
    readonly depth: number;
    readonly role?: string;
  } | null;
  readonly creatorNotes: string | null;
  readonly creator: string | null;
  readonly cardVersion: string | null;
  readonly regexScripts: readonly Record<string, unknown>[];
  readonly extensions: Record<string, unknown> | null;
  readonly residualData: Record<string, unknown> | null;
  readonly avatarAssetId: string | null;
  readonly refinery: {
    readonly score: number | null;
    readonly analysis: Record<string, unknown> | null;
  } | null;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly synthetic: boolean;
  readonly forbidExternalMedia: boolean | null;
  readonly trustHtml: boolean | null;
  readonly themeOverride: Record<string, unknown> | null;
  readonly importedFrom: string | null;
  readonly importHash: string | null;
  readonly contentHash: string;
  readonly createdAt: number;
  readonly avatarHash: string | null;
  readonly tags: readonly CharacterSummaryFixtureTag[];
}

/** A fully-valid `CharacterDetail` literal (the editor read). */
export function makeCharacterDetail(overrides: Partial<CharacterDetailFixture> = {}): CharacterDetailFixture {
  return {
    id: "char_ct_1",
    handle: castId<CharacterHandle>("char_ct_1"),
    name: "Aria",
    description: "A wandering cartographer.",
    personality: null,
    scenario: null,
    greetings: [{ text: "Hello, traveler." }],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
    starred: false,
    archived: false,
    synthetic: false,
    forbidExternalMedia: null,
    trustHtml: null,
    themeOverride: null,
    importedFrom: null,
    importHash: null,
    contentHash: "hash_ct_1",
    createdAt: FROZEN_AT,
    avatarHash: null,
    tags: [],
    ...overrides,
  };
}

/** A fully-valid `CharacterSummary` literal (the client read model — the library-list row). */
export function makeCharacterSummary(overrides: Partial<CharacterSummaryFixture> = {}): CharacterSummaryFixture {
  return {
    id: "char_ct_1",
    handle: castId<CharacterHandle>("char_ct_1"),
    name: "Aria",
    starred: false,
    archived: false,
    forbidExternalMedia: null,
    trustHtml: null,
    themeOverride: null,
    avatarAssetId: null,
    avatarHash: null,
    contentHash: "hash_ct_1",
    createdAt: FROZEN_AT,
    tokenSize: 42,
    tags: [],
    elevatorPitch: null,
    lastChattedAt: null,
    ...overrides,
  };
}

/** One `character.list` page (`ListCharactersResult`) — `totalCount` is the server's census over the
 *  request's scope, which the library's live region and the list band both print. */
export interface CharacterListPageFixture {
  readonly items: readonly CharacterSummaryFixture[];
  readonly nextCursor: { readonly sort: "recent"; readonly lastChattedAt: number | null; readonly createdAt: number; readonly id: string } | null;
  readonly totalCount: number;
}

/**
 * An INPUT-AWARE `character.list` responder — the stub applies the same narrowing the server does (`search`
 * · `starred` · `archived` · `includeTagIds` · `excludeTagIds` · `limit` · `cursor`), so a CT drives the
 * real semantics instead of a stub that hands back everything no matter what the surface asked.
 *
 * That distinction is the whole point after 2026-08-13, when every library lens moved server-side: a
 * fixed-array stub would make each filter/search CT pass by ignoring the very input under test — and it is
 * exactly what let the client-side-filtering defect live behind green CTs for months.
 *
 * The `chat.listChats` twin (`features/chat/fixtures.ts`) is the shape this mirrors. Ordering is the
 * ARRAY's — a fixture author states the order they want to assert; the cursor is the last served row's id.
 */
export function characterListResponder(all: readonly CharacterSummaryFixture[]): (input: unknown) => CharacterListPageFixture {
  return (input: unknown): CharacterListPageFixture => {
    const args = (input ?? {}) as {
      search?: string;
      starred?: boolean;
      archived?: boolean;
      includeTagIds?: readonly string[];
      excludeTagIds?: readonly string[];
      limit?: number;
      cursor?: { id?: string };
    };
    const needle = args.search?.trim().toLowerCase() ?? "";
    // `wanted` rather than `tagId`: fixture ids are plain wire strings (see the header), and a `tagId:
    // string` parameter is a `brand-in-name-position` violation — the gate is right, the fixture layer is
    // the exception it does not need to learn.
    const has = (row: CharacterSummaryFixture, wanted: string): boolean => row.tags.some((tag) => tag.id === wanted);
    const matched = all.filter(
      (row) =>
        (needle === "" ||
          row.name.toLowerCase().includes(needle) ||
          row.handle.toLowerCase().includes(needle) ||
          (row.elevatorPitch?.toLowerCase().includes(needle) ?? false) ||
          row.tags.some((tag) => tag.name.toLowerCase().includes(needle))) &&
        (args.starred === undefined || row.starred === args.starred) &&
        (args.archived === undefined || row.archived === args.archived) &&
        (args.includeTagIds ?? []).every((tagId) => has(row, tagId)) &&
        (args.excludeTagIds ?? []).every((tagId) => !has(row, tagId)),
    );
    const cursorId = args.cursor?.id;
    const from = cursorId === undefined ? 0 : matched.findIndex((row) => row.id === cursorId) + 1;
    const limit = args.limit ?? matched.length;
    const items = matched.slice(from, from + limit);
    const last = items.at(-1);
    return {
      items,
      // A FULL page always carries a cursor — the server mints one without a lookahead peek, so exhaustion
      // is discovered on the next (short) fetch. Reproduced here or the tail-fetch guard stops one page early.
      nextCursor: items.length === limit && last !== undefined ? { sort: "recent", lastChattedAt: null, createdAt: last.createdAt, id: last.id } : null,
      totalCount: matched.length,
    };
  };
}
