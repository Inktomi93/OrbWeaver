// The rail names of the sections a shell or journey spec opens, read from the zero-import module each section's own rail
// entry prints, so a spec follows the product when a section is renamed.
import { CHARACTERS_SECTION_LABEL } from "../../../packages/client/src/features/character/lib/characters-section-label.ts";
import { CHATS_SECTION_LABEL } from "../../../packages/client/src/features/chat/lib/chats-section-label.ts";
import { CONFIG_SECTION_LABEL } from "../../../packages/client/src/features/config/lib/config-copy.ts";
import { DATABANK_SECTION_LABEL } from "../../../packages/client/src/features/databank/lib/databank-section-label.ts";
import { CORPUS_SECTION_LABEL } from "../../../packages/client/src/features/discovery/lib/corpus-section-label.ts";
import { HOME_SECTION_LABEL } from "../../../packages/client/src/features/home/lib/home-section-label.ts";
import { EXTENSIONS_SECTION_LABEL } from "../../../packages/client/src/features/plugin/lib/extensions-section-label.ts";
import { PRESETS_SECTION_LABEL } from "../../../packages/client/src/features/preset/lib/presets-section-label.ts";
import { REFINERY_SECTION_LABEL } from "../../../packages/client/src/features/refinery/lib/refinery-section-label.ts";

export const SECTION_LABELS = {
  characters: CHARACTERS_SECTION_LABEL,
  chats: CHATS_SECTION_LABEL,
  corpus: CORPUS_SECTION_LABEL,
  databank: DATABANK_SECTION_LABEL,
  extensions: EXTENSIONS_SECTION_LABEL,
  home: HOME_SECTION_LABEL,
  presets: PRESETS_SECTION_LABEL,
  refinery: REFINERY_SECTION_LABEL,
  settings: CONFIG_SECTION_LABEL,
} as const;
