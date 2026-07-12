// The Shiki `CodeHighlighterPlugin` for `<Streamdown plugins={{ code }}>` (D44 §12/UI-Gates §11.6).
// Streamdown 2.5 dropped its bundled Shiki entirely (verified: no "code-highlighter" reference survives
// in its own chunk, and `shiki` ships only as a streamdown DEVdependency for types) — a consumer now
// MUST supply `plugins.code` or fenced blocks render unhighlighted (`--sdm-c:inherit`, the `text-[var(
// --sdm-c,inherit)]` class in Streamdown's CodeBlockContainer with no color ever written to it).
//
// ENGINE: `@shikijs/engine-javascript` (`createJavaScriptRegexEngine`), NOT `@shikijs/engine-oniguruma`
// (WASM). A sibling pass already slimmed the client entry chunk by keeping oniguruma's wasm binary out
// of the graph — reintroducing it here would refatten exactly what that pass removed. The JS engine is
// pure JS regex, synchronous to construct, no wasm fetch/instantiate.
//
// GRAMMARS: fine-grained + LAZY. `@shikijs/langs` ships one ESM module per language
// (`@shikijs/langs/typescript`, etc.) — `LanguageInput` accepts a `() => import(...)` getter directly
// (Shiki's own `MaybeGetter` type), so `createHighlighterCore({ langs: [] })` starts with ZERO grammars
// loaded and `highlighter.loadLanguage(...)` dynamic-imports one only the first time a fence in that
// language is actually rendered — most chats never touch most of this curated set. Unknown/unlisted
// fence languages fall back to Shiki's built-in `"plaintext"` special language (no grammar, never
// crashes, never triggers an import).
//
// THEMES: `getThemes()` returns the token-sourced `[light, dark]` pair (`ORB_LIGHT`/`ORB_DARK` below,
// literal token values — same non-reactive-to-live-theme-flip rationale as the prior shiki-theme.ts:
// Shiki emits inline `color:`/`--shiki-dark:` CSS on HTML spans, which DOES cascade through a CSS
// custom-property theme flip, so baking the *light-mode* and *dark-mode* literals here (rather than
// resolving one "current" theme at render time) is what makes BOTH slots correct at once). `highlight()`
// calls `codeToTokens({ themes: { light, dark }, defaultColor: "light" })`, which dispatches to shiki's
// `codeToTokensWithThemes` — verified against Streamdown's own consumption (`chunk-BO2N2NFS.js`): a
// token's `color` becomes light-mode `--sdm-c` (and the `dark:` Tailwind variant's fallback), while
// `htmlStyle["--shiki-dark"]` is read as the literal dark-mode override var. That's exactly
// `flatTokenVariants`'s output shape when `variantsOrder = ["light","dark"]`, `cssVariablePrefix:
// "--shiki-"` (shiki's own default).
//
// ASYNC CONTRACT: `highlight()` returns `null` while the grammar for `language` hasn't loaded yet, and
// calls `callback` once loading + tokenizing finishes (`HighlightedCodeBlockBody` — the ONE call site —
// is written for exactly this: it seeds local state with `null`/raw text, then re-renders off the
// callback). The already-loaded fast path still routes through the same promise chain (shiki has no
// sync `codeToTokens` variant on a core built via the async `createHighlighterCore`), but resolves on
// the same microtask tick so there's no user-visible flash.
import type { HighlighterCore } from "@shikijs/core";
import { createHighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type { CodeHighlighterPlugin, HighlightOptions, ThemeInput } from "streamdown";
import { TOKENS } from "#tokens";

// `HighlightResult` (the return shape `CodeHighlighterPlugin["highlight"]` requires) is declared in
// streamdown's own .d.ts but NOT included in its public `export {}` list — reconstructed here
// structurally (verified field-for-field against the source .d.ts: `bg?`/`fg?`/`rootStyle?`/`tokens`,
// each token `bgColor?`/`color?`/`content`/`htmlAttrs?`/`htmlStyle?`/`offset?`). TS still checks this
// against the real (unexported) interface at the `CodeHighlighterPlugin` assignment below, so a drift
// in Streamdown's actual shape still fails `tsc`, not just this local type.
interface ShikiHighlightToken {
  bgColor?: string;
  color?: string;
  content: string;
  htmlAttrs?: Record<string, string>;
  htmlStyle?: Record<string, string>;
  offset?: number;
}
interface ShikiHighlightResult {
  bg?: string;
  fg?: string;
  rootStyle?: string | false;
  tokens: ShikiHighlightToken[][];
}

// Curated fence-language set (task scope): the everyday web/scripting/data languages a chat message or
// a card actually fences, kept short so the lazy-load list stays legible. Streamdown's `HighlightOptions
// ["language"]` types as shiki's full ~200-language `BundledLanguage` union; we only ever load from this
// map, so an unlisted fence id falls through to the plaintext branch below regardless of what the type
// permits.
const LANGUAGE_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  javascript: () => import("@shikijs/langs/javascript"),
  js: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  ts: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  python: () => import("@shikijs/langs/python"),
  py: () => import("@shikijs/langs/python"),
  bash: () => import("@shikijs/langs/bash"),
  sh: () => import("@shikijs/langs/bash"),
  shell: () => import("@shikijs/langs/bash"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  markdown: () => import("@shikijs/langs/markdown"),
  md: () => import("@shikijs/langs/markdown"),
  rust: () => import("@shikijs/langs/rust"),
  rs: () => import("@shikijs/langs/rust"),
  go: () => import("@shikijs/langs/go"),
  sql: () => import("@shikijs/langs/sql"),
  yaml: () => import("@shikijs/langs/yaml"),
  yml: () => import("@shikijs/langs/yaml"),
  diff: () => import("@shikijs/langs/diff"),
};

// Semantic scope → token, split light/dark. One entry per broad TextMate scope family so any grammar in
// LANGUAGE_LOADERS lands a sensible color; `chart-2..5`/`destructive` aren't theme-overridden in
// globals.css (verified — no per-theme block redefines them) so both palettes reuse the same literal.
function buildTheme(name: string, type: "light" | "dark", fg: string, bg: string): ThemeInput {
  return {
    name,
    type,
    fg,
    bg,
    colors: { "editor.background": bg, "editor.foreground": fg },
    settings: [
      { scope: ["source", "text"], settings: { foreground: fg } },
      {
        scope: ["comment", "punctuation.definition.comment"],
        settings: { foreground: TOKENS["color.muted-foreground"].value, fontStyle: "italic" },
      },
      {
        scope: ["string", "string.quoted", "constant.character", "punctuation.definition.string"],
        settings: { foreground: TOKENS["color.chart-4"].value },
      },
      {
        scope: ["constant.numeric", "constant.language", "constant.other", "keyword.other.unit"],
        settings: { foreground: TOKENS["color.chart-2"].value },
      },
      {
        scope: ["keyword", "storage", "storage.type", "keyword.control", "keyword.operator"],
        settings: { foreground: TOKENS["color.primary"].value },
      },
      {
        scope: ["entity.name.function", "support.function", "meta.function-call"],
        settings: { foreground: TOKENS["color.chart-3"].value },
      },
      {
        scope: ["entity.name.type", "entity.name.class", "support.type", "support.class"],
        settings: { foreground: TOKENS["color.chart-5"].value },
      },
      {
        scope: ["variable", "variable.other", "meta.definition.variable"],
        settings: { foreground: fg },
      },
      {
        scope: ["entity.name.tag", "meta.tag", "support.type.property-name"],
        settings: { foreground: TOKENS["color.chart-5"].value },
      },
      {
        scope: ["punctuation", "meta.brace", "punctuation.separator", "punctuation.terminator"],
        settings: { foreground: TOKENS["color.muted-foreground"].value },
      },
      {
        scope: ["invalid", "invalid.illegal"],
        settings: { foreground: TOKENS["color.destructive"].value },
      },
    ],
  };
}

// Dark literals: `TOKENS["color.*"].value` (the app's default palette). Light literals: transcribed
// from the `[data-theme="light"]` override block in `styles/globals.css` (tokens.json holds only the
// dark/default namespace — light values live solely as CSS-var overrides there). A palette edit to that
// block needs the matching edit here — one owner, two consumers (same tension shiki-theme.ts already
// had for its single dark set, now doubled because this plugin renders BOTH slots for real).
const ORB_DARK = buildTheme(
  "orbweaver-dark",
  "dark",
  TOKENS["color.foreground"].value,
  TOKENS["color.card"].value,
);
const ORB_LIGHT = buildTheme(
  "orbweaver-light",
  "light",
  "oklch(0.24 0.01 60)",
  "oklch(0.995 0.003 75)",
);

const THEMES: [ThemeInput, ThemeInput] = [ORB_LIGHT, ORB_DARK];

// Lazily constructed on first `highlight()` call — nothing here runs (no engine construction, no
// grammar fetch) until a fenced code block actually mounts.
let highlighterPromise: Promise<HighlighterCore> | null = null;
function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    themes: THEMES,
    langs: [],
  });
  return highlighterPromise;
}

