// The one home of the custom-property names a read may rely on: every sheet's declarations, the appearance channel, the
// names a component writes at runtime, and the vendor names. Stylelint and ESLint both refuse a read outside this set.
import { execFileSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A custom property a component writes at runtime and a sheet or class string reads; each names its writer. */
export const RUNTIME_CUSTOM_PROPERTIES: Readonly<Record<string, string>> = {
  "--orb-web-spiral-length": "primitives/spinner/spinner.tsx (the spiral's arc length)",
  "--orb-ws-pitch": "charts/meter/waystone.tsx (the lattice step)",
  "--orb-ws-glow": "charts/meter/waystone-layers.tsx (the altitude-derived glow floor)",
  "--orb-weave-hub-x": "art/web-weave/web-weave.tsx (the hub's glow position)",
  "--orb-weave-hub-y": "art/web-weave/web-weave.tsx (the hub's glow position)",
  "--orb-keyboard-inset": "app-shell/hooks/use-keyboard-inset-var.ts (the soft keyboard's inset, removed when it is down)",
  "--orb-skeleton-sweep-base": "chat/lib/message-row-backing.ts (the sweep's base tint over a background image)",
  "--orb-skeleton-sweep-crest": "chat/lib/message-row-backing.ts (the sweep's crest tint over a background image)",
  "--x": "primitives/media-grid/media-grid.tsx (the pointer's inline offset in a cell)",
  "--y": "primitives/media-grid/media-grid.tsx (the pointer's block offset in a cell)",
};

/** Names streamdown's code blocks write inline (its Shiki dual-theme spans); a test finds each in the installed package. */
export const VENDOR_CUSTOM_PROPERTIES: Readonly<Record<string, string>> = {
  "--shiki-dark": "streamdown",
  "--shiki-dark-bg": "streamdown",
  "--sdm-c": "streamdown",
  "--sdm-bg": "streamdown",
  "--sdm-tbg": "streamdown",
};

const BASE_UI_DIR = "packages/ui/node_modules/@base-ui/react";
const COMMENT = /\/\*[\s\S]*?\*\//gu;
const DECLARATION = /(?<![\w-])(--[\w-]+)\s*:/gu;
const AT_PROPERTY = /@property\s+(--[\w-]+)/gu;
const CSS_VAR_NAME = /'(--[a-z0-9-]+)'/gu;

/** The custom properties Base UI writes on its parts, read from the installed package's `*CssVars` modules. */
export function baseUiCustomProperties(root: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const file of globSync("**/*CssVars.js", { cwd: join(root, BASE_UI_DIR) })) {
    for (const match of readFileSync(join(root, BASE_UI_DIR, file), "utf8").matchAll(CSS_VAR_NAME)) {
      names.add(match[1] ?? "");
    }
  }
  return names;
}

/** Every custom property a stylesheet text declares, as a property or by `@property`; comments declare nothing. */
export function declaredInCss(text: string): readonly string[] {
  const code = text.replace(COMMENT, "");
  return [...code.matchAll(DECLARATION), ...code.matchAll(AT_PROPERTY)].map((match) => match[1] ?? "");
}

function stylesheets(root: string): readonly string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "packages/**/*.css"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((path) => path !== "");
}

/** Every name a read may rely on: the sheets (the generated channel included), runtime writers and vendors. */
export function declaredCustomProperties(root: string): ReadonlySet<string> {
  const names = new Set<string>([...Object.keys(RUNTIME_CUSTOM_PROPERTIES), ...Object.keys(VENDOR_CUSTOM_PROPERTIES), ...baseUiCustomProperties(root)]);
  for (const sheet of stylesheets(root)) {
    for (const name of declaredInCss(readFileSync(join(root, sheet), "utf8"))) {
      names.add(name);
    }
  }
  return names;
}
