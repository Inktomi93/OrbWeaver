---
kind: law
status: active
updated: 2026-11-08
---

# UI platform rulings: styling, fonts, appearance, browser floor and evidence

Split off [UI-Density-Law.md](UI-Density-Law.md) for the 48 KiB law cap; it keeps that law's §8 numbering, because code comments cite these sections as §8.x. Scope: platform and system rulings in `packages/ui/src` and `packages/client/src`.

## 8. Platform and system rulings

### 8.1 Styling

- Resolve glass, plates, shadow colours and carried-theme ingredients on the consumer. A formula resolved on the root cannot follow a nested theme. Shadow ingredients stay theme-relative under D200: no frozen colours and no independent elevation ramp.
- Keep wallpaper-specific fade policy in client appearance and reusable masks in `@orb/ui`. Runtime image URLs, speaker colours and measured reservations are runtime data.
- Use logical box properties where the browser floor supports them. The panels keep physical `translateX` because FLIP owns the separate `translate` channel.
- The name row's bubble-ink rule lives in client globals because it addresses chat-owned slots. It is not a primitive skin.
- A gradient ring paints its border only, so no ink sits on a lightened fill. Each carrier applies the masked utility in its own top-level `@supports (mask-clip: padding-box)` block on its full `::after` selector; a `&` nested under a pseudo-element matches nothing in unoptimized CSS.
- A state that changes a live node's emphasis keeps one component. Two components remount the node and drop keyboard focus.
- Cap wide content by its measure. The composer and its adjacent bands never exceed the transcript's reading column.
- Keep `shell-short`: the room scrolls while its controls stay reachable. A shell pane or room 20rem tall or less at the enlarged root scrolls as a whole, and its rows or transcript keep a floor that yields while the message field holds focus. A name row stops pinning in a room 20rem tall or less or a column under 20rem wide. A phone 16rem wide or less gives the topbar a second line for the screen's name unless the keyboard is up. While writing with a keyboard under the 20rem height step, the topbar and its edge controls yield to the input.
- A box 24rem tall or less, the `container.cq-24` step, has one scroller. A dialog popup reads it as `dialog-short`; a bracketed Context pane reads it as `@container shell-panel`. A landscape phone's dialog is a short dialog on a screen 27rem tall or less, read as a media height in the platform's own rem (`glass-short`): a screen that short is in the regime at any text scale, and enlarged text alone never moves a taller screen into it. There the title and Close stay at the top of the dialog while the body scrolls under them (a screen under 30rem wide scrolls its header away), the header holds one line and the title truncates to it (its full text stays the dialog's name), and a tiny dialog (the cq-14 step, enlarged text on a landscape phone) spends none of its height on insets; a list takes the room its chrome leaves, down to one touch row (a command palette's, down to its search strip), and the popup gives its inset and heading gap back; the list stays clear of the command box's focus ring. Any other short dialog keeps its header in flow, its wrapping title and its fixed list window. A stacked dialog (short and 32rem wide or less) gives its heading gap back to the row step, its inset back to the field step and its pinned row's inline inset back to its actions, because at enlarged text the chrome is most of the box; a landscape phone's dialog keeps its own insets. A picker pins its action row with both actions only where the dialog's height holds that row over one whole row of its list; `packages/ui/src/styles/primitives.css` (`dialog-stacked-cramped`) holds the sums per pointer and line count. Elsewhere the row flows after the list, the second action follows the first, and the row says more sits below, so nothing covers the list's first row. A title beside Close alone wraps by its words and keeps Close on its line until a word cannot fit. Every short dialog drops a picker list's group headings, and a tiny one unpins its footer. A modal's block gutter is capped at a twentieth of the screen, so enlarged text does not spend the screen's height on margin. A dialog taller than 26rem and wider than 14rem holds its picker's box (`height.picker-box`), so the picker's footer takes room from the list and the first keystroke moves nothing: the window is the screen less 21rem of chrome, and above that height it still leaves a touch row after the footer's one line, which the width keeps to one line. In a shorter or narrower dialog the footer adds to the box. In a short Context pane the tab body flows at its content's height, so the pane scrolls as a whole, and the tab overflow trigger draws its ring inside its own box. A picker in its own dialog sets `listSize="pickerWindow"` and the command palette uses `compact`; both follow this rule. The Add document body is one scroller on a landscape phone: its dialog body, with its modes' `scrollLg` floor only lengthening it. The `grow` list, the model picker's, keeps its 24rem window and does not follow the rule. Measured on a landscape phone it is 384px inside a form body 341px (844x390) or 278px (568x320) tall that scrolls as well, because the picker sits among a form's other fields and has no room remainder to share.
- Avoid persistent layer-promotion hacks. Follow the integer-line-box law and measure `contain`, `content-visibility` and backdrop-filter changes.

