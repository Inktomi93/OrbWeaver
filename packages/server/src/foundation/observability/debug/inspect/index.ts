// foundation/observability/debug/inspect — front door for the read-only DB probes (the dissolved `debug`
// domain's persistence, folded into foundation; reads @orb/db DOWN — no DbInspector port, ledger).

export {
  type ChatInspection,
  type InspectedMessage,
  type InspectedParticipant,
  inspectChatState,
} from "./inspect-chat";
export { type IntegrityReport, integrityProbe } from "./integrity";
export { type CharacterListRow, type ChatListRow, characterListSummaries, chatListSummaries } from "./list";
export { tableCounts } from "./stats";
