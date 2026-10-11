// Which plugins' chat panels this user has hidden — per plugin, per user, in every room. The list rides the
// user's settings (`profile.hiddenChatPluginIds`), so it follows them across devices and needs no plugin row.
// Panels show by default; the panel's Hide and the Plugins pane's "Show in chat" switch are the two doors.

import type { PluginId } from "@orb/kit/ids";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createEntityMutation, peekQueryData, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { CHAT_PANEL_HIDDEN_HINT, CHAT_PANEL_UNDO_LABEL, chatPanelHiddenTitle } from "../lib/plugin-copy.ts";

interface HiddenChatPluginsPatchVars {
  readonly section: "profile";
  readonly patch: { readonly hiddenChatPluginIds: readonly PluginId[] };
}
const useSetHiddenChatPlugins = createEntityMutation<HiddenChatPluginsPatchVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // emits `settingsChanged` → USER_BUS_FILTERS covers getUserSettings.
  echo: (trpc) => trpc.settings.getUserSettings.queryKey(),
  errorToast: "Couldn't save that. Try again.",
});

export interface PluginChatVisibility {
  readonly isHidden: (pluginId: PluginId) => boolean;
  /** Hide the plugin's chat panels and offer an Undo that brings them back. */
  readonly hide: (plugin: { readonly id: PluginId; readonly name: string }) => void;
  /** Show (`true`) or hide (`false`) the plugin's chat panels without the Undo notice — the switch's door. */
  readonly setShown: (pluginId: PluginId, shown: boolean) => void;
}

export function usePluginChatVisibility(): PluginChatVisibility {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const setHidden = useSetHiddenChatPlugins({ trpc, invalidation });
  // A non-suspending read: a panel that mounts before settings arrive shows, which is the default.
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const hidden = data?.config.profile.hiddenChatPluginIds ?? [];

  // Read at click time, never from the render's snapshot: an Undo pressed seconds later must not restore a
  // list that another hide has since moved.
  const current = (): readonly PluginId[] => peekQueryData(queryClient, trpc.settings.getUserSettings.queryKey())?.config.profile.hiddenChatPluginIds ?? [];
  const write = (next: readonly PluginId[]): void => setHidden.mutate({ section: "profile", patch: { hiddenChatPluginIds: next } });
  const without = (pluginId: PluginId): readonly PluginId[] => current().filter((id) => id !== pluginId);

  return {
    isHidden: (pluginId): boolean => hidden.includes(pluginId),
    hide: ({ id, name }): void => {
      write([...without(id), id]);
      notify.info({
        title: chatPanelHiddenTitle(name),
        description: CHAT_PANEL_HIDDEN_HINT,
        action: { label: CHAT_PANEL_UNDO_LABEL, onClick: (): void => write(without(id)) },
      });
    },
    setShown: (pluginId, shown): void => write(shown ? without(pluginId) : [...without(pluginId), pluginId]),
  };
}
