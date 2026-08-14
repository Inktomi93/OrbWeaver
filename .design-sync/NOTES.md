# design-sync notes — orbweaver (@orb/ui → "Orbweaver UI")

- **Scope is deliberately the web-weave motion cluster only** (WebWeave, WeaveVeil, WebSpinner) —
  first sync 2026-08-14 was for a motion review of the main-page weave animations. The rest of the
  60+ @orb/ui exports are unsynced by choice; widening = add pins to `componentSrcMap` (and widen
  `srcDir` back to `src`), not a new project.
- **No dist**: @orb/ui is a source-exported workspace package (exports map to `./src/*/index.ts`,
  no build script). The converter runs in synth-entry mode; all components must be PINNED in
  `componentSrcMap` because the pinned-adds path bypasses `deriveComponentsFromSrc`.
- **`srcDir` is narrowed to `src/art/web-weave`** so the synth entry only bundles the weave tree;
  WebSpinner rides in via `extraEntries` (`./src/primitives/spinner/index.ts`).
- **CSS comes from the CLIENT's built stylesheet** (`cssEntry: ../client/dist/assets/index-<hash>.css`)
  because @orb/ui ships no compiled CSS — tailwind utilities + theme tokens + `.orb-weave-glow`
  compile in the app. RE-SYNC RISK: the hash rotates on every client build — re-glob
  `packages/client/dist/assets/*.css` and update `cssEntry` before each re-sync; a stale hash =
  `[CSS_IMPORT_MISSING]`.
- ui uses `#*` package-imports (`./src/*/index.ts`) — esbuild resolves them from the package.json
  `imports` field; no tsconfig paths needed.

## Motion-review context (owner-reported defects, 2026-08-14 — the reason this sync exists)

1. Web geometry has UNCONNECTED bits (strands that don't join the web).
2. Pieces STICK OUT past the visible bounds at certain screen sizes (viewport-dependent overflow).
3. Spider pathing/movement doesn't read as sensible spider motion.
4. Web highlights look wrong/glitchy.

These go to the design agent via the conventions header; fixes land back in
`packages/ui/src/art/web-weave/` (geometry/spider/render are pure modules with vitest coverage —
`tests/ui/art/web-weave/`).

## Re-sync risks

- `cssEntry` hash rotation (above) — check first, every time.
- The weave animation resolves its palette at runtime from computed styles (color-mix probe in
  web-weave.tsx) — if cards render with a fallback palette, the token custom properties didn't make
  it into the preview document; check `styles.css`'s import closure carries the client CSS.
- Canvas animations: static screenshots capture ONE frame — a good grade proves render, not motion.
  Motion judgment stays human/design-agent territory.

## Repo-tooling exemption (2026-08-14)

- `.design-sync/`, `.ds-sync/`, `ds-bundle/` are EXCLUDED in biome.json `files.includes`: the
  design-sync contract REQUIRES PascalCase `<Name>.tsx` preview filenames (converter matches by
  component name), which collides with the repo's kebab-case filename rule. Deliberate scoped
  exemption for the external tool's fixture dir, not product code. If eslint ever starts biting
  these files, give it the same scoped ignore.
- App-level find surfaced by [FONT_MISSING]: the app's token stack names Geist/"Geist Mono" but NO
  @font-face ever ships it — the live app silently renders system fonts. `runtimeFontPrefixes:
  ["Geist"]` suppresses the warn HERE; whether to actually ship Geist is an app decision (boarded).
- Known render warns: [TOKENS_MISSING] ~15 vars = Base UI runtime-set vars from the full app CSS
  (expected-absent statically) · [FONT_DANGLING] 12 KaTeX faces (math fonts, /assets urls not in
  bundle — irrelevant to the weave scope) · [EXPORT_COLLISION] WebSpinner via extraEntries + pin =
  same source file, same binding, harmless.
