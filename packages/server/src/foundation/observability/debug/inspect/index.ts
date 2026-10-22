// foundation/observability/debug/inspect — front door for the read-only DB probes (the dissolved `debug`
// domain's persistence, folded into foundation; reads @orb/db DOWN — no DbInspector port, ledger).

export { automationFireRows } from "./automation-fires.ts";
export {
  characterDetailRow,
  characterPolicySweep,
  chatConfigRow,
  personaRows,
  presetRows,
  rpgGameForChat,
  userSettingsRows,
} from "./config.ts";
export { inspectChatState } from "./inspect-chat.ts";
export { integrityProbe } from "./integrity.ts";
export { characterListSummaries, chatListSummaries } from "./list.ts";
export { tableCounts } from "./stats.ts";
