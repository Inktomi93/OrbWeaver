// The plugin feature's TWO chat-anchor contributions (plugin-ui-plane #679 U2, seam 7) — the door-side halves
// of the `chat-flank` and `chat-settings-section` plugin anchors (§4.5). plugin never imports chat and chat
// never imports plugin: `compose/authed-app.tsx` owns both arrays and injects these members, exactly as it does
// for automation's needle meter and this feature's own snippet console.
//
// ONE CONTRIBUTION PER ANCHOR, FOREVER (the one-assembly law, G8). Neither array grows when a person installs
// a plugin — the per-plugin fan happens INSIDE the body, off `plugin.listSurfaces` (`PluginAnchoredSurfaces`).
//
// THE FLANK'S `when`/`body` SPLIT IS THE SEAM'S LAW (the `automationNeedleMeterSurface` precedent): `when` is
// SYNC and sees only `{chatId}`, so it can answer "could this ever apply" and nothing more. Whether this person
// has a plugin with a `chat-flank` surface is DATA, so there is deliberately NO `when` here — the contribution
// mounts in every room and its body returns `null` (never an empty wrapper) where it does not apply, which the
// flank column's `empty:hidden` collapse renders identically to not being mounted at all. A plugin surface also
// needs no committed room: a plugin may publish plugin-wide state (keyed by (plugin, surface) alone), so a
// draft room is not a reason to withhold it.
//
// THE ROOM RIDES THROUGH (row 777). Both anchors hand the fan-out their `chatId`, which is what lets a plugin
// publish PER-ROOM state and a room-anchored action run in the room a person is actually looking at. The flank's
// `chatId` is nullable (a draft room has none); the fan-out treats `null` as "plugin-wide only", which is
// exactly right — there is no room for a room-keyed row to belong to yet.

import type { ReactElement } from "react";
import type { ChatSettingsSectionContribution, ChatSurfaceContribution } from "#lib";
import { PluginAnchoredSurfaces } from "../components/plugin-anchored-surfaces.tsx";

/** The `chat-flank` anchor: plugin surfaces mounted beside the transcript, in the room's flank column. */
export const pluginChatFlankSurface: ChatSurfaceContribution = {
  id: "pluginChatFlank",
  anchor: "thread-flank",
  body: ({ chatId }): ReactElement | null => <PluginAnchoredSurfaces anchor="chat-flank" {...(chatId === null ? {} : { chatId })} />,
};

/** The `chat-settings-section` anchor: plugin panels inside the "This chat" tab's HOST-ONLY band. Host-gated by
 *  MOUNT (the whole band is omitted for a member — `contribution-contracts.ts`), the same wall the snippet
 *  console rides, and deliberately tighter than the per-surface permission: a plugin's room panel is the
 *  installer's own, and the room's other members have no business being handed it by default.
 *
 *  The host spells the `<Section kicker>`, so this contribution carries a NAME and a BODY and never its own
 *  grouping chrome — and the host collapses that Section when the body renders nothing (settings-context-tab),
 *  so a person with no plugin panels sees no heading. */
export const pluginChatSettingsSection: ChatSettingsSectionContribution = {
  id: "pluginChatSurfaces",
  anchor: "host-controls",
  kicker: "Plugin panels",
  body: ({ chatId }): ReactElement | null => <PluginAnchoredSurfaces anchor="chat-settings-section" chatId={chatId} />,
};