### 8.2 Fonts and text scale

- Geist and Geist Mono are the shipped faces. `THEME_FONT_ALLOWLIST` owns the selectable faces and their derived fallback stacks.
- The root font size respects the browser default; appearance font scale is a multiplier on it. Keep the text-scale metadata and the input zoom floor.
- An isolated card or plugin frame cannot inherit the host root. The host delivers `--appearance-font-scale` as the style token `--sandbox-root-size`, a percentage the frame applies to its root. It rides the frame style-token clamp, which bounds it to the font-scale range, on the srcdoc, plugin frame and chat card paths. First-party frame bundles size text in rem.
- Dynamic Type (`-apple-system-body`) is deferred. Adopting it changes the approved iPhone type hierarchy and needs an owner decision after device review.

### 8.3 Appearance preferences

- Reduced motion, transparency and contrast each take `system`, `on` or `off`. An explicit `off` overrides the OS preference.
- Parse earlier boolean preferences forward. Boot replay and mounted writers use the same appearance channel names.
- One typed appearance manifest (`packages/client/src/lib/appearance-carrier-manifest.ts`) lists the channels. Numeric properties derive their registration bounds and defaults from contracts; enum attributes stay explicit. A JS-only setting declares that it has no CSS channel.
- Appearance lives on the root; shell state lives at its own scope.
- Keep the supported owner-CSS hooks with their application consumers, completion, warnings and injection rewrites.

### 8.4 Browser floor and platform CSS

- Honour the targets in `packages/client/browser-targets.ts`, including the Safari and iOS floor. Keep safe-area, dynamic-viewport, overscroll, input-type and focus-zoom behaviour through lint and stylesheet changes.
- Keep script sizing for `Textarea` where `field-sizing: content` is unsupported, with the same minimum and maximum rows. Use overflow-axis spellings the Safari floor supports. Unsupported scrollbar styling and off-screen skipping may fall back to browser defaults.
- Keep the Streamdown inline-style override and CodeMirror's runtime stylesheet behaviour.

| Feature | Ruling |
| - | - |
| `accent-color` | Adopt from the primary token; unsupported controls keep the system tint |
| `text-wrap: balance`, `overflow-wrap: break-word` | Adopt for headings; keep `break-word` on prose |
| `touch-action: manipulation`, underline offset | Adopt as base rules below explicit utility overrides |
| Forced colors, print | Adopt; print covers the transcript and character export |
| Scroll-driven fades | Adopt with an attribute-driven fallback where scroll timelines are unsupported |
| Numeric figure variants | Keep; voices own tabular figures and numeric controls keep their modifier |
| Chrome selection and callout control | Keep primitive selection policy and target-derived prefixes |
| `text-wrap: pretty`, `hanging-punctuation`, `scrollbar-gutter`, `contrast-color()` | Defer: measure a real stream, review on real Safari, or find a layout defect first; the theme engine owns contrast |
| `interpolate-size`, `@starting-style`, anchor positioning | Reject: Base UI and floating-ui own disclosure, enter/exit and positioning |
| `caret-color`, `image-rendering`, `text-rendering`, `font-optical-sizing`, `prefers-reduced-data`, Custom Highlight API, `@scope` lower boundaries | Reject: no consumer, or no support at the floor |
| `-webkit-user-drag` | Reject: dragging media into the composer is supported |
| `scroll-margin`, `overflow-anchor` | Reject: settings jumps own their position and the scripted transcript owns end anchoring |

### 8.5 Evidence

- Verify a visible change with isolated before and after captures and geometry checks. Explain each intended difference and get rendered review. Keep no committed screenshot corpus.
- Keep real-device checks open for notch insets, keyboard with dynamic viewport, standalone status bar, theme colour, rubber-banding, focus zoom, Dynamic Type, Safari punctuation and macOS font rendering. Playwright WebKit on Linux reproduces none of them.
- Do not keep a hand-maintained styling inventory that duplicates generated contracts.
