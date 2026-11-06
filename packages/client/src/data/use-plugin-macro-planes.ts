// The caller's own enabled plugins' macros as catalog planes (`plugin.listMacros`). Cache-first and not a
// suspense read: every macro surface completes from the first keystroke and gains the plugin rows when the read
// lands, as `usePromptMacroSuggestions` does with the preset.

import type { PluginMacroView } from "@orb/contracts/plugin";
import { useQuery } from "@tanstack/react-query";
import type { MacroPlane } from "#lib";
import { pluginMacroPlanes } from "#lib";
import { useTRPC } from "./trpc.ts";

/** The not-yet-loaded arm, hoisted so its plane list is one stable array. */
const NO_VIEWS: readonly PluginMacroView[] = [];

/** `enabled: false` is for a surface that offers no plugin rows, so it does not send the read at all. */
export function usePluginMacroPlanes(enabled = true): readonly MacroPlane[] {
  const trpc = useTRPC();
  const { data } = useQuery({ ...trpc.plugin.listMacros.queryOptions(), enabled });
  return pluginMacroPlanes(data ?? NO_VIEWS);
}
