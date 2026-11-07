// The finder and both census consumers must project the same permission-shaped roster through one filter.
import { useDeferredValue } from "react";
import { filteredCensus } from "#lib";
import { useExtensionsSearchQuery } from "#state";
import type { PluginPageView } from "./use-plugin-pages.ts";
import { usePluginPages } from "./use-plugin-pages.ts";

interface ExtensionsRoster {
  readonly pages: readonly PluginPageView[];
  readonly matching: readonly PluginPageView[];
  readonly census: number | string;
  /** Does a plugin name match the finder? The waiting rows filter through the same query as the pages. */
  readonly matchesName: (name: string) => boolean;
}

export function useExtensionsRoster(): ExtensionsRoster {
  const pages = usePluginPages();
  const query = useDeferredValue(useExtensionsSearchQuery().trim().toLocaleLowerCase(), "");
  const matching = pages.filter((page) => `${page.title} ${page.pluginName}`.toLocaleLowerCase().includes(query));
  const census = filteredCensus(matching.length, pages.length, query !== "");
  return { pages, matching, census, matchesName: (name) => name.toLocaleLowerCase().includes(query) };
}
