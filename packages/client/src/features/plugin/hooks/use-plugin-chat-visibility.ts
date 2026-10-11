// Which plugins' chat panels this user has hidden — per plugin, per user, in every room. The list rides the
// user's settings (`profile.hiddenChatPluginIds`), so it follows them across devices and needs no plugin row.
// Panels show by default; the panel's Hide and the Plugins pane's "Show in chat" switch are the two doors.

import type { PluginId } from "@orb/kit/ids";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation, peekQueryData, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { CHAT_PANEL_HIDDEN_HINT, CHAT_PANEL_UNDO_LABEL, chatPanelHiddenTitle } from "../lib/plugin-copy.ts";

interface PluginPanelPrefsPatchVars {
  readonly section: "profile";
  readonly patch: { readonly hiddenChatPluginIds?: readonly PluginId[]; readonly flankCollapsed?: boolean };
}
/** The settings read the write patches in place — tRPC-inferred, so a reshape of it breaks here. */
type UserSettingsRead = inferOutput<Trpc["settings"]["getUserSettings"]>;

// OPTIMISTIC, NOT ECHOED: the cache takes the write the moment it is made, so a second hide or an Undo pressed
// before the first write lands builds its list from the first one's result. An echo would land the FIRST
// response over the second's optimistic list when responses arrive late.
const useSetPluginPanelPrefs = createEntityMutation<PluginPanelPrefsPatchVars, unknown, UserSettingsRead>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // emits `settingsChanged` → USER_BUS_FILTERS covers getUserSettings.
  optimistic: {
    readKey: (trpc) => trpc.settings.getUserSettings.queryKey(),
    update: (old, vars) =>
      old === undefined
        ? undefined
        : {
            ...old,
            config: {
              ...old.config,
              profile: {
                ...old.config.profile,
                ...(vars.patch.hiddenChatPluginIds === undefined ? {} : { hiddenChatPluginIds: [...vars.patch.hiddenChatPluginIds] }),
                ...(vars.patch.flankCollapsed === undefined ? {} : { flankCollapsed: vars.patch.flankCollapsed }),
              },
            },
          },
  },
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
  const setHidden = useSetPluginPanelPrefs({ trpc, invalidation });
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

export interface PluginFlankCollapse {
  /** The user's settings have arrived: the answer below is theirs, not the default. */
  readonly ready: boolean;
  readonly collapsed: boolean;
  readonly toggle: () => void;
}

/** Whether the user folded the room's plugin column away, and the one door that flips it. Stored in the user's
 *  settings, so it holds across rooms, reloads and devices. */
export function usePluginFlankCollapsed(): PluginFlankCollapse {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const setPrefs = useSetPluginPanelPrefs({ trpc, invalidation });
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  return {
    ready: data !== undefined,
    collapsed: data?.config.profile.flankCollapsed ?? false,
    // Read at click time for the same reason `hide` does: the cache already holds a write still in flight.
    toggle: (): void => {
      const current = peekQueryData(queryClient, trpc.settings.getUserSettings.queryKey())?.config.profile.flankCollapsed ?? false;
      setPrefs.mutate({ section: "profile", patch: { flankCollapsed: !current } });
    },
  };
}
