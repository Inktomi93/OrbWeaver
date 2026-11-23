// Authored plugin programs exercise the published ambient SDK. Neither lives under a package's src directory, so the
// author tsconfigs' programs say which files are which, never a path pattern: the author files are the own sources a
// program holds, and the SDK's are the declaration files it keeps (the published SDK's, which the world keeps by
// `NativeWorld`'s declaration filter).
import { globSync } from "node:fs";
import type { WorldFiles } from "./native.ts";
import { NativeWorld } from "./native.ts";
import { publishedSdkSources } from "./plugin-surface.ts";
import { isProduction as isAppSource } from "./worlds.ts";

const AUTHOR_WORLDS = "packages/showcase-plugins/tsconfig.author-*.json";
const DECLARATION_FILE = ".d.ts";

/** The plugin author source and the published SDK's declarations, repository-relative. */
export interface PluginSources {
  readonly author: ReadonlySet<string>;
  readonly sdk: ReadonlySet<string>;
}

const NO_PLUGIN_SOURCES: PluginSources = { author: new Set(), sdk: new Set() };

/** Whether a file is product source, plugin author source or an SDK declaration. */
export function isProduction(file: string, plugins: PluginSources): boolean {
  return isAppSource(file) || plugins.author.has(file) || plugins.sdk.has(file);
}

export function pluginAuthorWorlds(root: string): string[] {
  return globSync(AUTHOR_WORLDS, { cwd: root }).sort();
}

/** The plugin sources the programs of `authorWorlds` hold, from the file lists of `lists` (a world's own files, its
 *  declaration files kept only where {@link NativeWorld.fileLists} was asked to keep them). */
export function pluginSources(lists: ReadonlyMap<string, WorldFiles>, authorWorlds: readonly string[]): PluginSources {
  const held = authorWorlds.flatMap((config) => [...(lists.get(config)?.held ?? [])]);
  return {
    author: new Set(held.filter((file) => !file.endsWith(DECLARATION_FILE))),
    sdk: new Set(held.filter((file) => file.endsWith(DECLARATION_FILE))),
  };
}

/** The plugin sources of `root`'s author worlds, read from their programs; empty for a tree with no author world. */
export function readPluginSources(root: string): PluginSources {
  const worlds = pluginAuthorWorlds(root);
  return worlds.length === 0 ? NO_PLUGIN_SOURCES : pluginSources(NativeWorld.fileLists(root, worlds, publishedSdkSources(root)), worlds);
}
