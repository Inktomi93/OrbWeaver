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
  readonly handle: string;
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
  readonly handle: string;
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
    handle: "char_ct_1",
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
    handle: "char_ct_1",
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
