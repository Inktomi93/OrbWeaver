// The reads of the door's "This chat" sections (`chatSettingsSections` in `compose/contributors.ts`), fed with
// the quietest true state: no automation rules, no installed plugins, no plugin surfaces.
//
// The CT harness mounts the production section list, so any CT that reaches the "This chat" tab for a reason of
// its own makes these reads. An unfed read answers `null`, which is not a view: a suspending reader throws and
// its `QueryBoundary` swaps the section body for `QueryErrorState` (`route-trpc.ts` header). Same precedent as
// `regex-reads-empty.ts`: one home, so a section that grows a read is fed in one place.

/** Spread into a `routeTrpc` map by any CT that mounts the "This chat" tab. */
export const CHAT_SETTINGS_SECTIONS_READS_EMPTY = {
  "automation.listRules": (): readonly never[] => [],
  "plugin.list": (): readonly never[] => [],
  "plugin.listSurfaces": (): readonly never[] => [],
} as const;
