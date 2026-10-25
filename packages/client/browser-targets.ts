// The one declaration of the browsers the shipped app supports, in the esbuild-style form Vite takes for
// `build.target` and `build.cssTarget`. Vite converts the same list into Lightning CSS targets for the CSS
// minifier, so vendor prefixes and syntax lowering follow it and no sheet carries a hand-written twin.
// Raise a floor here only.
export const BROWSER_TARGETS = ["chrome136", "edge136", "firefox138", "safari18", "ios18"] as const;

// Builtins `src/lib/platform-polyfills.ts` installs before `src/entry.ts` loads the app graph, so the compat lint
// treats them as supported. A name here without an installer there fails to typecheck.
export const POLYFILLED_BUILTINS = ["Temporal", "RegExp.escape", "Error.isError"] as const;

// CSS a browser may ignore with no change to layout or behavior; the compat lint admits it unguarded. A key is a property
// or a `property: value` pair, whichever is the narrowest that is harmless; each says why ignoring it is harmless.
export const HARMLESS_WHEN_UNSUPPORTED = {
  "field-sizing": "the field keeps its floor width, and the Textarea sizes by script",
  "view-transition-name": "without view transitions the name does nothing",
  "scrollbar-width": "the native scrollbar shows",
  "scrollbar-color": "the native scrollbar shows",
  cursor: "touch screens show no cursor",
  resize: "touch browsers show no resize handle",
  "text-wrap: pretty": "only moves line breaks",
  "forced-color-adjust": "Safari has no forced-colors mode for it to opt out of",
} as const satisfies Readonly<Record<string, string>>;
