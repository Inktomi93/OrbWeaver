import { Blocks } from "@orb/ui/icons";
import type { ChatContextState, ChatContextTabId, ContextTabDef } from "#lib";
import { CHAT_PLUGINS_TAB_LABEL } from "#lib";
import { PluginContextPanels } from "../components/plugin-context-panels.tsx";

/** The host-owned home for ordinary plugin chat panels, independent of author registration anchors. */
export const pluginContextTab: ContextTabDef<ChatContextState> & { readonly id: ChatContextTabId } = {
  id: "plugins",
  label: CHAT_PLUGINS_TAB_LABEL,
  icon: Blocks,
  body: (state) => <PluginContextPanels chatId={state.chatId} />,
};
