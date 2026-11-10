// Authored plugin programs exercise the published ambient SDK. Neither lives under a package's src directory.
import { globSync } from "node:fs";
import { isProduction as isAppSource } from "./worlds.ts";

const SDK_DECLARATIONS = "packages/plugin-sdk/*.d.ts";
const AUTHOR_WORLDS = "packages/showcase-plugins/tsconfig.author-*.json";
const AUTHOR_SOURCE = /^packages\/showcase-plugins\/bundles\/[^/]+\/.+\.tsx?$/u;
const SDK_SOURCE = /^packages\/plugin-sdk\/[^/]+\.d\.ts$/u;

export function isProduction(file: string): boolean {
  return isAppSource(file) || AUTHOR_SOURCE.test(file) || SDK_SOURCE.test(file);
}

export function pluginAuthorWorlds(root: string): string[] {
  return globSync(AUTHOR_WORLDS, { cwd: root }).sort();
}

export function publishedSdkSources(root: string): ReadonlySet<string> {
  return new Set(globSync(SDK_DECLARATIONS, { cwd: root }));
}
