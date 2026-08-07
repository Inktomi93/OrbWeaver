# Base UI docs mirror — v1.7.0

Verbatim snapshot of the upstream Base UI documentation (`base-ui.com/react/**.md`), fetched
2026-08-07 against the installed `@base-ui/react@1.7.0`. **Reference only — never edit these files;
re-fetch on a version bump** (the fetch script shape lives in git history of this commit).

This mirror exists so every agent working the 1.7 alignment program reads the SAME authoritative
surface instead of a half-remembered API. Layout mirrors the site:

- `releases/v1-7-0.md` — the 1.7.0 release notes (the breaking-change list).
- `handbook/` — styling · animation · composition · customization · forms · typescript. The
  cross-cutting law; `forms.md` is the authority for the Field/Form/TanStack integration.
- `components/` — one page per component, including components we deliberately do NOT wrap
  (checkbox-group · context-menu · otp-field · preview-card · menubar · navigation-menu — see
  `docs/design/baseui-crunch.md` §8 for the opt-out reasons).
- `utils/` — csp-provider · direction-provider · merge-props · use-render.

Owner of the alignment program: `docs/design/baseui-crunch.md` (findings) + the retro workboard.
