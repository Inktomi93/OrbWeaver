---
kind: adr
status: active
updated: 2026-10-03
supersedes: docs/adr/0044-theming-and-rich-content-use-trust-tiers.md
---

# Rich content uses trust tiers, and interactive story cards are on by default

## Context

SillyTavern users style chats with custom CSS (global and per character), rich HTML cards, inline media and cards that run their own scripts, and they expect that expressiveness. ST filters untrusted CSS by string rewriting, which filters rather than isolates. The owner ruled that interactive story cards work by default, so an imported card behaves as its author built it. The chat content model, the composer and assembly all depend on this decision.

## Decision

Theming and rich message content use two trust tiers, isolated by browser boundaries and never by regex sanitize-and-scope. Trusted input is the box owner's and the viewer's own: global theme CSS, the viewer's persona theme, own uploads and the viewer's own messages. Every other author reaches a trust level only through the HTML-trust ladder.

Theming is a curated, Zod-validated token-override API applied through `<ThemeScope>`. Values are parsed and clamped, and `url()` is rejected. Scopes are global (owner) and per character, resolved `character > global > default`.

The HTML-trust ladder is `HTML_TRUST_STEPS` in `@orb/contracts/chat`: `untrusted`, `trusted`, `interactive`. `resolveRenderPolicy` folds the deployment settings and a character's `trust_html` and `interactive_html` columns into one step.

- A character on "Inherit default" has both columns null, which includes every imported card. It resolves to `interactive` while the deployment `allowInteractiveCards` setting is on. That setting's floor is on.
- `allowInteractiveCards` is also a ceiling. While it is off, no character reaches `interactive`, and an inheriting character takes the deployment `trustHtml` default, whose floor is `untrusted`.
- An explicit "Render HTML" or "Untrusted" step stores `interactive_html: false`. That is the per-character disable.
- A seat with no readable character row resolves to the deployment floor and never reaches `interactive`. This covers human seats, agent-voiced rows and unreadable rows.
- The viewer's own messages render trusted. Another user's messages render untrusted.

Tier A is the inert sanitized allowlist through Streamdown in the main DOM. It renders cards for a row below `trusted`, unless a game chat has `features.immersiveHtml` on. Tier B is `@orb/ui/sandbox-frame`: a sandboxed iframe with its own CSP, never Shadow DOM, rendered on completion, with theme tokens injected and postMessage auto-height.

A row at or above `trusted` renders sanitized markdown in the main DOM under the trusted policy. Off-origin images are dropped unless the row admits external media, links open through a confirm, and a Mermaid block renders as inert code. Its cards render in Tier B.

A card runs its own scripts only under the `interactive` frame posture. The card-frame route grants it when three answers are yes: the character resolves to `interactive`, `allowInteractiveCards` is on, and the viewer's `UserSettings.chat.runCardScripts` is on (default on). The route resolves all three again on every serve of an interactive document, so any one switched off withdraws the scripts at the next frame load.

The sandbox does not change with the posture: an opaque origin with `sandbox allow-scripts` and never `allow-same-origin`, `default-src 'none'` with no `connect-src`, `form-action 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`, and the app's `frame-src 'self'`. Only `script-src` changes. The static posture admits our height script by hash, and the interactive posture admits `'unsafe-inline'`.

Accepted residual: a card script can send a WebRTC/STUN beacon to a host it picks. The beacon can carry the viewer's IP, a signal that the card was shown, or text typed into the card. No CSP directive in Chromium closes it. The controls are `allowInteractiveCards` for the box and `runCardScripts` for one viewer.

Media: own uploads render freely through `asset://id`. External URLs default to `forbidExternalMedia: true`, which a lower tier can only tighten. They are click-to-load, with `autoplay` forced off and `controls` required on untrusted audio and video (not overridable), behind `allowedMediaPrefixes` and a CSP backstop, all through `@orb/ui/MessageMedia`. The render block union is `MessageContentBlock` in `@orb/contracts/chat`. Gates: `no-untrusted-html-in-main-dom`, `no-external-media-without-gate`, `theme-override-only-via-scope`, and a present CSP.

Homes: `resolveRenderPolicy` (`@orb/contracts/chat`), `ALLOW_INTERACTIVE_CARDS_FLOOR` in `packages/server/src/domain/settings/effective-config/layer.ts`, `packages/server/src/entry/http/card-frame.ts`, `@orb/kit/card-frame`, and `resolveRowRenderPolicy` in `packages/client/src/lib/render-trust.ts`.

## Consequences

A theme is a token value set, never a structural mode. Per-character styling covers the ST token subset (accent, role bubbles, name color, prose semantics, font, radius, surface, chat style and density) with no injection surface. The live emit surface is `THEME_SCOPE_EMIT_VARS` in `packages/ui/src/content/theme-scope/clamp.ts`, and it grows only for chrome whose absence leaves an unthemed edge on a themed panel. Native `<audio controls>` and `<video controls>` play media in a card that runs no script.

On a default deployment, an imported card renders trusted and runs its scripts on first load, and the WebRTC residual is open. An operator closes it for the box with `allowInteractiveCards`, and a viewer closes it for their own browser with `runCardScripts`. A handoff copy keeps an inheriting character inheriting, but it stores an explicit Interactive step as Render HTML, so the new owner decides.

## Alternatives rejected

- Regex sanitize and scope, as ST does: this filters rather than isolates; isolation must be a browser boundary.
- Shadow DOM for Tier B: it gives composability, not isolation. Script in a shadow tree has full page access and custom properties pierce it.
- DOMPurify as a second pass: Streamdown's own `rehype-sanitize` and `rehype-harden` already sanitize inside the pipeline; a second pass outside it adds nothing.
- `react-shadow` or a generic isolation library: built for design-system encapsulation, and a security boundary we depend on should be the small owned `sandbox-frame` whose `sandbox` and CSP attributes we control.
- Structural theme modes such as a work mode, free-form dragging (`movingUI`) and visual-novel fullscreen (`waifuMode`): a theme is a palette plus optional density, and the visual-novel layer is out (D49).
- Interactive cards as a per-character opt-in under a deployment switch that is off by default: an imported card would not work until someone found both settings.
- A script grant decided only when the frame is minted: the client keeps a frame handle for the life of the tab, so a revocation would not reach it.
