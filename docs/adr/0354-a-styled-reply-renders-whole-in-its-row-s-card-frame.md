---
kind: adr
status: active
updated: 2026-11-20
---

# A reply a display script styled renders whole in its row's card frame

## Context

Presets draw styled panels with display regex scripts, or have the model write them. A region cannot be traced through later scripts, captures and markdown repair. The owner ruled that a preset's styling draws on a row whose existing tier allows the card frame (D294), with no new consent, and that nothing styled reaches the main document.

## Decision

A reply frames when its row's card tier is Tier B (D294) and either holds:

- **Styled.** A display script whose own template carries an HTML tag, with replacement tokens stripped, replaced a match, and no plugin display transform changed the text.
- **A model panel.** Its drawn prose, outside a card and outside code, holds a `<style>`, `<script>` or `<svg>` element, or an HTML block whose opening tag carries a style attribute (`modelPanels` in `@orb/kit/content`).

Inline markup, a bare tag and a template that only echoes a capture never frame a row. A card greeting is a row like any other. A framed reply renders whole in one routed frame. Media, choice sets and paragraphs with a dice stamp stay native between frame runs. A speaker marker or label inside a panel splits nothing (`markupUnitRanges`).

The frame document holds:

- **Markup.** The transcript's markdown seal, rendered statically with raw HTML kept and not sanitized. `@orb/ui/frame-markdown` throws outside a frame render, and policy `ui-frame-markdown-frame-only` admits one importer. An attributed self-closing tag stays as markup (`keepUnknownDirectives`), and a hidden span stays hidden. A block element on showdown's list, or a whole document, parses whole to its close (`holdBlocksWhole`), so Markdown is not read inside a panel.
- **App rules.** Only the rules the markup can match, read through the CSSOM from the app's build stylesheets: a same-origin `<link>`, or a `<style>` Vite injected for a module. The owner's theme, extension and unreadable sheets are skipped. The rules sit in a cascade layer below the reply's styles.
- **Tokens and channels.** The resolved token set and the root's `data-*` channels, clamped by `@orb/kit/card-frame`.

The frame's `style-src` stays `'unsafe-inline'` only.

The frame mints under the row's card origin, so the interactive posture applies to it as to a card. Its height follows its content up to the reply cap. After it settles, each change spends a credit from a small refilling burst (`foldCardFrameHeight` in `@orb/kit/card-frame`); a change with no credit lands when one returns. A drawer closes at once, nothing stays clipped, and a self-feeding height relayouts at a bounded rate. The frame drops the app's `min-block-size: 100dvh` body floor. The run takes the transcript's full measure (`FILLS_MEASURE` in `@orb/ui/lib`), because the frame cannot size its bubble.

**Links.** The pinned frame script hands a link click in the reply to the host, as for a card. The host takes a link only from its own frame window, under a live user activation, from a frame the focus gate admitted (`holdsAdmittedFocus` in `frame-focus.ts`), as an http, https or mailto address off the app's origin. A press or a Tab admits a frame, its own `focus()` never; after that input its script may post too. An app press or key ends an admission; focus leaving with no app input relies on blur order, measured only in Chromium.

A link opens only through a confirm, whose header states its parse and display rule. It wraps the host only between labels and leaves the registrable domain unmarked, an accepted residual. A Cancel returns focus to the frame's stop in the app. Repeated requests are paced (`framed-link-pace.ts`): after two Cancels in a row each doubles the next wait, 2 s to 30 s, then the newest waiting request raises its confirm, whose close returns focus where the reader was. An Open or a remount resets the count.

**Before the frame draws.** The row shows the reply as a streaming card forms (`scanStyledHold` in `@orb/kit/content`): prose through the inert allowlist, each HTML block as a forming chip with none of its bytes. A block opens on CommonMark's block shapes and holds to its element's close, blank lines included, so nothing a script styles, hides or deletes shows early. Pending, it splits the display output until the first height report; streaming, the model's text while a display script is in force, or on Tier B once a panel or an arriving tag line shows. Inline tags drop with their words kept.

**A streaming panel.** On Tier B a held unit, read after the live display pass, draws in its own routed frame once every block in it closed and a prose line after it ended (`scanFormingPanels`). Its mint sends `forming: true`: the server caps each serve static with no external media, since a save-pass script, stop string or abort can drop those bytes. At most `FORMING_PANELS_MAX` draw per stream. At settle the reply mints at the row's grant, and a turn ending in the room drops its forming handles from the store.

**Inert path.** The reply renders through the inert allowlist on a Tier A row, or when a plugin rewrote its text, the mint is refused, a handle is lost twice, its scripts were stopped for taking focus (D294), or its document reports no height in time. Its style, script and text elements drop with their content first; other dropped markup keeps its words.

**A lost handle.** The server's miss document carries `data-frame-missing`, which the pinned script reports; the frame mints again once, then renders the inert path.

**Limits**, sized from Sola V4 replies:

| Limit | Value and basis |
| - | - |
| Mint HTML | 204,544 chars, ten times the largest measured reply. |
| Mint CSS | 256,000 chars. A reply matched 58,319 of the app sheet's 388,191, so an untrimmed sheet is refused. |
| Theme tokens | `CARD_FRAME_THEME_TOKEN_LIMITS` in `@orb/kit/card-frame`. |
| Handle store | 8 MiB and 256 handles per account, 32 MiB and 1024 in all. The longest reply stores about 0.27 MiB. |
| Mints in flight | `CARD_FRAME_MINTS_IN_FLIGHT` per account. The gate runs before the body limit, which buffers a chunked body whole, and answers 429. The client queues to the same bound. |

An account's mints evict its own oldest handles first.

**Homes:**

- `packages/client/src/lib/display-styled.ts`
- `packages/client/src/features/chat/hooks/use-drawn-message.ts`
- `packages/client/src/features/chat/lib/reply-parts.ts`
- `packages/client/src/features/chat/components/reply-frame.tsx`
- `packages/client/src/components/framed-link-confirm.tsx`
- `packages/client/src/components/framed-link-pace.ts`
- `packages/client/src/features/chat/components/ghost-message-row.tsx`
- `packages/client/src/features/chat/components/forming-panel.tsx`
- `@orb/kit/content`
- `packages/ui/src/content/sandbox-frame/frame-reply.ts`
- `packages/ui/src/markdown/frame/`
- `@orb/kit/card-frame`
- `packages/contracts/src/chat/card-frame.ts`
- `packages/server/src/entry/http/card-frame.ts`
- `packages/server/src/entry/http/frame-handle-store.ts`

## Consequences

A preset's panels, inline colours and keyframes draw as their author built them on a Tier B row. A preset is not a theme, so no contrast floor judges its colours.

One gap remains: the app's font files meet `Cross-Origin-Resource-Policy: same-origin` from the frame's opaque origin, so framed prose uses the system face. Loading them is not yet built.

## Alternatives rejected

- **Linking the app stylesheet in the frame.** `Cross-Origin-Resource-Policy: same-origin` bars the frame's opaque origin, and widening it changes the app's security headers for one feature.
- **Per-region frames or in-text markers.** Later scripts break markers, and a capture echo loses provenance.
- **A new trust setting or consent.** The row's tier already decides where a card frame may draw.
- **The srcdoc floor for a reply.** It runs no script, so it can neither measure the reply nor hand over a link.
- **The inert render while the frame is pending.** The allowlist keeps a `<style>` element's content as text, so an opened room would show the template's CSS.
- **Muting a frame's links after a Cancel.** It reads as a dead control, and the pace bounds a scripted frame too.
