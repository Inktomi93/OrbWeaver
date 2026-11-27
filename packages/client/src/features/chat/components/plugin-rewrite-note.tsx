// The row's one note naming the plugins whose display transforms changed the text it shows, so a reader can tell that what
// they see differs from what is stored and who did it.

import type { ReactElement } from "react";
import { MutedLine } from "#components";
import { pluginRewriteLine } from "../lib/plugin-rewrite-copy.ts";

export function PluginRewriteNote({ pluginNames }: { readonly pluginNames: readonly string[] }): ReactElement {
  return <MutedLine>{pluginRewriteLine(pluginNames)}</MutedLine>;
}
