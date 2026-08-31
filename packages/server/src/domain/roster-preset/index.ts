// domain/roster-preset — front door: the only legal external import. Saved rosters (D61 B6; build
// record: docs/history/design/saved-rosters-build-record.md). The cross-boundary wire types
// (RosterPresetView/RosterPresetSummary/ApplyRosterPresetResult + the create/update schemas) live in
// @orb/contracts/roster-preset; callers import them from there directly, not through this door.

export type { RosterPresetContext } from "./context.ts";
export {
  RosterPresetCharacterNotFoundError,
  RosterPresetNameConflictError,
  RosterPresetNotFoundError,
  RosterPresetPersonaNotFoundError,
} from "./contract/errors.ts";
export type {
  CastRuleWrite,
  MemberWrite,
  PresentCharacterSeat,
  RosterPresetAutomationOps,
  RosterPresetChatOps,
  RosterPresetService,
} from "./contract/service.ts";
export { createRosterPresetService } from "./service.ts";
