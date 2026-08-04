// foundation/observability/debug/inspect — front door for the read-only DB probes (the dissolved `debug`
// domain's persistence, folded into foundation; reads @orb/db DOWN — no DbInspector port, ledger).

export {
  type AppSettingRow,
  appSettingRows,
  type CharacterDetailRow,
  type ChatConfigRow,
  type ChatParticipantRow,
  characterDetailRow,
  characterPolicySweep,
  chatConfigRow,
  type PersonaRow,
  type PresetRow,
  personaRows,
  presetRows,
  type RenderPolicyVerdict,
  type RpgGameRow,
  rpgGameForChat,
  type UserSettingsRow,
  userSettingsRows,
} from "./config.ts";
export {
  type ChatInspection,
  type InspectedMessage,
  type InspectedParticipant,
  inspectChatState,
} from "./inspect-chat.ts";
export { type IntegrityReport, integrityProbe } from "./integrity.ts";
export { type CharacterListRow, type ChatListRow, characterListSummaries, chatListSummaries } from "./list.ts";
export { tableCounts } from "./stats.ts";
