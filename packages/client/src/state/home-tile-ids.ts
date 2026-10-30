/** The production Home population; the composition root provides exactly one definition per identity. */
export const HOME_TILE_IDS = [
  "chat.masthead",
  "chat.recents",
  "chat.alsoOpen",
  "chat.quickPicks",
  "rosterPreset.rosters",
  "chat.tempChat",
  "databank.documents",
  "home.jump",
] as const;
export type HomeTileId = (typeof HOME_TILE_IDS)[number];

export const [
  CHAT_MASTHEAD_TILE_ID,
  CHAT_RECENTS_TILE_ID,
  ALSO_OPEN_TILE_ID,
  QUICK_PICKS_TILE_ID,
  ROSTERS_TILE_ID,
  CHAT_TEMP_CHAT_TILE_ID,
  DATABANK_DOCUMENTS_TILE_ID,
  HOME_JUMP_TILE_ID,
] = HOME_TILE_IDS;