async function highlightAsync(code: string, language: string): Promise<ShikiHighlightResult> {
  const highlighter = await getHighlighter();
  const loader = LANGUAGE_LOADERS[language];
  const lang = loader ? language : "plaintext";
  if (loader && !highlighter.getLoadedLanguages().includes(language)) {
    const mod = await loader();
    await highlighter.loadLanguage(mod.default as Parameters<HighlighterCore["loadLanguage"]>[0]);
  }
  const result = highlighter.codeToTokens(code, {
    lang,
    themes: { light: ORB_LIGHT, dark: ORB_DARK },
    defaultColor: "light",
  });
  // Structural cast: shiki's `TokensResult` (`tokens`/`fg`/`bg`/`rootStyle`) and Streamdown's
  // `HighlightResult` are independently declared but field-identical (verified against both packages'
  // .d.ts — Streamdown's `HighlightToken` mirrors shiki's `ThemedToken`: `content`/`color`/`bgColor`/
  // `htmlStyle`/`htmlAttrs`/`offset`). No runtime transform needed, just re-typing at the seam.
  return result as unknown as ShikiHighlightResult;
}

/**
 * The `CodeHighlighterPlugin` for `<Streamdown plugins={{ code }}>`. `getThemes()` wins over the
 * top-level `shikiTheme` prop (verified in Streamdown's source:
 * `plugins?.code?.getThemes() ?? shikiTheme`), so this plugin alone determines both fenced-code
 * palettes. `highlight()` always returns
 * `null` synchronously and delivers the real result through `callback` — `HighlightedCodeBlockBody`
 * (the one call site) is written for exactly that async contract.
 */
export const MARKDOWN_SHIKI_PLUGIN: CodeHighlighterPlugin = {
  name: "shiki",
  type: "code-highlighter",
  getThemes: () => THEMES,
  getSupportedLanguages: () => Object.keys(LANGUAGE_LOADERS) as never[],
  supportsLanguage: (language) => language in LANGUAGE_LOADERS,
  highlight(
    options: HighlightOptions,
    callback?: (result: ShikiHighlightResult) => void,
  ): ShikiHighlightResult | null {
    highlightAsync(options.code, options.language)
      .then((result) => callback?.(result))
      .catch(() => {
        // Grammar fetch/tokenize failure (e.g. offline dynamic import): leave the block unhighlighted
        // rather than crashing the render — `MarkdownErrorBoundary` (markdown.tsx) is the outer net for
        // anything worse, this is the narrower "one code fence" degrade.
      });
    return null;
  },
};
