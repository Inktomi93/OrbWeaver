// These discriminants identify the native file format independently of the entity family in the backup registry.
export const CHAT_BUNDLE_SCHEMA_KIND = "orb.chat.bundle";
export const DATABANK_SCHEMA_KIND = "orb.databank.document";
export const GALLERY_SCHEMA_KIND = "orb.gallery";
export const IMAGERY_SCHEMA_KIND = "orb.imagery";
export const PERSONA_SCHEMA_KIND = "orb.persona";
export const PRESET_SCHEMA_KIND = "orb.preset";
export const REGEX_SCRIPT_SCHEMA_KIND = "orb.regex-script";
export const SPEND_LEDGER_SCHEMA_KIND = "orb.spend-ledger";
export const TAG_LIBRARY_SCHEMA_KIND = "orb.tag-library";
export const THEME_SCHEMA_KIND = "orb.theme";
export const USER_SETTINGS_SCHEMA_KIND = "orb.user-settings";
export const WORLD_INFO_SCHEMA_KIND = "orb.world-info.book";

const PORTABLE_SCHEMA_KINDS = [
  CHAT_BUNDLE_SCHEMA_KIND,
  DATABANK_SCHEMA_KIND,
  GALLERY_SCHEMA_KIND,
  IMAGERY_SCHEMA_KIND,
  PERSONA_SCHEMA_KIND,
  PRESET_SCHEMA_KIND,
  REGEX_SCRIPT_SCHEMA_KIND,
  SPEND_LEDGER_SCHEMA_KIND,
  TAG_LIBRARY_SCHEMA_KIND,
  THEME_SCHEMA_KIND,
  USER_SETTINGS_SCHEMA_KIND,
  WORLD_INFO_SCHEMA_KIND,
] as const;

export type PortableSchemaKind = (typeof PORTABLE_SCHEMA_KINDS)[number];
