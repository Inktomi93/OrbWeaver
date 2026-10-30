// Feature-owned Home bodies are assembled once, exhaustively over the state-owned identity population.

import { chatAlsoOpenTile, chatMastheadTile, chatQuickPicksTile, chatRecentsTile, chatTempChatTile } from "#features/chat";
import { databankDocumentsTile } from "#features/databank";
import { makeSectionJumpTile } from "#features/home";
import { rosterPresetHomeTile } from "#features/roster-preset";
import type { ContributorRegistry } from "#lib";
import { createContributorRegistry } from "#lib";
import type { HomeTileContribution, HomeTileId } from "#state";
import {
  ALSO_OPEN_TILE_ID,
  CHAT_MASTHEAD_TILE_ID,
  CHAT_RECENTS_TILE_ID,
  CHAT_TEMP_CHAT_TILE_ID,
  DATABANK_DOCUMENTS_TILE_ID,
  HOME_JUMP_TILE_ID,
  HOME_TILE_IDS,
  QUICK_PICKS_TILE_ID,
  ROSTERS_TILE_ID,
} from "#state";

const HOME_TILE_CONTRIBUTIONS = {
  [CHAT_MASTHEAD_TILE_ID]: chatMastheadTile,
  [CHAT_RECENTS_TILE_ID]: chatRecentsTile,
  [ALSO_OPEN_TILE_ID]: chatAlsoOpenTile,
  [QUICK_PICKS_TILE_ID]: chatQuickPicksTile,
  [ROSTERS_TILE_ID]: rosterPresetHomeTile,
  [CHAT_TEMP_CHAT_TILE_ID]: chatTempChatTile,
  [DATABANK_DOCUMENTS_TILE_ID]: databankDocumentsTile,
} satisfies Record<Exclude<HomeTileId, typeof HOME_JUMP_TILE_ID>, HomeTileContribution>;

const definitions = {
  ...HOME_TILE_CONTRIBUTIONS,
  [HOME_JUMP_TILE_ID]: makeSectionJumpTile(Object.values(HOME_TILE_CONTRIBUTIONS)),
} satisfies Record<HomeTileId, HomeTileContribution>;

/** The single Home registry consumes the same exhaustive identity population used by surface admission. */
export const homeTiles: ContributorRegistry<HomeTileContribution> = createContributorRegistry<HomeTileContribution>(
  "home-tiles",
  HOME_TILE_IDS.map((id) => definitions[id]),
);
