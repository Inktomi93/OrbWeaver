// CT appends its tests/ source root to client globals before Tailwind compiles it, so the extension plugin must be registered first.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import ts from "typescript";
import ctConfig from "../../playwright-ct.config.ts";

const EXTENSION_PLUGIN = "orb:ct-css-source-extension";
const TAILWIND_PLUGIN_PREFIX = "@tailwindcss/vite";
const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const REGISTER_BOTH = "CT config must register BOTH the harness source-extension plugin and Tailwind";
const REGISTER_FIRST = "CT config must register the harness source extension BEFORE Tailwind compiles it";
const NAME_TARGET = `CT config's source extension must inject into client globals (${CLIENT_GLOBALS}), which it names nowhere`;

// Every plugin name in a Vite plugin list, which may nest arrays (Tailwind's plugin is three plugins).
function pluginNames(option: unknown): readonly string[] {
  if (Array.isArray(option)) {
    return option.flatMap(pluginNames);
  }
  return typeof option === "object" && option !== null && "name" in option && typeof option.name === "string" ? [option.name] : [];
}

function registrationFindings(names: readonly string[]): readonly string[] {
  const extension = names.indexOf(EXTENSION_PLUGIN);
  const tailwind = names.findIndex((name) => name.startsWith(TAILWIND_PLUGIN_PREFIX));
  if (extension < 0 || tailwind < 0) {
    return [REGISTER_BOTH];
  }
  return extension > tailwind ? [REGISTER_FIRST] : [];
}

// The config's tokens with comments dropped, so a comment that names a path cannot satisfy the target check.
function codeOf(text: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const tokens: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    tokens.push(scanner.getTokenText());
  }
  return tokens.join(" ");
}

function targetFindings(configText: string): readonly string[] {
  return codeOf(configText).includes(`"${CLIENT_GLOBALS}"`) ? [] : [NAME_TARGET];
}

function configuredPlugins(): readonly string[] {
  const vite = ctConfig.use?.ctViteConfig;
  if (vite === undefined || typeof vite === "function") {
    throw new Error("CT must expose its configured Vite build contract");
  }
  return pluginNames(vite.plugins);
}

test("the real CT config registers the harness source extension before Tailwind and injects into client globals", () => {
  const names = configuredPlugins();
  expect(names, "the plugin population is non-empty").toContain(EXTENSION_PLUGIN);
  expect(registrationFindings(names)).toEqual([]);
  expect(targetFindings(readFileSync(join(import.meta.dirname, "../../playwright-ct.config.ts"), "utf8"))).toEqual([]);
});

test("the CT config checks flag a swapped order, a missing extension and a wrong injection target", () => {
  expect(registrationFindings([`${TAILWIND_PLUGIN_PREFIX}:scan`, EXTENSION_PLUGIN])).toEqual([REGISTER_FIRST]);
  expect(registrationFindings([`${TAILWIND_PLUGIN_PREFIX}:scan`])).toEqual([REGISTER_BOTH]);
  expect(registrationFindings([EXTENSION_PLUGIN])).toEqual([REGISTER_BOTH]);
  expect(registrationFindings([EXTENSION_PLUGIN, `${TAILWIND_PLUGIN_PREFIX}:scan`])).toEqual([]);
  expect(targetFindings('const marker = "packages/client/src/styles/other.css";')).toEqual([NAME_TARGET]);
  expect(targetFindings(`// "${CLIENT_GLOBALS}" in a comment is not a target\nconst marker = 1;`)).toEqual([NAME_TARGET]);
});
