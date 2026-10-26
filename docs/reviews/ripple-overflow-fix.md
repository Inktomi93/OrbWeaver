# Ripple width, focused controls and utility fallback

## Outcome

The existing bubble cap is `min(100%, 65ch)`. Cards keep shrink-to-fit sizing and the desktop reading cap without exceeding their parent. The token source owns the formula; only its required generated stylesheet and TypeScript map change.

Identity and timestamp groups wrap, and long names can break words. The action slot reserves the existing glyph height. The inside header has a bottom row inset so actual controls, coarse hit areas and focused rings stay within its opaque backing. No portrait or hit target is reduced, and no clipping rule hides overflow.

The canonical layer order places `properties` first. Tailwind’s browser-specific fallback defaults must rank below utility declarations. The touch-target recipes are unchanged.

## Proof and corrections

The production-shell suite persists synthetic messages and long persona/character names through real corpus operations, as the corpus root’s owner. It checks paragraph boxes, actual text-line rectangles, real menus, portraits, the resolved desktop cap, sticky pinning and row exits. Focus assertions run after keyboard menu use and re-pinning; they include computed ring spread, translated pseudo hit geometry and visible prose intersections.

- `reports/ripple-overflow/red.log`: unmodified Ripple fails at 390px with 22px of horizontal overflow.
- `focus-probe.log` and `user-focus-facts.json`: a focused control paints below its header into the prose. The glyph-height reservation and bottom inset address that escape.
- `webkit-hit-probe.log`: WebKit’s untranslated 44px pseudo intercepts real hit tests below the header. This is not a percentage-top measurement error.
- `webkit-parsed-declarations.json`: the translation utility rules exist and are parsed. The fallback layer resets their custom properties to zero.
- `cascade-intervention.json`: removing only the fallback resets restores `-50% -50%`, centered hit testing and the real focus ring. The diagnostic restores the declarations afterward.
- `primitive-red.log`: Chromium passes the primitive controls; WebKit fails signed-edge centering and focus-ring visibility before the layer correction.

The earlier claim that a feature-local derived width formula was lint-legal is retracted. Scoped ESLint rejects it in `message-box.tsx`; the final implementation uses the existing UI token home. The earlier pseudo measurement also omitted the separate CSS translate property; the final assertion includes it. The later WebKit failure is a genuine cascade defect, not that instrumentation mistake.

## Completed native floor

- The shared-header run qualifies the non-Ripple cases against the final glyph-height and inset source (`chromium-paint-shared-report.json`). Its Ripple instrumentation failures are retained, not reported as passes.
- `chromium-root-final.log` and its report: 7 passed, exit 0. These cover the existing served-layer order, actual signed-edge hit tests for square/stretched/checkbox controls, visible keyboard focus, and Ripple at 360, 390, 520 and 1440px for both roles.
- `webkit-root-final.log` and its report: 4 passed, exit 0. These cover the same primitive controls and Ripple at 360 and 390px for both roles, with real focus paint restored.
- `document-root-final.log` and its report: desktop and narrow Document captures pass, exit 0. These qualify the actions-only format against the final shared frame and layer source.
- No retries, skipped cases or flaky outcomes qualify these results.

Chromium’s observed utility state and non-Ripple geometry are unchanged by the canonical-layer correction. Completed non-Ripple evidence against the same header frame remains applicable. The focused primitive scanner is mechanically simplified to `Element.contains`, which includes the element itself and rejects null; its signed-edge assertions are unchanged.

## Static checks

- `pnpm --filter @orb/ui tokens:build`: passed; only the required bubble-cap output changes.
- `pnpm test tests/ui/token-contract.test.ts`: 20 passed. Reused after unchanged token source.
- UI, client and browser-test typechecks passed after the token update. `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` passes again after the final header and test changes, including its router prerequisite.
- Final scoped ESLint passes and includes `message-box.tsx` explicitly. Generated token output is excluded by native lint configuration, not suppressed locally.
- Final scoped Biome passes for the authored source; Stylelint passes for the changed CSS. Generated output is checked where the repository’s native configuration includes it.

## Artifacts and limits

Ignored evidence lives under `reports/ripple-overflow/`. The `qualified-*` PNGs preserve the failing focus-paint state. The `paint-qualified-*` PNGs show the corrected header frame. Final root-corrected Ripple and Document captures use `root-qualified-*`.

The new `platform-utility-fallback.suite.ct.tsx` mounts real square and stretched Buttons and a Checkbox through `CtIsolation`. It tests both signed hit edges and actual keyboard ring paint in Chromium and WebKit, not copied CSS logic.

Rendered chat tests qualify settled rows. Ghost rows share the changed box, header frame and name renderer; rendered ghost parity is not claimed. Linux WebKit with an iPhone descriptor is not physical iPhone Safari. The orchestrator owns independent review, board transitions and integration. Production port 8788 is untouched.
