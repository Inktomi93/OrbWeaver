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

export function makeTagFixture(
  overrides: Partial<CharacterSummaryFixtureTag> = {},
): CharacterSummaryFixtureTag {
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

/** A fully-valid `CharacterSummary` literal (the client read model — the library-list row). */
export function makeCharacterSummary(
  overrides: Partial<CharacterSummaryFixture> = {},
): CharacterSummaryFixture {
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
