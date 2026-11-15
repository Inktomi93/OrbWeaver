---
kind: adr
status: active
updated: 2026-11-15
---

# A reply a display script styled renders whole in its row's card frame

## Context

SillyTavern presets draw their panels with display regex scripts. Their templates open and close styled regions around the model's prose, colour inline speech, and carry `<style>` blocks and keyframes. A region cannot be traced through later scripts, captured text and markdown repair, so per-region styling cannot follow the preset. The owner ruled that a preset's styling draws on a row whose existing tier allows the card frame (D294), with no new consent, and that nothing styled reaches the main document.

## Decision

A reply is styled when all three hold:

- its row's card tier is Tier B (D294);
- a display script whose own template carries an HTML tag, with replacement tokens stripped, replaced a match;
- no plugin display transform changed the text.

Markup the model wrote and a template that only echoes a capture never style a row. A styled reply renders whole in one routed card frame. Media, choice sets and paragraphs with a dice stamp stay native between frame runs.

The frame document holds:

- **Markup.** The transcript's markdown seal, rendered statically with raw HTML kept and not sanitized. `@orb/ui/frame-markdown` throws outside a frame render, and policy `ui-frame-markdown-frame-only` admits one importer. An attributed self-closing tag stays as markup (`keepUnknownDirectives`), and a hidden span stays hidden.
- **App rules.** Only the rules the markup can match, read through the CSSOM from the app's build stylesheets: a same-origin `<link>`, or a `<style>` Vite injected for a module. The owner's custom theme, extension sheets and unreadable sheets are skipped. The rules sit in one cascade layer below the reply's own styles.
- **Tokens and channels.** The resolved token set and the root's `data-*` channels, clamped by `@orb/kit/card-frame`.

The frame's `style-src` stays `'unsafe-inline'` only.

The frame mints under the row's card origin, so the interactive posture applies to it as to a card. It grows to its content up to the reply height cap.

**Links.** The pinned frame script hands a click on a link inside the reply body to the host. The host accepts a link only when all of these hold:

- it comes from its own frame window;
- a user activation is live;
- that iframe holds focus;
- the address is http, https or mailto;
- the address is off the app's own origin.

It opens the link only through a confirm. An open confirm keeps its address, and Open opens exactly that address. A Cancel mutes the frame's links until it remounts.

**Inert path.** The reply renders through the inert allowlist on a Tier A row, while it streams, while the mint is pending, and when the mint is refused.

**A lost handle.** The server's miss document carries `data-frame-missing`, and the pinned script reports it. A frame whose handle expired or was evicted mints again once, then renders the inert path.

**Limits.** Each is sized from Sola V4 replies drawn by their own display scripts:

| Limit | Value and basis |
| - | - |
| Mint HTML | Ten times the largest measured reply, 204,544 chars. |
| Mint CSS | 256,000 chars. A reply matched 58,319 chars of the 388,191 in the whole app stylesheet, so an untrimmed sheet is refused. |
| Theme tokens | `CARD_FRAME_THEME_TOKEN_LIMITS` in `@orb/kit/card-frame`. |
| Handle store | 8 MiB and 256 handles per account, 32 MiB and 1024 handles in all. The longest reply stores about 0.27 MiB, and an open transcript mounts about sixteen frames. |
| Mints in flight | `CARD_FRAME_MINTS_IN_FLIGHT` per account. The gate runs before the body limit, which buffers a chunked body whole, and answers 429. The client queues to the same bound. |

An account's own mints evict its own oldest handles first.

**Homes:**

- `packages/client/src/lib/display-styled.ts`
- `packages/client/src/features/chat/lib/reply-parts.ts`
- `packages/client/src/features/chat/components/reply-frame.tsx`
- `packages/ui/src/content/sandbox-frame/frame-reply.ts`
- `packages/ui/src/markdown/frame/`
- `@orb/kit/card-frame`
- `packages/contracts/src/chat/card-frame.ts`
- `packages/server/src/entry/http/card-frame.ts`
- `packages/server/src/entry/http/frame-handle-store.ts`

## Consequences

A preset's panels, inline colours and keyframes draw as their author built them, on a Tier B row. A framed reply's prose takes the transcript's type and tokens.

One gap remains: the app's font files do not load in the frame. An opaque-origin request meets `Cross-Origin-Resource-Policy: same-origin`, so framed prose falls back to the system face. Loading them is not yet built.

## Alternatives rejected

- **Linking the app stylesheet in the frame.** Every app response carries `Cross-Origin-Resource-Policy: same-origin`, so the frame's opaque origin cannot load it.
- **Widening that header on the app's assets.** It changes the app's security headers for one feature.
- **Per-region frames or in-text markers.** Later scripts' lookbehinds break markers, and a capture echo loses provenance.
- **A new trust setting or consent.** The row's existing tier already decides where a card frame may draw.
- **The whole app stylesheet in every frame.** Untrimmed, a frame carries 388,191 chars of CSS against 58,319 trimmed.
- **A stylesheet store keyed by content hash.** With trimming it saves under 1 MiB per viewer, at the cost of a second store and route.
- **The srcdoc floor for a reply.** It runs no script, so it can neither measure the reply nor hand over a link.
