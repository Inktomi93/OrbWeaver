// The per-user bus's exhaustive event-to-filter map, split from `invalidation.ts` like the automation and RPG maps:
// the central seam owns dispatch and the one `invalidateQueries` chokepoint, this module owns the user bus's reads.

import type { UserBusEvent } from "@orb/contracts/user-bus";
import { USER_BUS_EVENT_TYPES } from "@orb/contracts/user-bus";
import type { InvalidateFilter } from "./invalidation-reads.ts";
import { corpusRecomputeReads, promptPreviewReads } from "./invalidation-reads.ts";
import type { Trpc } from "./trpc.ts";

// Second map: the per-user bus. staleTime: Infinity means only a bus tick refetches a non-chat
// domain read; this is the freshness driver for every surface the chat bus doesn't reach. Coarse by
// design — each member path-invalidates its whole domain root.
type UserBusFilterMap = {
  readonly [K in UserBusEvent["type"]]: (event: Extract<UserBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

// Target changes refresh Labels attachment counts, destination names and staged character names.
export const USER_BUS_FILTERS: UserBusFilterMap = {
  // `chat.getMemberCard` is a CHAT-scoped projection of a character card (host-owned, clamped by the room's
  // memberCardVisibility) — a card edit is announced HERE, not on the chat bus, so without this row the member-
  // card dialog re-opened inside its gcTime window showed the pre-edit card. Path-level and free when the
  // dialog is closed (the read is `enabled: open`, so there is no cache entry to refetch).
  // + the regex attached-by rosters: a character RENAME must repaint its name in listScriptUsage
  // (REGROSTER's flagged gap — attach/detach ride regexChanged; renames ride only this event).
  // + the lexical search: each hit carries its card's name and avatar, so a rename or a delete repaints it.
  charactersChanged: (_e, trpc) => [
    trpc.character.pathFilter(),
    trpc.chat.getMemberCard.pathFilter(),
    trpc.regex.listScriptUsage.pathFilter(),
    trpc.search.fields.pathFilter(),
    trpc.tag.pathFilter(),
  ],
  personasChanged: (_e, trpc) => [trpc.persona.pathFilter(), trpc.tag.pathFilter()],
  // A preset edit changes the effective params (maxOutput/maxContext) the fit reserves against, so the
  // transcript divider's budget must refetch too (the boundary tracks knob changes live) — and the
  // preset OWNS the prompt's section order/content, so the prompt preview is stale on the same edit.
  // `getUserMacroPicks`/`getVariablePicks` ride a preset edit too: their DECLARATIONS halves ARE the active
  // preset's `userMacros`/`variables` (adding/removing a macro input or a ChoiceBlock changes which controls
  // the picks pane must render), and no chat-bus event fires when the preset — a different domain's row — is
  // edited. The preset ROOT filter also carries `resolveEffective`: every knob autosave, reset, import and
  // fork-COW emits this event, and re-resolving the funnel on save-settle is what makes the deck's effective
  // column TRUE rather than a snapshot (redesign §4.4).
  presetsChanged: (_e, trpc) => [
    trpc.preset.pathFilter(),
    trpc.tag.pathFilter(),
    trpc.chat.previewContextFit.pathFilter(),
    trpc.chat.getUserMacroPicks.pathFilter(),
    trpc.chat.getVariablePicks.pathFilter(),
    ...promptPreviewReads(trpc),
    // The regex attached-by roster names a preset by display name — a rename repaints here.
    trpc.regex.listScriptUsage.pathFilter(),
  ],
  worldInfoChanged: (_e, trpc) => [trpc.worldInfo.pathFilter(), trpc.tag.pathFilter()],
  // The library plane. The Regex section's body is a CHAT read, so `trpc.regex.pathFilter()` alone left the
  // HOST's own section stale after every one of the host's own writes (#1733's room plane covers the others).
  regexChanged: (_e, trpc) => [trpc.regex.pathFilter(), trpc.chat.listEffectiveRegex.pathFilter()],
  tagsChanged: (_e, trpc) => [trpc.tag.pathFilter(), trpc.character.pathFilter(), trpc.chat.getMemberCard.pathFilter()],
  // Themes live under the settings router but are a distinct read surface.
  themesChanged: (_e, trpc) => [trpc.settings.listThemes.pathFilter(), trpc.settings.getTheme.pathFilter()],
  // User settings only — not the app/global settings. Routing/roleDefaults changes re-resolve the chat
  // capability (the fit window), so the divider's budget refetches with the settings read — and so does
  // `connection.resolveChatCapability`, the read the preset params panel gates its sampling/reasoning/output
  // axes on (Connections writes roleDefaults through `settings.updateUserSettingsSection`, which is
  // busDriven — without this row, picking a chat model left the editor on its connect-a-model note until a
  // full page reload). Narrow filter, not the connection ROOT: the catalog reads under it are cold-fetch
  // expensive and no roleDefaults edit changes them.
  settingsChanged: (_e, trpc) => [
    trpc.settings.getUserSettings.pathFilter(),
    trpc.chat.previewContextFit.pathFilter(),
    trpc.connection.resolveChatCapability.pathFilter(),
    // `preset.resolveEffective` is the funnel projected AGAINST that capability, and its readout names the
    // model ("resolved for <model>"). A routing/model change that refetched the capability but not this read
    // would leave every provenance line — `model default`, `clamped to 1.2` — describing the OLD model.
    // Narrow, not the preset root: the preset ROWS did not change, and `presetsChanged` already covers those.
    trpc.preset.resolveEffective.pathFilter(),
    // `preset.listUsage`'s `isUserDefault` arm IS `seeds.defaultPresetId` — activating another preset is
    // precisely a settings write, and without this row the CONTEXT panel would keep calling the old pick
    // "your active preset" until a reload. Narrow, for the same reason as the line above.
    trpc.preset.listUsage.pathFilter(),
    // The same settings feed the ASSEMBLY the fit measures (chat behavior, the resolved model/capability the
    // shaper builds against) — the preview must move with the budget, never lag a knob behind it.
    ...promptPreviewReads(trpc),
  ],
  credentialsChanged: (_e, trpc) => [trpc.credentials.pathFilter()],
  // The chat-list + character-library recency driver, and the sole driver on the message-commit
  // terminal path (the server fans this to every present member on both canon-commit terminals and
  // chat-list lifecycle ops). chatId present (lifecycle) also refetches that chat's getChat.
  //
  // `trpc.stats.pathFilter()` (the ROUTER ROOT — all twelve Analytics reads) rides here: turn ECONOMICS is
  // written into the `owner_stats`/`character_stats` rollups inside the SAME db.batch as the canon write
  // (`ctx.applyStatsDelta`, `domain/chat/substrate/stats-delta.ts`), and this fan is the moment that batch
  // lands. Without it the twelve reads had NO driver at all: an open Analytics route froze at mount, and a
  // re-open inside gcTime served numbers up to 5 min old (the previewAssembly class).
  //
  // The cost objection that deferred this row is bounded by how `invalidateQueries` works: it REFETCHES only
  // ACTIVE queries and merely MARKS inactive ones stale. Every stats consumer lives in `features/stats`
  // (the Analytics section), and `SectionContent` hides an inactive section with `<Activity mode="hidden">`
  // — which tears down effects, so the observers unsubscribe. So a commit costs wire fetches ONLY while the
  // dashboard is the VISIBLE section (where live numbers are the point); everywhere else it costs exactly
  // one stale mark, which is what makes the next open correct. The reads are `owner_stats` rollup SELECTs,
  // not scans (`domain/stats/persistence/rollups.ts`).
  //
  // Two honest residuals, over- and under-fire, both accepted: a chat rename/star fans this with no stats
  // change (a spare stale mark), and a CHATLESS image generation (`imagery.editImage` with no `chatId`) does
  // write cost stats with no chat event — that dashboard catches up on the next chat activity. Closing the
  // latter needs a stats-grain producer event, not a wider chat one.
  // `getChatLineage` rides both arms: a membership change in ANY chat can open or close a fork's parent.
  chatsChanged: (e, trpc) =>
    e.chatId === undefined
      ? [trpc.chat.listChats.pathFilter(), trpc.chat.getChatLineage.pathFilter(), trpc.character.list.pathFilter(), trpc.stats.pathFilter()]
      : [
          trpc.chat.listChats.pathFilter(),
          trpc.chat.getChatLineage.pathFilter(),
          trpc.chat.getChat.queryFilter({ chatId: e.chatId }),
          trpc.character.list.pathFilter(),
          trpc.stats.pathFilter(),
          trpc.tag.pathFilter(),
        ],
  // The saved-roster library (#26 — D61 B6): ONE coarse row for the whole router root (the picker's list +
  // any future detail read). An APPLY never rides here — it mutates the CHAT, whose freshness is the chat
  // bus's `chatUpdated`; this member fires only on library CRUD (create/update/remove).
  rosterPresetsChanged: (_e, trpc) => [trpc.rosterPreset.pathFilter()],
  // The refinery workspace — the whole router root (roster · session view · run ledger · schema library ·
  // preflight): the member is coarse by design, every one of those reads moves on some write, and the
  // surface never has more than one session open, so a narrower map would be five rows for one refetch.
  //
  // `character.get` rides here, and it is the non-obvious row: a score/analyze run rewrites
  // `characters.refinery.score`/`.analysis` through the F6 stamp op, which is SILENT BY DESIGN (no audit,
  // no user-bus event — `character/persistence/refinery-ops.ts`). That is exactly what the card's
  // provenance readout renders, so without this row the readout has no driver at all once the write tier
  // stopped naming it (the R2 hooks are busDriven now). Narrow, not the character ROOT: the library list
  // did not change — a refinery run touches derived signals on ONE card, and `charactersChanged` already
  // covers everything that moves the roster.
  refineryChanged: (_e, trpc) => [trpc.refinery.pathFilter(), trpc.character.get.pathFilter()],
  // The document bank — the whole router root (library list · one document's detail · the global id set ·
  // the "Active in" attachment chips · the per-chat rack). Coarse on purpose: every databank write moves at
  // least two of those reads, and the previous alternative was nine mutations each hand-naming its own
  // subset (event-bus coverage survey H3). The `documentId` hint is deliberately UNUSED here — a root
  // path-invalidate is what the surface needs and it costs one refetch either way.
  //
  // Note what this row does NOT do, and this is the correction #2471 was filed for: it does not repaint the
  // chat rack for a NON-OWNER participant, and it never could — a user-bus event reaches ONE user's channel
  // by construction, so a host's attach repaints the HOST. The wording here used to say the room's half
  // "rides `chatUpdated`", which was true of only PART of it: `chatUpdated` carries the rack for MEMBERSHIP
  // and the D85 visibility write (see `BUS_FILTERS`), and the attach/detach/rename themselves fanned nothing
  // to the room at all — a co-member sat on the pre-attach rack until an unrelated `chatUpdated` landed.
  //
  // The room half is now its OWN driver: `roomEntityChanged{entity:"databank"}`, fanned by the databank
  // junction and library writes through `entry/compose/room-reach.ts` (bridge fork F-E closed by owner
  // ruling 2026-09-20). Widening THIS member to the room was never the alternative — `membership-fan-guard`
  // bans exactly that.
  databankChanged: (_e, trpc) => [trpc.databank.pathFilter()],
  corpusRecomputed: (_e, trpc) => corpusRecomputeReads(trpc),
  // The VIEWER'S OWN identity, through the one `identityFilters` helper the recovery ladder also calls (W7b).
  // Closes the staleness design's D5 gap: `sessions.me` had NO bus driver, so an `admin.setRole` grant — or an
  // SSO login elsewhere that renamed the handle / re-derived the role — reached a live client only on a full
  // reload, which at `staleTime: Infinity` may never come. It joins the reconnect gap-heal by DERIVATION, and
  // that half matters most here: the write happens on somebody ELSE'S request, so a device that was offline
  // for the grant has no local signal at all. NOT `admin.listUsers`/`listSessions` — those are the ACTING
  // admin's reads (writer-local, per their own cited `query-freshness-coverage` entries); this member only
  // ever reaches the AFFECTED user's channel.
  identityChanged: (_e, trpc) => identityFilters(trpc),
  // A plugin surface published new state (`host.ui.setState` U1). PATH-invalidate the
  // surface-state read — coarse by the member's own design (a `pluginId` hint the coarse map ignores): the only
  // viewer is the installer and they hold a handful of surfaces, so refetching all their `getSurfaceState`
  // entries on a poke is cheap and correct. NOT `listSurfaces` — a state change never moves the registration set
  // (that rides enable/disable, a different write).
  pluginSurfaceStateChanged: (_e, trpc) => [trpc.plugin.getSurfaceState.pathFilter()],
  // Every persisting connection and binding verb. A re-point's rebuild is queued after this tick, so the job list
  // rides `workloadsChanged` instead. The game read's delivery verdicts (read-only, the state round's fit against the
  // context window) are derived from the viewer's resolved connection, so they refetch with it.
  connectionsChanged: (_e, trpc) => [trpc.connection.pathFilter(), trpc.chat.getNextTurnConnection.pathFilter(), trpc.rpg.getGame.pathFilter()],
  // A rebuild starting or ending also moves whether search is paused, which the vector role rows read beside the jobs.
  workloadsChanged: (_e, trpc) => [trpc.workloads.list.pathFilter(), trpc.search.spaceStatus.pathFilter()],
};

/** The viewer triple: the server identity (`sessions.me`) plus the two reads a composed
 *  current-persona derivation would need (`settings.getUserSettings`/`persona.list`; the retired
 *  `use-viewer.ts`, #73, composed exactly these three — this filter set outlives the hook because the
 *  three reads are each independently live). TWO callers share this ONE spelling — the `identityChanged`
 *  row above (the cross-device driver; W7b retired this docblock's old "the map has NO identity member"
 *  note) and `invalidateIdentity()` in `invalidation.ts`, the recovery ladder's rung that fires with no event at all. */
export function identityFilters(trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.sessions.me.pathFilter(), trpc.settings.getUserSettings.pathFilter(), trpc.persona.list.pathFilter()];
}

/** Every filter the user map covers — derived so a new member can't drift the gap-heal set. */
export function allUserRootFilters(trpc: Trpc): readonly InvalidateFilter[] {
  return (Object.keys(USER_BUS_EVENT_TYPES) as UserBusEvent["type"][]).flatMap((type) => {
    const handler = USER_BUS_FILTERS[type] as (e: UserBusEvent, t: Trpc) => readonly InvalidateFilter[];
    return handler({ type } as UserBusEvent, trpc);
  });
}
