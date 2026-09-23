---
kind: adr
status: active
updated: 2026-09-23
---

# Theming and rich content use trust tiers

## Context

SillyTavern lets users style chats with custom CSS (global and per character), rich HTML cards and inline media, and users expect that expressiveness. ST contains untrusted CSS by string rewriting (renaming classes to a `.custom-` prefix and stripping `://`), which is bypassable. The chat content model, composer and assembly all depend on this decision, so it was ruled before chat assembled any content.

## Decision

User theming + rich message content: **two trust tiers, isolation by physics** — TRUSTED (owner CSS / own persona theme / own uploads) vs UNTRUSTED (per-character CSS, card HTML, external URLs, LLM markdown), contained by browser boundaries, never regex-sanitize-and-scope. Theming = a curated Zod-validated TOKEN-OVERRIDE API applied via `<ThemeScope>` (values parsed+clamped; reject `url()`); scopes global(owner) + per-character, resolution `character > global > default`. Rich HTML: Tier A = inert sanitized allowlist through Streamdown in the main DOM; Tier B = `@orb/ui/sandbox-frame` — a **sandboxed IFRAME + per-frame CSP** (never Shadow DOM — encapsulation ≠ isolation), opt-in per-character trust, render-on-complete, theme tokens injected, postMessage auto-height; card JS stays out in v1 (flipping `allow-scripts` later needs no re-architecture). Media: own uploads render freely via `asset://id`; external URLs default `forbidExternalMedia:true`, click-to-load, `autoplay` FORCED OFF + `controls` required on untrusted A/V (non-overridable), `allowedMediaPrefixes` + CSP backstop; all through `@orb/ui/MessageMedia`. `MessageContentBlock` union (`markdown | image | html-card{trust}`) in `@orb/contracts`. Gates: `no-untrusted-html-in-main-dom`, `no-external-media-without-gate`, `theme-override-only-via-scope`, CSP-present.

## Consequences

A theme is a token value set, never a structural mode. Per-character styling covers the ST token subset (accent, role bubbles, name color, prose semantics, font, radius, surface, chat style and density) with no injection surface. The live emit surface is `THEME_SCOPE_EMIT_VARS` in `packages/ui/src/content/theme-scope/clamp.ts`, and it grows only for chrome whose absence leaves an unthemed edge on a themed panel. Native `<audio controls>` and `<video controls>` are the one declaratively interactive HTML class, because a card can play media with no card JS.

## Alternatives rejected

- Regex sanitize and scope, as ST does: bypassable by construction; isolation must be a browser boundary.
- Shadow DOM for Tier B: it gives composability, not isolation. Script in a shadow tree has full page access and custom properties pierce it.
- DOMPurify as a second pass: Streamdown's own `rehype-sanitize` and `rehype-harden` already sanitize inside the pipeline; a second pass outside it adds nothing.
- `react-shadow` or a generic isolation library: built for design-system encapsulation, and a security boundary we depend on should be the small owned `sandbox-frame` whose `sandbox` and CSP attributes we control.
- Structural theme modes such as a work mode, free-form dragging (`movingUI`) and visual-novel fullscreen (`waifuMode`): a theme is a palette plus optional density, and the visual-novel layer is out (D49).
