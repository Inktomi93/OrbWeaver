---
kind: adr
status: active
updated: 2026-11-20
supersedes: docs/adr/0044-theming-and-rich-content-use-trust-tiers.md
---

# Rich content uses trust tiers, and interactive story cards are on by default

## Context

SillyTavern users style chats with custom CSS (global and per character), rich HTML cards, inline media and cards that run their own scripts, and they expect that expressiveness. ST filters untrusted CSS by string rewriting, which filters rather than isolates. The owner ruled that interactive story cards work by default, so an imported card behaves as its author built it.

## Decision

Theming and rich message content use two trust tiers, isolated by browser boundaries and never by regex sanitize-and-scope. Trusted input is the box owner's and the viewer's own: global theme CSS, the viewer's persona theme, own uploads and the viewer's own messages. Every other author reaches a trust level only through the HTML-trust ladder.

Theming is a curated, Zod-validated token-override API applied through `<ThemeScope>`. Values are parsed and clamped, and `url()` is rejected. Scopes are global (owner) and per character, resolved `character > global > default`.

The HTML-trust ladder is `HTML_TRUST_STEPS` (`@orb/contracts/chat`): Plain text, Rich HTML, Interactive. `resolveRenderPolicy` folds the install's step and a character's `trust_html` and `interactive_html` columns into one step; `docs/law/UI-Theming-and-Content.md` §12.2 tables every author.

- The install's one setting, `AppSettings.defaultHtmlStep` ("Default for characters", floor `interactive`), is the step of an inheriting character, every imported card included, and below Interactive the script ceiling. A character's own Plain text or Rich HTML wins either way, and stores `interactive_html: false`, the per-character disable.
- A seat with no readable card, or a room with no consenting host, draws as Plain text: no one consents for it.
- The viewer's own messages render trusted in the static frame; another user's render untrusted. A game's immersive switch frames every speaker's cards statically.

Tier A is the inert sanitized allowlist through Streamdown in the main DOM. It renders cards for a row below `trusted`, unless a game chat has `features.immersiveHtml` on. Tier B is `@orb/ui/sandbox-frame`: a sandboxed iframe with its own CSP, never Shadow DOM, rendered on completion, with theme tokens injected and postMessage auto-height.

A row at or above `trusted` renders sanitized markdown in the main DOM under the trusted policy. Off-origin images are dropped unless the row admits external media, links open through a confirm, and a Mermaid block renders as inert code. Its cards render in Tier B.

A reply that a display regex script styled renders whole in one card frame on a Tier B row (D354).

A card runs its own scripts only under the `interactive` frame posture: `resolveCardScriptVerdict` needs the character and the default step at Interactive and the viewer's `runCardScripts`, read through `viewerRunsCardScripts` so an unreadable blob is off, and only when the other two allow. A failed read draws static; a streaming panel's mint draws static with no external media (D354). Every serve resolves all three again, so one switched off withdraws scripts at the next load.

The sandbox does not change with the posture: an opaque origin with `sandbox allow-scripts` and never `allow-same-origin`, `default-src 'none'` with no `connect-src`, `form-action 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`, and the app's `frame-src 'self'`. Only `script-src` changes. The static posture admits our pinned script by hash, which measures the height and hands a link click to the host, and the interactive posture admits `'unsafe-inline'`.

Keyboard focus enters a card or reply frame only by the reader's hand: a press or tap on that frame, or Tab or Shift+Tab from the app. Focus that a frame's script takes any other way returns to the app element the reader last held, never into another frame, so a card that focuses its own field on load does not keep focus. Accepted cost: a reader typing in one card when another grabs loses their place and clicks back in. Keys pressed before the return can still reach the frame. A grab loop, `FRAME_FOCUS_GRAB_LOOP_BOUND` refusals with no app press or Tab between them, stops the frame's scripts for that mount. A card then draws on the script-dead floor, and a reply on its inert path (D354). Accepted residual: a frame grabbing once per reader press gets at most the key in flight before each return. Reader entries the host cannot read count too. On an engine that shows no press on a frame, the frame under the pointer is admitted while the page holds an activation, and nothing is stopped. A plugin surface is not gated.

Accepted residual: a card script can send a WebRTC/STUN beacon to a host it picks. The beacon can carry the viewer's IP, a signal that the card was shown, or text typed into the card. No CSP directive in Chromium closes it. The controls are the default step for the box, a character's step, and `runCardScripts` for one viewer.

Media: own uploads render through `asset://id`. External URLs default to `forbidExternalMedia: true`, which a lower tier can only tighten, and are click-to-load, with `autoplay` off and `controls` required on untrusted audio and video, behind a CSP that admits `https:` only while the deployment allows it, through `@orb/ui/message-media`. The viewer's own messages follow the install's setting alone. `resolveCardMediaVerdict` is a frame's one media rule. The render block union is `MessageContentBlock` in `@orb/contracts/chat`. Gates: `no-untrusted-html-in-main-dom`, `no-external-media-without-gate`, `theme-override-only-via-scope`, and a present CSP.

Homes: the resolvers and verdicts in `@orb/contracts/chat`, `viewerRunsCardScripts` and `APP_SETTINGS_LIFTS` in `@orb/contracts/settings`, `packages/server/src/domain/settings/effective-config/layer.ts`, `packages/server/src/entry/http/card-frame.ts`, `@orb/kit/card-frame`, `packages/ui/src/content/sandbox-frame/frame-focus.ts`, and `resolveRowRenderPolicy` in `packages/client/src/lib/render-trust.ts`.

## Consequences

A theme is a token value set, never a structural mode. Per-character styling covers the ST token subset (accent, role bubbles, name color, prose semantics, font, radius, surface, chat style and density) with no injection surface. The live emit surface is `THEME_SCOPE_EMIT_VARS` in `packages/ui/src/content/theme-scope/clamp.ts`, and it grows only for chrome whose absence leaves an unthemed edge on a themed panel. Native `<audio controls>` and `<video controls>` play media in a card that runs no script.

On a default deployment, an imported card renders trusted and runs its scripts on first load, and the WebRTC residual is open. An operator closes it for the box with Rich HTML as the default step, which keeps presets styled, and a viewer closes it with `runCardScripts`. A handoff copy keeps an inheriting character inheriting, but it stores an explicit Interactive step as Rich HTML, so the new owner decides.

## Alternatives rejected

- Regex sanitize and scope, as ST does: this filters rather than isolates; isolation must be a browser boundary.
- Shadow DOM for Tier B: it gives composability, not isolation. Script in a shadow tree has full page access and custom properties pierce it.
- DOMPurify as a second pass: Streamdown's own `rehype-sanitize` and `rehype-harden` already sanitize inside the pipeline; a second pass outside it adds nothing.
- `react-shadow` or a generic isolation library: a boundary we rely on is the small owned `sandbox-frame`.
- Structural theme modes such as a work mode, free-form dragging (`movingUI`) and visual-novel fullscreen (`waifuMode`): a theme is a palette plus optional density, and the visual-novel layer is out (D49).
- Interactive cards as a per-character opt-in under a deployment switch that is off by default: an imported card would not work until someone found both settings.
- A script grant decided only when the frame is minted: the client keeps a frame handle for the life of the tab, so a revocation would not reach it.
