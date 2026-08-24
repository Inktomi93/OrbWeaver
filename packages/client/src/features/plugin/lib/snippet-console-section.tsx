// C7 — the plugin CONSOLE's "This chat" SECTION contribution, grafted into chat's per-chat-configuration
// tab through the §6c `ChatSettingsSectionContribution` seam (the 13th contributor family, minted at #616).
// plugin NEVER imports chat and chat never imports plugin — the door (`compose/authed-app.tsx`) assembles
// this def into the `chat-settings-sections` registry and `CommittedSettingsTab` renders it blind in the
// band's own `<Section kicker>` grammar, exactly as automation's Rules section does.
//
// HOST-ONLY BY MOUNT, and that is DELIBERATELY TIGHTER THAN THE VERB. `runSnippet` is the one plugin path a
// plain MEMBER reaches (its authority gate admits anyone who can READ the chat, and the fixed grant profile
// then withholds `chat.variables.write` from a non-host — `verbs/run-snippet.ts:28-32`). But the only
// section anchor that exists today is `host-controls`, whose whole band is omitted for a member, and a
// code-execution console is not a control to hand every participant in a room by default. So the surface is
// narrower than the permission on purpose. Widening it later is one `CHAT_SETTINGS_SECTION_ANCHORS` tuple
// entry plus a member-readable arm on the union — the documented extension shape — not a rewrite here.

import type { ReactElement } from "react";
import type { ChatSettingsSectionContribution } from "#lib";
import { SnippetConsole } from "../components/snippet-console.tsx";

/** The host-only "Plugin console" section inside the "This chat" tab. Reads nothing on mount (the snippet
 *  run is a mutation), so it needs no `QueryBoundary` of its own. */
export const pluginSnippetConsoleSection: ChatSettingsSectionContribution = {
  id: "pluginSnippetConsole",
  anchor: "host-controls",
  kicker: "Plugin console",
  body: (state): ReactElement => <SnippetConsole chatId={state.chatId} />,
};
