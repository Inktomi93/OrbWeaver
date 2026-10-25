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
  "--orb-media-x": "primitives/media-grid/media-grid.tsx (the pointer's inline offset in a cell)",
  "--orb-media-y": "primitives/media-grid/media-grid.tsx (the pointer's block offset in a cell)",
};

/** Names streamdown's code blocks write inline (its Shiki dual-theme spans); a test finds each in the installed package. */
export const VENDOR_CUSTOM_PROPERTIES: Readonly<Record<string, string>> = {
  "--shiki-dark": "streamdown",
  "--shiki-dark-bg": "streamdown",
  "--sdm-c": "streamdown",
  "--sdm-bg": "streamdown",
  "--sdm-tbg": "streamdown",
};

const GREP_BUFFER_BYTES = 67_108_864;
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

/** A Tailwind arbitrary-property write in a class string: `[--x:v]`, bare or behind a variant. */
const CLASS_WRITE = /\[(--[\w-]+):/gu;
/** A read: `var(--x`, `var( --x`, and Tailwind's `-(--x)` or type-hinted `-(length:--x)` utility value. */
export const PROPERTY_READ = /var\(\s*(--[\w-]+)(?=\s*[,)])|(?<=-)\(\s*(?:[a-z-]+:)?(--[\w-]+)\s*\)/gu;

/** Every class-string write and read the client and ui sources spell, in one `git grep` for speed; the JS patterns then pick the names. */
function sourceUses(root: string): string {
  const pathspecs = ["client", "ui"].flatMap((name) => [`packages/${name}/src/**/*.ts`, `packages/${name}/src/**/*.tsx`]);
  const grep = String.raw`\[--[A-Za-z0-9_-]+:|var\(\s*--[A-Za-z0-9_-]+\s*[,)]|-\(\s*([a-z-]+:)?--[A-Za-z0-9_-]+\s*\)`;
  return execFileSync("git", ["grep", "--untracked", "-h", "-o", "-I", "-E", grep, "--", ...pathspecs], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: GREP_BUFFER_BYTES,
  });
}

/** What the sheets and the client and ui sources declare and read. */
export interface CustomPropertyUses {
  /** Every name a read may rely on: the sheets (the generated channel included), class-string writes, runtime writers and vendors. */
  readonly declared: ReadonlySet<string>;
  /** Every name a sheet or a source string reads. */
  readonly read: ReadonlySet<string>;
}

export function customPropertyUses(root: string): CustomPropertyUses {
  const declared = new Set<string>([...Object.keys(RUNTIME_CUSTOM_PROPERTIES), ...Object.keys(VENDOR_CUSTOM_PROPERTIES), ...baseUiCustomProperties(root)]);
  const read = new Set<string>();
  const collectReads = (text: string): void => {
    for (const match of text.matchAll(PROPERTY_READ)) {
      read.add(match[1] ?? match[2] ?? "");
    }
  };
  for (const sheet of stylesheets(root)) {
    const text = readFileSync(join(root, sheet), "utf8");
    for (const name of declaredInCss(text)) {
      declared.add(name);
    }
    collectReads(text.replace(COMMENT, ""));
  }
  const uses = sourceUses(root);
  for (const match of uses.matchAll(CLASS_WRITE)) {
    declared.add(match[1] ?? "");
  }
  collectReads(uses);
  return { declared, read };
}

/** Every name a read may rely on; see {@link CustomPropertyUses}. */
export function declaredCustomProperties(root: string): ReadonlySet<string> {
  return customPropertyUses(root).declared;
}
