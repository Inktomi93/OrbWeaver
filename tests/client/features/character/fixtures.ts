import type { CharacterProvenance } from "@orb/contracts/character";
import { characterProvenanceOf } from "@orb/contracts/character";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { VIEWER_AMBIENT_ROUTES } from "../fixtures.ts";

// Character CT fixtures — plain client read-model literals matching `CharacterSummary`'s wire shape
// (packages/server/src/domain/character/contract/views.ts). Kept as plain literals with STRING ids (not
// the branded `CharacterId`/`TagId` — those brands are compile-time only and `routeTrpc` fulfills raw
// JSON, so a plain string is the honest wire shape) — the same "fixtures are plain literals, not the
// support/factories DB-row builders" precedent `features/chat/fixtures.ts` documents.

const FROZEN_AT = 1_750_000_000_000;

/** #865 — what a card with no import URL and no shipped creator mark reads as. Named (rather than inlined)
 *  so the widened-literal spread inside {@link makeCharacterSummary}'s `base` keeps the closed union. */
const DEFAULT_PROVENANCE: CharacterProvenance = "authored";

/**
 * THE AMBIENT READS OF A MOUNTED CHARACTER-EDITOR TREE (#649) — spread into every `routeTrpc` call in this
 * feature so the pipelines behind them actually RUN.
 *
 * Neither is anybody's subject: a facet-row CT is about the row's a11y contract, not about the character's
 * attached display scripts or its staged tag suggestions. But `routeTrpc` answers an unlisted procedure
 * `null` by design and `null` is not a view — both readers fell to their no-data arm, so the attachment
 * resolve path and the suggestion-tier path ran INERT in every editor-driven file. Empty ARRAYS are the
 * honest default for a fresh card (no attachments, nothing staged) AND they are real shapes, so the readers
 * execute their select/dedup work where `null` skipped it.
 *
 * Composes {@link VIEWER_AMBIENT_ROUTES} — the editor tree also reads the viewer's settings row. DEFAULTS,
 * NOT A CEILING: a file whose subject IS one of these lists the same key AFTER the spread and wins
 * (character-editor-surface.ct.tsx's `suggestionFixtures()` is exactly that).
 */
export const CHARACTER_EDITOR_AMBIENT_ROUTES: Readonly<Record<string, unknown>> = {
  ...VIEWER_AMBIENT_ROUTES,
  // `RegexScriptRow[]` — the scripts attached to this character, in execution order
  // (domain/regex/verbs/attachments/list-for-character.ts).
  "regex.listForCharacter": [],
  // `TagSuggestionView[]` — the owner-scoped read of STAGED (`status:'pending'`) tag suggestions
  // (domain/tag/verbs/list-pending-suggestions.ts).
  "tag.listPendingSuggestions": [],
};

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
  readonly createdAt: number;
  readonly tokenSize: number;
  readonly tags: readonly CharacterSummaryFixtureTag[];
  readonly elevatorPitch: string | null;
  readonly lastChattedAt: number | null;
  /** #1662 — WHICH room that stamp belongs to (`CharacterSummary.lastChatId`); null = never chatted. The
   *  landing's Recently-chatted faces are a door into it, so a fixture that omits it renders an OPEN door
   *  where the product renders a RESUME one. */
  readonly lastChatId: string | null;
  /** #865 — the `character_stats.chats` rollup, projected onto the row (0 when the join misses; never null). */
  readonly chatCount: number;
  /** #865 — the CLOSED where-it-came-from verdict the server derives once (`characterProvenanceOf`). The
   *  REAL union, not a loose string: the brands are what this file spells as plain strings (they are
   *  compile-time only), and a closed wire vocabulary is a value a fixture must not be able to invent. */
  readonly provenance: CharacterProvenance;
  /** #517 — does ANOTHER of this owner's characters carry the same name (case-insensitively)? The server
   *  answers it library-wide; {@link characterListResponder} recomputes it over the whole fixture library
   *  for the same reason the handle is derived from the name — a fixture whose shape the server cannot mint
   *  tests a product nobody ships. Hand-built page responders set it themselves. */
  readonly nameIsAmbiguous: boolean;
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
  readonly interactiveHtml: boolean | null;
  readonly themeOverride: Record<string, unknown> | null;
  readonly importedFrom: string | null;
  readonly importHash: string | null;
  /** #865 — the server-derived provenance verdict the Origin readout DISPATCHES on (it no longer re-derives
   *  it from `importedFrom` + `creator`, so a story that wants the shipped arm states THIS, not the creator). */
  readonly provenance: CharacterProvenance;
  readonly contentHash: string;
  readonly createdAt: number;
  readonly avatarHash: string | null;
  readonly tags: readonly CharacterSummaryFixtureTag[];
}

