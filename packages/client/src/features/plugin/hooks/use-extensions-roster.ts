// The finder and both census consumers must project the same permission-shaped roster through one filter.
import { useDeferredValue } from "react";
import { useExtensionsSearchQuery } from "#state";
import type { PluginPageView } from "./use-plugin-pages.ts";
import { usePluginPages } from "./use-plugin-pages.ts";

interface ExtensionsRoster {
  readonly pages: readonly PluginPageView[];
  readonly matching: readonly PluginPageView[];
  readonly census: number | string;
}

export function useExtensionsRoster(): ExtensionsRoster {
  const pages = usePluginPages();
  const query = useDeferredValue(useExtensionsSearchQuery().trim().toLocaleLowerCase(), "");
  const matching = pages.filter((page) => `${page.title} ${page.pluginName}`.toLocaleLowerCase().includes(query));
  // A filtered zero must not suppress the census and imply the underlying library disappeared.
  const census = matching.length === 0 && pages.length > 0 ? `0 of ${String(pages.length)}` : matching.length;
  return { pages, matching, census };
}
