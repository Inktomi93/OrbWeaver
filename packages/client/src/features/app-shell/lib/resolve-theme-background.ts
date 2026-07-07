// The D49 §3 background-image URL resolver — pure, module-scope (split out of
// `components/theme-background-layer.tsx` per `useComponentExportOnlyModules`: a component file may
// export components only). Exported so BOTH `<ThemeBackgroundLayer>` (paints the resolved URL) AND
// `app-shell.tsx` (gates `.shell-grid`'s own opaque background off the SAME resolved outcome — the
// image must show through the chrome's gaps/glass to be visible at all; a raw token-presence check
// would wrongly punch a transparent hole for an unresolvable `asset` source) read the ONE answer.
//
// FLAG[PD-131]: the `asset` arm always resolves to `null` — no client asset-URL resolver/upload flow
// exists yet (#67, the SAME gap `message-media-block.tsx` flags for message images). Schema-complete,
// UI-unreachable; the theme-editor background picker only offers seeded/external until #67 lands.
// Debt registry: `Core-Audits-and-Debt.md` PD-131.

import type { ClampedTheme, ThemeScopeBackgroundImageSource } from "@orb/ui/theme-scope";
import { resolveSeededBackgroundUrl } from "#lib";

// The per-kind URL resolver, dispatched by an exhaustive Record (Spine-TypeScript-and-Patterns.md
// §5.5) — a new `backgroundImage.kind` member fails `tsc` here until this table says how to resolve it.
const RESOLVE_BY_KIND: {
  readonly [K in ThemeScopeBackgroundImageSource["kind"]]: (
    source: Extract<ThemeScopeBackgroundImageSource, { kind: K }>,
  ) => string | null;
} = {
  seeded: (source) => resolveSeededBackgroundUrl(source.id) ?? null,
  external: (source) => source.url,
  // FLAG[PD-XXX] — never fabricate a resolver; render nothing instead of a broken image.
  asset: () => null,
};

/** `null` ⇒ no image renders (absent, or an `asset` source awaiting PD-XXX/#67). */
export function resolveThemeBackgroundUrl(
  backgroundImage: ClampedTheme["backgroundImage"],
): string | null {
  if (backgroundImage === undefined) {
    return null;
  }
  const resolve = RESOLVE_BY_KIND[backgroundImage.kind] as (
    source: ThemeScopeBackgroundImageSource,
  ) => string | null;
  return resolve(backgroundImage);
}
