// The custom-property pass: every property a sheet declares that nothing reads.
//
// - Reads are the house census's (tooling/src/eslint/css/custom-properties.ts: sheets, source strings, prefix reads),
//   plus what Tailwind itself reads: each class token the sources spell is compiled through the analysed tree's design
//   system, loaded as eslint.config.ts loads it, and the variables its CSS reads are reads, as are preflight's.
// - A token reference `{primitive.space.4}` in tokens.json reads the variable its path names (tooling/src/ui-facts/
//   purposes.ts spells the variable), and a breakpoint or container variant (`shell:`, `@max-cq-7:`) reads the
//   variable inlined into its query.
// - A variable a registry member holds (`avatar: { "1": "--pigment-avatar-1" }`) is read when the graph has that member,
//   and for a record entry's field the entry too, read.
// - A script string spelling a variable whole names it for code the text cannot judge (a read through
//   `getPropertyValue(token.cssVar)`, a write): such a variable is reported apart from those nothing names. The
//   generated token registry names every token, so it names none; the owner-CSS surface publishes names to CSS the
//   owner writes, so a variable only it names is reported as published.
import { globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { CandidatesToCss } from "../../eslint/index.ts";
import { customPropertyUses, declaredInCss, PROPERTY_READ } from "../../eslint/index.ts";
import { settleRoles } from "./analyse.ts";
import type { Graph } from "./build.ts";
import type { DeclKey } from "./resolve.ts";
import { READS } from "./roles.ts";

/** The custom-property buckets, in report order. */
export const CSS_BUCKETS = ["css-property-unread", "css-property-named-in-script-only", "css-property-owner-css-only"] as const;
export type CssBucket = (typeof CSS_BUCKETS)[number];

/** Each bucket's `sheet:--name` entries, and what the pass read on the way. */
export interface CssReport {
  readonly buckets: { readonly [B in CssBucket]: readonly string[] };
  readonly counts: {
    readonly tokens: number;
    readonly compiled: number;
    readonly tokenRefs: number;
    readonly variantReads: number;
    readonly heldReads: number;
    readonly reads: number;
  };
}

const THEME = "packages/ui/src/styles/theme.css";
const TOKENS = "packages/ui/src/tokens/tokens.json";
const SOURCES = "packages/{client,ui}/src/**/*.{ts,tsx}";
const SHEETS = "packages/*/src/**/*.css";
const GENERATED_REGISTRY = "packages/ui/src/tokens/index.ts";
const OWNER_CSS_SURFACE = "packages/client/owner-css-surface.ts";
const NOT_SOURCE = ["**/node_modules/**"];
const TOKEN_REF = /"\{([\w.-]+)\}"/gu;
const STRING = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/gu;
const APPLY = /@apply\s+([^;]+);/gu;
const NAMED = /["'`](--[\w-]+)["'`]/gu;
// printable ASCII, space excluded
const CLASS_TOKEN = /^[\x21-\x7E]+$/u;
// A class token longer than this is prose or a URL, never a utility.
const MAX_TOKEN = 160;
// candidatesToCss takes a list; pages keep one call's CSS bounded.
const COMPILE_PAGE = 2000;
const RANGE = /^(?:max|min)-/u;

// The design system, from the analysed tree's own tailwindcss: the module is validated at the import boundary.
const tailwindSchema = z.object({
  // biome-ignore lint/style/useNamingConvention: tailwindcss exports this name; the schema must spell it to read it
  __unstable__loadDesignSystem: z.custom<(css: string) => Promise<{ readonly candidatesToCss: CandidatesToCss }>>((value) => typeof value === "function"),
});

/** Every custom property the sheets of `root` declare that nothing reads, with `graph` deciding registry members. */
export async function cssPass(root: string, graph: Graph): Promise<CssReport> {
  const require = createRequire(join(root, "package.json"));
  const tailwind = tailwindSchema.parse(await import(pathToFileURL(require.resolve("tailwindcss")).href));
  const design = await tailwind.__unstable__loadDesignSystem(
    `${readFileSync(require.resolve("tailwindcss/theme.css"), "utf8")}\n${readFileSync(join(root, THEME), "utf8")}`,
  );
  const uses = customPropertyUses(root);
  const reads = new Set(uses.read);
  const readAll = (css: string): void => {
    for (const match of css.matchAll(PROPERTY_READ)) {
      reads.add(match[1] ?? match[2] ?? "");
    }
  };
  readAll(readFileSync(require.resolve("tailwindcss/preflight.css"), "utf8"));
  const tokenRefs = [...readFileSync(join(root, TOKENS), "utf8").matchAll(TOKEN_REF)].map((match) => `--${(match[1] ?? "").split(".").join("-")}`);
  for (const name of tokenRefs) {
    reads.add(name);
  }
  const sources = globSync(SOURCES, { cwd: root, exclude: NOT_SOURCE });
  const sheets = globSync(SHEETS, { cwd: root, exclude: NOT_SOURCE });
  const tokens = classTokens(root, sources, sheets);
  let compiled = 0;
  for (let at = 0; at < tokens.length; at += COMPILE_PAGE) {
    for (const css of design.candidatesToCss(tokens.slice(at, at + COMPILE_PAGE))) {
      if (css !== null) {
        compiled++;
        readAll(css);
      }
    }
  }
  const variantReads = tokens.flatMap(variantVariables);
  for (const name of variantReads) {
    reads.add(name);
  }
  const held = heldReads(graph);
  for (const name of held) {
    reads.add(name);
  }
  return {
    buckets: unreadBuckets(root, { sources, sheets, reads, prefixes: uses.readPrefixes }),
    counts: { tokens: tokens.length, compiled, tokenRefs: tokenRefs.length, variantReads: variantReads.length, heldReads: held.length, reads: reads.size },
  };
}

// Every token a source string or an `@apply` spells: a superset of the class tokens, which only adds reads.
function classTokens(root: string, sources: readonly string[], sheets: readonly string[]): string[] {
  const tokens = new Set<string>();
  const add = (text: string): void => {
    for (const token of text.split(/\s+/u)) {
      if (token !== "" && token.length < MAX_TOKEN && CLASS_TOKEN.test(token)) {
        tokens.add(token);
      }
    }
  };
  for (const file of sources) {
    for (const match of readFileSync(join(root, file), "utf8").matchAll(STRING)) {
      add(match[1] ?? match[2] ?? match[3] ?? "");
    }
  }
  for (const file of sheets) {
    for (const match of readFileSync(join(root, file), "utf8").matchAll(APPLY)) {
      add(match[1] ?? "");
    }
  }
  return [...tokens];
}

// The variables a token's variants inline into their queries: `shell:` and `max-shell:` read --breakpoint-shell,
// `@cq-7:` and `@max-cq-7:` read --container-cq-7. A colon inside brackets or parentheses is a value's, not a variant's.
function variantVariables(token: string): readonly string[] {
  return variantsOf(token).flatMap((raw) => {
    const variant = raw.replace(RANGE, "");
    if (variant.startsWith("@")) {
      return [`--container-${variant.slice(1).replace(RANGE, "").replace("/", "-")}`];
    }
    return variant === "" ? [] : [`--breakpoint-${variant}`];
  });
}

const OPENERS: ReadonlySet<string> = new Set(["[", "("]);
const CLOSERS: ReadonlySet<string> = new Set(["]", ")"]);

// A token's variant prefixes: each run before a colon that no bracket or parenthesis encloses.
function variantsOf(token: string): readonly string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  // a class token is printable ASCII (CLASS_TOKEN), so its UTF-16 units are its characters
  for (let at = 0; at < token.length; at++) {
    const char = token.charAt(at);
    depth += (OPENERS.has(char) ? 1 : 0) - (CLOSERS.has(char) ? 1 : 0);
    if (char === ":" && depth === 0) {
      out.push(token.slice(start, at));
      start = at + 1;
    }
  }
  return out;
}

// The names held by members the product reads: the holder, and for a record entry's field the entry itself, since a
// read of the shared field reads no entry in particular.
function heldReads(graph: Graph): readonly string[] {
  const roles = settleRoles(graph);
  const read = (key: DeclKey | null): boolean => key !== null && [...(roles.get(key)?.product ?? [])].some((role) => READS.has(role));
  return graph.state.cssNames.filter(({ holder, entry }) => read(holder) && (entry === null || read(entry))).map(({ name }) => name);
}

function unreadBuckets(
  root: string,
  seen: { readonly sources: readonly string[]; readonly sheets: readonly string[]; readonly reads: ReadonlySet<string>; readonly prefixes: readonly string[] },
): CssReport["buckets"] {
  const named = (file: string): readonly string[] => [...readFileSync(join(root, file), "utf8").matchAll(NAMED)].map((match) => match[1] ?? "");
  const ownerCss = new Set(named(OWNER_CSS_SURFACE));
  const namedInScript = new Set(seen.sources.filter((file) => file !== GENERATED_REGISTRY).flatMap(named));
  const out: { readonly unread: string[]; readonly namedOnly: string[]; readonly ownerOnly: string[] } = { unread: [], namedOnly: [], ownerOnly: [] };
  const judged = new Set<string>();
  for (const file of seen.sheets) {
    for (const name of declaredInCss(readFileSync(join(root, file), "utf8"))) {
      if (judged.has(name) || seen.reads.has(name) || seen.prefixes.some((prefix) => name.startsWith(prefix))) {
        continue;
      }
      judged.add(name);
      if (namedInScript.has(name)) {
        out.namedOnly.push(`${file}:${name}`);
      } else if (ownerCss.has(name)) {
        out.ownerOnly.push(`${file}:${name}`);
      } else {
        out.unread.push(`${file}:${name}`);
      }
    }
  }
  return { "css-property-unread": out.unread, "css-property-named-in-script-only": out.namedOnly, "css-property-owner-css-only": out.ownerOnly };
}
