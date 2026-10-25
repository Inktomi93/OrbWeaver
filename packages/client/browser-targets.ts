// The one declaration of the browsers the shipped app supports, in the esbuild-style form Vite takes for
// `build.target` and `build.cssTarget`. Vite converts the same list into Lightning CSS targets for the CSS
// minifier, so vendor prefixes and syntax lowering follow it and no sheet carries a hand-written twin.
// Raise a floor here only.
export const BROWSER_TARGETS = ["chrome136", "edge136", "firefox138", "safari18", "ios18"] as const;