/** A fully-valid `CharacterDetail` literal (the editor read).
 *
 *  PROVENANCE IS DERIVED FROM THE RESULTING ROW unless the caller pins one — the same rule the handle
 *  below obeys, for the same reason. #865 moved the Origin readout off `importedFrom` onto the
 *  server-derived `provenance`, and the detail fixture kept `provenance` as a plain default: a story
 *  saying `importedFrom: "chub"` then produced a row carrying an import URL AND the `authored` verdict,
 *  which `characterProvenanceOf` cannot mint (`imported` wins outright on a non-null `importedFrom`).
 *  It rendered `Made here` and left the Overview pin red on main. Running the ONE derivation over the
 *  finished row keeps every fixture a shape the server can produce; a story that wants an arm the raw
 *  columns do not imply still states `provenance` and wins.
 *
 *  THE COROLLARY, AND IT BITES (#900): because a stated `provenance` PINS, re-running this factory over a
 *  row it already produced carries that row's OLD verdict forward — the finished row's derived field is,
 *  on the second pass, an explicit override. Re-derive from the RAW OVERRIDES
 *  (`makeCharacterDetail({ ...INPUT, creator })`), never from a finished detail. Measured: spreading a
 *  finished `authored` row and adding `creator: AUTHORED_CARD_CREATOR` still renders `Made here`. */
export function makeCharacterDetail(overrides: Partial<CharacterDetailFixture> = {}): CharacterDetailFixture {
  const row = {
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
    interactiveHtml: null,
    themeOverride: null,
    importedFrom: null,
    importHash: null,
    contentHash: "hash_ct_1",
    createdAt: FROZEN_AT,
    avatarHash: null,
    tags: [],
    ...overrides,
  };
  return { ...row, provenance: overrides.provenance ?? characterProvenanceOf(row) };
}

/** A fully-valid `CharacterSummary` literal (the client read model — the library-list row).
 *
 *  THE HANDLE IS DERIVED FROM THE NAME unless the caller pins one (#492). It used to be the fixed
 *  `char_ct_1` for every row, which is a shape the product cannot produce: the server mints a handle by
 *  slugifying the name (`@orb/kit/slug`), so `Bolt` is `bolt`. That mattered the moment the row started
 *  spending its handle as an accessible-name disambiguator ONLY when the handle is not derivable — under
 *  the old default every fixture row looked like a collision and announced one. A fixture whose shape the
 *  server cannot mint is a fixture that tests a product nobody ships. Pin `handle` explicitly to build the
 *  case that MATTERS: two rows with the same name and different handles. */
export function makeCharacterSummary(overrides: Partial<CharacterSummaryFixture> = {}): CharacterSummaryFixture {
  const base = {
    id: "char_ct_1",
    name: "Aria",
    starred: false,
    archived: false,
    forbidExternalMedia: null,
    trustHtml: null,
    themeOverride: null,
    avatarAssetId: null,
    avatarHash: null,
    createdAt: FROZEN_AT,
    tokenSize: 42,
    tags: [],
    elevatorPitch: null,
    lastChattedAt: null,
    lastChatId: null,
    chatCount: 0,
    provenance: DEFAULT_PROVENANCE,
    nameIsAmbiguous: false,
    ...overrides,
  };
  return { ...base, handle: overrides.handle ?? castId<CharacterHandle>(slugifyHandle(base.name)) };
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
  // #517 — the AMBIGUITY signal is LIBRARY-WIDE and lens-independent, exactly as the server computes it
  // (`ambiguousNamesFor`): a name is ambiguous when another of the owner's characters carries it, whatever
  // the current page or filter happens to hold. Derived here once so no fixture can claim an ambiguity the
  // library does not contain (or hide one it does).
  const nameCounts = new Map<string, number>();
  for (const character of all) {
    const key = character.name.toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const stamped = all.map((character) => ({ ...character, nameIsAmbiguous: (nameCounts.get(character.name.toLowerCase()) ?? 0) > 1 }));
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
    const matched = stamped.filter(
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
